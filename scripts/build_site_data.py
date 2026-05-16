#!/usr/bin/env python3
"""Export a small static data bundle for the companion site."""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
ASSETS = SITE / "assets"
PUBLIC = SITE / "public"
CASE_DOCS = PUBLIC / "cases"
PROVISIONAL_POLICY_OBJECT = (
    ROOT
    / "archive"
    / "superseded_policy_graph_normalization_2026-05-16"
    / "policy_re_extraction_full"
)
CURRENT_POLICY_OBJECT = ROOT / "extractions" / "policy_from_source_uk"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def as_int(value: str) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def as_float(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def fmt_int(value: int) -> str:
    return f"{value:,}"


def historical_policy_period(value: str) -> dict[str, str]:
    """Represent decade-coded historical case dates without false precision."""
    year = as_int(value)
    if year and 1950 <= year <= 2000 and year % 10 == 0:
        return {
            "label": f"{year}s",
            "plotYear": str(year + 5),
        }
    return {
        "label": str(value or ""),
        "plotYear": str(value or ""),
    }


def clean_text(value: object, limit: int = 240) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) > limit:
        return text[: limit - 1].rstrip() + "..."
    return text


def norm_key(value: str) -> str:
    value = value.lower()
    value = re.sub(r"\b(cma|ccnew|oft|merger|inquiry|cc|plc|ltd|limited|inc|sa|ag|nv|llc)\b", " ", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def title_from_case_id(case_id: str) -> str:
    title = re.sub(r"^(cma|ccnew|oft)_", "", case_id)
    title = re.sub(r"_[Tt]\d+$", "", title)
    title = title.replace("_htm", "")
    title = title.replace("_", " ")
    return re.sub(r"\s+", " ", title).strip()


def source_label(edge: dict[str, object], nodes: dict[str, str]) -> str:
    return nodes.get(str(edge.get("source_node_id")), str(edge.get("source_node_id") or ""))


def target_label(edge: dict[str, object], nodes: dict[str, str]) -> str:
    return nodes.get(str(edge.get("target_node_id")), str(edge.get("target_node_id") or ""))


def build_raw_doc_index() -> list[dict[str, object]]:
    roots = [
        ROOT / "data" / "01_cma_mergers" / "raw_data",
        ROOT / "data" / "02_historical_uk" / "mmc" / "documents",
        ROOT / "data" / "02_historical_uk" / "oft" / "documents",
        ROOT / "data" / "02_historical_uk" / "cc" / "documents",
    ]
    index: list[dict[str, object]] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.iterdir():
            if not path.is_dir() and path.suffix.lower() not in {".htm", ".html", ".pdf"}:
                continue
            index.append({"path": path, "label": path.name, "norm": norm_key(path.name)})
    return index


def best_file_in_folder(folder: Path) -> Path | None:
    if not folder.exists() or not folder.is_dir():
        return None
    files = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in {".pdf", ".html", ".htm"}]
    if not files:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        s = 0
        for token, weight in [
            ("full", 50),
            ("decision", 45),
            ("final", 40),
            ("report", 35),
            ("provisional_findings", 30),
            ("summary", 15),
            ("derogation", -30),
            ("hearing", -25),
            ("timetable", -25),
            ("notice", -18),
            ("submission", -15),
        ]:
            if token in name:
                s += weight
        if path.suffix.lower() in {".html", ".htm"}:
            s += 10
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        return (s, -size, path.name)

    return sorted(files, key=score, reverse=True)[0]


def copy_case_document(case_id: str, raw_index: list[dict[str, object]]) -> dict[str, str] | None:
    query = norm_key(case_id)
    if not query:
        return None
    best: tuple[float, Path] | None = None
    for item in raw_index:
        path = item["path"]
        label_norm = str(item["norm"])
        score = SequenceMatcher(None, query, label_norm).ratio()
        if query in label_norm or label_norm in query:
            score += 0.25
        if best is None or score > best[0]:
            best = (score, path)  # type: ignore[arg-type]
    if best is None or best[0] < 0.58:
        return None

    container = best[1]
    source = best_file_in_folder(container) if container.is_dir() else container
    if source is None or not source.exists():
        return None
    try:
        size = source.stat().st_size
    except OSError:
        return None
    if size > 16_000_000:
        return {
            "status": "too_large",
            "label": source.name,
            "bytes": str(size),
        }

    out_dir = CASE_DOCS / case_id
    out_dir.mkdir(parents=True, exist_ok=True)
    ext = source.suffix.lower() or ".html"
    dest = out_dir / f"source{ext}"
    shutil.copyfile(source, dest)
    doc = {
        "status": "available",
        "label": source.name,
        "path": f"public/cases/{case_id}/{dest.name}",
        "type": ext.replace(".", ""),
        "bytes": str(size),
    }
    year = infer_year(case_id, source, container)
    if year:
        doc["year"] = year
    if ext == ".pdf":
        pdftoppm = shutil.which("pdftoppm")
        preview = out_dir / "preview-1.png"
        if pdftoppm:
            try:
                subprocess.run(
                    [pdftoppm, "-f", "1", "-singlefile", "-png", "-r", "115", str(dest), str(out_dir / "preview-1")],
                    check=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except (OSError, subprocess.CalledProcessError):
                pass
        if preview.exists():
            doc["previewPath"] = f"public/cases/{case_id}/{preview.name}"
    return doc


def infer_year(case_id: str, source: Path | None = None, container: Path | None = None) -> str:
    for path in [container, source]:
        if path and path.is_dir():
            for html in sorted(path.glob("*.htm*"))[:3]:
                try:
                    text = html.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                match = re.search(r'"datePublished":\s*"((?:19|20)\d{2})-', text)
                if match:
                    return match.group(1)
                match = re.search(r"Published\s+.*?((?:19|20)\d{2})", text)
                if match:
                    return match.group(1)
        if path:
            match = re.search(r"((?:19|20)\d{2})", path.name)
            if match:
                return match.group(1)
    match = re.match(r"((?:19|20)\d0)s_", case_id)
    if match:
        return f"{match.group(1)}s"
    match = re.search(r"((?:19|20)\d{2})", case_id)
    return match.group(1) if match else ""


def edge_key(source: str, target: str, sign: str) -> str:
    return f"{source.strip().lower()}|{target.strip().lower()}|{sign.strip().lower()}"


def clean_concept_id(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.startswith("https://openalex.org/keywords/"):
        text = text.rsplit("/", 1)[-1].replace("-", " ")
    elif text.startswith("jel:"):
        text = text.split(":", 2)[-1]
    elif text.startswith("wp:"):
        text = "policy concept"
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1].upper() + text[1:] if text else ""


def clean_policy_triple(value: str) -> str:
    parts = [p.strip() for p in str(value or "").split("|")]
    if len(parts) == 3:
        return f"{parts[0]} → {parts[2]}"
    return str(value or "")


def build_relationship_cases(
    top_edges: list[dict[str, object]], case_meta: dict[str, dict[str, object]]
) -> dict[str, list[dict[str, object]]]:
    parsed_dir = PROVISIONAL_POLICY_OBJECT / "parsed"
    wanted = {
        edge_key(str(edge["source"]), str(edge["target"]), str(edge["sign"])): edge
        for edge in top_edges
    }
    matches: dict[str, dict[str, dict[str, object]]] = {key: {} for key in wanted}
    for path in sorted(parsed_dir.glob("*.json")):
        case_id = path.stem.split("__")[0]
        meta = case_meta.get(case_id)
        if not meta:
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        nodes = {str(n.get("node_id")): str(n.get("label", "")) for n in raw.get("nodes", [])}
        for edge in raw.get("edges", []):
            key = edge_key(source_label(edge, nodes), target_label(edge, nodes), str(edge.get("sign", "")))
            if key not in wanted or case_id in matches[key]:
                continue
            matches[key][case_id] = {
                "caseId": case_id,
                "title": meta["title"],
                "year": meta.get("year") or infer_year(case_id),
                "claim": clean_text(edge.get("claim_text") or edge.get("evidence_text"), 180),
            }
    out: dict[str, list[dict[str, object]]] = {}
    for key, rows in matches.items():
        out[key] = sorted(
            rows.values(),
            key=lambda r: (str(r.get("year") or "9999"), str(r.get("title") or "")),
        )
    return out


def collect_top_edge_case_ids(top_edges: list[dict[str, object]]) -> set[str]:
    parsed_dir = PROVISIONAL_POLICY_OBJECT / "parsed"
    wanted = {
        edge_key(str(edge["source"]), str(edge["target"]), str(edge["sign"]))
        for edge in top_edges
    }
    case_ids: set[str] = set()
    for path in sorted(parsed_dir.glob("*.json")):
        case_id = path.stem.split("__")[0]
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        nodes = {str(n.get("node_id")): str(n.get("label", "")) for n in raw.get("nodes", [])}
        for edge in raw.get("edges", []):
            key = edge_key(source_label(edge, nodes), target_label(edge, nodes), str(edge.get("sign", "")))
            if key in wanted:
                case_ids.add(case_id)
                break
    return case_ids


def load_case_detail(case_id: str) -> dict[str, object]:
    parsed_dir = PROVISIONAL_POLICY_OBJECT / "parsed"
    files = sorted(parsed_dir.glob(f"{case_id}__T*.json"))
    tohs = []
    for path in files[:12]:
        raw = json.loads(path.read_text(encoding="utf-8"))
        nodes = {str(n.get("node_id")): str(n.get("label", "")) for n in raw.get("nodes", [])}
        edges = []
        for edge in raw.get("edges", [])[:18]:
            edges.append(
                {
                    "source": source_label(edge, nodes),
                    "target": target_label(edge, nodes),
                    "sign": str(edge.get("sign", "")),
                    "role": str(edge.get("edge_role", "")),
                    "claim": clean_text(edge.get("claim_text"), 220),
                    "evidence": clean_text(edge.get("evidence_text"), 220),
                }
            )
        tohs.append(
            {
                "tohId": path.stem.split("__")[-1],
                "nodes": sorted(nodes.values())[:24],
                "edges": edges,
            }
        )
    return {"tohGraphs": tohs}


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "paper").mkdir(parents=True, exist_ok=True)
    CASE_DOCS.mkdir(parents=True, exist_ok=True)

    overview = read_csv(PROVISIONAL_POLICY_OBJECT / "descriptive_review_internal" / "corpus_overview.csv")
    total_cases = sum(as_int(r["n_cases"]) for r in overview)
    total_tohs = sum(as_int(r["n_tohs"]) for r in overview)
    total_edges = sum(as_int(r["n_edges"]) for r in overview)
    total_nodes = sum(as_int(r["n_nodes"]) for r in overview)

    top_edges_raw = read_csv(PROVISIONAL_POLICY_OBJECT / "descriptive_review_internal" / "top_affirmative_edges.csv")
    top_edges = [
        {
            "source": r["source"],
            "target": r["target"],
            "sign": r["sign"],
            "edges": as_int(r["n_edges"]),
            "cases": as_int(r["n_cases"]),
        }
        for r in top_edges_raw[:28]
    ]

    origins_raw = read_csv(
        PROVISIONAL_POLICY_OBJECT
        / "origins_diagnostics_internal"
        / "policy_to_frontiergraph_bridge_audit_v0"
        / "bridged_origins_diagnostics_v0"
        / "family_first_years_v0"
        / "origins_family_first_year_summary_v0.csv"
    )
    origins_family = [
        {
            "family": r["mechanism_family"],
            "rule": r["matched_rule"],
            "triples": as_int(r["matched_triples"]),
            "policyEdges": as_int(r["policy_edges"]),
            "academicBefore": as_int(r["academic_before_policy"]),
            "contemporaneous": as_int(r["roughly_contemporaneous"]),
            "policyBefore": as_int(r["policy_before_academic"]),
            "earliestPolicy": r["earliest_policy_year"],
            "earliestPolicyLabel": historical_policy_period(r["earliest_policy_year"])["label"],
            "earliestPolicyPlotYear": historical_policy_period(r["earliest_policy_year"])["plotYear"],
            "earliestSource": r["earliest_fg_year"],
        }
        for r in origins_raw
        if r.get("matched_rule") == "family_bridge"
    ]

    origins_triples_raw = read_csv(
        PROVISIONAL_POLICY_OBJECT
        / "origins_diagnostics_internal"
        / "policy_to_frontiergraph_bridge_audit_v0"
        / "bridged_origins_diagnostics_v0"
        / "family_first_years_v0"
        / "origins_family_first_year_triples_v0.csv"
    )
    origins_triples = [
        {
            "family": r["mechanism_family"],
            "triple": clean_policy_triple(r["bridged_policy_triple"]),
            "policyEdges": as_int(r["policy_edges"]),
            "policyCases": as_int(r["policy_cases"]),
            "policyFirstYear": r["policy_first_year"],
            "policyFirstLabel": historical_policy_period(r["policy_first_year"])["label"],
            "policyFirstPlotYear": historical_policy_period(r["policy_first_year"])["plotYear"],
            "academicFirstYear": r["fg_first_year"],
            "timingBucket": r["timing_bucket"],
            "academicPapers": as_int(r["fg_papers"]),
        }
        for r in origins_triples_raw
        if r.get("matched_rule") == "direct_bridge"
    ][:80]

    named_raw = read_csv(
        ROOT
        / "extractions"
        / "named_contributions_canonical_v0"
        / "origins_diagnostic_v0"
        / "named_contribution_origins_family_summary_v0.csv"
    )
    named_family = [
        {
            "sample": r["sample_group"],
            "family": r["mechanism_family"],
            "policyTriples": as_int(r["policy_triples"]),
            "matchedTriples": as_int(r["named_matched_policy_triples"]),
            "matchedPct": as_float(r["named_matched_policy_triples_pct"]),
            "policyEdges": as_int(r["policy_edges"]),
            "matchedEdges": as_int(r["named_matched_policy_edges"]),
        }
        for r in named_raw
        if r.get("sample_group") == "all_policy"
    ]

    named_matches_raw = read_csv(
        ROOT
        / "extractions"
        / "named_contributions_canonical_v0"
        / "origins_diagnostic_v0"
        / "named_contribution_origins_matches_v0.csv"
    )
    named_matches = [
        {
            "family": r["mechanism_family"],
            "triple": clean_policy_triple(r["policy_triple"]),
            "source": r["named_contribution"],
            "year": r["named_contribution_year"],
            "idea": r["idea_label"],
            "policyFirstYear": r["policy_first_year"],
            "timingBucket": r["timing_bucket"],
            "policyEdges": as_int(r["policy_edges"]),
        }
        for r in named_matches_raw
        if r.get("sample_group") == "all_policy"
    ][:60]

    named_source_summary_raw = read_csv(
        ROOT
        / "extractions"
        / "named_contributions_canonical_v0"
        / "origins_diagnostic_v0"
        / "named_contribution_origins_source_summary_v0.csv"
    )
    named_source_summary = [
        {
            "source": r["contribution_label"],
            "year": r["contribution_year"],
            "idea": r["idea_label"],
            "matchedTriples": as_int(r["matched_policy_triples"]),
            "matchedEdges": as_int(r["matched_policy_edges"]),
        }
        for r in named_source_summary_raw
    ]

    cases_raw = read_csv(PROVISIONAL_POLICY_OBJECT / "tables" / "case_graph_summary.csv")
    raw_doc_index = build_raw_doc_index()
    sorted_cases = sorted(cases_raw, key=lambda x: as_int(x.get("edge_count", "")), reverse=True)
    detail_case_ids = {r["case_id"] for r in sorted_cases[:120]} | collect_top_edge_case_ids(top_edges)
    cases = [
        {
            "caseId": r["case_id"],
            "title": r.get("case_name") or title_from_case_id(r["case_id"]),
            "corpus": r["corpus"],
            "tohCount": as_int(r["toh_count"]),
            "edges": as_int(r["edge_count"]),
            "nodes": as_int(r["node_count"]),
            "document": copy_case_document(r["case_id"], raw_doc_index) if r["case_id"] in detail_case_ids else None,
            **(load_case_detail(r["case_id"]) if r["case_id"] in detail_case_ids else {"tohGraphs": []}),
        }
        for r in sorted_cases
    ]
    case_meta = {
        row["caseId"]: {
            "title": row["title"],
            "year": (row.get("document") or {}).get("year") if isinstance(row.get("document"), dict) else infer_year(row["caseId"]),
        }
        for row in cases
    }
    for row in cases:
        if row["caseId"] in case_meta and case_meta[row["caseId"]].get("year"):
            row["year"] = case_meta[row["caseId"]]["year"]
    relationship_cases = build_relationship_cases(top_edges, case_meta)

    sources_raw = read_csv(ROOT / "extractions" / "named_source_expansion_v0" / "source_admission_v0.csv")
    sources = [
        {
            "sourceId": r["source_id"],
            "label": r["bibliographic_label"],
            "year": r["year"],
            "layer": r["source_layer"],
            "family": r["mechanism_family"],
            "action": r["extraction_action"],
            "status": r["extraction_status"],
            "concepts": r["expected_concepts"],
        }
        for r in sources_raw
    ]

    data = {
        "updated": "2026-05-16",
        "dataStatus": (
            "Source-level UK extraction in progress; current displays are "
            "provisional placeholders from a superseded intermediate object."
        ),
        "currentPolicyObject": str(CURRENT_POLICY_OBJECT.relative_to(ROOT)),
        "provisionalDisplayObject": str(PROVISIONAL_POLICY_OBJECT.relative_to(ROOT)),
        "headline": {
            "cases": total_cases,
            "casesLabel": fmt_int(total_cases),
            "tohs": total_tohs,
            "tohsLabel": fmt_int(total_tohs),
            "edges": total_edges,
            "edgesLabel": fmt_int(total_edges),
            "nodes": total_nodes,
            "nodesLabel": fmt_int(total_nodes),
        },
        "corpusOverview": overview,
        "topEdges": top_edges,
        "relationshipCases": relationship_cases,
        "originsFamily": origins_family,
        "originsTriples": origins_triples,
        "namedFamily": named_family,
        "namedMatches": named_matches,
        "namedSourceSummary": named_source_summary,
        "cases": cases,
        "sources": sources,
    }

    (ASSETS / "site-data.js").write_text(
        "window.HC_SITE_DATA = " + json.dumps(data, indent=2) + ";\n",
        encoding="utf-8",
    )

    paper_pdf = ROOT / "paper" / "main.pdf"
    if paper_pdf.exists():
        shutil.copyfile(paper_pdf, PUBLIC / "paper" / "main.pdf")

    print(json.dumps({"out": str(ASSETS / "site-data.js"), "cases": total_cases, "edges": total_edges}, indent=2))


if __name__ == "__main__":
    main()
