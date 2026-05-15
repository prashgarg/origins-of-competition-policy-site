# The Origins of Competition Policy Companion Site

Static V0 companion site for the paper.

## Build Data

Run from the repository root:

```bash
python3 Harmful_Competition/site/scripts/build_site_data.py
```

This writes `assets/site-data.js` and copies the current paper PDF to
`public/paper/main.pdf`.

## View

Open `index.html` directly in a browser, or serve the folder with any static
server. The site is intentionally framework-free for this first content/design
pass.

## Current Structure

- `index.html`: home surface with a placeholder for the eventual headline visual.
- `paper.html`: draft PDF link and planned paper-facing materials.
- `explore.html`: graph explorer with mechanisms, cases, origins, and sources tabs. The cases tab includes the full case index, detailed ToH evidence for the first high-information tranche, and copied source documents where mapped.
- `methods.html`: method and data status.

## Case Documents

The build script copies one mapped source document for each detailed case when
the file is small enough for the static bundle. PDFs are currently linked from
the case panel. HTML source pages are embedded in-page. A later pass can add
PDF.js or page-image rendering for inline PDF pages.
