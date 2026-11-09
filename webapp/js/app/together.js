// "Do something together" (her window's sidebar, next to Achievements). It used to be Settings > Dates.
// The rows live in index.html (#togetherRows, each with data-group: out / play / in) and their buttons
// are wired by main.js wireDatesPanel as always; this only opens, filters and closes the panel.
// A new activity = one more row with its group; a new group = one more nav button.

let opener = null;
const drawer = () => document.getElementById('togetherDrawer');
const backdrop = () => document.getElementById('togetherBackdrop');

export function isOpen() { return !!drawer()?.classList.contains('open'); }

export function open(group) {
  const d = drawer();
  if (!d || isOpen()) return;
  opener = document.activeElement;
  show(group || 'all');
  backdrop()?.classList.add('open');
  d.classList.add('open');
  document.body.classList.add('drawer-open');
  document.addEventListener('keydown', onKey);
  document.getElementById('togetherClose')?.focus();
}

export function close() {
  const d = drawer();
  if (!d || !isOpen()) return;
  d.classList.remove('open');
  backdrop()?.classList.remove('open');
  if (!document.getElementById('settingsDrawer')?.classList.contains('open')) document.body.classList.remove('drawer-open');
  document.removeEventListener('keydown', onKey);
  if (opener?.focus && document.contains(opener)) opener.focus();
  opener = null;
}

function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

function show(group) {
  const d = drawer();
  for (const b of d.querySelectorAll('.settings-navitem')) {
    const on = b.dataset.group === group;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  // filter with a class, so rows main.js hides (no watch page on the phone) stay hidden
  for (const r of d.querySelectorAll('#togetherRows .set-row')) r.classList.toggle('tg-out', group !== 'all' && r.dataset.group !== group);
}

export function wire(button) {
  const d = drawer();
  if (!d) return;
  button?.addEventListener('click', () => open());
  document.getElementById('togetherClose')?.addEventListener('click', close);
  backdrop()?.addEventListener('click', close);
  d.querySelector('.settings-navlist')?.addEventListener('click', (e) => {
    const b = e.target.closest('.settings-navitem');
    if (b) show(b.dataset.group);
  });
  // picking something closes the panel (after the button's own handler has run)
  document.getElementById('togetherRows')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) setTimeout(close, 0);
  });
}
