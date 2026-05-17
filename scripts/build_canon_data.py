"""
Build canon-data.js for the website's Canonical works page.

Reads:  extractions/named_contributions_books/per_book_json/*.json
Writes: site/assets/canon-data.js (window.HC_CANON_DATA)

The output is a small, browser-friendly subset of the production data:
  - Per work: metadata, thesis list with summaries + edges
  - Edges include source/target, relation, direction, evidence snippet
  - Ready for D3 force-directed rendering on the client side
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PER_BOOK = ROOT / "extractions" / "named_contributions_books" / "per_book_json"
ER_RES = ROOT / "extractions" / "named_contributions_books" / "er_with_extension" / "file_node_resolutions.json"
OUT = ROOT / "site" / "assets" / "canon-data.js"


# Map mechanism_family to a coarse "tradition" tag, used for site filtering.
TRADITION_MAP = {
    "information_problem": "austrian_or_information",
    "price_signalling": "austrian_or_information",
    "discovery_process": "austrian_or_information",
    "market_constitution": "ordoliberal_or_structural",
    "creative_destruction": "schumpeterian",
    "dynamic_efficiency": "schumpeterian",
    "welfare_standard": "chicago_or_neoclassical",
    "efficiency_defence": "chicago_or_neoclassical",
    "predation_skepticism": "chicago_or_neoclassical",
    "exclusionary_conduct_skepticism": "chicago_or_neoclassical",
    "vertical_restraint_doctrine": "chicago_or_neoclassical",
    "per_se_vs_rule_of_reason": "chicago_or_neoclassical",
    "enforcement_institutional_design": "chicago_or_neoclassical",
    "public_choice_critique": "free_market",
    "economic_freedom_doctrine": "free_market",
    "transaction_cost_governance": "transaction_cost",
    "coordinated_effects": "ioclassical",
    "entry_barriers": "ioclassical",
    "incumbent_market_power": "ioclassical",
    "restrictive_agreements": "ioclassical",
    "vertical_foreclosure": "ioclassical",
    "buyer_power": "ioclassical",
    "platform_network_effects": "modern_platform",
    "data_advantage": "modern_platform",
    "methodology": "methodology",
    "other": "other",
}

TRADITION_LABEL = {
    "austrian_or_information": "Austrian & information",
    "ordoliberal_or_structural": "Ordoliberal & structural",
    "schumpeterian": "Schumpeterian",
    "chicago_or_neoclassical": "Chicago & doctrinal",
    "free_market": "Free-market",
    "transaction_cost": "Transaction-cost",
    "ioclassical": "Classical IO",
    "modern_platform": "Modern platform / Brandeisian",
    "methodology": "Methodology",
    "other": "Other",
}


def load_canonical_keys() -> dict[str, str]:
    """Map each (book, raw_label) to a canonical key.

    Uses ER output if available: matched labels → canonical concept ID;
    unmatched labels → raw normalised label. Falls back to raw-label-only
    if ER output isn't present.
    """
    if not ER_RES.exists():
        return {}
    res = json.loads(ER_RES.read_text())
    out: dict[str, str] = {}
    for book_id, nodes in res.items():
        for nid, info in nodes.items():
            label = (info.get("label") or "").strip().lower()
            cid = (info.get("concept_id") or "").strip()
            mapping = info.get("mapping_source", "")
            if cid and mapping != "unmatched":
                # Group by canonical id so synonyms collapse
                out[f"{book_id}::{label}"] = f"id:{cid}"
            else:
                out[f"{book_id}::{label}"] = f"raw:{label}"
    return out


def canonical_key(book_id: str, raw_label: str, canon_keys: dict[str, str]) -> str:
    norm = (raw_label or "").strip().lower()
    if not norm:
        return ""
    k = canon_keys.get(f"{book_id}::{norm}")
    if k:
        return k
    return f"raw:{norm}"


def main() -> None:
    canon_keys = load_canonical_keys()
    files = sorted(PER_BOOK.glob("*.json"))
    works = []
    for fp in files:
        d = json.loads(fp.read_text())
        meta = d["metadata"]
        theses = []
        traditions: set[str] = set()
        for t in d["theses"]:
            tradition = TRADITION_MAP.get(t["mechanism_family"], "other")
            traditions.add(tradition)
            edges = []
            for e in t["edges"]:
                edges.append({
                    "s": e.get("source_text", ""),
                    "t": e.get("target_text", ""),
                    "rel": e.get("relation_category", ""),
                    "rel_exact": e.get("relation_label_exact", ""),
                    "dir": e.get("direction", "forward"),
                    "lf": e.get("link_form", ""),
                    "step": e.get("narrative_step", ""),
                    "evi": e.get("evidence_snippet", ""),
                })
            theses.append({
                "id": t["thesis_id"],
                "label": t["thesis_label"],
                "claim_type": t["claim_type"],
                "mechanism_family": t["mechanism_family"],
                "tradition": tradition,
                "confidence": t["confidence"],
                "summary": t["summary"],
                "narrative_steps": t["narrative_steps"],
                "nodes": t["nodes"],
                "edges": edges,
            })

        try:
            year_int = int(str(meta.get("year", "0"))[:4])
        except ValueError:
            year_int = 0

        works.append({
            "id": d["book_id"],
            "author": meta.get("author", ""),
            "year": meta.get("year", ""),
            "year_int": year_int,
            "title": meta.get("title", ""),
            "venue": meta.get("venue", ""),
            "source": meta.get("source", ""),
            "confidence_overall": meta.get("confidence_overall", ""),
            "traditions": sorted(traditions),
            "n_theses": len(theses),
            "n_edges": sum(len(t["edges"]) for t in theses),
            "theses": theses,
        })

    works.sort(key=lambda w: (w["year_int"], w["author"]))

    # ------------------------------------------------------------------
    # Concept index: every unique node across the corpus, keyed by ER
    # canonical concept ID where available (so synonyms collapse).
    # ------------------------------------------------------------------
    concept_map: dict[str, dict] = {}
    for work in works:
        for thesis in work["theses"]:
            for edge in thesis["edges"]:
                for label, role in ((edge["s"], "source"), (edge["t"], "target")):
                    if not label or not label.strip():
                        continue
                    key = canonical_key(work["id"], label, canon_keys)
                    if not key:
                        continue
                    if key not in concept_map:
                        concept_map[key] = {
                            "key": key,
                            "label": label.strip(),
                            "surface_forms": set(),
                            "books": set(),
                            "n_occurrences": 0,
                            "by_book": {},
                            "is_canonical": key.startswith("id:"),
                        }
                    c = concept_map[key]
                    c["surface_forms"].add(label.strip())
                    c["books"].add(work["id"])
                    c["n_occurrences"] += 1
                    # Prefer shortest surface form as display label (often the canonical FG label)
                    if len(label.strip()) < len(c["label"]):
                        c["label"] = label.strip()
                    if work["id"] not in c["by_book"]:
                        c["by_book"][work["id"]] = {"author": work["author"], "year": work["year"], "year_int": work["year_int"], "edges": []}
                    other = edge["t"] if role == "source" else edge["s"]
                    c["by_book"][work["id"]]["edges"].append({
                        "thesis": thesis["id"],
                        "role": role,
                        "raw_label": label.strip(),
                        "other": other.strip(),
                        "rel": edge["rel"],
                        "rel_exact": edge["rel_exact"],
                        "dir": edge["dir"],
                        "evi": edge["evi"],
                    })

    concepts = []
    for c in concept_map.values():
        concepts.append({
            "key": c["key"],
            "label": c["label"],
            "surface_forms": sorted(c["surface_forms"]),
            "books": sorted(c["books"]),
            "n_books": len(c["books"]),
            "n_occurrences": c["n_occurrences"],
            "is_canonical": c["is_canonical"],
            "by_book": c["by_book"],
        })
    concepts.sort(key=lambda c: (-c["n_books"], -c["n_occurrences"], c["label"]))

    # ------------------------------------------------------------------
    # Related works: shared canonical concepts (ER-grouped). For each
    # book, top N other books by shared-canonical-concept count.
    # ------------------------------------------------------------------
    # Map book → set of canonical concept keys + map (book, key) → labels for display
    book_keys: dict[str, set[str]] = {}
    book_key_labels: dict[str, dict[str, str]] = {}
    for w in works:
        keys: set[str] = set()
        labels: dict[str, str] = {}
        for t in w["theses"]:
            for e in t["edges"]:
                for lab in (e["s"], e["t"]):
                    k = canonical_key(w["id"], lab, canon_keys)
                    if k:
                        keys.add(k)
                        if k not in labels or len((lab or "").strip()) < len(labels[k]):
                            labels[k] = (lab or "").strip()
        book_keys[w["id"]] = keys
        book_key_labels[w["id"]] = labels

    related_works: dict[str, list] = {}
    for w1 in works:
        a = book_keys[w1["id"]]
        scores = []
        for w2 in works:
            if w2["id"] == w1["id"]:
                continue
            b = book_keys[w2["id"]]
            shared_keys = a & b
            if not shared_keys:
                continue
            # Prefer canonical-ID matches (groupings via ER); raw-key matches
            # also count but are weaker signal.
            canonical_shared = [k for k in shared_keys if k.startswith("id:")]
            union = a | b
            # Build human-readable shared-concept labels (prefer the shorter label)
            shared_labels = []
            for k in shared_keys:
                la = book_key_labels[w1["id"]].get(k, "")
                lb = book_key_labels[w2["id"]].get(k, "")
                shared_labels.append(la if len(la) <= len(lb) and la else (lb or la))
            shared_labels = sorted(set(filter(None, shared_labels)))[:6]
            scores.append({
                "book_id": w2["id"],
                "author": w2["author"],
                "year": w2["year_int"],
                "n_shared": len(shared_keys),
                "n_shared_canonical": len(canonical_shared),
                "shared": shared_labels,
                "jaccard": round(len(shared_keys) / max(1, len(union)), 3),
            })
        # Sort by canonical-id matches first (stronger), then total shared
        scores.sort(key=lambda s: (-s["n_shared_canonical"], -s["n_shared"], -s["jaccard"]))
        related_works[w1["id"]] = scores[:5]

    payload = {
        "version": "v2",
        "n_works": len(works),
        "tradition_labels": TRADITION_LABEL,
        "works": works,
        "concepts": concepts,
        "related_works": related_works,
        "summary": {
            "n_concepts_unique": len(concepts),
            "n_concepts_in_multiple_books": sum(1 for c in concepts if c["n_books"] > 1),
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    js = "window.HC_CANON_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n"
    OUT.write_text(js)

    print(f"Wrote {OUT} ({len(works)} works, {sum(w['n_edges'] for w in works)} edges total)")
    for w in works:
        print(f"  {w['year']:>6} {w['author']:<25} {w['n_theses']}T / {w['n_edges']}E "
              f"  [{','.join(w['traditions'])}]")


if __name__ == "__main__":
    main()
