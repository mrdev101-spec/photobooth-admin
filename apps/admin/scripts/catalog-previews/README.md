# Template previews

Renders a preview JPEG for every built-in template with the kiosk's own drawing code
(`photoLayouts.js`, `badgeLayouts.js`, the Classic Receipt components) into
`apps/admin/public/catalog/<kind>/<id>.jpg`. Re-run when the kiosk adds or changes templates.
Expects the kiosk repo at `C:\my-dev\photobooth-v1` with its `node_modules` installed.

1. Copy `sample.jpg`, `photo2.jpg`, `photo3.jpg` from the kiosk's `public/` into this folder.
2. `node build.mjs` (bundles the harness with the kiosk's esbuild; face tracking is stubbed).
3. `python server.py` (serves this folder on 127.0.0.1:8765 and saves uploads into `public/catalog`).
4. Open http://127.0.0.1:8765/index.html in a browser and wait for `DONE` (`?only=classic` redoes receipts).
5. AI scene samples: `powershell -File ai_variants.ps1` (female/male thumbnails from `data/ai-scenes`).

Then update `lib/template-visibility.ts` if a new id has no image (AI_IMAGES / AI_MALE).
