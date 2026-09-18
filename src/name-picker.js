// src/name-picker.js
// The type-to-search dropdown the admin editors share — a text input with a
// scrollable list of hits under it: the flight editor's player finder, the
// roster editor's member picker (stroke play, the M Cup, the wizard) and the
// M Cup's match player and scorer pickers. One wiring for all of them,
// because a finger does not work a list the way a mouse does:
//
// - a touch-scroll begins with pointerdown on whatever row is under the
//   finger, so a row that picks on pointerdown picks the wrong person the
//   moment the list is scrolled — a row is picked on click, a completed
//   tap, which a scroll never produces;
// - the keyboard going away blurs the input, and that must not take the
//   list with it while the finger is on it — blur closes the list only when
//   the list was not touched a moment ago; a tap outside closes it, as do a
//   pick and Escape;
// - a drag inside the list is the list's own scroll, not the page's
//   pull-to-refresh, so its touchstart stops at the list.
//
//   wireNamePicker({ input, list, itemSelector, fill, pick, reset })
//     input        the text field
//     list         the dropdown element, absolutely positioned under it
//     itemSelector how a pickable row is found in the filled list
//     fill()       write the hits for input.value into list.innerHTML
//     pick(item)   the row was chosen (the caller repaints as it likes)
//     reset()      optional: put the input back when the list closes
//
// Returns close().

// A blur that lands this soon after a touch on the list is the keyboard
// going away under a finger that is still on the list — not a dismissal.
export const TOUCH_GRACE_MS = 600;
const BLUR_DELAY_MS = 150;

export function wireNamePicker({ input, list, itemSelector, fill, pick, reset }) {
  if (!input || !list) return () => {};
  let touched = 0;

  const close = () => {
    if (list.hidden) return;
    list.hidden = true;
    reset?.();
  };
  const open = () => {
    fill();
    list.hidden = false;
    list.querySelectorAll(itemSelector).forEach(item => {
      item.onclick = (e) => { e.preventDefault(); pick(item); };
    });
  };

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  input.addEventListener('blur', () => setTimeout(() => {
    // A pick repaints the editor and this input goes with it.
    if (!document.body.contains(input)) return;
    if (Date.now() - touched < TOUCH_GRACE_MS) return;
    close();
  }, BLUR_DELAY_MS));

  list.addEventListener('pointerdown', () => { touched = Date.now(); });
  list.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });

  // A tap anywhere else closes the list. The editor repaints often and the
  // input goes with it; the listener notices and lets itself go.
  const outside = (e) => {
    if (!document.body.contains(input)) {
      document.removeEventListener('pointerdown', outside, true);
      return;
    }
    if (list.hidden) return;
    if (input.contains(e.target) || list.contains(e.target)) return;
    close();
  };
  document.addEventListener('pointerdown', outside, true);

  return close;
}
