// src/results-image.js
// The shareable result card: a 1080×1350 PNG drawn on a canvas from the
// results model — the portrait size Facebook and Instagram show whole on a
// phone. The model decides every number and name on it; this file only lays
// them out in the club's colours and fetches the two logos. Browser only.

const W = 1080;
const H = 1350;
const PAD = 64;
const NAVY = '#0C3051';
const NAVY_2 = '#0A2742';
const CREAM = '#F3EFE4';
const GOLD = '#DD8910';
const GOLD_L = '#F0B24A';
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";
const DISPLAY = "'Merriweather', Georgia, 'Times New Roman', serif";

const font = (weight, px, display = false) => `${weight} ${px}px ${display ? DISPLAY : FONT}`;
const cream = (a) => `rgba(243,239,228,${a})`;

// The fonts come from Google, so a first share on a cold cache would paint
// in the fallback face. Wait for the faces the card uses — briefly: a slow
// network gets the fallback rather than no card.
async function loadFonts() {
  if (!document.fonts?.load) return;
  const faces = [font(900, 52, true), font(800, 76), font(800, 30), font(700, 30), font(600, 27), font(500, 24)];
  await Promise.race([
    Promise.all(faces.map(f => document.fonts.load(f).catch(() => null))),
    new Promise(r => setTimeout(r, 2500))
  ]);
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The club's logo is an SVG with a viewBox and no width/height; a canvas
// cannot size it without one, so it is fetched and given the viewBox's own.
async function loadSvg(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    let text = await res.text();
    const vb = text.match(/viewBox="([\d.\s-]+)"/);
    if (vb && !/<svg[^>]*\swidth=/.test(text)) {
      const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
      text = text.replace('<svg', `<svg width="${w}" height="${h}"`);
    }
    const blobUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    const img = await loadImage(blobUrl);
    URL.revokeObjectURL(blobUrl);
    return img;
  } catch (_) {
    return null;
  }
}

// The page's own URL as a QR, drawn by the same lazy chunk the print pages
// use. Best effort: no QR is a card without one, never no card.
async function qrCanvas(url, size) {
  try {
    const mod = await import('qrcode');
    const QRCode = mod.default ?? mod;
    const c = document.createElement('canvas');
    await QRCode.toCanvas(c, url, { width: size, margin: 1, color: { dark: NAVY, light: '#ffffff' } });
    return c;
  } catch (_) {
    return null;
  }
}

// ---- drawing helpers ----

function fit(ctx, text, max) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= max) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(s.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1;
  }
  return s.slice(0, lo).trimEnd() + '…';
}

function wrap(ctx, text, max, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(w => {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width <= max || !line) line = probe;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(ctx, lines.slice(maxLines - 1).join(' '), max);
    return kept;
  }
  return lines.map(l => fit(ctx, l, max));
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawContain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function text(ctx, s, x, y, { size = 28, weight = 600, color = CREAM, align = 'left', display = false, max = null } = {}) {
  ctx.font = font(weight, size, display);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const out = max ? fit(ctx, s, max) : String(s ?? '');
  ctx.fillText(out, x, y);
  ctx.textAlign = 'left';
  return ctx.measureText(out).width;
}

function rule(ctx, y, color = cream(0.16)) {
  ctx.fillStyle = color;
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
}

// ---- blocks ----

// The champion(s): one block, or one per division side by side.
function drawChampions(ctx, model, L, y) {
  const boards = model.boards.filter(b => b.leaders.length);
  if (!boards.length) return y;
  const cols = boards.length > 1 ? 2 : 1;
  const colW = (W - PAD * 2 - (cols - 1) * 32) / cols;
  let bottom = y;
  boards.slice(0, 2).forEach((b, i) => {
    const x = PAD + i * (colW + 32);
    let yy = y;
    const cap = `${model.state === 'final' ? L.champion : L.leading}${b.division ? ` · ${L.division(b.division)}` : ''}`;
    text(ctx, cap.toUpperCase(), x, yy, { size: 22, weight: 800, color: GOLD, max: colW });
    yy += 36;
    const names = b.leaders.length > 2
      ? `${b.leaders.length} ${L.tied}`
      : b.leaders.map(e => e.name).join(' · ');
    text(ctx, names, x, yy, { size: cols === 1 ? 50 : 40, weight: 800, max: colW });
    yy += cols === 1 ? 66 : 54;
    const lead = b.leaders[0];
    const score = model.points ? String(lead.total) : scoreText(lead.total);
    const sw = text(ctx, score, x, yy, { size: cols === 1 ? 84 : 66, weight: 800, color: GOLD_L });
    const sub = model.points
      ? (lead.gross !== null && lead.gross !== undefined ? `${lead.gross} ${L.strokes}` : L.points)
      : (lead.gross !== null && lead.gross !== undefined ? `${lead.gross} ${L.strokes}` : '');
    if (sub) text(ctx, sub, x + sw + 18, yy + (cols === 1 ? 46 : 34), { size: 26, weight: 600, color: cream(0.7), max: colW - sw - 18 });
    yy += cols === 1 ? 100 : 82;
    if (model.team && lead.members?.length) {
      text(ctx, lead.members.join(' · '), x, yy, { size: 24, weight: 600, color: cream(0.75), max: colW });
      yy += 34;
    }
    bottom = Math.max(bottom, yy);
  });
  return bottom + 16;
}

// The standings: one column of ten, or two columns of ten by division.
function drawBoardList(ctx, model, L, y, maxY) {
  const boards = model.boards.filter(b => b.top.length);
  if (!boards.length) return y;
  const cols = boards.length > 1 ? 2 : 1;
  const colW = (W - PAD * 2 - (cols - 1) * 32) / cols;
  const rowH = cols === 1 ? 50 : 44;
  const nameSize = cols === 1 ? 30 : 26;
  const posW = cols === 1 ? 60 : 50;
  const grossW = cols === 1 ? 90 : 72;
  const scoreW = cols === 1 ? 110 : 90;
  let bottom = y;
  boards.slice(0, 2).forEach((b, i) => {
    const x = PAD + i * (colW + 32);
    let yy = y;
    if (b.division) {
      text(ctx, L.division(b.division).toUpperCase(), x, yy, { size: 22, weight: 800, color: GOLD, max: colW });
      yy += 36;
    }
    const rows = Math.min(b.top.length, Math.floor((maxY - yy) / rowH));
    b.top.slice(0, rows).forEach((e, j) => {
      if (j % 2 === 0) {
        ctx.fillStyle = cream(0.05);
        rrect(ctx, x - 10, yy - 4, colW + 20, rowH, 8);
        ctx.fill();
      }
      const ty = yy + (rowH - nameSize) / 2 - 4;
      text(ctx, e.posLabel, x, ty, { size: nameSize - 2, weight: 800, color: GOLD_L });
      text(ctx, e.name, x + posW, ty, { size: nameSize, weight: 700, max: colW - posW - scoreW - grossW - 16 });
      const score = model.points ? String(e.total) : scoreText(e.total);
      text(ctx, score, x + colW - grossW - 8, ty, { size: nameSize, weight: 800, align: 'right', color: !model.points && Number(e.total) < 0 ? GOLD_L : CREAM });
      if (e.gross !== null && e.gross !== undefined) {
        text(ctx, String(e.gross), x + colW, ty + 4, { size: nameSize - 6, weight: 500, align: 'right', color: cream(0.55) });
      }
      yy += rowH;
    });
    bottom = Math.max(bottom, yy);
  });
  return bottom;
}

// An M Cup: the two teams face to face, then the sessions.
function drawTeams(ctx, model, L, logos, y) {
  const colW = (W - PAD * 2 - 80) / 2;
  const side = (k, i) => {
    const tm = model.teams[k];
    const x = PAD + i * (colW + 80);
    const win = model.winner === k;
    ctx.fillStyle = win ? 'rgba(221,137,16,0.16)' : cream(0.05);
    rrect(ctx, x, y, colW, 300, 22);
    ctx.fill();
    if (win) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3; rrect(ctx, x, y, colW, 300, 22); ctx.stroke(); }
    const cx = x + colW / 2;
    const logo = logos[i];
    if (logo) {
      ctx.fillStyle = '#fff';
      rrect(ctx, cx - 50, y + 22, 100, 100, 18);
      ctx.fill();
      drawContain(ctx, logo, cx - 42, y + 30, 84, 84);
    } else {
      ctx.fillStyle = tm.color;
      ctx.beginPath();
      ctx.arc(cx, y + 72, 44, 0, Math.PI * 2);
      ctx.fill();
    }
    text(ctx, tm.short, cx, y + 138, { size: 32, weight: 800, align: 'center', max: colW - 24 });
    text(ctx, pointsText(tm.points), cx, y + 180, { size: 100, weight: 800, align: 'center', color: win ? GOLD_L : cream(0.8) });
  };
  side('a', 0);
  side('b', 1);
  text(ctx, '–', W / 2, y + 150, { size: 64, weight: 800, align: 'center', color: cream(0.5) });
  let yy = y + 322;
  const verdict = model.winner
    ? `${L.winner}: ${model.teams[model.winner].name}`
    : (model.complete ? L.tied.toUpperCase() : '');
  if (verdict) {
    text(ctx, verdict.toUpperCase(), W / 2, yy, { size: 26, weight: 800, align: 'center', color: GOLD, max: W - PAD * 2 });
    yy += 40;
  }
  return yy + 16;
}

function drawSessions(ctx, model, L, y, maxY) {
  const rows = model.sessions.filter(s => s.matches.length);
  let yy = y;
  if (rows.length) {
    rows.forEach(s => {
      if (yy + 46 > maxY) return;
      const label = [s.day !== null ? `${L.day} ${s.day}` : '', s.format].filter(Boolean).join(' — ') || L.matches;
      text(ctx, label, PAD, yy, { size: 28, weight: 700, max: W - PAD * 2 - 220 });
      text(ctx, `${pointsText(s.totals.a)} – ${pointsText(s.totals.b)}`, W - PAD, yy, { size: 28, weight: 800, align: 'right', color: GOLD_L });
      yy += 46;
    });
    return yy;
  }
  return yy;
}

// Plain match play: the standings.
function drawStandings(ctx, model, L, y, maxY) {
  if (!model.top.length) return y;
  const rowH = 50;
  let yy = y;
  model.top.forEach((r, j) => {
    if (yy + rowH > maxY) return;
    if (j % 2 === 0) { ctx.fillStyle = cream(0.05); rrect(ctx, PAD - 10, yy - 4, W - PAD * 2 + 20, rowH, 8); ctx.fill(); }
    const ty = yy + 6;
    text(ctx, r.posLabel, PAD, ty, { size: 28, weight: 800, color: GOLD_L });
    text(ctx, r.name, PAD + 60, ty, { size: 30, weight: 700, max: W - PAD * 2 - 60 - 260 });
    text(ctx, `${r.w}-${r.l}-${r.h}`, W - PAD - 130, ty + 4, { size: 24, weight: 500, align: 'right', color: cream(0.55) });
    text(ctx, pointsText(r.points), W - PAD, ty, { size: 30, weight: 800, align: 'right' });
    yy += rowH;
  });
  return yy;
}

const scoreText = (v) => {
  if (v === undefined || v === null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (n === 0) return 'E';
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
};
const pointsText = (n) => (Number(n) % 1 ? Number(n).toFixed(1) : String(Number(n) || 0));

/**
 * Draw the card. `labels` carries every word on it (the caller translates):
 *   results, after, champion, leading, tied, strokes, points, winner, day,
 *   matches, scan, division(d) → name.
 * `subtitle` is the dates · venue line; `url` the results page the QR opens.
 * Resolves to { blob, dataUrl, width, height }.
 */
export async function buildResultsImage(tn, model, { url = '', subtitle = '', labels = {}, clubLogo = '/logo-cream.svg', site = 'ubgolf.club' } = {}) {
  const L = { division: () => '', ...labels };
  await loadFonts();
  const [club, crest, qr, logoA, logoB] = await Promise.all([
    loadSvg(clubLogo),
    loadImage(tn?.logo),
    url ? qrCanvas(url, 150) : null,
    model.kind === 'ryder' ? loadImage(model.teams.a.logo) : null,
    model.kind === 'ryder' ? loadImage(model.teams.b.logo) : null
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, NAVY_2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 10);

  // Masthead: the club, the site.
  let y = PAD;
  if (club) drawContain(ctx, club, PAD, y, 300, 78);
  else text(ctx, 'UB GOLF CLUB', PAD, y + 22, { size: 30, weight: 800 });
  text(ctx, site, W - PAD, y + 26, { size: 26, weight: 700, align: 'right', color: cream(0.6) });
  y += 122;

  // The tournament: crest, name, dates · venue, and what this card is.
  let tx = PAD;
  if (crest) {
    ctx.fillStyle = '#fff';
    rrect(ctx, PAD, y, 150, 150, 24);
    ctx.fill();
    drawContain(ctx, crest, PAD + 14, y + 14, 122, 122);
    tx = PAD + 150 + 28;
  }
  const tw = W - PAD - tx;
  ctx.font = font(900, 52, true);
  const lines = wrap(ctx, tn?.name || '', tw, 2);
  lines.forEach((ln, i) => text(ctx, ln, tx, y + i * 64, { size: 52, weight: 900, display: true }));
  let ty = y + lines.length * 64 + 8;
  if (subtitle) {
    text(ctx, subtitle, tx, ty, { size: 27, weight: 600, color: cream(0.78), max: tw });
    ty += 44;
  }
  const pill = String(model.state === 'final' ? L.results : L.after).toUpperCase();
  ctx.font = font(800, 22);
  const pw = ctx.measureText(pill).width + 36;
  ctx.fillStyle = GOLD;
  rrect(ctx, tx, ty, pw, 40, 20);
  ctx.fill();
  text(ctx, pill, tx + 18, ty + 9, { size: 22, weight: 800, color: NAVY });
  y = Math.max(y + 150, ty + 40) + 36;
  rule(ctx, y);
  y += 30;

  // The result, then the table — down to the footer.
  const footerY = H - PAD - 150;
  if (model.kind === 'ryder') {
    y = drawTeams(ctx, model, L, [logoA, logoB], y);
    rule(ctx, y);
    y = drawSessions(ctx, model, L, y + 26, footerY - 24);
  } else if (model.kind === 'singles') {
    if (model.leaders.length) {
      text(ctx, (model.state === 'final' ? L.champion : L.leading).toUpperCase(), PAD, y, { size: 22, weight: 800, color: GOLD });
      text(ctx, model.leaders.map(r => r.name).join(' · '), PAD, y + 36, { size: 50, weight: 800, max: W - PAD * 2 });
      const sw = text(ctx, pointsText(model.leaders[0].points), PAD, y + 102, { size: 84, weight: 800, color: GOLD_L });
      text(ctx, L.points, PAD + sw + 18, y + 148, { size: 26, weight: 600, color: cream(0.7) });
      y += 218;
    }
    rule(ctx, y);
    y = drawStandings(ctx, model, L, y + 26, footerY - 24);
  } else {
    y = drawChampions(ctx, model, L, y);
    rule(ctx, y);
    y = drawBoardList(ctx, model, L, y + 26, footerY - 24);
  }

  // Footer: the QR that opens the full results, and where.
  rule(ctx, footerY - 26);
  if (qr) {
    ctx.fillStyle = '#fff';
    rrect(ctx, PAD, footerY, 150, 150, 14);
    ctx.fill();
    ctx.drawImage(qr, PAD + 6, footerY + 6, 138, 138);
  }
  const fx = qr ? PAD + 150 + 26 : PAD;
  text(ctx, L.scan || '', fx, footerY + 22, { size: 24, weight: 700, color: cream(0.8), max: W - PAD - fx });
  ctx.font = font(500, 22);
  wrap(ctx, url, W - PAD - fx, 2).forEach((ln, i) =>
    text(ctx, ln, fx, footerY + 60 + i * 30, { size: 22, weight: 500, color: cream(0.55) }));

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { blob, dataUrl: canvas.toDataURL('image/png'), width: W, height: H };
}
