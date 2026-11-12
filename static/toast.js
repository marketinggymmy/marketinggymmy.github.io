/* Toast unten mittig, mobil über der Tab-Leiste: ein Satz plus höchstens eine Aktion, immer nur einer gleichzeitig.
   Zwei Live-Regionen stehen ab dem Laden fest im DOM, denn Screenreader sagen nur an, was in eine schon vorhandene Region kommt; Fehler gehen in role=alert. */
(() => {
  'use strict';
  const regions = {};
  for (const role of ['status', 'alert']) {
    const region = regions[role] = document.createElement('div');
    region.setAttribute('role', role); region.setAttribute('aria-live', role === 'alert' ? 'assertive' : 'polite'); region.dataset.toastRegion = role;
    document.body.append(region);
  }
  let current = null;

  function show(message, {action, ms = 6000, tone} = {}) {
    current?.close();
    const node = document.createElement('div'), text = document.createElement('span');
    node.className = 'toast';
    if (tone === 'error') node.dataset.tone = 'error';
    text.textContent = message; node.append(text);
    let timer = null;
    const handle = {close() {
      clearTimeout(timer); node.remove();
      if (current === handle) current = null;
    }};
    if (action) {
      const run = document.createElement('button');
      run.type = 'button'; run.className = 'btn isQuiet'; run.dataset.toastAction = ''; run.textContent = action.label;
      run.addEventListener('click', () => { handle.close(); action.run(); });
      node.append(run);
    }
    regions[tone === 'error' ? 'alert' : 'status'].append(node);
    timer = setTimeout(handle.close, ms);
    current = handle;
    return handle;
  }

  window.KlartextToast = Object.freeze({show});
})();
