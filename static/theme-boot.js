/* Darstellung (Block N, Spec 4.5): setzt den gespeicherten Hintergrund vor dem ersten Malen. Läuft blockierend im head, fasst deshalb nur <html> und die theme-color an.
   Die Grundfarben stehen hier nur für die theme-color, weil tokens.css noch nicht geladen ist; Verläufe und alles andere liefert tokens.css. */
(() => {
  'use strict';
  const KEY = 'klartext.theme';
  const BACKGROUNDS = Object.freeze([
    ['kaffee', 'Kaffee', '#140d09'], ['nacht', 'Nacht', '#070b16'], ['wald', 'Wald', '#07110b'], ['beere', 'Beere', '#120814'], ['meer', 'Meer', '#051214'],
    ['stein', 'Stein', '#0e0f10'], ['schwarz', 'Schwarz', '#000000'], ['dunkel', 'Dark', '#1c1c1e'], ['hell', 'Light', '#f2f2f7'],
  ].map(([id, name, color]) => Object.freeze({id, name, color, light: id === 'hell'})));
  // Anything unknown (old values, empty, a blocked store) counts as Kaffee.
  const find = id => BACKGROUNDS.find(bg => bg.id === id) || BACKGROUNDS[0];
  let active;
  function apply(bg) {
    active = bg;
    const html = document.documentElement;
    html.dataset.bg = bg.id;
    html.classList.toggle('light', bg.light);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg.color);
  }
  function set(id) {
    apply(find(id));
    try { localStorage.setItem(KEY, active.id); } catch {}
    window.dispatchEvent(new CustomEvent('klartext:theme-changed', {detail: {id: active.id}}));
  }
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch {}
  apply(find(stored));
  window.KlartextTheme = Object.freeze({BACKGROUNDS, current: () => active.id, set});
})();
