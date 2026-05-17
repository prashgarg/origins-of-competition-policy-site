/*
 * canon.js — Canonical-works gallery
 * Implements: timeline hero, tab switching, tradition+era filter,
 * thesis-cluster graph layout, hover sync between thesis cards and graph,
 * and a Tensions tab of pre-curated contrastive pairs.
 */

(function () {
  "use strict";

  const DATA = window.HC_CANON_DATA;
  if (!DATA || !DATA.works || DATA.works.length === 0) {
    console.warn("canon.js: HC_CANON_DATA missing or empty");
    return;
  }

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  const THESIS_COLORS = [
    cssVar("--t1") || "#3b6e8f",
    cssVar("--t2") || "#a06b30",
    cssVar("--t3") || "#3d7a5c",
    cssVar("--t4") || "#8b1e2d",
    cssVar("--t5") || "#6b4a7a",
  ];

  // Tradition → primary tradition for a work (priority order matters)
  // Some works span several traditions; we pick a primary for the timeline
  // dot and the rail chip.
  const TRADITION_META = {
    austrian_or_information: { color: cssVar("--tr-austrian") || "#3d7a5c", label: "Austrian / information", short: "Austrian" },
    ordoliberal_or_structural: { color: cssVar("--tr-ordoliberal") || "#6b4a7a", label: "Ordoliberal", short: "Ordoliberal" },
    chicago_or_neoclassical: { color: cssVar("--tr-chicago") || "#8b1e2d", label: "Chicago / doctrinal", short: "Chicago" },
    schumpeterian: { color: cssVar("--tr-schumpet") || "#a06b30", label: "Schumpeterian", short: "Schumpeter" },
    transaction_cost: { color: cssVar("--tr-tce") || "#355c7d", label: "Transaction-cost", short: "TCE" },
    ioclassical: { color: cssVar("--tr-ioclass") || "#1f4f4f", label: "Classical IO", short: "Classical IO" },
    modern_platform: { color: cssVar("--tr-modern") || "#b8412a", label: "Modern / Brandeisian", short: "Brandeisian" },
    free_market: { color: cssVar("--tr-freemkt") || "#6b6b1e", label: "Free-market", short: "Free-market" },
    methodology: { color: cssVar("--tr-method") || "#67625c", label: "Methodology", short: "Methodology" },
    other: { color: cssVar("--tr-other") || "#999", label: "Other", short: "Other" },
  };

  // Primary-tradition assignment by book, since auto-derived sets are noisy.
  // Falls back to the first tradition in the work's `traditions` array.
  const PRIMARY_TRADITION = {
    hayek_1945: "austrian_or_information",
    kirzner_1973: "austrian_or_information",
    schumpeter_1942: "schumpeterian",
    eucken_1952: "ordoliberal_or_structural",
    bork_1978: "chicago_or_neoclassical",
    posner_1976: "chicago_or_neoclassical",
    areeda_hovenkamp_treatise: "chicago_or_neoclassical",
    friedman_1962: "free_market",
    galbraith_1952: "ordoliberal_or_structural", // closest = structural / balance
    williamson_1975: "transaction_cost",
    bain_1956: "ioclassical",
    stigler_1968: "ioclassical",
    chamberlin_1933: "ioclassical",
    robinson_1933: "ioclassical",
    whish_bailey: "ordoliberal_or_structural", // EU-inheritance doctrine
    wu_2018: "modern_platform",
  };

  // Pre-curated tensions (contrastive pairs)
  const TENSIONS = [
    {
      id: "welfare_standard",
      title: "Consumer-welfare standard",
      sub: "The dominant Chicago frame versus the modern neo-Brandeisian challenge: should antitrust optimise consumer welfare alone, or also democratic and structural concerns?",
      left: { work: "bork_1978", thesisIds: ["T1", "T2"], head: "Bork (1978) T1+T2", claim: "Consumer welfare as the sole criterion; efficiency offsets in merger analysis." },
      right: { work: "wu_2018", thesisIds: ["T1", "T2"], head: "Wu (2018) T1+T2", claim: "Concentration threatens democracy; the welfare standard is too narrow." },
    },
    {
      id: "entry_barriers",
      title: "Entry barriers",
      sub: "The classic IO doctrinal tension: Bain's three-source typology versus Stigler's reclassification of most Bainian barriers as efficiency advantages.",
      left: { work: "bain_1956", thesisIds: ["T1"], head: "Bain (1956) T1", claim: "Three sources: economies of scale, product differentiation, absolute cost advantages." },
      right: { work: "stigler_1968", thesisIds: ["T3"], head: "Stigler (1968) T3", claim: "Most Bainian barriers are efficiency advantages, not policy-relevant barriers." },
    },
    {
      id: "knowledge_vs_framework",
      title: "Knowledge problem vs market constitution",
      sub: "Two different solutions to coordination: prices as decentralised information signals (Hayek) versus an institutional framework that secures the competitive order (Eucken).",
      left: { work: "hayek_1945", thesisIds: ["T1", "T2"], head: "Hayek (1945) T1+T2", claim: "Knowledge is dispersed; the price system communicates it without central aggregation." },
      right: { work: "eucken_1952", thesisIds: ["T1", "T3"], head: "Eucken (1952) T1+T3", claim: "A competitive order requires constitutive principles set and maintained by a strong framework-setting state." },
    },
    {
      id: "static_vs_dynamic",
      title: "Static vs dynamic efficiency",
      sub: "Robinson's static welfare loss from imperfect competition versus Schumpeter's dynamic gain from monopoly-funded innovation.",
      left: { work: "robinson_1933", thesisIds: ["T2"], head: "Robinson (1933) T2", claim: "Imperfect competition produces deadweight loss; price exceeds marginal cost." },
      right: { work: "schumpeter_1942", thesisIds: ["T3", "T4"], head: "Schumpeter (1942) T3+T4", claim: "Monopoly profit funds innovation; perfect competition is the wrong benchmark." },
    },
    {
      id: "vertical_integration",
      title: "Vertical integration: motive and welfare",
      sub: "Bork sees vertical restraints as pro-competitive (internalising externalities); Williamson grounds vertical integration in transaction-cost efficiencies. Same direction, different mechanism.",
      left: { work: "bork_1978", thesisIds: ["T3"], head: "Bork (1978) T3", claim: "Vertical restraints solve free-rider problems; per-se prohibition over-deters." },
      right: { work: "williamson_1975", thesisIds: ["T3", "T4"], head: "Williamson (1975) T3+T4", claim: "Asset specificity creates holdup; vertical integration mitigates transaction costs." },
    },
  ];

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  let selectedWorkId = null;
  let selectedConceptKey = null;
  let activeTab = "books";
  let filterEra = "all";
  let filterTraditions = new Set();   // empty = all
  let bookSearchQuery = "";
  let conceptSearchQuery = "";
  let conceptSort = "n_books";        // "n_books" | "n_occurrences" | "alpha"
  let conceptFilter = "multi";        // "multi" | "all" | "canonical"
  let hoveredThesisId = null;          // for hover-sync
  let pinnedThesisId = null;           // for click-pinned focus
  let detailGraphSim = null;           // current d3 simulation (so we can stop it)

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function escapeHTML(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtAuthor(author) {
    return author.replace(/,\s*[A-Z]\.([A-Z]\.)*$/, "").trim();
  }

  function shortTitle(title, max = 80) {
    if (!title) return "";
    if (title.length <= max) return title;
    return title.slice(0, max).replace(/[\s,;:.]+\S*$/, "") + "…";
  }

  function wrapLabel(s, maxChars) {
    const words = s.split(/\s+/);
    if (!words.length) return [s];
    const lines = [[]];
    for (const w of words) {
      const line = lines[lines.length - 1];
      const curLen = line.join(" ").length;
      if (line.length && curLen + 1 + w.length > maxChars) {
        lines.push([w]);
      } else {
        line.push(w);
      }
    }
    return lines.map((l) => l.join(" "));
  }

  function primaryTradition(work) {
    return PRIMARY_TRADITION[work.id] || (work.traditions && work.traditions[0]) || "other";
  }

  function traditionMeta(t) {
    return TRADITION_META[t] || TRADITION_META.other;
  }

  function passesFilters(work) {
    if (filterEra !== "all") {
      const [lo, hi] = filterEra.split("-").map(Number);
      if (work.year_int < lo || work.year_int > hi) return false;
    }
    if (filterTraditions.size > 0 && !filterTraditions.has(primaryTradition(work))) {
      return false;
    }
    return true;
  }

  function passesBookSearch(work) {
    if (!bookSearchQuery) return true;
    const q = bookSearchQuery.toLowerCase();
    if ((work.author || "").toLowerCase().includes(q)) return true;
    if ((work.title || "").toLowerCase().includes(q)) return true;
    if (String(work.year_int).includes(q)) return true;
    if ((work.venue || "").toLowerCase().includes(q)) return true;
    // Match against thesis labels / summaries
    for (const t of work.theses) {
      if ((t.label || "").toLowerCase().includes(q)) return true;
      if ((t.summary || "").toLowerCase().includes(q)) return true;
      // Concept nodes
      for (const e of t.edges) {
        if ((e.s || "").toLowerCase().includes(q) || (e.t || "").toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }

  function workById(id) {
    return DATA.works.find((w) => w.id === id);
  }

  // --------------------------------------------------------------------------
  // Hero: timeline strip
  // --------------------------------------------------------------------------

  function renderTimeline() {
    const el = document.getElementById("canon-timeline");
    if (!el) return;
    el.innerHTML = "";

    const width = el.clientWidth || 900;
    const height = 110;
    const margin = { l: 30, r: 30, t: 18, b: 24 };
    const works = DATA.works.slice().sort((a, b) => a.year_int - b.year_int);
    const years = works.map((w) => w.year_int).filter((y) => y > 0);
    const minY = Math.min(...years, 1933);
    const maxY = Math.max(...years, 2018);

    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    const xScale = d3
      .scaleLinear()
      .domain([minY - 2, maxY + 2])
      .range([margin.l, width - margin.r]);

    const axisY = height - margin.b - 6;

    svg
      .append("line")
      .attr("class", "canon-timeline__axis")
      .attr("x1", margin.l)
      .attr("x2", width - margin.r)
      .attr("y1", axisY)
      .attr("y2", axisY);

    // Decade tick labels along the axis
    const decades = [1940, 1960, 1980, 2000, 2020];
    decades.forEach((y) => {
      if (y < minY - 2 || y > maxY + 2) return;
      svg
        .append("text")
        .attr("class", "canon-timeline__tick-label")
        .attr("x", xScale(y))
        .attr("y", height - 5)
        .text(y);
    });

    // Resolve dot-row collisions horizontally, not vertically:
    // when two works share a year, nudge them apart along the x-axis so they
    // sit side-by-side on a single dot row. This keeps the y-row uniform and
    // lets labels stack consistently above each dot.
    const yearGroups = d3.group(works, (w) => w.year_int);
    const positioned = [];
    yearGroups.forEach((group) => {
      const n = group.length;
      group.forEach((w, i) => {
        const baseX = xScale(w.year_int);
        const dx = n > 1 ? (i - (n - 1) / 2) * 9 : 0;
        positioned.push({ w, cx: baseX + dx, cy: axisY - 14 });
      });
    });

    // Greedy label-placement: assign each dot a label row (0,1,2) so adjacent
    // dots' labels don't overlap.
    const sortedByX = positioned.slice().sort((a, b) => a.cx - b.cx);
    const labelRowY = [axisY - 28, axisY - 41, axisY - 54]; // 3 rows above the axis
    const rowRightEdge = [-Infinity, -Infinity, -Infinity];
    const charPx = 4.2;
    sortedByX.forEach((p) => {
      const labelText = fmtAuthor(p.w.author).split(",")[0].split(" ").pop();
      const w = labelText.length * charPx + 6;
      let chosen = 0;
      for (let r = 0; r < labelRowY.length; r++) {
        if (p.cx - w / 2 > rowRightEdge[r]) {
          chosen = r;
          break;
        }
        if (r === labelRowY.length - 1) chosen = r;
      }
      rowRightEdge[chosen] = p.cx + w / 2;
      p.labelY = labelRowY[chosen];
      p.labelText = labelText;
    });

    // Connect each label to its dot with a faint vertical guide line
    positioned.forEach((p) => {
      svg
        .append("line")
        .attr("class", "canon-timeline__guide")
        .attr("x1", p.cx)
        .attr("x2", p.cx)
        .attr("y1", p.labelY + 2)
        .attr("y2", p.cy - 7);
    });

    // Dots
    positioned.forEach((p) => {
      const t = primaryTradition(p.w);
      const color = traditionMeta(t).color;
      const g = svg.append("g").attr("class", "canon-timeline__group");
      g.append("circle")
        .attr("class", "canon-timeline__dot")
        .attr("data-work-id", p.w.id)
        .attr("cx", p.cx)
        .attr("cy", p.cy)
        .attr("r", 6)
        .attr("fill", color)
        .on("click", () => {
          selectWork(p.w.id);
          setTab("books");
        })
        .on("mouseover", (ev) => showTimelineTooltip(p.w, ev))
        .on("mousemove", (ev) => showTimelineTooltip(p.w, ev))
        .on("mouseout", hideTimelineTooltip);
      g.append("text")
        .attr("class", "canon-timeline__label")
        .attr("x", p.cx)
        .attr("y", p.labelY)
        .text(p.labelText);
    });

    renderTimelineLegend();
    syncTimelineSelection();
  }

  function renderTimelineLegend() {
    const el = document.getElementById("canon-timeline-legend");
    if (!el) return;
    const used = new Set(DATA.works.map(primaryTradition));
    const order = [
      "austrian_or_information",
      "ordoliberal_or_structural",
      "schumpeterian",
      "free_market",
      "transaction_cost",
      "ioclassical",
      "chicago_or_neoclassical",
      "modern_platform",
    ];
    el.innerHTML = order
      .filter((t) => used.has(t))
      .map((t) => {
        const m = traditionMeta(t);
        return `<span class="canon-timeline__legend-item"><span class="canon-timeline__legend-swatch" style="background:${m.color}"></span>${escapeHTML(m.label)}</span>`;
      })
      .join("");
  }

  let timelineTooltipEl = null;
  function showTimelineTooltip(work, ev) {
    if (!timelineTooltipEl) {
      timelineTooltipEl = document.createElement("div");
      timelineTooltipEl.className = "canon-tooltip";
      document.body.appendChild(timelineTooltipEl);
    }
    timelineTooltipEl.innerHTML = `<span class="canon-tooltip__rel">${escapeHTML(fmtAuthor(work.author))} (${escapeHTML(work.year)})</span><div class="canon-tooltip__evidence">${escapeHTML(shortTitle(work.title, 90))}</div>`;
    timelineTooltipEl.classList.add("is-visible");
    timelineTooltipEl.style.left = ev.clientX + 12 + "px";
    timelineTooltipEl.style.top = ev.clientY + 12 + "px";
  }
  function hideTimelineTooltip() {
    if (timelineTooltipEl) timelineTooltipEl.classList.remove("is-visible");
  }

  function syncTimelineSelection() {
    document.querySelectorAll(".canon-timeline__dot").forEach((d) => {
      d.classList.toggle("is-active", d.getAttribute("data-work-id") === selectedWorkId);
    });
  }

  // --------------------------------------------------------------------------
  // Tabs
  // --------------------------------------------------------------------------

  function setTab(name) {
    activeTab = name;
    document.querySelectorAll(".canon-tab").forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".canon-panel").forEach((p) => {
      p.classList.toggle("is-active", p.id === `panel-${name}`);
    });
    if (name === "tensions") {
      renderTensions();
    } else if (name === "concepts") {
      renderConcepts();
    }
  }

  function attachTabHandlers() {
    document.querySelectorAll(".canon-tab").forEach((b) => {
      b.addEventListener("click", () => setTab(b.dataset.tab));
    });
  }

  // --------------------------------------------------------------------------
  // Books panel
  // --------------------------------------------------------------------------

  function renderTraditionFilter() {
    const el = document.getElementById("filter-tradition");
    if (!el) return;
    const used = Array.from(new Set(DATA.works.map(primaryTradition)));
    const order = [
      "austrian_or_information",
      "ordoliberal_or_structural",
      "schumpeterian",
      "free_market",
      "transaction_cost",
      "ioclassical",
      "chicago_or_neoclassical",
      "modern_platform",
    ];
    const ordered = order.filter((t) => used.includes(t));

    const allBtn = `<button class="canon-filter__btn ${filterTraditions.size === 0 ? "is-active" : ""}" data-tradition="__all" type="button">All</button>`;
    const chips = ordered
      .map((t) => {
        const m = traditionMeta(t);
        const active = filterTraditions.has(t) ? "is-active" : "";
        return `<button class="canon-filter__btn canon-filter__btn--tradition ${active}" data-tradition="${escapeHTML(t)}" style="--tradition-color: ${m.color}" type="button"><span class="canon-filter__swatch" style="--tradition-color: ${m.color}"></span>${escapeHTML(m.short)}</button>`;
      })
      .join("");
    el.innerHTML = allBtn + chips;

    el.querySelectorAll(".canon-filter__btn").forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.tradition;
        if (t === "__all") {
          filterTraditions = new Set();
        } else {
          if (filterTraditions.has(t)) filterTraditions.delete(t);
          else filterTraditions.add(t);
        }
        renderTraditionFilter();
        renderList();
      });
    });
  }

  function renderList() {
    const ol = document.getElementById("canon-list");
    const meta = document.getElementById("canon-list-meta");
    if (!ol) return;
    ol.innerHTML = "";
    const filtered = DATA.works.filter(passesFilters).filter(passesBookSearch);
    filtered.forEach((w) => {
      const t = primaryTradition(w);
      const m = traditionMeta(t);
      const li = document.createElement("li");
      li.className = "canon-list__item";
      li.style.setProperty("--tradition-color", m.color);
      if (w.id === selectedWorkId) li.classList.add("is-selected");
      li.dataset.workId = w.id;
      li.innerHTML = `
        <div class="canon-list__head">
          <span class="canon-list__year">${escapeHTML(w.year_int || w.year)}</span>
          <span class="canon-list__author">${escapeHTML(fmtAuthor(w.author))}</span>
          <span class="canon-list__chip">${escapeHTML(m.short)}</span>
        </div>
        <span class="canon-list__title">${escapeHTML(shortTitle(w.title, 78))}</span>
      `;
      li.addEventListener("click", () => selectWork(w.id));
      ol.appendChild(li);
    });
    if (meta) {
      const total = DATA.works.length;
      if (filtered.length === total) {
        meta.innerHTML = `<strong>${total}</strong> works`;
      } else {
        meta.innerHTML = `<strong>${filtered.length}</strong> of ${total} works${bookSearchQuery ? ` matching <em>"${escapeHTML(bookSearchQuery)}"</em>` : ""}`;
      }
    }
  }

  function attachBookSearchHandler() {
    const inp = document.getElementById("book-search");
    if (!inp) return;
    inp.addEventListener("input", (ev) => {
      bookSearchQuery = ev.target.value.trim();
      renderList();
    });
  }

  function attachEraFilterHandlers() {
    document.querySelectorAll(".canon-filter [data-era]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll(".canon-filter [data-era]").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        filterEra = b.dataset.era;
        renderList();
      });
    });
  }

  function selectWork(workId) {
    selectedWorkId = workId;
    pinnedThesisId = null;
    hoveredThesisId = null;
    renderList();
    syncTimelineSelection();
    renderDetail();
  }

  function renderDetail() {
    const panel = document.getElementById("canon-detail");
    if (!panel) return;
    if (!selectedWorkId) {
      panel.innerHTML = '<div class="canon-empty">Select a work from the list or timeline.</div>';
      return;
    }
    const work = workById(selectedWorkId);
    if (!work) return;
    const t = primaryTradition(work);
    const m = traditionMeta(t);

    const thesisCards = work.theses.map((th, i) => {
      const color = THESIS_COLORS[i % THESIS_COLORS.length];
      const focused = pinnedThesisId || hoveredThesisId;
      const active = focused === th.id ? " is-active" : "";
      const dim = focused && focused !== th.id ? " is-dim" : "";
      return `
        <div class="canon-thesis${active}${dim}" data-thesis-id="${th.id}" style="--thesis-color: ${color}">
          <div>
            <span class="canon-thesis__id">${th.id}</span>
            <span class="canon-thesis__label">${escapeHTML(th.label)}</span>
          </div>
          <span class="canon-thesis__summary">${escapeHTML(th.summary)}</span>
        </div>
      `;
    }).join("");

    panel.style.setProperty("--tradition-color", m.color);
    panel.innerHTML = `
      <div class="canon-detail__head">
        <span class="canon-detail__year">${escapeHTML(work.year_int || work.year)}</span>
        <span class="canon-detail__author">${escapeHTML(fmtAuthor(work.author))}</span>
      </div>
      <em class="canon-detail__title">${escapeHTML(work.title)}</em>
      <span class="canon-detail__venue">${escapeHTML(work.venue)}</span>
      <div class="canon-detail__meta">
        <span class="canon-detail__meta-pill canon-detail__meta-pill--tradition" style="background:${m.color}">${escapeHTML(m.label)}</span>
        <span class="canon-detail__meta-pill">${work.n_theses} theses</span>
        <span class="canon-detail__meta-pill">${work.n_edges} edges</span>
        <span class="canon-detail__meta-pill">confidence: ${escapeHTML(work.confidence_overall)}</span>
      </div>
      <div class="canon-detail__body">
        <div class="canon-theses" id="canon-theses">${thesisCards}</div>
        <div class="canon-graph" id="canon-graph">
          <div class="canon-graph__hint">drag · scroll to zoom · hover edges for evidence</div>
        </div>
      </div>
      <div class="canon-related" id="canon-detail-related"></div>
    `;

    document.querySelectorAll(".canon-thesis").forEach((el) => {
      const tid = el.dataset.thesisId;
      el.addEventListener("mouseenter", () => {
        hoveredThesisId = tid;
        applyThesisFocus();
      });
      el.addEventListener("mouseleave", () => {
        if (hoveredThesisId === tid) hoveredThesisId = null;
        applyThesisFocus();
      });
      el.addEventListener("click", () => {
        pinnedThesisId = pinnedThesisId === tid ? null : tid;
        applyThesisFocus();
      });
    });

    renderDetailGraph(work);
    renderRelatedWorks(work);
  }

  function renderRelatedWorks(work) {
    const el = document.getElementById("canon-detail-related");
    if (!el) return;
    const related = (DATA.related_works && DATA.related_works[work.id]) || [];
    if (related.length === 0) {
      el.innerHTML = `
        <h4 class="canon-related__title">Related works <span class="canon-related__sub">no other works share canonical concepts with this one</span></h4>
        <div class="canon-related__empty">${escapeHTML(fmtAuthor(work.author))}&rsquo;s vocabulary is distinctive enough that no other work in the corpus shares a canonical concept with it. (This is itself an interesting result for tracing intellectual lineage.)</div>
      `;
      return;
    }
    const cards = related.map((r) => {
      const other = workById(r.book_id);
      if (!other) return "";
      const c = traditionMeta(primaryTradition(other)).color;
      const sharedTags = r.shared.map((s) => `<span>${escapeHTML(s)}</span>`).join("");
      return `
        <button class="canon-related__card" data-work-id="${escapeHTML(r.book_id)}" style="--tradition-color: ${c}" type="button">
          <span class="canon-related__card-head">
            <span class="canon-related__year">${escapeHTML(r.year)}</span>
            <span class="canon-related__author">${escapeHTML(fmtAuthor(r.author))}</span>
            <span class="canon-related__count">${r.n_shared} shared${r.n_shared_canonical ? ` · ${r.n_shared_canonical} canonical` : ""}</span>
          </span>
          <span class="canon-related__shared">${sharedTags}</span>
        </button>
      `;
    }).join("");
    el.innerHTML = `
      <h4 class="canon-related__title">Related works <span class="canon-related__sub">by shared canonical concepts</span></h4>
      <div class="canon-related__list">${cards}</div>
    `;
    el.querySelectorAll(".canon-related__card").forEach((c) => {
      c.addEventListener("click", () => selectWork(c.dataset.workId));
    });
  }

  // --------------------------------------------------------------------------
  // Detail graph with thesis-cluster layout
  // --------------------------------------------------------------------------

  function renderDetailGraph(work) {
    const container = document.getElementById("canon-graph");
    if (!container) return;
    container.querySelectorAll("svg, .canon-tooltip").forEach((n) => n.remove());

    if (detailGraphSim) detailGraphSim.stop();

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 540;

    const { nodes, links, nodeIndex } = buildGraphFromWork(work);

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

    addArrowDefs(svg);

    const root = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on("zoom", (ev) => root.attr("transform", ev.transform)));

    const tooltip = createTooltip(container);

    const linkSel = root
      .append("g")
      .attr("class", "canon-edges")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("class", "canon-edge")
      .attr("stroke", (d) => d.color)
      .attr("marker-end", (d) => `url(#arrow-${d.thesisIdx})`)
      .on("mouseover", function (ev, d) {
        d3.select(this).classed("is-hover", true);
        showTooltip(tooltip, container, ev,
          `<span class="canon-tooltip__rel">${escapeHTML(d.source.id || d.source)} <strong>${escapeHTML(d.rel_exact || d.rel)}</strong> ${escapeHTML(d.target.id || d.target)}</span><div class="canon-tooltip__evidence">${escapeHTML(d.evi || "")}</div>`);
      })
      .on("mousemove", (ev, d) => showTooltip(tooltip, container, ev,
        `<span class="canon-tooltip__rel">${escapeHTML(d.source.id || d.source)} <strong>${escapeHTML(d.rel_exact || d.rel)}</strong> ${escapeHTML(d.target.id || d.target)}</span><div class="canon-tooltip__evidence">${escapeHTML(d.evi || "")}</div>`))
      .on("mouseout", function () {
        d3.select(this).classed("is-hover", false);
        hideTooltip(tooltip);
      });

    const nodeSel = root
      .append("g")
      .attr("class", "canon-nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "canon-node");

    nodeSel.append("circle").attr("r", (d) => Math.max(20, 6 + Math.sqrt(d.label.length) * 4));
    nodeSel.each(function (d) {
      const sel = d3.select(this);
      const lines = wrapLabel(d.label, 12);
      const lineHeight = 11;
      const baseY = -(lineHeight * (lines.length - 1)) / 2;
      lines.forEach((line, i) => {
        sel.append("text").attr("x", 0).attr("y", baseY + i * lineHeight).text(line);
      });
    });

    nodeSel
      .on("mouseenter", function (ev, d) {
        // Hover-sync: light up theses that contain this node.
        const theses = Array.from(d.theses);
        if (theses.length === 1) {
          hoveredThesisId = theses[0];
          applyThesisFocus();
        }
        d3.select(this).classed("is-hover", true);
      })
      .on("mouseleave", function () {
        if (hoveredThesisId) {
          hoveredThesisId = null;
          applyThesisFocus();
        }
        d3.select(this).classed("is-hover", false);
      });

    nodeSel.call(
      d3
        .drag()
        .on("start", (ev, d) => {
          if (!ev.active) detailGraphSim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => {
          if (!ev.active) detailGraphSim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Thesis-cluster layout: arrange thesis centroids in a circle around the
    // viewport centre and apply a positional force per node toward its
    // primary thesis centroid.
    const thesisIds = work.theses.map((t) => t.id);
    const centroids = computeClusterCentroids(thesisIds, width, height);

    // Each node may belong to multiple theses; use its primary (first encountered).
    nodes.forEach((n) => {
      const primary = n.thesesArr[0];
      n.cx = centroids[primary].x;
      n.cy = centroids[primary].y;
    });

    detailGraphSim = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(80).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("collide", d3.forceCollide(40))
      .force("clusterX", d3.forceX((d) => d.cx).strength(0.18))
      .force("clusterY", d3.forceY((d) => d.cy).strength(0.18))
      .stop();

    // Pre-settle synchronously so the initial render is always visible
    // (headless/throttled environments sometimes don't auto-run the simulation).
    for (let i = 0; i < 240; i++) detailGraphSim.tick();
    linkSel.attr("d", linkPath);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Re-attach the tick handler so subsequent drag-induced restarts update DOM
    detailGraphSim.on("tick", () => {
      linkSel.attr("d", linkPath);
      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    applyThesisFocus();
  }

  function computeClusterCentroids(thesisIds, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.27;
    const out = {};
    if (thesisIds.length === 1) {
      out[thesisIds[0]] = { x: cx, y: cy };
      return out;
    }
    thesisIds.forEach((id, i) => {
      const angle = (i / thesisIds.length) * Math.PI * 2 - Math.PI / 2;
      out[id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return out;
  }

  function applyThesisFocus() {
    const focus = pinnedThesisId || hoveredThesisId;
    // Cards
    document.querySelectorAll(".canon-thesis").forEach((c) => {
      const tid = c.dataset.thesisId;
      c.classList.toggle("is-active", focus === tid);
      c.classList.toggle("is-dim", !!focus && focus !== tid);
    });
    // Graph
    d3.selectAll("#canon-graph .canon-edge").classed("is-dim", (d) => focus && d.thesis !== focus);
    d3.selectAll("#canon-graph .canon-node").classed("is-dim", (d) => focus && !d.theses.has(focus));
  }

  function buildGraphFromWork(work) {
    const nodes = [];
    const nodeIndex = new Map();
    const links = [];
    work.theses.forEach((t, ti) => {
      const color = THESIS_COLORS[ti % THESIS_COLORS.length];
      t.edges.forEach((e) => {
        for (const txt of [e.s, e.t]) {
          if (!txt) continue;
          if (!nodeIndex.has(txt)) {
            const n = { id: txt, label: txt, theses: new Set(), thesesArr: [] };
            nodeIndex.set(txt, n);
            nodes.push(n);
          }
          const n = nodeIndex.get(txt);
          if (!n.theses.has(t.id)) {
            n.theses.add(t.id);
            n.thesesArr.push(t.id);
          }
        }
        links.push({
          source: e.s,
          target: e.t,
          rel: e.rel,
          rel_exact: e.rel_exact,
          dir: e.dir,
          evi: e.evi,
          thesis: t.id,
          thesisIdx: ti,
          color,
        });
      });
    });
    return { nodes, links, nodeIndex };
  }

  function linkPath(d) {
    const dx = d.target.x - d.source.x;
    const dy = d.target.y - d.source.y;
    const dr = Math.sqrt(dx * dx + dy * dy) * 1.6;
    return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
  }

  function addArrowDefs(svg) {
    const defs = svg.append("defs");
    THESIS_COLORS.forEach((c, i) => {
      defs
        .append("marker")
        .attr("id", `arrow-${i}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 21)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", c);
    });
  }

  function createTooltip(container) {
    const el = document.createElement("div");
    el.className = "canon-tooltip";
    container.appendChild(el);
    return el;
  }
  function showTooltip(el, container, ev, html) {
    el.innerHTML = html;
    el.classList.add("is-visible");
    const r = container.getBoundingClientRect();
    const x = Math.min(r.width - 310, Math.max(0, ev.clientX - r.left + 12));
    const y = Math.min(r.height - 80, Math.max(0, ev.clientY - r.top + 12));
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
  function hideTooltip(el) {
    el.classList.remove("is-visible");
  }

  // --------------------------------------------------------------------------
  // Tensions panel
  // --------------------------------------------------------------------------

  let tensionsRendered = false;
  function renderTensions() {
    if (tensionsRendered) return;
    const host = document.getElementById("canon-tensions");
    if (!host) return;
    host.innerHTML = "";
    TENSIONS.forEach((t) => host.appendChild(renderTensionCard(t)));
    tensionsRendered = true;
  }

  function renderTensionCard(t) {
    const leftWork = workById(t.left.work);
    const rightWork = workById(t.right.work);
    if (!leftWork || !rightWork) return document.createElement("div");

    const sharedConcepts = computeSharedConcepts(leftWork, t.left.thesisIds, rightWork, t.right.thesisIds);

    const card = document.createElement("div");
    card.className = "canon-tension";
    card.id = `tension-${t.id}`;
    card.innerHTML = `
      <h3 class="canon-tension__head">${escapeHTML(t.title)}</h3>
      <p class="canon-tension__sub">${escapeHTML(t.sub)}</p>
      ${sharedConcepts.length ? `<div class="canon-tension__shared"><span class="canon-tension__shared-swatch"></span><span>Shared concepts: <em>${sharedConcepts.map(escapeHTML).join(", ")}</em></span></div>` : ""}
      <div class="canon-tension__panes">
        <div class="canon-tension__pane">
          <div class="canon-tension__pane-head">${escapeHTML(t.left.head)}</div>
          <div class="canon-tension__pane-claim">${escapeHTML(t.left.claim)}</div>
          <div class="canon-tension__graph" data-side="left" data-tension-id="${t.id}"></div>
        </div>
        <div class="canon-tension__pane">
          <div class="canon-tension__pane-head">${escapeHTML(t.right.head)}</div>
          <div class="canon-tension__pane-claim">${escapeHTML(t.right.claim)}</div>
          <div class="canon-tension__graph" data-side="right" data-tension-id="${t.id}"></div>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      renderTensionGraph(card.querySelector('.canon-tension__graph[data-side="left"]'), leftWork, t.left.thesisIds, sharedConcepts);
      renderTensionGraph(card.querySelector('.canon-tension__graph[data-side="right"]'), rightWork, t.right.thesisIds, sharedConcepts);
    });

    return card;
  }

  function computeSharedConcepts(workA, thesesA, workB, thesesB) {
    const setA = new Set();
    const setB = new Set();
    workA.theses.filter((t) => thesesA.includes(t.id)).forEach((t) => {
      t.edges.forEach((e) => { setA.add(normaliseConcept(e.s)); setA.add(normaliseConcept(e.t)); });
    });
    workB.theses.filter((t) => thesesB.includes(t.id)).forEach((t) => {
      t.edges.forEach((e) => { setB.add(normaliseConcept(e.s)); setB.add(normaliseConcept(e.t)); });
    });
    // Also match by semantic near-match — e.g. "consumer welfare" ~ "consumer welfare standard"
    const out = [];
    setA.forEach((a) => {
      if (setB.has(a)) {
        out.push(a);
        return;
      }
      // Fuzzy: substring match either direction
      for (const b of setB) {
        if (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a))) {
          out.push(a);
          return;
        }
      }
    });
    return Array.from(new Set(out)).slice(0, 6);
  }

  function normaliseConcept(s) {
    return (s || "").trim().toLowerCase();
  }

  function renderTensionGraph(container, work, thesisIds, sharedConcepts) {
    if (!container) return;
    const width = container.clientWidth || 380;
    const height = container.clientHeight || 360;

    const filteredWork = {
      ...work,
      theses: work.theses.filter((t) => thesisIds.includes(t.id)),
    };
    const { nodes, links } = buildGraphFromWork(filteredWork);

    const sharedSet = new Set(sharedConcepts.map((s) => s.toLowerCase()));
    // Apply fuzzy: if any shared phrase is a substring of node label, mark it
    function isShared(label) {
      const lab = label.toLowerCase();
      if (sharedSet.has(lab)) return true;
      for (const s of sharedSet) {
        if (s.length > 5 && lab.length > 5 && (lab.includes(s) || s.includes(lab))) {
          return true;
        }
      }
      return false;
    }

    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    addArrowDefs(svg);
    const root = svg.append("g");

    const linkSel = root.append("g").selectAll("path").data(links).join("path")
      .attr("class", "canon-edge")
      .attr("stroke", (d) => d.color)
      .attr("marker-end", (d) => `url(#arrow-${d.thesisIdx})`);

    const nodeSel = root.append("g").selectAll("g").data(nodes).join("g")
      .attr("class", (d) => "canon-node" + (isShared(d.label) ? " is-shared" : ""));

    nodeSel.append("circle").attr("r", (d) => Math.max(16, 5 + Math.sqrt(d.label.length) * 3.2));
    nodeSel.each(function (d) {
      const sel = d3.select(this);
      const lines = wrapLabel(d.label, 10);
      const lineHeight = 9;
      const baseY = -(lineHeight * (lines.length - 1)) / 2;
      lines.forEach((line, i) => {
        sel.append("text").attr("x", 0).attr("y", baseY + i * lineHeight).attr("style", "font-size: 8.5px").text(line);
      });
    });

    // Tight, settled layout for static rendering inside a small pane:
    // run a higher number of ticks with stronger centering and gravity,
    // so nodes don't drift out of frame.
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(48).strength(0.85))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("centerX", d3.forceX(width / 2).strength(0.08))
      .force("centerY", d3.forceY(height / 2).strength(0.08))
      .force("collide", d3.forceCollide(26))
      .stop();

    for (let i = 0; i < 220; i++) sim.tick();

    // Constrain nodes inside the SVG viewBox after settling
    const pad = 26;
    nodes.forEach((n) => {
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    });

    linkSel.attr("d", linkPath);
    nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  function renderStats() {
    const el = document.getElementById("canon-stats");
    if (!el) return;
    const nTheses = DATA.works.reduce((a, w) => a + w.n_theses, 0);
    const nEdges = DATA.works.reduce((a, w) => a + w.n_edges, 0);
    const minY = Math.min(...DATA.works.map((w) => w.year_int).filter((y) => y > 0));
    const maxY = Math.max(...DATA.works.map((w) => w.year_int).filter((y) => y > 0));
    const usedTraditions = new Set(DATA.works.map(primaryTradition));
    const rows = [
      { num: DATA.works.length, label: "Works" },
      { num: nTheses, label: "Theses" },
      { num: nEdges, label: "Edges" },
      { num: usedTraditions.size, label: "Traditions" },
      { num: `${minY}–${maxY}`, label: "Span" },
    ];
    el.innerHTML = rows
      .map((r) => `<div><span class="canon-stats__num">${escapeHTML(r.num)}</span><span class="canon-stats__label">${escapeHTML(r.label)}</span></div>`)
      .join("");
  }

  // --------------------------------------------------------------------------
  // Concepts panel
  // --------------------------------------------------------------------------

  function passesConceptSearch(c) {
    if (!conceptSearchQuery) return true;
    const q = conceptSearchQuery.toLowerCase();
    if ((c.label || "").toLowerCase().includes(q)) return true;
    for (const sf of c.surface_forms || []) {
      if (sf.toLowerCase().includes(q)) return true;
    }
    return false;
  }

  function passesConceptFilter(c) {
    if (conceptFilter === "all") return true;
    if (conceptFilter === "multi") return c.n_books >= 2;
    if (conceptFilter === "canonical") return c.is_canonical;
    return true;
  }

  function conceptSorter(a, b) {
    if (conceptSort === "alpha") return a.label.localeCompare(b.label);
    if (conceptSort === "n_occurrences") {
      return (b.n_occurrences - a.n_occurrences) || (b.n_books - a.n_books) || a.label.localeCompare(b.label);
    }
    return (b.n_books - a.n_books) || (b.n_occurrences - a.n_occurrences) || a.label.localeCompare(b.label);
  }

  function renderConcepts() {
    if (!DATA.concepts) return;
    const list = document.getElementById("concepts-list");
    const meta = document.getElementById("concept-list-meta");
    if (!list) return;
    const filtered = DATA.concepts.filter(passesConceptSearch).filter(passesConceptFilter).sort(conceptSorter);
    list.innerHTML = filtered.map((c) => {
      const sel = c.key === selectedConceptKey ? " is-selected" : "";
      const canon = c.is_canonical ? " concept-list__label--canonical" : "";
      return `<li class="concept-list__item${sel}" data-concept-key="${escapeHTML(c.key)}">
        <span class="concept-list__count">${c.n_books}</span>
        <span class="concept-list__label${canon}">${escapeHTML(c.label)}</span>
        <span class="concept-list__occ">${c.n_occurrences}×</span>
      </li>`;
    }).join("");
    list.querySelectorAll(".concept-list__item").forEach((el) => {
      el.addEventListener("click", () => {
        selectedConceptKey = el.dataset.conceptKey;
        renderConcepts();
      });
    });
    if (meta) {
      const total = DATA.concepts.length;
      meta.innerHTML = `<strong>${filtered.length}</strong> of ${total} concepts${conceptSearchQuery ? ` matching <em>"${escapeHTML(conceptSearchQuery)}"</em>` : ""}`;
    }
    if (!selectedConceptKey && filtered.length > 0) {
      selectedConceptKey = filtered[0].key;
      renderConcepts();
      return;
    }
    renderConceptDetail();
  }

  function renderConceptDetail() {
    const panel = document.getElementById("concept-detail");
    if (!panel) return;
    if (!selectedConceptKey) {
      panel.innerHTML = '<div class="canon-empty">Select a concept from the list.</div>';
      return;
    }
    const c = DATA.concepts.find((x) => x.key === selectedConceptKey);
    if (!c) {
      panel.innerHTML = '<div class="canon-empty">Concept not found.</div>';
      return;
    }
    const surfaces = (c.surface_forms || []).length > 1
      ? `<div class="concept-detail__surface">Surface forms: <em>${c.surface_forms.map(escapeHTML).join(" · ")}</em></div>`
      : "";
    const books = c.books.map((bookId) => {
      const w = workById(bookId);
      if (!w) return "";
      const tc = traditionMeta(primaryTradition(w)).color;
      const bookInfo = c.by_book[bookId];
      const edges = bookInfo.edges.map((e) => {
        const rel = e.rel_exact || e.rel;
        const left = e.role === "source" ? e.raw_label : e.other;
        const right = e.role === "source" ? e.other : e.raw_label;
        return `<li><span class="concept-book__edge-thesis">${escapeHTML(e.thesis)}</span> <strong>${escapeHTML(left)}</strong> <em>${escapeHTML(rel)}</em> <strong>${escapeHTML(right)}</strong></li>`;
      }).join("");
      return `<div class="concept-book" style="--tradition-color: ${tc}">
        <button class="concept-book__head" data-work-id="${escapeHTML(bookId)}" type="button">
          <span class="concept-book__year">${escapeHTML(w.year_int)}</span>
          <span class="concept-book__author">${escapeHTML(fmtAuthor(w.author))}</span>
          <span class="concept-book__edges">${bookInfo.edges.length} edge${bookInfo.edges.length === 1 ? "" : "s"}</span>
        </button>
        <ul class="concept-book__edges-list">${edges}</ul>
      </div>`;
    }).join("");
    panel.innerHTML = `
      <h3 class="concept-detail__name">${escapeHTML(c.label)}</h3>
      <div class="concept-detail__meta">
        <span class="meta-pill">${c.n_books} book${c.n_books === 1 ? "" : "s"}</span>
        <span class="meta-pill">${c.n_occurrences} occurrence${c.n_occurrences === 1 ? "" : "s"}</span>
        ${c.is_canonical ? '<span class="meta-pill meta-pill--canonical">◆ Canonical concept</span>' : '<span class="meta-pill">raw label (unmatched in ER)</span>'}
      </div>
      ${surfaces}
      <div class="concept-detail__books">${books}</div>
    `;
    panel.querySelectorAll(".concept-book__head").forEach((el) => {
      el.addEventListener("click", () => {
        selectWork(el.dataset.workId);
        setTab("books");
      });
    });
  }

  function attachConceptControls() {
    const inp = document.getElementById("concept-search");
    if (inp) {
      inp.addEventListener("input", (ev) => {
        conceptSearchQuery = ev.target.value.trim();
        const filtered = DATA.concepts.filter(passesConceptSearch).filter(passesConceptFilter);
        if (!filtered.find((c) => c.key === selectedConceptKey)) selectedConceptKey = null;
        renderConcepts();
      });
    }
    document.querySelectorAll("[data-concept-sort]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("[data-concept-sort]").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        conceptSort = b.dataset.conceptSort;
        renderConcepts();
      });
    });
    document.querySelectorAll("[data-concept-filter]").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("[data-concept-filter]").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        conceptFilter = b.dataset.conceptFilter;
        selectedConceptKey = null;
        renderConcepts();
      });
    });
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  function boot() {
    renderStats();
    renderTimeline();
    renderTraditionFilter();
    attachEraFilterHandlers();
    attachTabHandlers();
    attachBookSearchHandler();
    attachConceptControls();
    if (DATA.works.length) {
      // Default to a famous, simple example
      selectWork(DATA.works.find((w) => w.id === "hayek_1945")?.id || DATA.works[0].id);
    }
    window.addEventListener("resize", () => {
      // Re-render timeline only if viewport changed substantially
      const el = document.getElementById("canon-timeline");
      if (el && el.firstElementChild && Math.abs(el.firstElementChild.clientWidth - el.clientWidth) > 50) {
        renderTimeline();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
