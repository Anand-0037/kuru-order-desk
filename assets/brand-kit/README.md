# Kuru Order Desk — private brand assets

Original assets for the Kuru Order Desk hackathon testnet prototype.

## Use these files

- `kuru-order-desk-portal.png`: recommended square logo for the submission portal; 1024 × 1024, dark background
- `kuru-order-desk-mark.png`: transparent orange mark; 1024 × 1024
- `kuru-order-desk-mark.svg`: resolution-independent original mark, with no font dependency
- `kuru-order-desk-demo-cover.png`: 1920 × 1080 static demo title card
- `kuru-order-desk-lockup.png`: transparent horizontal logo, designed for a dark background
- Matching SVG files are editable source artwork; text-bearing sources use DejaVu Sans

The two square PNGs and demo cover are each below 2 MB and 4 million pixels. The optional horizontal lockup is not a square portal upload.

## Visual direction

Three orange ledger rails and a separated outcome column communicate an order being read in distinct states. The clipped corners provide a compact, recognizable silhouette. Charcoal, warm white and muted gray keep the presentation focused; orange identifies the product and key disclosures.

- Orange: `#FF7A33`
- Charcoal: `#111317`
- Warm white: `#F7F4EF`
- Secondary text: `#AAAEB7`
- Border: `#30343C`
- Typography: DejaVu Sans, regular and bold

The mark was checked at 32, 48, 64, 96 and 128 pixels on light and dark backgrounds. Keep clear space around the mark; avoid using the full wordmark where its text becomes too small to read.

## Honest presentation

The cover intentionally says TESTNET PROTOTYPE and Offline walkthrough, with synthetic-data and no-live-transactions disclosures. It explains the workflow without market data, performance claims, customer traction, awards or promises of profitability.

This is original geometric artwork created for this project. No official Kuru or MetaMask logo was used or imitated, and no affiliation or endorsement is asserted. MetaMask appears only in the prototype's factual integration description. This is not a trademark-availability review.

## Provenance and verification

Created locally from vector geometry and type, then rendered with Inkscape. The transparent mark contains only vector paths. No third-party stock illustration or AI image-generation service was used. `build_assets.py` reproduces the assets; `manifest.json` records exact dimensions, byte sizes and SHA-256 checksums. The final images were visually inspected for clipping, spacing, disclosure visibility and small-size legibility.

These assets have not been uploaded to a hackathon portal or published as a website.
