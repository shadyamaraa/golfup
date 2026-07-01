// src/icons.js
// UB Golf — interface icon set (30 icons).
// Drop-in for the existing vanilla-JS app: every icon is an inline SVG STRING,
// so it works directly inside template literals + innerHTML, and inherits color
// from CSS via currentColor (so .bn-item.active { color: var(--gold) } just works).
//
// Two ways to use it:
//   1) In template strings:   `...${icon('alerts', { size: 18 })}...`
//   2) Declarative in markup:  <span class="bn-icon" data-icon="home"></span>
//      then call paintIcons() once after that markup is in the DOM.

export const ICON_PATHS = {
  'home': '<path d="M3.6 11.6 12 4.3l8.4 7.3"/><path d="M5.7 10v9.6a.6.6 0 0 0 .6.6h3.6v-5.4h4.2v5.4h3.6a.6.6 0 0 0 .6-.6V10"/>',
  'play': '<path d="M6.6 20.8V3.4"/><path d="M6.6 4.3h10.8l-2.9 3.1 2.9 3.1H6.6"/>',
  'create': '<path d="M12 5.4v13.2M5.4 12h13.2"/>',
  'services': '<path d="M3.4 18.8h17.2"/><path d="M5.2 18.4a6.8 6.8 0 0 1 13.6 0"/><path d="M12 8V6.3"/><circle cx="12" cy="5.3" r="1"/>',
  'bookings': '<rect x="4.2" y="5.3" width="15.6" height="15" rx="2.4"/><path d="M4.2 9.6h15.6M8.6 3.4v3.8M15.4 3.4v3.8"/>',
  'leaderboard': '<path d="M7.6 4.6h8.8v3.6a4.4 4.4 0 0 1-8.8 0z"/><path d="M7.6 5.7H5v.8a3 3 0 0 0 3 3M16.4 5.7H19v.8a3 3 0 0 1-3 3"/><path d="M12 12.6v3.4M9.2 20.1l.7-3.9h4.2l.7 3.9z"/>',
  'members': '<circle cx="9.2" cy="8.3" r="3.2"/><path d="M3.7 19a5.5 5.5 0 0 1 11 0"/><path d="M15.8 5.6a3.2 3.2 0 0 1 0 6.1M19 19a5.5 5.5 0 0 0-2.9-4.8"/>',
  'profile': '<circle cx="12" cy="8.1" r="3.6"/><path d="M5.5 19.8a6.5 6.5 0 0 1 13 0"/>',
  'hole': '<path d="M11 18.5V4.6"/><path d="M11 5.4h6.6l-2.1 2.3 2.1 2.3H11"/><path d="M5 18.8c2.1-1.3 11.9-1.3 14 0"/>',
  'ball-tee': '<circle cx="12" cy="8.7" r="5.1"/><circle cx="10.5" cy="7.8" r=".55" fill="currentColor" stroke="none"/><circle cx="12.6" cy="7.1" r=".55" fill="currentColor" stroke="none"/><circle cx="11.8" cy="9.6" r=".55" fill="currentColor" stroke="none"/><path d="M10.2 13.9h3.6M12 14v6M9.8 20.2h4.4"/>',
  'driver': '<path d="M15.5 5 9 14.5"/><path d="M9 14.5c-1.7.8-3 2-3 3.2 0 .9.8 1.4 1.8 1.3 1.5-.1 2.8-1.5 3.5-3.1z"/>',
  'scorecard': '<rect x="5.3" y="3.7" width="13.4" height="16.6" rx="2.2"/><path d="M8.5 8.2h7M8.5 11.6h7M8.5 15h4"/><path d="M14.6 15.8l1.2 1.2 2.3-2.4"/>',
  'handicap': '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r=".5" fill="currentColor" stroke="none"/>',
  'course': '<path d="M9 4.3 4.2 6.2v13.5l4.8-1.9 6 1.9 4.8-1.9V4l-4.8 1.9-6-1.6z"/><path d="M9 4.3v13.4M15 6.2v13.5"/>',
  'search': '<circle cx="11" cy="11" r="6.3"/><path d="m15.7 15.7 4.1 4.1"/>',
  'alerts': '<path d="M6.1 9.6a5.9 5.9 0 0 1 11.8 0c0 4.4 1.8 5.5 2.1 5.9H4c.3-.4 2.1-1.5 2.1-5.9z"/><path d="M9.9 19.4a2.2 2.2 0 0 0 4.2 0"/>',
  'filter': '<path d="M4.6 5.6h14.8l-5.7 6.8v5.2l-3.4 1.7v-6.9z"/>',
  'settings': '<path d="M4.8 8h7.2M16 8h3.2M4.8 16h3.2M11.2 16h8"/><circle cx="14" cy="8" r="1.9"/><circle cx="9.2" cy="16" r="1.9"/>',
  'confirm': '<path d="m5.2 12.6 4.3 4.3 9.3-9.5"/>',
  'next': '<path d="m9.6 6 6 6-6 6"/>',
  'back': '<path d="M19.4 12H4.6M10.6 6 4.6 12l6 6"/>',
  'edit': '<path d="m14.4 5.6 4 4M4.6 19.4l1-3.9 9.3-9.4 2.9 2.9-9.4 9.4z"/>',
  'share': '<circle cx="6.2" cy="12" r="2.4"/><circle cx="17" cy="6.1" r="2.4"/><circle cx="17" cy="17.9" r="2.4"/><path d="m8.3 10.9 6.6-3.7M8.3 13.1l6.6 3.7"/>',
  'location': '<path d="M12 20.6c4.3-4 6.7-7.3 6.7-10.4A6.7 6.7 0 0 0 5.3 10.2c0 3.1 2.4 6.4 6.7 10.4z"/><circle cx="12" cy="10.2" r="2.5"/>',
  'time': '<circle cx="12" cy="12" r="7.5"/><path d="M12 7.7V12l3 1.9"/>',
  'lock': '<rect x="5" y="10.7" width="14" height="9.4" rx="2.3"/><path d="M8.1 10.7V8.1a3.9 3.9 0 0 1 7.8 0v2.6"/>',
  'dining': '<path d="M5.2 3.6v3.8a1.9 1.9 0 0 0 3.8 0V3.6M7.1 9.3v11.1"/><path d="M16.6 3.6c-1.5.5-2.4 2.3-2.4 4.4 0 1.9 1 3.2 2.4 3.5m0-7.9v16.8"/>',
  'coffee': '<path d="M5.5 8.8h11v4.4a5.5 5.5 0 0 1-11 0z"/><path d="M16.5 9.9h1.8a1.9 1.9 0 0 1 0 3.8h-1.8"/><path d="M8.2 3.6c-.6.7-.6 1.3 0 2M11.4 3.6c-.6.7-.6 1.3 0 2"/><path d="M5 20.4h12"/>',
  'pro-shop': '<rect x="7.6" y="6.6" width="6.8" height="13.4" rx="3.2"/><path d="M9.5 6.6 9.1 4.3M11.2 6.6 11 3.7M12.9 6.6l.3-2.2"/><path d="M14.4 9.6h2.1a1.4 1.4 0 0 1 1.4 1.4v3"/>',
  'order': '<path d="M6.6 8.6h10.8l-.9 11.4H7.5z"/><path d="M9.6 8.6V6.5a2.4 2.4 0 0 1 4.8 0v2.1"/>',
  'star': '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
  'card': '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="M3 9.6h18"/><path d="M6.5 14.4h4"/>',
  'phone': '<rect x="6.5" y="2.6" width="11" height="18.8" rx="2.6"/><path d="M10.3 18.6h3.4"/>',
  'table': '<path d="M3 8.6h18"/><path d="M5.4 8.6 4.4 20"/><path d="M18.6 8.6 19.6 20"/><path d="M6.4 8.6V5.6h11.2v3"/>',
  'trash': '<path d="M4.5 6.5h15"/><path d="M9 6.5V4.8h6v1.7"/><path d="M6.5 6.5 7.3 20a.6.6 0 0 0 .6.6h8.2a.6.6 0 0 0 .6-.6l.8-13.5"/><path d="M10 10v7M14 10v7"/>',
  'close': '<path d="M6 6l12 12M18 6 6 18"/>',
};

/**
 * Return an inline <svg> string for the named icon.
 * @param {string} name   key from ICON_PATHS (e.g. 'home', 'alerts')
 * @param {object} [opts]
 * @param {number} [opts.size=24]    px width/height
 * @param {number} [opts.stroke=1.8] stroke width
 * @param {string} [opts.cls='']     class added to the <svg>
 * @param {string} [opts.color]      force a color (default: inherits currentColor)
 */
export function icon(name, { size = 24, stroke = 1.8, cls = '', color } = {}) {
  const body = ICON_PATHS[name];
  if (!body) { console.warn('[icon] unknown name:', name); return ''; }
  const clsAttr = cls ? ` class="${cls}"` : '';
  const colorAttr = color ? ` style="color:${color}"` : '';
  return `<svg${clsAttr} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" `
    + `stroke-linejoin="round" aria-hidden="true"${colorAttr}>${body}</svg>`;
}

/**
 * Hydrate every [data-icon] element under root with its SVG.
 * Reads optional data-size / data-stroke. Safe to call repeatedly.
 */
export function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    if (!ICON_PATHS[name]) return;
    const size = +(el.getAttribute('data-size') || 24);
    const stroke = +(el.getAttribute('data-stroke') || 1.8);
    el.innerHTML = icon(name, { size, stroke });
  });
}
