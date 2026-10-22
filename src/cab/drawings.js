/* ==========================================================================
   Ясень · Конструктор: чертежи в SVG (размеры в миллиметрах)
   ========================================================================== */

import { T, HDF, SHEET, CELL_KINDS } from './model.js';

const r = Math.round;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sizes(W, H) {
  const fs = Math.max(20, Math.min(56, Math.max(W, H) / 38));
  return { fs, sw: fs / 13, gap: fs * 2.1 };
}

// Размерная линия. Горизонтальная: от x1 до x2 на уровне y (в координатах чертежа, y вниз).
function dimH(x1, x2, y, from, label, k) {
  if (Math.abs(x2 - x1) < 0.5) return '';
  const t = k.fs * 0.32, mid = (x1 + x2) / 2;
  const small = Math.abs(x2 - x1) < k.fs * (String(label).length * 0.62 + 0.6);
  return `<g class="dim">
    <line x1="${x1}" y1="${from}" x2="${x1}" y2="${y + t * 1.6 * Math.sign(y - from || 1)}"/><line x1="${x2}" y1="${from}" x2="${x2}" y2="${y + t * 1.6 * Math.sign(y - from || 1)}"/>
    <line x1="${x1 - t}" y1="${y}" x2="${x2 + t}" y2="${y}"/>
    <line class="tick" x1="${x1 - t}" y1="${y + t}" x2="${x1 + t}" y2="${y - t}"/><line class="tick" x1="${x2 - t}" y1="${y + t}" x2="${x2 + t}" y2="${y - t}"/>
    <text x="${small ? x2 + k.fs * 0.4 : mid}" y="${y - k.fs * 0.35}" text-anchor="${small ? 'start' : 'middle'}" font-size="${k.fs}">${label}</text></g>`;
}
function dimV(y1, y2, x, from, label, k) {
  if (Math.abs(y2 - y1) < 0.5) return '';
  const t = k.fs * 0.32, mid = (y1 + y2) / 2;
  const small = Math.abs(y2 - y1) < k.fs * (String(label).length * 0.62 + 0.6);
  const dir = Math.sign(x - from || 1);
  return `<g class="dim">
    <line x1="${from}" y1="${y1}" x2="${x + t * 1.6 * dir}" y2="${y1}"/><line x1="${from}" y1="${y2}" x2="${x + t * 1.6 * dir}" y2="${y2}"/>
    <line x1="${x}" y1="${y1 - t}" x2="${x}" y2="${y2 + t}"/>
    <line class="tick" x1="${x - t}" y1="${y1 + t}" x2="${x + t}" y2="${y1 - t}"/><line class="tick" x1="${x - t}" y1="${y2 + t}" x2="${x + t}" y2="${y2 - t}"/>
    <text transform="translate(${x - k.fs * 0.35} ${small ? Math.min(y1, y2) - k.fs * 0.4 : mid}) rotate(-90)" text-anchor="${small ? 'start' : 'middle'}" font-size="${k.fs}">${label}</text></g>`;
}

const STYLE = (k) => `<style>
  .ln{fill:none;stroke:#1f1c19;stroke-width:${k.sw}}
  .pn{fill:#efe8dc;stroke:#1f1c19;stroke-width:${k.sw}}
  .fr{fill:#f8f5ef;stroke:#1f1c19;stroke-width:${k.sw}}
  .gl{fill:#e3ebea;stroke:#1f1c19;stroke-width:${k.sw}}
  .hd{fill:#fbf9f5;stroke:#7d756b;stroke-width:${k.sw * 0.7};stroke-dasharray:${k.sw * 6} ${k.sw * 4}}
  .op{fill:none;stroke:#7d756b;stroke-width:${k.sw * 0.7};stroke-dasharray:${k.sw * 8} ${k.sw * 5}}
  .hn{fill:#1f1c19;stroke:#1f1c19;stroke-width:${k.sw * 2.4};stroke-linecap:round}
  .rl{stroke:#1f1c19;stroke-width:${k.sw * 2.2};stroke-linecap:round}
  .lb{fill:#6f685f;font-family:Manrope,Arial,sans-serif}
  .dim line{stroke:#2f4b3d;stroke-width:${k.sw * 0.75}}
  .dim .tick{stroke-width:${k.sw * 1.4}}
  .dim text{fill:#2f4b3d;font-family:Manrope,Arial,sans-serif;font-weight:600}
  .ttl{fill:#1f1c19;font-family:Manrope,Arial,sans-serif;font-weight:700}
</style>`;

function frame(minX, minY, maxX, maxY, body, k) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(minX)} ${r(minY)} ${r(maxX - minX)} ${r(maxY - minY)}" class="draw">${STYLE(k)}${body}</svg>`;
}

/* ------------------------------ фасад ------------------------------ */

export function frontSVG(L, { fronts = true } = {}) {
  const p = L.p, { W, H } = p, k = sizes(W, H), bh = p.baseH, legs = p.base === 'legs';
  const Y = (y) => H - y;
  const rect = (x, y, w, h, cls) => `<rect class="${cls}" x="${x}" y="${Y(y + h)}" width="${w}" height="${h}"/>`;
  let s = '';
  // основание
  if (legs) for (const l of L.legs.filter((l) => l.z > p.D / 2)) s += rect(l.x - 17, 0, 34, bh, 'pn');
  else if (!fronts) s += rect(T, 0, W - 2 * T, bh, 'hd');
  else s += rect(T, 0, W - 2 * T, bh, 'pn');
  // корпус
  for (const b of L.boxes) if (['side', 'top', 'bottom', 'divider'].includes(b.role)) s += rect(b.x, b.y, b.w, b.h, 'pn');
  if (!fronts) {
    for (const b of L.boxes) {
      if (b.role === 'shelf') s += rect(b.x, b.y, b.w, b.h, 'pn');
      if (b.role === 'front' && b.inner) s += rect(b.x, b.y, b.w, b.h, 'fr');
    }
    for (const S of L.secs) for (const C of S.cells) {
      if (C.k === 'drawer') {
        const bx = L.boxes.find((b) => b.role === 'dbox' && b.grp === `drawer:${S.i}:${C.j}`);
        if (bx) s += `<rect class="hd" x="${S.x0 + 13}" y="${Y(bx.y + bx.h)}" width="${S.cw - 26}" height="${bx.h}"/>`;
      }
      const cy = Y((C.y0 + C.y1) / 2), cx = S.x0 + S.cw / 2;
      const fsz = Math.min(k.fs, (C.y1 - C.y0) * 0.38, S.cw / 6);
      if (C.k === 'rail') {
        const ry = Y(C.y1 - 60);
        s += `<line class="rl" x1="${S.x0 + 6}" y1="${ry}" x2="${S.x1 - 6}" y2="${ry}"/>`;
      }
      if (fsz > 9) s += `<text class="lb" x="${cx}" y="${cy + fsz * 0.35}" text-anchor="middle" font-size="${fsz}">${C.k === 'drawer' ? 'ящик ' : C.k === 'rail' ? 'штанга · ' : ''}${r(C.h)}</text>`;
    }
  } else {
    for (const b of L.boxes) {
      if (!b.front) continue;
      if (b.role === 'sliding') {
        s += rect(b.x, b.y, b.w, b.h, 'fr') + rect(b.x + 24, b.y + 34, b.w - 48, b.h - 68, 'ln');
        const cy = Y(b.y + b.h / 2), cx = b.x + b.w / 2, a = Math.min(b.w * 0.18, 140);
        s += `<path class="op" d="M${cx - a} ${cy} H${cx + a} M${cx - a + a * 0.25} ${cy - a * 0.2} L${cx - a} ${cy} L${cx - a + a * 0.25} ${cy + a * 0.2} M${cx + a - a * 0.25} ${cy - a * 0.2} L${cx + a} ${cy} L${cx + a - a * 0.25} ${cy + a * 0.2}" style="stroke-dasharray:none"/>`;
        continue;
      }
      s += rect(b.x, b.y, b.w, b.h, b.role === 'glass' ? 'gl' : 'fr');
      if (b.role === 'glass') s += rect(b.x + 20, b.y + 20, b.w - 40, b.h - 40, 'ln');
      if (b.hingeSide) {
        const hx = b.hingeSide === 'left' ? b.x : b.x + b.w, ox = b.hingeSide === 'left' ? b.x + b.w : b.x;
        s += `<path class="op" d="M${ox} ${Y(b.y + b.h)} L${hx} ${Y(b.y + b.h / 2)} L${ox} ${Y(b.y)}"/>`;
      }
    }
    for (const h of L.handles) {
      if (h.kind === 'push' || h.y == null) continue;
      if (h.kind === 'knob') s += `<circle class="hn" cx="${h.x}" cy="${Y(h.y)}" r="${k.sw * 4}"/>`;
      else {
        const len = h.kind === 'bar192' ? 210 : h.kind === 'edge' ? (h.len || 220) : 150;
        s += h.orient === 'h' ? `<line class="hn" x1="${h.x - len / 2}" y1="${Y(h.y)}" x2="${h.x + len / 2}" y2="${Y(h.y)}"/>` : `<line class="hn" x1="${h.x}" y1="${Y(h.y - len / 2)}" x2="${h.x}" y2="${Y(h.y + len / 2)}"/>`;
      }
    }
  }
  // размеры
  const g = k.gap;
  s += dimH(0, W, H + g * (fronts ? 1 : 2), H, r(W), k);
  if (!fronts) {
    let chain = '';
    for (const S of L.secs) chain += dimH(S.x0, S.x1, H + g, H, r(S.cw), k);
    s += chain;
    s += dimV(Y(H - T), Y(p.baseH + T), W + g, W, r(H - T - p.baseH - T), k);
  } else if (L.secs.length > 1 && !L.sliding) {
    let x = 0;
    L.secs.forEach((S, i) => { const x1 = i === L.secs.length - 1 ? W : S.x1 + T / 2; s += dimH(x, x1, -g, 0, r(x1 - x), k); x = x1; });
  }
  s += dimV(0, H, -g * 2, 0, r(H), k);
  s += dimV(Y(bh), H, -g, 0, r(bh), k);
  const top = fronts && L.secs.length > 1 && !L.sliding ? -g * 1.8 : -k.fs;
  return frame(-g * 2.8, top, W + g * (fronts ? 0.6 : 1.8), H + g * (fronts ? 1.8 : 2.8), s, k);
}

/* ------------------------------ разрез ------------------------------ */

export function sideSVG(L, secIndex = 0) {
  const p = L.p, { H, D } = p, k = sizes(Math.max(D * 2, 900), H), FT = L.FT;
  const S = L.secs[Math.min(secIndex, L.secs.length - 1)];
  const Y = (y) => H - y;
  const rect = (z, y, d, h, cls) => `<rect class="${cls}" x="${z}" y="${Y(y + h)}" width="${d}" height="${h}"/>`;
  let s = '';
  const y0 = p.base === 'legs' ? p.baseH : 0;
  s += rect(0, y0, D, H - y0, 'hd');
  s += rect(-HDF, p.baseH + 2, HDF, H - p.baseH - 4, 'pn');
  s += rect(0, H - T, D, T, 'pn') + rect(0, p.baseH, D, T, 'pn');
  if (p.base === 'legs') for (const l of L.legs.filter((l) => l.x < p.W / 2)) s += rect(l.z - 17, 0, 34, l.h, 'pn');
  else s += rect(D - 40 - T, 0, T, p.baseH, 'pn') + rect(30, 0, T, p.baseH, 'pn');
  for (const b of L.boxes) {
    const inSec = b.x >= S.x0 - 1 && b.x + b.w <= S.x1 + T + 1 && b.x < S.x1;
    if (b.role === 'shelf' && b.sec === S.i) s += rect(b.z, b.y, b.d, b.h, 'pn');
    if ((b.role === 'dbox' || b.role === 'dbottom') && b.grp?.startsWith(`drawer:${S.i}:`) && b.w <= T + 0.5) s += rect(b.z, b.y, b.d, b.h, 'hd');
    if (b.role === 'front' && b.grp?.startsWith(`drawer:${S.i}:`)) s += rect(b.z, b.y, b.d, b.h, 'fr');
    if ((b.role === 'front' || b.role === 'glass') && b.grp?.startsWith(`door:${S.i}:0`)) s += rect(b.z, b.y, b.d, b.h, b.role === 'glass' ? 'gl' : 'fr');
    if (b.role === 'sliding' && inSec) s += rect(b.z, b.y, b.d, b.h, 'fr');
  }
  if (L.sliding) for (const z of [D + 12, D + 52]) s += rect(z - 2, H - 25, 30, 25, 'pn') + rect(z - 2, p.baseH, 30, 10, 'pn');
  for (const rl of L.rails.filter((x) => x.sec === S.i)) s += `<ellipse class="pn" cx="${rl.z}" cy="${Y(rl.y)}" rx="12" ry="8"/>`;
  for (const h of L.handles) {
    if (h.y == null || h.kind === 'push' || !h.grp?.match(new RegExp(`^(drawer|door):${S.i}:`))) continue;
    s += `<line class="hn" x1="${h.z}" y1="${Y(h.y)}" x2="${h.z + (h.kind === 'edge' ? 10 : 30)}" y2="${Y(h.y)}"/>`;
  }
  const g = k.gap, total = L.depthTotal;
  s += dimH(0, D, H + g, H, r(D), k);
  s += dimH(-HDF, -HDF + total, H + g * 2, H, r(total), k);
  s += dimV(0, H, -g * 1.6, -HDF, r(H), k);
  // высоты ячеек выбранной секции
  for (const C of S.cells) s += dimV(Y(C.y1), Y(C.y0), D + (L.sliding ? 90 : FT) + g, D, r(C.h), k);
  return frame(-g * 2.4, -k.fs * 2, D + (L.sliding ? 90 : FT) + g * 2.2, H + g * 2.8, `<text class="ttl" x="${D / 2}" y="${-k.fs * 0.6}" text-anchor="middle" font-size="${k.fs}">Разрез по секции ${S.i + 1}</text>` + s, k);
}

/* ------------------------------ карта раскроя ------------------------------ */

export function sheetSVG(sheet, mat, index, total) {
  const k = { fs: 46, sw: 3, gap: 80 };
  const tr = SHEET.trim;
  let s = `<rect x="0" y="0" width="${SHEET.L}" height="${SHEET.W}" fill="url(#hatch)" stroke="#1f1c19" stroke-width="4"/>`;
  s += `<rect x="${tr}" y="${tr}" width="${SHEET.L - 2 * tr}" height="${SHEET.W - 2 * tr}" fill="url(#hatch)" stroke="#8e867b" stroke-width="2" stroke-dasharray="14 10"/>`;
  for (const it of sheet.items) {
    const x = tr + it.x, y = tr + it.y;
    const fs = Math.max(16, Math.min(56, it.h / 3.4, it.w / 7));
    s += `<rect x="${x}" y="${y}" width="${it.w}" height="${it.h}" fill="${mat.grain ? '#efe1cc' : '#f4efe7'}" stroke="#1f1c19" stroke-width="3"/>`;
    if (mat.grain) s += `<line x1="${x + it.w * 0.08}" y1="${y + it.h * 0.82}" x2="${x + it.w * 0.24}" y2="${y + it.h * 0.82}" stroke="#b49770" stroke-width="3" marker-end="url(#arr)"/>`;
    s += `<text x="${x + it.w / 2}" y="${y + it.h / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="Manrope,Arial,sans-serif" font-weight="700" fill="#1f1c19">${it.no}</text>`;
    if (it.h > 110 && it.w > 260) s += `<text x="${x + it.w / 2}" y="${y + it.h / 2 + fs * 1.5}" text-anchor="middle" font-size="${fs * 0.62}" font-family="Manrope,Arial,sans-serif" fill="#6f685f">${it.rot ? it.wid + '×' + it.len : it.len + '×' + it.wid}</text>`;
  }
  const defs = `<defs><pattern id="hatch" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="#fbf9f5"/><line x1="0" y1="0" x2="0" y2="40" stroke="#ddd5c8" stroke-width="6"/></pattern>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b49770"/></marker></defs>`;
  const head = `<text x="0" y="-36" font-size="58" font-family="Manrope,Arial,sans-serif" font-weight="700" fill="#1f1c19">Лист ${index} из ${total} · ${esc(mat.name)}</text>
    <text x="${SHEET.L}" y="-36" text-anchor="end" font-size="44" font-family="Manrope,Arial,sans-serif" fill="#6f685f">${SHEET.L}×${SHEET.W} мм · использование ${Math.round(sheet.util * 100)}%</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -110 ${SHEET.L + 20} ${SHEET.W + 130}" class="draw sheet">${defs}${head}${s}</svg>`;
}

export const cellName = (k) => CELL_KINDS[k].name;
