// One-off harness: renders every built-in template with the kiosk's own code and uploads
// a preview JPEG per template to the local save server.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import html2canvas from 'html2canvas';
import { PHOTO_LAYOUTS, renderPhotoLayout, getPhotoTheme } from 'C:/my-dev/photobooth-v1/src/services/photoLayouts.js';
import { BADGE_FRAMES, renderBadge } from 'C:/my-dev/photobooth-v1/src/services/badgeLayouts.js';
import NewspaperTemplate from 'C:/my-dev/photobooth-v1/src/components/templates/NewspaperTemplate.jsx';
import ReceiptTemplate from 'C:/my-dev/photobooth-v1/src/components/templates/ReceiptTemplate.jsx';
import FilmStripTemplate from 'C:/my-dev/photobooth-v1/src/components/templates/FilmStripTemplate.jsx';
import PolaroidTemplate from 'C:/my-dev/photobooth-v1/src/components/templates/PolaroidTemplate.jsx';
import 'C:/my-dev/photobooth-v1/src/index.css';

const log = (m) => { document.getElementById('log').textContent += m + '\n'; };
const W = 480; // preview width (2:3 for 4x6)

async function save(path, canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const res = await fetch('/save?path=' + encodeURIComponent(path), { method: 'POST', body: blob });
  log(`${res.ok ? 'saved' : 'FAILED'} ${path} (${Math.round(blob.size / 1024)} KB)`);
}

function scaled(src, width) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((src.height / src.width) * width);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const CLASSIC = { newspaper: NewspaperTemplate, receipt: ReceiptTemplate, filmstrip: FilmStripTemplate, polaroid: PolaroidTemplate };

async function run() {
  const photos = ['/sample.jpg', '/photo2.jpg', '/photo3.jpg'];
  const theme = getPhotoTheme({});
  const only = new URLSearchParams(location.search).get('only');
  if (!only) for (const l of PHOTO_LAYOUTS) {
    try {
      const out = await renderPhotoLayout(photos[0], { layoutId: l.id, theme, width: 1200 });
      const canvas = out instanceof HTMLCanvasElement ? out : out.canvas ?? out;
      await save(`photo-4x6/${l.id}.jpg`, scaled(canvas, W));
    } catch (e) { log(`ERROR photo ${l.id}: ${e.message}`); }
  }
  if (!only) for (const f of BADGE_FRAMES) {
    try {
      const canvas = await renderBadge(photos[1], { frameId: f.id, theme, size: 600 });
      await save(`badge/${f.id}.jpg`, scaled(canvas, W));
    } catch (e) { log(`ERROR badge ${f.id}: ${e.message}`); }
  }
  const host = document.getElementById('stage');
  for (const [id, Comp] of Object.entries(CLASSIC)) {
    try {
      host.innerHTML = '';
      const el = document.createElement('div');
      el.className = 'printable-receipt-wrapper paper-80mm';
      el.style.background = '#fff';
      el.style.display = 'inline-block';
      el.style.width = 'fit-content';
      host.appendChild(el);
      const root = createRoot(el);
      flushSync(() => root.render(<Comp photoUrls={photos} />));
      await document.fonts.ready;
      await Promise.all([...el.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      const target = el.firstElementChild || el;
      const canvas = await html2canvas(target, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      await save(`classic/${id}.jpg`, scaled(canvas, W));
      root.unmount();
    } catch (e) { log(`ERROR classic ${id}: ${e.message}`); }
  }
  log('DONE');
}

run();
