/* Rückfrage im Klartext-Dialog statt window.confirm: der Titel nennt das Objekt, die Knöpfe sagen, was passiert. */
(() => {
  'use strict';
  let count = 0;

  // Resolves 'confirm', 'alt' or null (Abbrechen, Esc); focus then returns to whatever had it before.
  function ask({title, text = '', confirm, danger = true, alt} = {}) {
    const trigger = document.activeElement, id = `klartextConfirm${++count}`;
    const dialog = document.createElement('dialog'), heading = document.createElement('h2'), body = document.createElement('p'), actions = document.createElement('div');
    dialog.className = 'dlg'; dialog.tabIndex = -1; dialog.dataset.confirm = '';
    dialog.setAttribute('role', 'alertdialog'); dialog.setAttribute('aria-labelledby', `${id}Title`);
    heading.id = `${id}Title`; heading.textContent = title;
    actions.className = 'dlgActions';
    dialog.append(heading);
    if (text) { body.id = `${id}Text`; body.textContent = text; dialog.setAttribute('aria-describedby', body.id); dialog.append(body); }
    dialog.append(actions);
    return new Promise(resolve => {
      let answer = null;
      const add = (label, value, className) => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = className; button.textContent = label;
        button.addEventListener('click', () => { answer = value; dialog.close(); });
        actions.append(button);
      };
      add('Abbrechen', null, 'btn');
      if (alt) add(alt, 'alt', 'btn');
      add(confirm, 'confirm', danger ? 'btn isDanger' : 'btn isPrimary');
      // Esc closes the native modal dialog without an answer.
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (trigger?.isConnected) trigger.focus();
        resolve(answer);
      });
      document.body.append(dialog);
      dialog.showModal(); dialog.focus();
    });
  }

  window.KlartextConfirm = Object.freeze({ask});
})();
