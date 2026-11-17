'use strict';

// Classroom convenience guard only. Web pages cannot disable browser developer
// tools or provide a security boundary against a user who controls the browser.
// Keep this independent of game controls and do not interfere with editable
// fields, ordinary typing, movement, abilities, or accessibility shortcuts.
(function installDevtoolsShortcutGuard() {
  const developerToolKeys = new Set(['i', 'j', 'c', 'k', 'e']);
  const macDeveloperToolKeys = new Set(['i', 'j', 'c']);

  window.addEventListener('keydown', event => {
    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '').toLowerCase();
    const f12 = key === 'f12' || code === 'f12';
    const windowsDevtools = event.ctrlKey && event.shiftKey && developerToolKeys.has(key);
    const macDevtools = event.metaKey && event.altKey && macDeveloperToolKeys.has(key);
    const viewSource = (event.ctrlKey || event.metaKey) && !event.shiftKey && key === 'u';

    if (!f12 && !windowsDevtools && !macDevtools && !viewSource) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
