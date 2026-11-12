/* Stufenchip, Prüfstatus-Chip, Fristanzeige und Initiale: ein Helfer für Aufgaben, Heute und Freigaben, Farben kommen aus tokens.css. */
(() => {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';
  const SOON_MS = 48 * 60 * 60 * 1000;
  const pad = n => String(n).padStart(2, '0');
  const STATUS = {open: 'Offen', in_review: 'In Prüfung', changes: 'Änderungen', approved: 'Freigegeben'};

  function chip(stageId, label) {
    const node = document.createElement('span');
    node.className = 'chip'; node.dataset.stage = stageId; node.textContent = label;
    return node;
  }

  const statusLabel = status => STATUS[status] || status;

  function statusChip(status) {
    const node = document.createElement('span');
    node.className = 'chip'; node.dataset.status = status; node.textContent = statusLabel(status);
    return node;
  }

  function clockIcon() {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [name, value] of Object.entries({viewBox: '0 0 12 12', width: '12', height: '12', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true'})) svg.setAttribute(name, value);
    for (const [tag, attrs] of [['circle', {cx: 6, cy: 6, r: 5}], ['line', {x1: 6, y1: 3.5, x2: 6, y2: 6}], ['line', {x1: 6, y1: 6, x2: 8, y2: 7.5}]]) {
      const part = document.createElementNS(SVG, tag);
      for (const [name, value] of Object.entries(attrs)) part.setAttribute(name, String(value));
      svg.append(part);
    }
    return svg;
  }

  // aria-label on a plain span is not read out: the visible text hides from screen readers, a hidden text says it in full.
  function spoken(node, label) {
    const shown = document.createElement('span'), said = document.createElement('span');
    shown.setAttribute('aria-hidden', 'true'); shown.append(...node.childNodes);
    said.className = 'srOnly'; said.textContent = label;
    node.append(shown, said);
    return node;
  }

  // deadline ist ein Tag 'JJJJ-MM-TT' (vom Server geprüft); er gilt bis 23:59 lokal.
  function due(deadline, stageId, now = new Date()) {
    if (!deadline) return null;
    const [year, month, day] = deadline.split('-').map(Number);
    const short = `${pad(day)}.${pad(month)}.`, full = `${short}${year}`;
    const node = document.createElement('span');
    node.className = 'due';
    node.textContent = year === now.getFullYear() ? short : full;
    if (stageId === 'published') return node;
    if (new Date(year, month - 1, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      node.dataset.due = 'overdue';
      node.textContent = `! ${node.textContent}`;
      spoken(node, `Überfällig seit ${full}`);
    } else if (new Date(year, month - 1, day, 23, 59) - now <= SOON_MS) {
      node.dataset.due = 'soon';
      spoken(node, `Fällig am ${full}`).prepend(clockIcon());
    }
    return node;
  }

  function initial(name) {
    const letter = [...(name || '').trim()][0];
    if (!letter) return null;
    const node = document.createElement('span');
    node.className = 'initial'; node.textContent = letter.toUpperCase();
    node.title = name;
    return spoken(node, name);
  }

  // Heute and the Frist filter of Aufgaben count the same tasks. Only stages before Veröffentlicht have a deadline that matters.
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const open = task => Boolean(task.deadline) && task.stage !== 'published';
  const overdue = (task, now = new Date()) => open(task) && task.deadline < dayKey(now);
  // Fällig diese Woche: deadline up to Sunday of the running week; overdue tasks count too (spec 4.6, red tile).
  function dueThisWeek(task, now = new Date()) {
    const sunday = new Date(now); sunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    return open(task) && task.deadline <= dayKey(sunday);
  }

  // Beitragszustände (spec 4.5), one table for calendar entries, the composer head and the task panel.
  // While Instagram has the post, its state stands in for the post status.
  const POST = {draft: 'Entwurf', planned: 'Geplant', posted: 'Veröffentlicht'};
  const INSTAGRAM = {queued: 'Wartet', publishing: 'Wird gepostet', held: 'Zurückgehalten', missed: 'Verpasst', failed: 'Fehlgeschlagen', published: 'Veröffentlicht'};
  // shortcut: the scheduler keeps a missed post as held and says so only in the reason; upgrade once instagram_state stores its own field.
  const missed = ig => ig?.status === 'held' && /^Verpasst/.test(ig.reason || '');
  function postLabel(post, ig) {
    if (!ig) return POST[post?.status] || post?.status || '';
    return INSTAGRAM[missed(ig) ? 'missed' : ig.status] || ig.status;
  }
  // The label already says Verpasst, so the reason shown next to it drops its own „Verpasst: “.
  const postReason = ig => missed(ig) ? ig.reason.replace(/^Verpasst:\s*/, '') : ig?.reason || '';

  // Leerzustand einer Seite (spec 4.7): Icon im 40-px-Kreis, Titel, ein Satz mit dem nächsten Schritt, höchstens ein Knopf.
  // The icons are fixed markup from this file; title, text and label go in as text.
  const ICONS = {
    tasks: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M3 9h5M12 9h5M12 13h5"/>',
    inbox: '<path d="M4 5h16v11H8l-4 4z"/>',
    check: '<path d="M9 4H5v17h14V4h-4"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 13 3 3 5-6"/>',
    flow: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
    folder: '<path d="M3 6h6l2 3h10v11H3Z"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/>',
    money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  };
  function emptyState({icon = 'inbox', title, text, action} = {}) {
    const box = document.createElement('div'), circle = document.createElement('span'), heading = document.createElement('h3'), line = document.createElement('p');
    box.className = 'emptyState'; circle.className = 'emptyStateIcon'; circle.setAttribute('aria-hidden', 'true');
    circle.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[icon] || ICONS.inbox}</svg>`;
    heading.textContent = title; line.textContent = text;
    box.append(circle, heading, line);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.textContent = action.label;
      button.addEventListener('click', action.run); box.append(button);
    }
    return box;
  }

  window.KlartextStage = Object.freeze({chip, statusLabel, statusChip, due, initial, dueThisWeek, overdue, postLabel, postReason, emptyState});
})();
