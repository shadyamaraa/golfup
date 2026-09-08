// src/results-image.js
// The share cards: pictures drawn on a canvas, on the phone that shares them,
// from the results model — the champion poster (feed 4:5 and story 9:16), a
// player's own card, the pages of a carousel, and a link-preview card. The
// model decides every number and name; this file lays them out in the
// club's colours, over the tournament's cover photo when it has one.
// Browser only; nothing here is stored.

const SIZES = {
  feed: [1080, 1350],
  story: [1080, 1920],
  personal: [1080, 1350],
  personalStory: [1080, 1920],
  og: [1200, 630]
};
// Instagram draws its own controls over the top and bottom of a story.
const SAFE = 250;
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

// ---- assets ----

// The fonts come from Google, so a first share on a cold cache would paint
// in the fallback face. Wait for the faces the cards use — briefly: a slow
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

// The page's URL as a QR, by the same lazy chunk the print pages use. Best
// effort: no QR is a card without one, never no card.
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

async function loadAssets(tn, o) {
  const [club, crest, cover, qr, avatar, ...rest] = await Promise.all([
    loadSvg(o.clubLogo || '/logo-cream.svg'),
    loadImage(tn?.logo),
    o.background === 'cover' ? loadImage(o.cover) : null,
    o.url ? qrCanvas(o.url, 150) : null,
    loadImage(o.avatar),
    ...(o.sponsors || []).map(s => loadImage(s.logo)),
  ]);
  const sponsors = (o.sponsors || []).map((s, i) => ({ name: s.name, img: rest[i] }));
  const teams = o.teamLogos ? await Promise.all([loadImage(o.teamLogos.a), loadImage(o.teamLogos.b)]) : [null, null];
  return { club, crest, cover, qr, avatar, sponsors, teams };
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

function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
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

function rule(ctx, y, W, color = cream(0.16)) {
  ctx.fillStyle = color;
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
}

// A gold pill with navy text; returns its width.
function pill(ctx, label, x, y, { size = 22, bg = GOLD, fg = NAVY, padX = 18, h = 40 } = {}) {
  ctx.font = font(800, size);
  const w = ctx.measureText(label).width + padX * 2;
  ctx.fillStyle = bg;
  rrect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  text(ctx, label, x + padX, y + (h - size) / 2 - 1, { size, weight: 800, color: fg });
  return w;
}

// A translucent panel the way the app's cards sit on the navy page.
function panel(ctx, x, y, w, h, { fill = cream(0.06), stroke = cream(0.14), r = 22, gold = false } = {}) {
  ctx.fillStyle = gold ? 'rgba(221,137,16,0.16)' : fill;
  rrect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = gold ? GOLD : stroke;
  ctx.lineWidth = gold ? 3 : 1.5;
  rrect(ctx, x, y, w, h, r);
  ctx.stroke();
}

// The ground: the cover photo under a navy veil, or the navy gradient with a
// fairway glow and the faint diagonal weave the club's cards carry.
function background(ctx, W, H, cover) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, NAVY);
  g.addColorStop(1, NAVY_2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (cover) {
    drawCover(ctx, cover, 0, 0, W, H);
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(12,48,81,0.55)');
    v.addColorStop(0.55, 'rgba(12,48,81,0.82)');
    v.addColorStop(1, 'rgba(10,39,66,0.96)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  } else {
    const glow = ctx.createRadialGradient(W / 2, H * 1.05, 40, W / 2, H * 1.05, W * 0.9);
    glow.addColorStop(0, 'rgba(46,139,87,0.42)');
    glow.addColorStop(1, 'rgba(46,139,87,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    const warm = ctx.createRadialGradient(W * 0.75, -60, 20, W * 0.75, -60, W * 0.9);
    warm.addColorStop(0, 'rgba(221,137,16,0.30)');
    warm.addColorStop(1, 'rgba(221,137,16,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 6;
    for (let i = -H; i < W + H; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + H, H);
      ctx.stroke();
    }
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 10);
}

function masthead(ctx, A, W, y, right, site) {
  if (A.club) drawContain(ctx, A.club, PAD, y, 280, 72);
  else text(ctx, 'UB GOLF CLUB', PAD, y + 20, { size: 30, weight: 800 });
  text(ctx, right || site || '', W - PAD, y + 24, { size: 24, weight: 700, align: 'right', color: cream(0.62), max: W - PAD * 2 - 300 });
  return y + 72;
}

// Crest tile, the name over two lines, the dates · venue line, the state
// pill. Returns the bottom of the block.
function titleBlock(ctx, A, W, y, { name, subtitle, pillText, size = 52 }) {
  let tx = PAD;
  if (A.crest) {
    ctx.fillStyle = '#fff';
    rrect(ctx, PAD, y, 150, 150, 24);
    ctx.fill();
    drawContain(ctx, A.crest, PAD + 14, y + 14, 122, 122);
    tx = PAD + 150 + 28;
  }
  const tw = W - PAD - tx;
  ctx.font = font(900, size, true);
  const lines = wrap(ctx, name || '', tw, 2);
  const lh = Math.round(size * 1.22);
  lines.forEach((ln, i) => text(ctx, ln, tx, y + i * lh, { size, weight: 900, display: true }));
  let ty = y + lines.length * lh + 8;
  if (subtitle) {
    text(ctx, subtitle, tx, ty, { size: 27, weight: 600, color: cream(0.78), max: tw });
    ty += 44;
  }
  if (pillText) {
    pill(ctx, String(pillText).toUpperCase(), tx, ty);
    ty += 40;
  }
  return Math.max(A.crest ? y + 150 : 0, ty);
}

function sponsorStrip(ctx, A, W, y, L) {
  const list = A.sponsors.filter(s => s.img || s.name);
  if (!list.length) return y;
  text(ctx, String(L.sponsors || '').toUpperCase(), PAD, y + 20, { size: 18, weight: 800, color: cream(0.6) });
  ctx.font = font(800, 18);
  let x = PAD + ctx.measureText(String(L.sponsors || '').toUpperCase()).width + 24;
  const h = 56;
  for (const s of list) {
    let w = 150;
    if (!s.img) {
      ctx.font = font(800, 20);
      w = Math.min(220, ctx.measureText(s.name).width + 32);
    }
    if (x + w > W - PAD) break;
    ctx.fillStyle = '#fff';
    rrect(ctx, x, y, w, h, 10);
    ctx.fill();
    if (s.img) drawContain(ctx, s.img, x + 10, y + 8, w - 20, h - 16);
    else text(ctx, s.name, x + 16, y + 17, { size: 20, weight: 800, color: NAVY, max: w - 32 });
    x += w + 12;
  }
  return y + h;
}

// QR + "scan to open" + url; or the hashtag line when the card has no page
// of its own to point at.
function footer(ctx, A, W, y, { url, scan, hashtag, note }) {
  let fx = PAD;
  if (A.qr) {
    ctx.fillStyle = '#fff';
    rrect(ctx, PAD, y, 150, 150, 14);
    ctx.fill();
    ctx.drawImage(A.qr, PAD + 6, y + 6, 138, 138);
    fx = PAD + 150 + 26;
  }
  let ty = y + (A.qr ? 18 : 0);
  if (note) { text(ctx, note, fx, ty, { size: 26, weight: 700, color: cream(0.85), max: W - PAD - fx }); ty += 38; }
  if (scan) { text(ctx, scan, fx, ty, { size: 22, weight: 600, color: cream(0.7), max: W - PAD - fx }); ty += 32; }
  if (hashtag) { text(ctx, hashtag, fx, ty, { size: 22, weight: 700, color: GOLD_L, max: W - PAD - fx }); ty += 32; }
  if (url) {
    ctx.font = font(500, 20);
    wrap(ctx, url, W - PAD - fx, 2).forEach((ln, i) => text(ctx, ln, fx, ty + i * 26, { size: 20, weight: 500, color: cream(0.5) }));
  }
}

const scoreText = (v, points = false) => {
  if (v === undefined || v === null || v === '') return '–';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  if (points) return String(n);
  if (n === 0) return 'E';
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
};
const pointsText = (n) => (Number(n) % 1 ? Number(n).toFixed(1) : String(Number(n) || 0));
const under = (v, points) => !points && Number(v) < 0;

// ---- blocks shared by the tournament cards ----

// The champion(s): one panel, or one per division side by side.
function championBlock(ctx, W, model, L, y, { big = true, story = false } = {}) {
  const boards = model.boards.filter(b => b.leaders.length);
  if (!boards.length) return y;
  const cols = boards.length > 1 ? 2 : 1;
  const gap = 24;
  const colW = (W - PAD * 2 - (cols - 1) * gap) / cols;
  const nameSize = cols === 1 ? (story ? 60 : big ? 52 : 44) : (story ? 44 : 40);
  const scoreSize = cols === 1 ? (story ? 108 : big ? 92 : 76) : (story ? 76 : 66);
  const h = 40 + nameSize + 16 + scoreSize + 28 + (model.team ? 34 : 0);
  boards.slice(0, 2).forEach((b, i) => {
    const x = PAD + i * (colW + gap);
    panel(ctx, x, y, colW, h, { gold: model.state === 'final' });
    let yy = y + 22;
    const cap = `${model.state === 'final' ? L.champion : L.leading}${b.division ? ` · ${L.division(b.division)}` : ''}`;
    text(ctx, `🏆 ${cap}`.toUpperCase(), x + 24, yy, { size: 22, weight: 800, color: GOLD_L, max: colW - 48 });
    yy += 36;
    const names = b.leaders.length > 2 ? `${b.leaders.length} ${L.players} ${L.tied}` : b.leaders.map(e => e.name).join(' · ');
    text(ctx, names, x + 24, yy, { size: nameSize, weight: 900, display: true, max: colW - 48 });
    yy += nameSize + 14;
    const lead = b.leaders[0];
    const score = scoreText(lead.total, model.points);
    const sw = text(ctx, score, x + 24, yy, { size: scoreSize, weight: 800, color: GOLD_L });
    const subParts = [];
    if (lead.gross !== null && lead.gross !== undefined) subParts.push(`${lead.gross} ${L.strokes}`);
    (lead.rounds || []).forEach((v, r) => { if (v !== null && v !== undefined) subParts.push(`R${r + 1} ${scoreText(v, model.points)}`); });
    if (model.points) subParts.unshift(L.points);
    text(ctx, subParts.join(' · '), x + 24 + sw + 18, yy + scoreSize - 34, { size: 24, weight: 600, color: cream(0.72), max: colW - 48 - sw - 18 });
    if (model.team && lead.memberIds?.length && lead.members) {
      text(ctx, lead.members.join(' · '), x + 24, yy + scoreSize + 6, { size: 24, weight: 600, color: cream(0.75), max: colW - 48 });
    }
  });
  return y + h;
}

// Standings rows: one column of `rows`, or two columns by division.
function boardList(ctx, W, model, L, y, maxY, { rows = 10, from = 1, division = undefined, highlightWinner = true, rowH: rowHOpt, nameSize: nameSizeOpt } = {}) {
  const boards = (division === undefined ? model.boards : model.boards.filter(b => b.division === division))
    .filter(b => b.inPlay.length >= from);
  if (!boards.length) return y;
  const cols = boards.length > 1 ? 2 : 1;
  const gap = 32;
  const colW = (W - PAD * 2 - (cols - 1) * gap) / cols;
  // The overrides are for the story's single column; two columns have no
  // room for them and keep their own sizes.
  const rowH = cols === 1 ? (rowHOpt || 62) : Math.min(rowHOpt || 50, 58);
  const nameSize = cols === 1 ? (nameSizeOpt || 32) : Math.min(nameSizeOpt || 26, 28);
  const posW = cols === 1 ? 70 : 54;
  const grossW = cols === 1 ? 80 : 64;
  const scoreW = cols === 1 ? 120 : 92;
  let bottom = y;
  boards.slice(0, 2).forEach((b, i) => {
    const x = PAD + i * (colW + gap);
    let yy = y;
    if (b.division) {
      text(ctx, L.division(b.division).toUpperCase(), x, yy, { size: 22, weight: 800, color: GOLD_L, max: colW });
      yy += 38;
    }
    const slice = b.inPlay.slice(from - 1, from - 1 + rows);
    const n = Math.min(slice.length, Math.floor((maxY - yy) / rowH));
    slice.slice(0, n).forEach((e, j) => {
      const win = highlightWinner && e.rank === 1 && model.state === 'final';
      if (win) { ctx.fillStyle = 'rgba(221,137,16,0.18)'; rrect(ctx, x - 12, yy, colW + 24, rowH - 6, 10); ctx.fill(); ctx.strokeStyle = 'rgba(221,137,16,0.6)'; ctx.lineWidth = 2; rrect(ctx, x - 12, yy, colW + 24, rowH - 6, 10); ctx.stroke(); }
      else if (j % 2 === 0) { ctx.fillStyle = cream(0.05); rrect(ctx, x - 12, yy, colW + 24, rowH - 6, 10); ctx.fill(); }
      const ty = yy + (rowH - 6 - nameSize) / 2 - 2;
      text(ctx, e.posLabel, x + 4, ty, { size: nameSize - 2, weight: 800, color: GOLD_L });
      text(ctx, e.name, x + posW, ty, { size: nameSize, weight: 700, max: colW - posW - scoreW - grossW - 12 });
      text(ctx, scoreText(e.total, model.points), x + colW - grossW - 12, ty, { size: nameSize, weight: 800, align: 'right', color: under(e.total, model.points) ? GOLD_L : CREAM });
      if (e.gross !== null && e.gross !== undefined) text(ctx, String(e.gross), x + colW - 6, ty + 5, { size: nameSize - 8, weight: 500, align: 'right', color: cream(0.55) });
      yy += rowH;
    });
    bottom = Math.max(bottom, yy);
  });
  return bottom;
}

// An M Cup: the two teams face to face, then the sessions.
function teamsBlock(ctx, W, model, A, L, y) {
  const colW = (W - PAD * 2 - 80) / 2;
  const h = 300;
  ['a', 'b'].forEach((k, i) => {
    const tm = model.teams[k];
    const x = PAD + i * (colW + 80);
    const win = model.winner === k && model.complete;
    panel(ctx, x, y, colW, h, { gold: win });
    const cx = x + colW / 2;
    const logo = A.teams[i];
    if (logo) { ctx.fillStyle = '#fff'; rrect(ctx, cx - 50, y + 22, 100, 100, 18); ctx.fill(); drawContain(ctx, logo, cx - 42, y + 30, 84, 84); }
    else { ctx.fillStyle = tm.color; ctx.beginPath(); ctx.arc(cx, y + 72, 44, 0, Math.PI * 2); ctx.fill(); }
    text(ctx, tm.short, cx, y + 138, { size: 32, weight: 800, align: 'center', max: colW - 24 });
    text(ctx, pointsText(tm.points), cx, y + 180, { size: 100, weight: 800, align: 'center', color: win ? GOLD_L : cream(0.85) });
  });
  text(ctx, '–', W / 2, y + 150, { size: 64, weight: 800, align: 'center', color: cream(0.5) });
  let yy = y + h + 22;
  const verdict = model.winner
    ? `${model.complete ? L.winner : L.leading}: ${model.teams[model.winner].name}`
    : (model.complete ? L.tied : '');
  if (verdict) { text(ctx, verdict.toUpperCase(), W / 2, yy, { size: 26, weight: 800, align: 'center', color: GOLD, max: W - PAD * 2 }); yy += 40; }
  return yy + 10;
}

function sessionRows(ctx, W, model, L, y, maxY) {
  let yy = y;
  model.sessions.filter(s => s.matches.length).forEach(s => {
    if (yy + 46 > maxY) return;
    const label = [s.day !== null ? `${L.day} ${s.day}` : '', s.format].filter(Boolean).join(' — ') || L.matches;
    text(ctx, label, PAD, yy, { size: 28, weight: 700, max: W - PAD * 2 - 220 });
    text(ctx, `${pointsText(s.totals.a)} – ${pointsText(s.totals.b)}`, W - PAD, yy, { size: 28, weight: 800, align: 'right', color: GOLD_L });
    yy += 46;
  });
  return yy;
}

function standingsRows(ctx, W, rows, L, y, maxY) {
  let yy = y;
  rows.forEach((r, j) => {
    if (yy + 56 > maxY) return;
    if (j % 2 === 0) { ctx.fillStyle = cream(0.05); rrect(ctx, PAD - 12, yy, W - PAD * 2 + 24, 50, 10); ctx.fill(); }
    text(ctx, r.posLabel, PAD + 4, yy + 8, { size: 28, weight: 800, color: GOLD_L });
    text(ctx, r.name, PAD + 70, yy + 8, { size: 30, weight: 700, max: W - PAD * 2 - 70 - 260 });
    text(ctx, `${r.w}-${r.l}-${r.h}`, W - PAD - 130, yy + 12, { size: 24, weight: 500, align: 'right', color: cream(0.55) });
    text(ctx, pointsText(r.points), W - PAD, yy + 8, { size: 30, weight: 800, align: 'right' });
    yy += 56;
  });
  return yy;
}

// ---- the tournament cards ----

function drawFeed(ctx, W, H, tn, model, A, L, o) {
  background(ctx, W, H, A.cover);
  let y = masthead(ctx, A, W, PAD, null, o.site);
  y = titleBlock(ctx, A, W, y + 36, { name: tn?.name, subtitle: o.subtitle, pillText: model.state === 'final' ? L.results : L.after }) + 30;
  rule(ctx, y, W);
  y += 28;
  const footerY = H - PAD - 150;
  const hasSp = A.sponsors.some(s => s.img || s.name);
  const listEnd = footerY - 28 - (hasSp ? 80 : 0);
  if (model.kind === 'ryder') {
    y = teamsBlock(ctx, W, model, A, L, y);
    rule(ctx, y, W);
    sessionRows(ctx, W, model, L, y + 24, listEnd);
  } else if (model.kind === 'singles') {
    if (model.leaders.length) {
      panel(ctx, PAD, y, W - PAD * 2, 200, { gold: model.state === 'final' });
      text(ctx, (model.state === 'final' ? L.champion : L.leading).toUpperCase(), PAD + 24, y + 22, { size: 22, weight: 800, color: GOLD_L });
      text(ctx, model.leaders.map(r => r.name).join(' · '), PAD + 24, y + 58, { size: 48, weight: 900, display: true, max: W - PAD * 2 - 48 });
      const sw = text(ctx, pointsText(model.leaders[0].points), PAD + 24, y + 118, { size: 64, weight: 800, color: GOLD_L });
      text(ctx, L.points, PAD + 24 + sw + 16, y + 150, { size: 24, weight: 600, color: cream(0.7) });
      y += 224;
    }
    standingsRows(ctx, W, model.top, L, y, listEnd);
  } else {
    y = championBlock(ctx, W, model, L, y) + 26;
    boardList(ctx, W, model, L, y, listEnd, { rows: 10 });
  }
  if (hasSp) sponsorStrip(ctx, A, W, footerY - 84, L);
  rule(ctx, footerY - 26, W);
  footer(ctx, A, W, footerY, { url: o.url, scan: L.scan, hashtag: o.hashtag });
}

function drawStory(ctx, W, H, tn, model, A, L, o) {
  background(ctx, W, H, A.cover);
  let y = masthead(ctx, A, W, SAFE + 10, null, o.site);
  y = titleBlock(ctx, A, W, y + 40, { name: tn?.name, subtitle: o.subtitle, pillText: model.state === 'final' ? L.results : L.after, size: 56 }) + 36;
  rule(ctx, y, W);
  y += 34;
  const footerY = H - SAFE - 170;
  if (model.kind === 'ryder') {
    y = teamsBlock(ctx, W, model, A, L, y);
    rule(ctx, y, W);
    sessionRows(ctx, W, model, L, y + 28, footerY - 30);
  } else if (model.kind === 'singles') {
    standingsRows(ctx, W, model.top.slice(0, 6), L, y, footerY - 30);
  } else {
    y = championBlock(ctx, W, model, L, y, { big: true, story: true }) + 34;
    boardList(ctx, W, model, L, y, footerY - 30, { rows: 6, highlightWinner: false, rowH: 74, nameSize: 36 });
  }
  rule(ctx, footerY - 26, W);
  footer(ctx, A, W, footerY, { url: o.url, note: L.liveBoard, hashtag: o.hashtag });
}

function drawOg(ctx, W, H, tn, model, A, L, o) {
  background(ctx, W, H, A.cover);
  if (A.club) drawContain(ctx, A.club, 48, 40, 220, 56);
  let x = 48;
  if (A.crest) { ctx.fillStyle = '#fff'; rrect(ctx, 48, 120, 150, 150, 24); ctx.fill(); drawContain(ctx, A.crest, 62, 134, 122, 122); x = 48 + 150 + 28; }
  ctx.font = font(900, 48, true);
  wrap(ctx, tn?.name || '', W - x - 48, 2).forEach((ln, i) => text(ctx, ln, x, 118 + i * 58, { size: 48, weight: 900, display: true }));
  text(ctx, o.subtitle || '', x, 240, { size: 24, weight: 600, color: cream(0.75), max: W - x - 48 });
  pill(ctx, String(model.state === 'final' ? L.results : L.after).toUpperCase(), x, 282, { size: 20, h: 36, padX: 16 });
  const board = model.kind === 'stroke' ? model.boards.find(b => b.leaders.length) : null;
  if (board) {
    const lead = board.leaders[0];
    text(ctx, `${model.state === 'final' ? L.champion : L.leading}${board.division ? ` · ${L.division(board.division)}` : ''}`.toUpperCase(), 48, 350, { size: 20, weight: 800, color: GOLD_L });
    text(ctx, board.leaders.length > 2 ? `${board.leaders.length} ${L.players} ${L.tied}` : board.leaders.map(e => e.name).join(' · '), 48, 384, { size: 60, weight: 900, display: true, max: W - 96 - 260 });
    text(ctx, scoreText(lead.total, model.points), W - 48, 360, { size: 120, weight: 800, align: 'right', color: GOLD_L });
  } else if (model.kind === 'ryder') {
    text(ctx, `${model.teams.a.short}  ${pointsText(model.teams.a.points)}  –  ${pointsText(model.teams.b.points)}  ${model.teams.b.short}`, 48, 380, { size: 64, weight: 800, max: W - 96 });
  }
  text(ctx, o.site || '', W - 48, H - 72, { size: 24, weight: 700, align: 'right', color: cream(0.6) });
}

// ---- the player's own card ----

// The hole strip in the card's notation: a ring for a birdie, two for an
// eagle, a box for a bogey, two for worse, nothing for par.
function holeCell(ctx, x, y, s, h) {
  ctx.fillStyle = cream(0.08);
  rrect(ctx, x, y, s, s, 10);
  ctx.fill();
  if (h.strokes === null || h.strokes === undefined) return;
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.lineWidth = 3;
  if (h.cls === 'birdie' || h.cls === 'eagle') {
    ctx.strokeStyle = GOLD_L;
    ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 5, 0, Math.PI * 2); ctx.stroke();
    if (h.cls === 'eagle') { ctx.beginPath(); ctx.arc(cx, cy, s / 2 - 12, 0, Math.PI * 2); ctx.stroke(); }
  } else if (h.cls === 'bogey' || h.cls === 'double') {
    ctx.strokeStyle = cream(0.75);
    ctx.strokeRect(x + 5, y + 5, s - 10, s - 10);
    if (h.cls === 'double') ctx.strokeRect(x + 12, y + 12, s - 24, s - 24);
  }
  text(ctx, String(h.strokes), cx, cy - 15, { size: 28, weight: 800, align: 'center' });
}

function statTile(ctx, x, y, w, h, cap, value, { gold = false, small = '', valueSize = 48 } = {}) {
  panel(ctx, x, y, w, h, { r: 18 });
  text(ctx, String(cap).toUpperCase(), x + 20, y + 16, { size: 18, weight: 800, color: cream(0.6), max: w - 40 });
  text(ctx, String(value), x + 20, y + 44, { size: valueSize, weight: 800, color: gold ? GOLD_L : CREAM, max: w - 40 });
  if (small) text(ctx, small, x + 20, y + 52 + valueSize, { size: 18, weight: 600, color: cream(0.55), max: w - 40 });
}

function drawPersonal(ctx, W, H, tn, me, A, L, o, story) {
  background(ctx, W, H, A.cover);
  const top = story ? SAFE + 10 : PAD;
  let y = masthead(ctx, A, W, top, tn?.name || '', o.site);
  y += 40;

  // Who: avatar disc, the position line, the name, the small facts.
  const av = 150;
  ctx.fillStyle = GOLD_L;
  ctx.beginPath(); ctx.arc(PAD + av / 2, y + av / 2, av / 2 + 6, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(PAD + av / 2, y + av / 2, av / 2, 0, Math.PI * 2); ctx.clip();
  const ag = ctx.createLinearGradient(PAD, y, PAD + av, y + av);
  ag.addColorStop(0, '#0C3051'); ag.addColorStop(1, '#4E8FCB');
  ctx.fillStyle = ag; ctx.fillRect(PAD, y, av, av);
  if (A.avatar) drawCover(ctx, A.avatar, PAD, y, av, av);
  else text(ctx, initialsOf(me.name), PAD + av / 2, y + av / 2 - 30, { size: 60, weight: 800, align: 'center' });
  ctx.restore();
  const tx = PAD + av + 30;
  const tw = W - PAD - tx;
  const capParts = me.kind === 'stroke'
    ? [me.posLabel && me.posLabel !== '–' ? (/^T?\d+$/.test(me.posLabel) ? `${L.pos} ${me.posLabel}` : me.posLabel) : '', me.division ? L.division(me.division) : '', me.inPlay ? `${me.fieldSize} ${L.players}` : '']
    : me.kind === 'ryder' ? [me.team?.short || '', `${pointsText(me.record.points)} ${L.points}`] : [`${L.pos} ${me.posLabel}`, `${pointsText(me.record.points)} ${L.points}`];
  text(ctx, capParts.filter(Boolean).join(' · ').toUpperCase(), tx, y + 4, { size: 22, weight: 800, color: GOLD_L, max: tw });
  ctx.font = font(900, 56, true);
  const nameLines = wrap(ctx, me.name, tw, 2);
  nameLines.forEach((ln, i) => text(ctx, ln, tx, y + 40 + i * 66, { size: 56, weight: 900, display: true }));
  const facts = me.kind === 'stroke'
    ? [me.hcp !== null && me.hcp !== undefined ? `HCP ${me.hcp}` : '', o.subtitle].filter(Boolean).join(' · ')
    : o.subtitle;
  text(ctx, facts || '', tx, y + 40 + nameLines.length * 66 + 6, { size: 24, weight: 600, color: cream(0.72), max: tw });
  y += Math.max(av, 40 + nameLines.length * 66 + 40) + 34;

  // Badges.
  if (me.badges?.length) {
    let bx = PAD;
    me.badges.forEach(b => { bx += pill(ctx, `★ ${L.badge(b)}`.toUpperCase(), bx, y, { size: 20, h: 38, padX: 16 }) + 10; });
    y += 56;
  }

  // The numbers.
  const tiles = [];
  if (me.kind === 'stroke') {
    tiles.push([L.total, scoreText(me.total, me.points), { gold: true }]);
    if (!o.hideStrokes && me.gross !== null && me.gross !== undefined) tiles.push([L.strokes, me.gross]);
    else if (me.thru) tiles.push([L.thru, me.thru]);
    // Being ahead of nobody is not a number to put on a card.
    if (me.beatPct !== null && me.beatPct > 0) tiles.push([L.field, `${me.beatPct}%`, { small: L.beatShort }]);
    me.rounds.slice(0, 3).forEach(r => tiles.push([`R${r.round}`, scoreText(r.toPar, me.points), { small: [o.hideStrokes ? '' : String(r.gross), r.complete ? '' : `${L.thru} ${r.holesIn}`].filter(Boolean).join(' · ') }]));
    if (me.hasPars) tiles.push([me.eagles > 0 ? 'Eagle · Birdie' : 'Birdie', me.eagles > 0 ? `${me.eagles} · ${me.birdies}` : `${me.birdies}`, { gold: true }]);
    if (me.team && me.members.length) tiles.push([L.team, me.members.join(' · ')]);
  } else if (me.kind === 'ryder') {
    tiles.push([L.points, pointsText(me.record.points), { gold: true }]);
    tiles.push(['W · L · H', `${me.record.w} · ${me.record.l} · ${me.record.h}`]);
    tiles.push([me.teams.a.short, pointsText(me.teams.a.points)]);
    tiles.push([me.teams.b.short, pointsText(me.teams.b.points)]);
  } else {
    tiles.push([L.points, pointsText(me.record.points), { gold: true }]);
    tiles.push(['W · L · H', `${me.record.w} · ${me.record.l} · ${me.record.h}`]);
    tiles.push([L.matches, me.record.played]);
  }
  const cols = 3;
  const gap = 16;
  const tw2 = (W - PAD * 2 - gap * (cols - 1)) / cols;
  const th = story ? 160 : 124;
  if (story) y += 20;
  tiles.slice(0, 6).forEach(([cap, v, opt], i) => {
    statTile(ctx, PAD + (i % cols) * (tw2 + gap), y + Math.floor(i / cols) * (th + gap), tw2, th, cap, v, { valueSize: story ? 58 : 48, ...(opt || {}) });
  });
  y += Math.ceil(Math.min(tiles.length, 6) / cols) * (th + gap) + (story ? 44 : 20);

  // The latest round hole by hole.
  const footerY = story ? H - SAFE - 170 : H - PAD - 150;
  const round = me.kind === 'stroke' ? me.rounds.at(-1) : null;
  if (round && round.holes.some(h => h.strokes !== null) && y + 40 + 2 * 96 < footerY - 40) {
    text(ctx, `R${round.round} · ${L.byHole}`.toUpperCase(), PAD, y, { size: 22, weight: 800, color: GOLD_L });
    y += 40;
    const s = (W - PAD * 2 - 8 * 12) / 9;
    round.holes.slice(0, 18).forEach((h, i) => holeCell(ctx, PAD + (i % 9) * (s + 12), y + Math.floor(i / 9) * (s + 12), s, h));
    y += 2 * (s + 12) + 10;
  }

  const hasSp = A.sponsors.some(s => s.img || s.name);
  if (hasSp && footerY - 84 > y) sponsorStrip(ctx, A, W, footerY - 84, L);
  rule(ctx, footerY - 26, W);
  const note = me.kind === 'stroke' && me.best
    ? `${L.bestRound}: R${me.best.round} ${scoreText(me.best.toPar)}${me.beatPct !== null && me.beatPct > 0 ? ` · ${L.beat(me.beatPct)}` : ''}`
    : (me.kind === 'ryder' && me.badges.includes('champion') ? `🏆 ${L.winner}: ${me.team?.name || ''}` : '');
  footer(ctx, A, W, footerY, { url: o.url, note, hashtag: o.hashtag });
}

const initialsOf = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// ---- carousel pages ----

function drawCarouselPage(ctx, W, H, desc, tn, model, A, L, o, index, count) {
  if (desc.type === 'champion') { drawFeed(ctx, W, H, tn, model, A, L, o); return; }
  background(ctx, W, H, A.cover);
  let y = masthead(ctx, A, W, PAD, tn?.name || '', o.site);
  y += 30;
  const footerY = H - PAD - 150;
  if (desc.type === 'board') {
    const b = model.boards.find(x => x.division === desc.division);
    text(ctx, `${b?.division ? `${L.division(b.division)} · ` : ''}${desc.from}–${desc.to} / ${b?.inPlay.length || 0}`.toUpperCase(), PAD, y, { size: 24, weight: 800, color: GOLD_L });
    pill(ctx, String(model.state === 'final' ? L.results : L.after).toUpperCase(), W - PAD - 320, y - 8, { size: 20, h: 36, padX: 16 });
    y += 48;
    boardList(ctx, W, { ...model, boards: b ? [{ ...b, division: null }] : [] }, L, y, footerY - 40, { rows: desc.to - desc.from + 1, from: desc.from, highlightWinner: desc.from === 1 });
  } else if (desc.type === 'stats' && model.stats) {
    text(ctx, String(L.statsTitle).toUpperCase(), PAD, y, { size: 24, weight: 800, color: GOLD_L });
    y += 48;
    const s = model.stats;
    const tiles = [[L.players, s.players, { small: `${L.finished}: ${s.finished}` }]];
    s.rounds.forEach(r => tiles.push([`${L.lowRound} · R${r.round}`, `${r.low[0].gross} (${scoreText(r.low[0].toPar)})`, { gold: true, small: r.low.length > 2 ? `${r.low.length} ${L.players} ${L.tied}` : r.low.map(x => x.name).join(' · ') }]));
    s.rounds.forEach(r => tiles.push([`${L.fieldAvg} · R${r.round}`, r.avg.toFixed(1), { small: `${r.count} ${L.rounds}` }]));
    if (s.hasPars) tiles.push(['Eagle · Birdie', `${s.eagles} · ${s.birdies}`, { gold: true }]);
    const cols = 2;
    const gap = 16;
    const tw = (W - PAD * 2 - gap) / cols;
    tiles.slice(0, 8).forEach(([cap, v, opt], i) => statTile(ctx, PAD + (i % cols) * (tw + gap), y + Math.floor(i / cols) * (140 + gap), tw, 140, cap, v, opt));
  } else if (desc.type === 'session') {
    const s = model.sessions.find(x => x.id === desc.id);
    if (s) {
      const label = [s.day !== null ? `${L.day} ${s.day}` : '', s.format].filter(Boolean).join(' — ') || L.matches;
      text(ctx, label.toUpperCase(), PAD, y, { size: 24, weight: 800, color: GOLD_L, max: W - PAD * 2 - 220 });
      text(ctx, `${pointsText(s.totals.a)} – ${pointsText(s.totals.b)}`, W - PAD, y - 6, { size: 36, weight: 800, align: 'right', color: GOLD_L });
      y += 56;
      s.matches.forEach((m, j) => {
        if (y + 96 > footerY - 40) return;
        if (j % 2 === 0) { ctx.fillStyle = cream(0.05); rrect(ctx, PAD - 12, y, W - PAD * 2 + 24, 88, 10); ctx.fill(); }
        text(ctx, m.a.join(' / '), PAD + 4, y + 12, { size: 26, weight: m.winner === 'a' ? 800 : 600, color: m.winner === 'a' ? GOLD_L : CREAM, max: (W - PAD * 2) / 2 - 90 });
        text(ctx, m.b.join(' / '), W - PAD - 4, y + 12, { size: 26, weight: m.winner === 'b' ? 800 : 600, align: 'right', color: m.winner === 'b' ? GOLD_L : CREAM, max: (W - PAD * 2) / 2 - 90 });
        text(ctx, m.result || (m.state === 'UPCOMING' ? '–' : ''), W / 2, y + 44, { size: 28, weight: 800, align: 'center', color: cream(0.9) });
        y += 96;
      });
    }
  } else if (desc.type === 'standings') {
    standingsRows(ctx, W, model.standings.slice(desc.from - 1, desc.to), L, y, footerY - 40);
  } else if (desc.type === 'sponsors') {
    text(ctx, String(L.sponsors).toUpperCase(), PAD, y, { size: 24, weight: 800, color: GOLD_L });
    y += 56;
    const list = A.sponsors.filter(s => s.img || s.name);
    const cols = 2;
    const gap = 20;
    const w = (W - PAD * 2 - gap) / cols;
    list.slice(0, 12).forEach((s, i) => {
      const x = PAD + (i % cols) * (w + gap);
      const yy = y + Math.floor(i / cols) * (150 + gap);
      ctx.fillStyle = '#fff';
      rrect(ctx, x, yy, w, 150, 16);
      ctx.fill();
      if (s.img) drawContain(ctx, s.img, x + 24, yy + 20, w - 48, 110);
      else text(ctx, s.name, x + w / 2, yy + 58, { size: 30, weight: 800, align: 'center', color: NAVY, max: w - 40 });
    });
  }
  text(ctx, `${index + 1} / ${count}`, W - PAD, footerY + 60, { size: 22, weight: 700, align: 'right', color: cream(0.5) });
  rule(ctx, footerY - 26, W);
  footer(ctx, A, W, footerY, { url: o.url, scan: L.scan, hashtag: o.hashtag });
}

// ---- API ----

function finish(canvas) {
  return new Promise(resolve => canvas.toBlob(blob => resolve({
    blob, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height
  }), 'image/png'));
}

const defaults = (labels) => ({
  division: () => '', badge: (k) => k, beat: (n) => `${n}%`, players: '', tied: '', strokes: '', points: '', thru: '',
  pos: '', total: '', field: '', beatShort: '', team: '', byHole: '', bestRound: '', liveBoard: '', matches: '', day: '',
  statsTitle: '', lowRound: '', fieldAvg: '', finished: '', rounds: '', sponsors: '', scan: '', results: '', after: '',
  champion: '', leading: '', winner: '', ...labels
});

/**
 * One card. `kind`: feed | story | og take the results model as `data`;
 * personal | personalStory take a player share model. `opts`: { url,
 * subtitle, labels, background: 'cover'|'navy', cover, hideStrokes, hashtag,
 * sponsors: [{name, logo}], avatar, teamLogos: {a, b}, clubLogo, site }.
 */
export async function buildShareImage(kind, tn, data, opts = {}) {
  const [W, H] = SIZES[kind] || SIZES.feed;
  const o = { site: 'ubgolf.club', background: 'navy', ...opts };
  const L = defaults(o.labels);
  await loadFonts();
  const A = await loadAssets(tn, o);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (kind === 'story') drawStory(ctx, W, H, tn, data, A, L, o);
  else if (kind === 'og') drawOg(ctx, W, H, tn, data, A, L, o);
  else if (kind === 'personal' || kind === 'personalStory') drawPersonal(ctx, W, H, tn, data, A, L, o, kind === 'personalStory');
  else drawFeed(ctx, W, H, tn, data, A, L, o);
  return finish(canvas);
}

/** Every page of a carousel, from `pages` (see carouselPlan). */
export async function buildCarousel(tn, model, pages, opts = {}) {
  const [W, H] = SIZES.feed;
  const o = { site: 'ubgolf.club', background: 'navy', ...opts };
  const L = defaults(o.labels);
  await loadFonts();
  const A = await loadAssets(tn, o);
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    drawCarouselPage(canvas.getContext('2d'), W, H, pages[i], tn, model, A, L, o, i, pages.length);
    out.push(await finish(canvas));
  }
  return out;
}

// Kept for the results page's first version; the feed card is the poster.
export const buildResultsImage = (tn, model, opts) => buildShareImage('feed', tn, model, opts);
