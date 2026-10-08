# Dep Beacon presentation assets

The logo is a code-authored SVG. Its source is
`packages/vscode-dep-beacon/resources/icon.svg`; run `pnpm run assets` to regenerate
its derived files and the optimized backdrop.

The editor showcase layers real screenshots over a decorative AI-generated plate.
AI does not generate or retouch dependency names, versions, diagnostics, or editor UI.
The screenshots contain only the repository's public sample workspace. Versions and
risk signals are a capture-time snapshot, not a current security report.

- `apps/docs/public/usage-preview.png`: VS Code sample-workspace capture.
- `apps/docs/public/zed-preview.jpg`: native Zed capture on 2026-10-07, using the
  user's installed editor and theme with real Dep Beacon inline hints and diagnostics.
- `beacon-backdrop.png`: original output from the built-in image generation tool.
- `apps/docs/public/images/beacon-backdrop.webp`: generated web delivery asset.

Keep each original capture's aspect ratio. To refresh, open
`examples/sample-workspace` in a separate editor window, wait for dependency analysis,
close unrelated panels and notifications, and capture only the demo window. Inspect
for private tabs or data before replacing the asset. Do not stage sample-manifest
changes made while demonstrating update actions.

## Backdrop prompt

Use case: stylized-concept. Asset type: decorative background plate behind authentic
editor screenshots on the Dep Beacon documentation website. Create a wide 16:9 abstract
editorial product backdrop: midnight navy graphite with a sculptural frosted-glass arc
catching pale sky blue and soft teal light, subtle satin material grain and quiet
dimensional shadows. The glass form hugs the outer left and upper edges, inspired by
a beacon's signal sweeping through space. Keep the center and lower right spacious,
calm and nearly uniform dark navy so a real rectangular code-editor screenshot can be
layered over it later. Restrained, refined developer-tool branding, tactile and minimal,
not neon sci-fi. Palette #0b1115 #102630 #7dd3fc #5eead4. No text, no letters, no logos,
no interface, no fake screenshots, no device, no stars, no people, no watermark.
