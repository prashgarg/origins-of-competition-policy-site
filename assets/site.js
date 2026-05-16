const data = window.HC_SITE_DATA || {};

const fmt = (value) => new Intl.NumberFormat("en-GB").format(value || 0);

const esc = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const familyLabel = (value = "") =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace("And", "and");

const humanize = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function sourceFamilyLabel(value = "") {
  return {
    foreclosure_vertical: "Vertical foreclosure",
    coordination_concentration: "Coordination and concentration",
    entry_barriers: "Entry barriers",
    unilateral_pricing: "Unilateral pricing",
    market_definition_legal: "Market definition",
  }[value] || familyLabel(value);
}

const signClass = (value = "") => {
  const sign = String(value).toLowerCase();
  if (sign.includes("decrease") || sign.includes("mitigat") || sign.includes("reduce")) return "sign--decrease";
  if (sign.includes("increase") || sign.includes("raise") || sign.includes("worsen")) return "sign--increase";
  return "sign--neutral";
};

function cleanCaseTitle(row = {}) {
  const raw = String(row.title || row.caseId || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const historical = raw.match(/^((?:19|20)\d{2}s)\s+(.+)$/i);
  if (historical) {
    const body = historical[2].replace(/^\d+/, "").trim();
    if (body) return normalizeCaseTitle(toTitleCase(body));
  }
  return normalizeCaseTitle(raw);
}

function toTitleCase(value = "") {
  return value.replace(/\b[a-z][a-z-]*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function normalizeCaseTitle(value = "") {
  return value
    .replace(/\bS P Global\b/g, "S&P Global")
    .replace(/\bS A\b/g, "SA")
    .replace(/\bB V\b/g, "BV")
    .replace(/\bN V\b/g, "NV")
    .replace(/\bP L C\b/g, "PLC")
    .replace(/\bL T D\b/g, "Ltd")
    .replace(/\bPlc\b/g, "PLC")
    .replace(/\bplc\b/g, "PLC")
    .replace(/\bltd\b/g, "Ltd")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .replace(/\bOn\b/g, "on")
    .replace(/\bIn\b/g, "in")
    .replace(/\bThe\b/g, "the")
    .replace(/^the\b/, "The")
    .replace(/\s+CC$/g, "")
    .trim();
}

function sourceGroup(row = {}) {
  const corpus = String(row.corpus || "");
  if (corpus.includes("cma")) return "Modern CMA";
  if (corpus.includes("cc")) return "Competition Commission";
  if (corpus.includes("oft")) return "OFT";
  if (corpus.includes("historical") || /^\d{4}s_/.test(row.caseId || "")) return "Historical UK";
  return "UK competition case";
}

function docStatusLabel(doc) {
  if (!doc) return "Document not mapped";
  if (doc.status === "available") return doc.type === "pdf" ? "PDF available" : "HTML available";
  if (doc.status === "too_large") return "Large source";
  return "Document pending";
}

function caseListMeta(row = {}) {
  const doc = row.document;
  const parts = [];
  if (row.year) parts.push(row.year);
  if (!doc || doc.status !== "available") parts.push(docStatusLabel(doc));
  return parts.join(" · ");
}

function relationKey(edge) {
  return `${String(edge.source || "").trim().toLowerCase()}|${String(edge.target || "").trim().toLowerCase()}|${String(edge.sign || "").trim().toLowerCase()}`;
}

const nodeNotes = {
  "barriers to entry": "Conditions that make timely entry or expansion less likely.",
  "competitive constraint": "Pressure from rivals, entry, buyers, or alternatives that limits conduct.",
  "price increase": "A higher price, fare, fee, or charge relative to the counterfactual.",
  "market concentration": "A more concentrated market structure or reduced number of effective competitors.",
  "horizontal merger": "A merger between firms active at the same level of supply.",
  "vertical integration": "Common ownership or control across adjacent levels of supply.",
  "input foreclosure": "A rival is denied or disadvantaged in access to an input.",
  "market share": "A party's share of sales, capacity, supply, or another market measure.",
  "closeness of competition": "How directly two firms constrain each other before the transaction.",
  "substantial lessening of competition": "The legal harm standard used in UK merger control.",
  "service quality": "Quality, range, reliability, or service dimensions other than price.",
  "product differentiation": "Differences across products that affect substitution and competitive pressure.",
};

const nodeKinds = {
  "barriers to entry": "Mechanism",
  "competitive constraint": "Constraint",
  "price increase": "Outcome",
  "market concentration": "Market structure",
  "horizontal merger": "Transaction type",
  "vertical integration": "Transaction type",
  "input foreclosure": "Mechanism",
  "market share": "Diagnostic",
  "closeness of competition": "Diagnostic",
  "substantial lessening of competition": "Legal standard",
  "service quality": "Outcome",
  "product differentiation": "Market feature",
};

function nodeNote(label = "") {
  return nodeNotes[String(label).toLowerCase()] || "Extracted concept node from the policy mechanism graph.";
}

function nodeKind(label = "") {
  return nodeKinds[String(label).toLowerCase()] || "Concept";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function initFacts() {
  if (!data.headline) return;
  setText("fact-cases", data.headline.casesLabel);
  setText("fact-tohs", data.headline.tohsLabel);
  setText("fact-edges", data.headline.edgesLabel);
  setText("updated-label", `Updated ${data.updated}`);
}

function edgePath(edge) {
  return `${edge.source} → ${edge.target}`;
}

function renderEdgeInspector(edge, index) {
  const el = document.getElementById("edge-inspector");
  if (!el || !edge) return;
  const cases = data.relationshipCases?.[relationKey(edge)] || [];
  el.innerHTML = `
    <div class="mechanism-card">
      <h3>
        ${esc(edge.source)}
        <span class="fact-tip-wrap node-tip">
          <button class="fact-info" type="button" aria-label="${esc(edge.source)} definition">i</button>
          <span class="fact-tip" role="tooltip">${esc(nodeNote(edge.source))}</span>
        </span>
      </h3>
      <p class="path ${signClass(edge.sign)}">
        → ${esc(edge.target)}
        <span class="fact-tip-wrap node-tip">
          <button class="fact-info" type="button" aria-label="${esc(edge.target)} definition">i</button>
          <span class="fact-tip" role="tooltip">${esc(nodeNote(edge.target))}</span>
        </span>
      </p>
      <p class="mechanism-card__meta">${fmt(cases.length || edge.cases)} cases</p>
    </div>
    <div class="relationship-cases">
      <h4>Cases</h4>
      ${
        cases.length
          ? cases
              .map(
                (item) => `
                  <button type="button" data-open-case="${esc(item.caseId)}">
                    <header>
                      <strong>${esc(cleanCaseTitle(item))}</strong>
                      <span>${esc(item.year || "")}</span>
                    </header>
                    ${item.claim ? `<p>${esc(item.claim)}</p>` : ""}
                  </button>
                `
              )
              .join("")
          : `<p class="list-note">Cases are not indexed for this relationship yet.</p>`
      }
    </div>
  `;
  el.querySelectorAll("[data-open-case]").forEach((button) => {
    button.addEventListener("click", () => openCase(button.dataset.openCase));
  });

  const caption = document.getElementById("home-edge-caption");
  if (caption) {
    caption.textContent = `${edgePath(edge)} · ${fmt(edge.edges)} edges · ${fmt(edge.cases)} cases`;
  }
}

function initMechanisms() {
  const list = document.getElementById("edge-list");
  if (!list || !data.topEdges?.length) return;

  const visibleEdges = data.topEdges.slice(0, 12);

  list.innerHTML = visibleEdges
    .map(
      (edge, index) => `
        <button class="edge-row ${index === 0 ? "is-active" : ""} ${signClass(edge.sign)}" data-edge-index="${index}">
          <span class="edge-rank">${String(index + 1).padStart(2, "0")}</span>
          <span class="edge-path">
            <span>${esc(edge.source)}</span>
            <b>→</b>
            <span>${esc(edge.target)}</span>
          </span>
          <span class="edge-mark ${signClass(edge.sign)}" aria-hidden="true"></span>
        </button>
      `
    )
    .join("") +
    (data.topEdges.length > visibleEdges.length
      ? `<p class="list-note">12 of ${fmt(data.topEdges.length)} shown</p>`
      : "");

  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-edge-index]");
    if (!row) return;
    list.querySelectorAll(".edge-row").forEach((item) => item.classList.remove("is-active"));
    row.classList.add("is-active");
    const index = Number(row.dataset.edgeIndex);
    selectMechanism(data.topEdges[index], index);
  });

  renderMechanismNetwork(visibleEdges);
  initMechanismViewSwitch();
  selectMechanism(data.topEdges[0], 0);
}

function selectMechanism(edge, index) {
  renderEdgeInspector(edge, index);
  document.querySelectorAll("[data-edge-index]").forEach((item) => {
    item.classList.toggle("is-active", Number(item.dataset.edgeIndex) === index);
  });
}

function renderMechanismNetwork(edges) {
  const el = document.getElementById("edge-network");
  if (!el) return;
  const labels = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))].slice(0, 18);
  const layout = {
    "barriers to entry": { x: 120, y: 120, anchor: "start" },
    "product differentiation": { x: 130, y: 230, anchor: "start" },
    "market share": { x: 120, y: 350, anchor: "start" },
    "horizontal merger": { x: 165, y: 470, anchor: "start" },
    "market concentration": { x: 350, y: 505, anchor: "middle" },
    "closeness of competition": { x: 365, y: 125, anchor: "middle" },
    "competitive constraint": { x: 480, y: 300, anchor: "middle" },
    "substantial lessening of competition": { x: 560, y: 500, anchor: "middle" },
    "service quality": { x: 730, y: 450, anchor: "end" },
    "price increase": { x: 735, y: 315, anchor: "end" },
    "input foreclosure": { x: 720, y: 185, anchor: "end" },
    "vertical integration": { x: 650, y: 90, anchor: "end" },
  };
  const positions = new Map();
  labels.forEach((label, i) => {
    const fixed = layout[String(label).toLowerCase()];
    positions.set(label, fixed || { x: 170 + (i % 5) * 140, y: 120 + Math.floor(i / 5) * 120, anchor: "middle" });
  });
  const visible = edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target));
  const viewBox = window.innerWidth < 700 ? "70 55 710 500" : "35 28 790 548";
  const trimEdge = (a, b, startGap = 16, endGap = 30) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    return {
      start: { x: a.x + ux * startGap, y: a.y + uy * startGap },
      end: { x: b.x - ux * endGap, y: b.y - uy * endGap },
    };
  };
  el.innerHTML = `
    <svg viewBox="${viewBox}" role="img" aria-label="Network of common mechanism relationships">
      <defs>
        <marker id="arrow-increase" markerWidth="5.6" markerHeight="5.6" refX="5" refY="2.8" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L5.6,2.8 L0,5.6 Z"></path>
        </marker>
        <marker id="arrow-decrease" markerWidth="5.6" markerHeight="5.6" refX="5" refY="2.8" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L5.6,2.8 L0,5.6 Z"></path>
        </marker>
      </defs>
      ${visible
        .map((edge, index) => {
          const a = positions.get(edge.source);
          const b = positions.get(edge.target);
          const trimmed = trimEdge(a, b);
          const dx = trimmed.end.x - trimmed.start.x;
          const dy = trimmed.end.y - trimmed.start.y;
          const bend = Math.max(-55, Math.min(55, dx * 0.08 - dy * 0.05));
          const mx = (trimmed.start.x + trimmed.end.x) / 2 - bend;
          const my = (trimmed.start.y + trimmed.end.y) / 2 + bend;
          return `<g class="network-edge-button" data-edge-index="${index}" tabindex="0" role="button" aria-label="${esc(edgePath(edge))}">
            <path class="network-edge ${signClass(edge.sign)}" d="M ${trimmed.start.x} ${trimmed.start.y} Q ${mx} ${my} ${trimmed.end.x} ${trimmed.end.y}"></path>
          </g>`;
        })
        .join("")}
      ${labels
        .map((label) => {
          const p = positions.get(label);
          const tipX = Math.max(60, Math.min(620, p.x - 118));
          const tipY = p.y < 210 ? p.y + 45 : p.y - 112;
          return `<g class="network-node" tabindex="0">
            <title>${esc(`${nodeKind(label)}. ${nodeNote(label)}`)}</title>
            <circle cx="${p.x}" cy="${p.y}" r="11"></circle>
            <text x="${p.x}" y="${p.y + 33}" text-anchor="${p.anchor || "middle"}">${esc(label)}</text>
            <foreignObject class="network-node-tip" x="${tipX}" y="${tipY}" width="236" height="88">
              <div xmlns="http://www.w3.org/1999/xhtml">
                <strong>${esc(nodeKind(label))}</strong>
                <span>${esc(nodeNote(label))}</span>
              </div>
            </foreignObject>
          </g>`;
        })
        .join("")}
    </svg>
  `;
  el.querySelectorAll("[data-edge-index]").forEach((button) => {
    const select = () => selectMechanism(visible[Number(button.dataset.edgeIndex)], Number(button.dataset.edgeIndex));
    button.addEventListener("click", select);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") select();
    });
  });
}

function initMechanismViewSwitch() {
  const buttons = [...document.querySelectorAll("[data-mechanism-view]")];
  const views = [...document.querySelectorAll(".mechanism-view")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      views.forEach((view) => {
        const active = button.dataset.mechanismView === "list"
          ? view.id === "edge-list"
          : view.id === "edge-network";
        view.classList.toggle("is-active", active);
      });
    });
  });
}

function initTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".tab-panel")];

  const activate = (name) => {
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    panels.forEach((panel) => panel.classList.toggle("is-active", panel.id === `tab-${name}`));
    if (location.pathname.endsWith("explore.html")) {
      const originSubhash = location.hash === "#origins-families" || location.hash === "#origins-sources";
      const nextUrl = name === "origins" && originSubhash
        ? location.hash
        : name === "mechanisms"
          ? "explore.html"
          : `#${name}`;
      history.replaceState(null, "", nextUrl);
    }
  };
  window.HC_ACTIVATE_TAB = activate;

  tabs.forEach((tab) => tab.addEventListener("click", () => activate(tab.dataset.tab)));
  document.querySelectorAll("[data-tab-link]").forEach((link) => {
    link.addEventListener("click", () => {
      const tab = link.dataset.tabLink;
      window.setTimeout(() => activate(tab), 0);
    });
  });

  if (window.location.hash === "#origins") activate("origins");
  if (window.location.hash === "#origins-families") activate("origins");
  if (window.location.hash === "#origins-sources") activate("origins");
  if (window.location.hash === "#sources") activate("sources");
  if (window.location.hash === "#cases") activate("cases");
}

function openCase(caseId) {
  if (!caseId) return;
  const input = document.getElementById("case-search");
  if (input) input.value = "";
  const rows = data.cases || [];
  const index = Math.max(0, rows.findIndex((row) => row.caseId === caseId));
  if (window.HC_ACTIVATE_TAB) window.HC_ACTIVATE_TAB("cases");
  renderCases(rows, index);
  document.getElementById("case-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCaseDetail(row, index = 0) {
  const el = document.getElementById("case-detail");
  if (!el || !row) return;
  const doc = row.document;
  const title = cleanCaseTitle(row);
  const group = sourceGroup(row);
  const docHtml = doc?.status === "available"
    ? `
      <div class="document-viewer">
        <div class="document-viewer__bar">
          <strong>Source document</strong>
          <a href="${esc(doc.path)}" target="_blank" rel="noreferrer">Open full document</a>
        </div>
        ${
          doc.type === "pdf" && doc.previewPath
            ? `<a class="document-preview" href="${esc(doc.path)}" target="_blank" rel="noreferrer"><img src="${esc(doc.previewPath)}" alt="${esc(title)} source document preview" /></a>`
            : `<iframe src="${esc(doc.path)}" title="${esc(title)} source document"></iframe>`
        }
      </div>
    `
    : `
      <div class="document-missing">
        <strong>Document</strong>
        <p>${doc?.status === "too_large" ? "Mapped source is large. Use extracted evidence below for now." : "Source document not mapped yet."}</p>
      </div>
    `;

  const tohs = (row.tohGraphs || [])
    .map(
      (toh, i) => `
        <details class="toh-card" ${i === 0 ? "open" : ""}>
          <summary>
            <span>Theory ${i + 1}</span>
            <small>${fmt((toh.edges || []).length)} relationships</small>
          </summary>
          <div class="toh-nodes">
            ${(toh.nodes || []).slice(0, 10).map((node) => `<span>${esc(node)}</span>`).join("")}
          </div>
          <div class="toh-edge-list">
            ${(toh.edges || [])
              .map(
                (edge) => `
                  <article class="toh-edge">
                    <p><strong>${esc(edge.source)}</strong> <b class="${signClass(edge.sign)}">→</b> <strong>${esc(edge.target)}</strong></p>
                    <small><span class="sign-dot ${signClass(edge.sign)}"></span>${edge.role ? esc(edge.role) : ""}</small>
                    ${edge.claim ? `<p>${esc(edge.claim)}</p>` : ""}
                    ${edge.evidence ? `<blockquote>${esc(edge.evidence)}</blockquote>` : ""}
                  </article>
                `
              )
              .join("")}
          </div>
        </details>
      `
    )
    .join("");

  el.innerHTML = `
    <div class="case-detail__head">
      <div class="case-tags">
        ${row.year ? `<span>${esc(row.year)}</span>` : ""}
      </div>
      <h2>${esc(title)}</h2>
      <dl>
        <div><dt>Theories</dt><dd>${fmt(row.tohCount)}</dd></div>
        <div><dt>Relationships</dt><dd>${fmt(row.edges)}</dd></div>
      </dl>
    </div>
    <div class="case-detail__grid">
      ${docHtml}
      <section class="toh-browser">
        <h3>Extracted theories of harm</h3>
        ${tohs || "<p>Detailed graph evidence is staged for the high-information case tranche first. This case is in the corpus index but has not been added to the case-detail bundle yet.</p>"}
      </section>
    </div>
  `;
}

function renderCases(rows, selectedIndex = 0) {
  const list = document.getElementById("case-list");
  if (!list) return;
  list.innerHTML = rows.slice(0, 260)
    .map(
      (r, index) => `
        <button class="case-row ${index === selectedIndex ? "is-active" : ""}" data-case-index="${index}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <strong>${esc(cleanCaseTitle(r))}</strong>
          ${caseListMeta(r) ? `<small>${esc(caseListMeta(r))}</small>` : ""}
        </button>
      `
    )
    .join("") + (rows.length > 260 ? `<p class="list-note">${fmt(rows.length - 260)} more match the current search.</p>` : "");

  list.querySelectorAll("[data-case-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.caseIndex);
      list.querySelectorAll(".case-row").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      renderCaseDetail(rows[index], index);
    });
  });

  renderCaseDetail(rows[selectedIndex], selectedIndex);
}

function initCases() {
  const rows = data.cases || [];
  renderCases(rows);
  const input = document.getElementById("case-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      `${r.caseId} ${r.title} ${sourceGroup(r)} ${r.corpus} ${r.edges} ${r.tohCount}`.toLowerCase().includes(q)
    );
    renderCases(filtered);
  });
}

function yearValue(value, fallback = 1950) {
  const text = String(value || "");
  const match = text.match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : fallback;
}

function timingLabel(value = "") {
  if (value === "academic_before_policy" || value === "named_before_policy") return "academic first";
  if (value === "policy_before_academic" || value === "policy_before_named") return "policy first";
  return "similar timing";
}

function initOrigins() {
  renderOriginTimeline();
  renderOriginFamilies();
  renderOriginSources();
  const buttons = [...document.querySelectorAll("[data-origin-view]")];
  const views = [...document.querySelectorAll(".origin-view")];
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => item.classList.toggle("is-active", item === button));
      views.forEach((view) => view.classList.toggle("is-active", view.id === `origin-${button.dataset.originView}`));
    });
  });
  if (window.location.hash === "#origins-families") activateOriginView("families");
  if (window.location.hash === "#origins-sources") activateOriginView("sources");
}

function renderOriginTimeline() {
  const el = document.getElementById("origin-timeline");
  if (!el) return;
  const rows = (data.originsFamily || []).filter((r) => r.family !== "other");
  const minYear = 1950;
  const maxYear = 2030;
  const x = (year) => Math.max(2, Math.min(98, ((yearValue(year) - minYear) / (maxYear - minYear)) * 100));
  el.innerHTML = `
    <div class="origin-note">
      <strong>Placeholder.</strong>
      <span>Origins timing will be rerun from policy canonical triples after the source-level UK extraction is validated.</span>
    </div>
    <div class="origin-legend" aria-label="Timeline legend">
      <span><i class="timeline-dot--policy"></i>Policy</span>
      <span><i class="timeline-dot--academic"></i>Academic graph</span>
    </div>
    <div class="origin-timeline">
      <div class="origin-axis" aria-hidden="true">
        ${[1950, 1970, 1990, 2010, 2030].map((year) => `<span style="left:${x(year)}%">${year}</span>`).join("")}
      </div>
      ${rows
        .map((row) => {
          const policyLabel = row.earliestPolicyLabel || row.earliestPolicy;
          const policyX = x(row.earliestPolicyPlotYear || row.earliestPolicy);
          const academicX = x(row.earliestSource);
          const left = Math.min(policyX, academicX);
          const width = Math.max(1.6, Math.abs(academicX - policyX));
          const dominant = row.academicBefore > row.policyBefore
            ? "academic first"
            : row.policyBefore > row.academicBefore
              ? "policy first"
              : "mixed";
          return `
            <button class="timeline-row" type="button" data-origin-family="${esc(row.family)}">
              <span class="timeline-label">${familyLabel(row.family)}</span>
              <span class="timeline-track">
                <span class="timeline-gap" style="left:${left}%;width:${width}%"></span>
                <span class="timeline-dot timeline-dot--policy" style="left:${policyX}%"><b>Policy</b></span>
                <span class="timeline-dot timeline-dot--academic" style="left:${academicX}%"><b>Academic</b></span>
              </span>
              <span class="timeline-years"><em>${esc(dominant)}</em>${esc(policyLabel)} / ${esc(row.earliestSource)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
  el.querySelectorAll("[data-origin-family]").forEach((button) => {
    button.addEventListener("click", () => {
      activateOriginView("families");
      selectOriginFamily(button.dataset.originFamily);
    });
  });
}

function renderOriginFamilies(selectedFamily = null) {
  const el = document.getElementById("origin-families");
  if (!el) return;
  const families = (data.originsFamily || []).filter((r) => r.family !== "other");
  const selected = selectedFamily || families[0]?.family;
  const row = families.find((r) => r.family === selected) || families[0];
  const triples = (data.originsTriples || [])
    .filter((item) => item.family === row?.family)
    .sort((a, b) => b.policyEdges - a.policyEdges)
    .slice(0, 8);
  const totalBuckets = Math.max(1, row.academicBefore + row.contemporaneous + row.policyBefore);
  el.innerHTML = `
    <div class="origin-note">
      <strong>Placeholder.</strong>
      <span>Family overlap is provisional until policy triples are rebuilt from the source-level extraction.</span>
    </div>
    <div class="origin-family-layout">
      <div class="origin-family-list">
        ${families.map((family) => `<button class="${family.family === row.family ? "is-active" : ""}" type="button" data-family-select="${esc(family.family)}">${familyLabel(family.family)}</button>`).join("")}
      </div>
      <div class="origin-family-detail">
        <h3>${familyLabel(row.family)}</h3>
        <dl class="origin-summary">
          <div><dt>Policy</dt><dd>${esc(row.earliestPolicyLabel || row.earliestPolicy)}</dd></div>
          <div><dt>Academic</dt><dd>${esc(row.earliestSource)}</dd></div>
          <div><dt>Edges</dt><dd>${fmt(row.policyEdges)}</dd></div>
        </dl>
        <div class="origin-buckets">
          <span>${fmt(row.academicBefore)} academic first</span>
          <span>${fmt(row.contemporaneous)} similar timing</span>
          <span>${fmt(row.policyBefore)} policy first</span>
        </div>
        <div class="origin-split" aria-label="Timing split">
          <span class="origin-split__academic" style="width:${(100 * row.academicBefore) / totalBuckets}%"></span>
          <span class="origin-split__similar" style="width:${(100 * row.contemporaneous) / totalBuckets}%"></span>
          <span class="origin-split__policy" style="width:${(100 * row.policyBefore) / totalBuckets}%"></span>
        </div>
        <div class="origin-triples">
          ${triples.map((triple) => `
            <article>
              <strong>${esc(triple.triple)}</strong>
              <span>${esc(timingLabel(triple.timingBucket))} · policy ${esc(triple.policyFirstLabel || triple.policyFirstYear)} · academic ${esc(triple.academicFirstYear)}</span>
            </article>
          `).join("")}
        </div>
      </div>
    </div>
  `;
  el.querySelectorAll("[data-family-select]").forEach((button) => {
    button.addEventListener("click", () => selectOriginFamily(button.dataset.familySelect));
  });
}

function selectOriginFamily(family) {
  renderOriginFamilies(family);
}

function activateOriginView(viewName) {
  document.querySelectorAll("[data-origin-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.originView === viewName);
  });
  document.querySelectorAll(".origin-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === `origin-${viewName}`);
  });
}

function renderOriginSources() {
  const el = document.getElementById("origin-sources");
  if (!el) return;
  const sources = data.namedSourceSummary || [];
  const matches = data.namedMatches || [];
  const selected = el.dataset.selectedSource || sources[0]?.source || "";
  const shownMatches = matches.filter((match) => !selected || match.source === selected);
  el.innerHTML = `
    <div class="origin-note">
      <strong>Placeholder.</strong>
      <span>Named-source links are internal diagnostics until policy triples and source expansion are refreshed.</span>
    </div>
    <div class="origin-source-layout">
      <div class="origin-source-shelf">
        ${sources.map((source) => `
          <button type="button" class="${source.source === selected ? "is-active" : ""}" data-source-select="${esc(source.source)}">
            <header><strong>${esc(source.source)}</strong><span>${esc(source.year)}</span></header>
            <p>${esc(source.idea)}</p>
            <small>${fmt(source.matchedEdges)} linked policy edges</small>
          </button>
        `).join("")}
      </div>
      <div class="origin-triples">
        ${shownMatches.slice(0, 10).map((match) => `
          <article>
            <strong>${esc(match.triple)}</strong>
            <span>${esc(match.source)} · ${esc(match.year)} · ${esc(timingLabel(match.timingBucket))}</span>
          </article>
        `).join("")}
      </div>
    </div>
  `;
  el.querySelectorAll("[data-source-select]").forEach((button) => {
    button.addEventListener("click", () => {
      el.dataset.selectedSource = button.dataset.sourceSelect;
      renderOriginSources();
    });
  });
}

function initSources() {
  renderSources();
}

function renderSources(selectedFamily = null, selectedSourceId = null) {
  const el = document.getElementById("source-browser");
  if (!el) return;
  const sources = data.sources || [];
  if (!sources.length) {
    el.innerHTML = `<p class="list-note">Source expansion queue is not bundled yet.</p>`;
    return;
  }

  const families = [...new Set(sources.map((source) => source.family))];
  const family = selectedFamily || el.dataset.family || families[0];
  const familySources = sources.filter((source) => source.family === family);
  const selected = familySources.find((source) => source.sourceId === (selectedSourceId || el.dataset.sourceId)) || familySources[0];
  const years = familySources.map((source) => Number(source.year)).filter(Boolean);
  const layerCount = new Set(familySources.map((source) => source.layer)).size;
  const statusCount = new Map();
  familySources.forEach((source) => statusCount.set(source.status, (statusCount.get(source.status) || 0) + 1));

  el.dataset.family = family;
  el.dataset.sourceId = selected?.sourceId || "";
  el.innerHTML = `
    <aside class="source-family-list" aria-label="Source families">
      ${families
        .map((familyName) => {
          const rows = sources.filter((source) => source.family === familyName);
          return `
            <button type="button" class="${familyName === family ? "is-active" : ""}" data-source-family="${esc(familyName)}">
              <strong>${sourceFamilyLabel(familyName)}</strong>
              <span>${fmt(rows.length)} sources</span>
            </button>
          `;
        })
        .join("")}
    </aside>
    <section class="source-detail" aria-label="Selected source family">
      <div class="source-detail__head">
        <div>
          <h3>${sourceFamilyLabel(family)}</h3>
          <p>${fmt(familySources.length)} sources · ${fmt(layerCount)} layers · ${years.length ? `${Math.min(...years)}-${Math.max(...years)}` : "year pending"}</p>
        </div>
        <span class="source-status-chip">${[...statusCount.entries()].map(([status, count]) => `${fmt(count)} ${humanize(status)}`).join(" · ")}</span>
      </div>
      <article class="source-focus">
        <header>
          <strong>${esc(selected.label)}</strong>
          <span>${esc(selected.year)}</span>
        </header>
        <p>${esc(humanize(selected.layer))} · ${esc(humanize(selected.action))}</p>
        <div class="source-concepts">
          ${String(selected.concepts || "")
            .split(";")
            .map((concept) => concept.trim())
            .filter(Boolean)
            .map((concept) => `<span>${esc(concept)}</span>`)
            .join("")}
        </div>
      </article>
      <div class="source-queue" aria-label="Sources in selected family">
        ${familySources
          .map(
            (source) => `
              <button type="button" class="${source.sourceId === selected.sourceId ? "is-active" : ""}" data-source-id="${esc(source.sourceId)}">
                <span>${esc(source.year)}</span>
                <strong>${esc(source.label)}</strong>
                <small>${esc(humanize(source.status))}</small>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;

  el.querySelectorAll("[data-source-family]").forEach((button) => {
    button.addEventListener("click", () => renderSources(button.dataset.sourceFamily, null));
  });
  el.querySelectorAll("[data-source-id]").forEach((button) => {
    button.addEventListener("click", () => renderSources(family, button.dataset.sourceId));
  });
}

initFacts();
initTabs();
initMechanisms();
initCases();
initOrigins();
initSources();
