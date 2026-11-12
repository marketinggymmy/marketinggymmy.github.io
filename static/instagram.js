/* Instagram details inside the calendar's post editor. Posting itself happens on the server. */
(() => {
  'use strict';
  const TYPES = [['reel', 'Reel'], ['photo', 'Foto'], ['carousel', 'Karussell'], ['story', 'Story']];
  const GROUPS = [['versions', 'Freigaben'], ['material', 'Material'], ['exports', 'Exporte']];
  const APPROVAL = /freigegeben|Freigabe|Aufgabe mit freigegebener/;
  function node(tag, className = '', text = '') { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; }
  function button(text, attrs = {}) { const el = node('button', 'btn', text); el.type = 'button'; for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); return el; }
  function field(label, control) { const wrap = node('label', 'field'); wrap.append(node('span', '', label), control); return wrap; }
  async function request(url, method = 'GET', body) {
    const response = await KlartextRequest.send(url, {method, headers: {'Accept': 'application/json', ...(method !== 'GET' ? {'X-Klartext': '1'} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {})}, ...(body ? {body: JSON.stringify(body)} : {})}, 'Instagram');
    let data; try { data = await response.json(); } catch { throw new Error(KlartextRequest.failed(method, 'Instagram', response.status)); }
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : KlartextRequest.failed(method, 'Instagram', response.status));
    return data;
  }
  const names = text => text.split(/[\s,]+/).map(name => name.replace(/^@/, '')).filter(Boolean);
  const count = (text, pattern) => (text.match(pattern) || []).length;

  // head: where the composer shows the Instagram state; catalog: the composer's file catalog; file: the composer's one file.
  function editor(fieldset, post, snapshot, {head = null, catalog: files = null, file = () => null} = {}) {
    const ig = {type: 'reel', items: post.media_id ? [post.media_id] : [], cover: null, thumb_offset_ms: null, first_comment: '',
      user_tags: [], collaborators: [], share_to_feed: true, location: null, ...(post.instagram || {})};
    const form = fieldset.closest('form'), editable = snapshot.can_edit !== false;
    const state = post.id ? snapshot.instagram_states?.[post.id] : null;
    const problems = post.id ? snapshot.problems?.[post.id] || [] : [];
    // chosen: the composer file the items follow; picked: the user chose the kind, so the file no longer sets it.
    let items = [...ig.items], catalog = null, chosen = file(), drawn = '', picked = false;
    // A fresh box per opened post, so listeners of a previous post never fire again.
    const box = node('div', 'igBox');
    fieldset.replaceChildren(node('legend', 'srOnly', 'Instagram'), box);

    const status = node('div', 'igState'), detail = node('p', 'igStateDetail'), publishNow = button('Jetzt posten', {'data-ig-publish-now': ''});
    const publishError = node('p', 'igError'); publishError.setAttribute('role', 'alert'); detail.dataset.igStateDetail = '';
    status.append(detail, publishNow, publishError);
    function showState(entry) {
      status.hidden = !entry; publishNow.hidden = !entry || !editable || !['held', 'failed'].includes(entry.status);
      detail.replaceChildren();
      if (!entry) return;
      const chip = node('span', 'chip', window.KlartextStage.postLabel(post, entry)); chip.dataset.igState = entry.status; detail.append(chip);
      const reason = window.KlartextStage.postReason(entry);
      if (reason) detail.append(document.createTextNode(` · ${reason}`));
      if (entry.permalink) {
        const link = node('a', 'igPermalink', 'Auf Instagram ansehen'); link.href = entry.permalink; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.dataset.igPermalink = ''; detail.append(document.createTextNode(' · '), link);
      }
    }
    showState(state);
    publishNow.addEventListener('click', async () => {
      if (!editable || !post.id) return;
      publishNow.disabled = true; publishError.textContent = '';
      try { showState(await request(`/api/instagram/posts/${encodeURIComponent(post.id)}/publish-now`, 'POST')); }
      catch (error) { publishError.textContent = error.message; }
      finally { publishNow.disabled = false; }
    });

    const type = node('select'); type.id = 'igType';
    for (const [value, label] of TYPES) type.add(new Option(label, value));
    type.value = ig.type;

    const list = node('ul', 'igItems'); list.dataset.igItems = '';
    const add = button('Datei hinzufügen', {'data-ig-add': ''}), picker = node('div', 'igPicker'); picker.hidden = true; picker.dataset.igPicker = '';
    const lookup = ref => GROUPS.flatMap(([key]) => catalog?.[key] || []).find(entry => entry.ref === ref);
    const mismatch = node('p', 'status', 'Instagram nutzt eine andere Datei als der Kalender.'); mismatch.dataset.igMismatch = '';
    // The composer's file is the Instagram file; only a carousel adds more, with the composer file first.
    // A saved post keeps its Instagram files until the composer's file changes (older posts kept them apart).
    function sync() {
      const now = file(), entry = lookup(now);
      if (!post.id && !picked && entry) type.value = entry.kind === 'image' ? 'photo' : 'reel';
      if (now === chosen && items.length) { if (type.value !== 'carousel') items = items.slice(0, 1); return; }
      if (type.value !== 'carousel') items = now ? [now] : items.slice(0, 1);
      else if (now !== chosen) items = [now, ...items.filter(ref => ref !== chosen && ref !== now)].filter(Boolean);
      chosen = now;
    }
    function renderItems() {
      const carousel = type.value === 'carousel'; drawn = `${type.value}|${items.join()}`;
      list.replaceChildren(...items.map((ref, index) => {
        const entry = lookup(ref), row = node('li', 'igItem'); row.dataset.igItem = ref;
        row.append(node('span', 'igItemName', entry?.name || 'Datei'), node('span', 'igItemKind', entry ? (entry.kind === 'video' ? 'Video' : 'Bild') : ''));
        if (!carousel) return row;
        const up = button('↑', {'data-ig-item-up': '', 'aria-label': 'Nach vorn'}); up.disabled = index === 0 || !editable;
        const down = button('↓', {'data-ig-item-down': '', 'aria-label': 'Nach hinten'}); down.disabled = index === items.length - 1 || !editable;
        row.append(up, down, button('Entfernen', {'data-ig-item-remove': ''})); return row;
      }));
      if (!items.length) list.append(node('li', 'igEmpty', carousel ? 'Noch keine Datei gewählt.' : 'Die Datei wählst du oben im Feld Datei.'));
    }
    function renderPicker() {
      picker.replaceChildren();
      if (!catalog) { picker.append(node('p', 'igEmpty', 'Dateien werden geladen …')); return; }
      for (const [key, label] of GROUPS) {
        const entries = catalog[key] || []; if (!entries.length) continue;
        picker.append(node('h4', '', label));
        for (const entry of entries) {
          const option = button(entry.name, {'data-ig-option': entry.ref, class: 'btn isQuiet'});
          if (key === 'versions') option.append(node('span', 'igOptionNote', entry.status === 'approved' ? ' · freigegeben' : ' · Freigabe fehlt'));
          picker.append(option);
        }
      }
    }

    const reel = node('div', 'igReel'), cover = node('select'), offset = node('input'), feed = node('input');
    cover.id = 'igCover'; cover.add(new Option('Bild aus dem Video', ''));
    if (ig.cover) { cover.add(new Option('Gewähltes Bild', ig.cover)); cover.value = ig.cover; }
    offset.id = 'igThumbOffset'; offset.type = 'number'; offset.min = '0'; offset.step = '0.1'; offset.inputMode = 'decimal';
    offset.value = ig.thumb_offset_ms === null ? '' : String(ig.thumb_offset_ms / 1000);
    feed.id = 'igShareToFeed'; feed.type = 'checkbox'; feed.checked = ig.share_to_feed;
    const feedLabel = node('label', 'igCheck check'); feedLabel.append(feed, document.createTextNode('Reel auch im Raster zeigen'));
    reel.append(field('Thumbnail', cover), field('Bild aus Sekunde', offset), feedLabel);

    const comment = node('textarea'); comment.id = 'igFirstComment'; comment.rows = 2; comment.maxLength = 2200; comment.value = ig.first_comment;
    comment.placeholder = 'Zum Beispiel deine Hashtags';
    const collaborators = node('input'); collaborators.id = 'igCollaborators'; collaborators.value = ig.collaborators.join(', ');
    collaborators.placeholder = 'benutzername, zweiter.name';
    const tags = node('input'); tags.id = 'igTags'; tags.value = ig.user_tags.map(tag => tag.username).join(', '); tags.placeholder = 'benutzername';
    const location = node('select'); location.id = 'igLocation'; location.add(new Option('Kein Standort', ''));
    if (ig.location) { location.add(new Option('Gespeicherter Standort', ig.location)); location.value = ig.location; }

    const counters = node('p', 'igCounters'); counters.dataset.igCounters = '';
    const approval = node('p', 'igApproval'); approval.dataset.igApproval = '';
    const problemList = node('ul', 'igProblems'); problemList.dataset.igProblems = '';
    const hint = problems.find(problem => problem.level === 'hint' && APPROVAL.test(problem.text));
    approval.textContent = hint ? hint.text : ''; approval.hidden = !hint;
    problemList.replaceChildren(...problems.filter(problem => problem !== hint).map(problem => node('li', problem.level === 'error' ? 'igProblemError' : 'igProblemHint', problem.text)));

    if (head) head.replaceChildren(status);
    box.append(...(head ? [] : [status]), field('Art', type), node('h3', '', 'Dateien'), list, mismatch, add, picker, reel,
      field('Erster Kommentar', comment), field('Collab-Partner (bis 3, durch Komma getrennt)', collaborators),
      field('Markierte Personen (durch Komma getrennt)', tags), field('Standort', location), counters, approval, problemList);

    const caption = () => form?.querySelector('[data-planning-override="instagram"]')?.value || form?.querySelector('#planningCaption')?.value || '';
    function refresh() {
      sync();
      const text = caption(), parts = [['caption', `${text.length} / 2200 Zeichen`, text.length > 2200],
        ['hashtags', `${count(text, /#\w+/gu)} / 30 Hashtags`, count(text, /#\w+/gu) > 30],
        ['mentions', `${count(text, /@[\w.]+/gu)} / 20 Erwähnungen`, count(text, /@[\w.]+/gu) > 20]];
      counters.replaceChildren(...parts.map(([key, label, over]) => { const span = node('span', over ? 'isOver' : '', label); span.dataset.igCounter = key; return span; }));
      const carousel = type.value === 'carousel';
      reel.hidden = type.value !== 'reel'; add.hidden = !editable || !carousel;
      if (!carousel) picker.hidden = true;
      mismatch.hidden = !file() || !items.length || items[0] === file();
      if (drawn !== `${type.value}|${items.join()}`) renderItems();
    }
    refresh();

    box.addEventListener('click', event => {
      const target = event.target.closest('button'); if (!target || !editable) return;
      const row = target.closest('[data-ig-item]'), index = row ? items.indexOf(row.dataset.igItem) : -1;
      if (target.hasAttribute('data-ig-add')) { picker.hidden = !picker.hidden; renderPicker(); }
      else if (target.dataset.igOption) {
        const ref = target.dataset.igOption;
        items = type.value === 'carousel' ? (items.includes(ref) || items.length >= 20 ? items : [...items, ref]) : [ref];
        picker.hidden = true; renderItems();
      } else if (target.hasAttribute('data-ig-item-up') && index > 0) { [items[index - 1], items[index]] = [items[index], items[index - 1]]; renderItems(); }
      else if (target.hasAttribute('data-ig-item-down') && index < items.length - 1) { [items[index + 1], items[index]] = [items[index], items[index + 1]]; renderItems(); }
      else if (target.hasAttribute('data-ig-item-remove') && index >= 0) { items.splice(index, 1); renderItems(); }
      refresh();
    });
    // input comes before the form's own input listener refreshes, so a picked kind is never taken back.
    type.addEventListener('input', () => { picked = true; });
    type.addEventListener('change', refresh);

    (files || request(`/api/instagram/catalog${post.id ? `?post_id=${encodeURIComponent(post.id)}` : ''}`)).then(data => {
      catalog = data; drawn = ''; refresh(); if (!picker.hidden) renderPicker();
      for (const entry of GROUPS.flatMap(([key]) => data[key] || []).filter(entry => entry.kind === 'image')) cover.add(new Option(entry.name, entry.ref));
      cover.value = ig.cover || '';
      location.replaceChildren(new Option('Kein Standort', ''), ...(data.locations || []).map(entry => new Option(entry.name, entry.id)));
      location.value = ig.location || '';
    }).catch(() => { catalog = {}; renderPicker(); });

    return {
      value: () => (sync(), {type: type.value, items: [...items], cover: type.value === 'reel' ? cover.value || null : null,
        thumb_offset_ms: type.value === 'reel' && offset.value !== '' ? Math.round(Number(offset.value) * 1000) : null,
        first_comment: comment.value, user_tags: names(tags.value).map(username => ({username, item: 0, x: null, y: null})),
        collaborators: names(collaborators.value), share_to_feed: feed.checked, location: location.value || null}),
      refresh,
    };
  }
  // Grid preview: planned feed posts (newest first, like the profile) above the account's real latest posts.
  function grid(container, snapshot, hooks) {
    const editable = snapshot.can_edit !== false, brand = node('select'), board = node('div', 'igGrid'), status = node('p', 'igGridStatus');
    brand.id = 'igGridBrand';
    for (const entry of snapshot.brands) brand.add(new Option(entry.name, entry.id));
    status.dataset.igGridStatus = ''; status.setAttribute('role', 'status'); board.dataset.igGrid = '';
    const toolbar = node('div', 'igGridToolbar'); toolbar.append(field('Konto', brand), status);
    container.replaceChildren(toolbar, board);
    let dragged = null;
    const when = local => `${local.slice(8, 10)}.${local.slice(5, 7)}. ${local.slice(11, 16)}`;
    function picture(tile, url) {
      if (!url) return;
      const image = node('img'); image.src = url; image.alt = ''; image.loading = 'lazy'; image.addEventListener('error', () => image.remove());
      tile.append(image);
    }
    function render(data) {
      const tiles = data.planned.map(entry => {
        const tile = button('', {'data-ig-grid-planned': entry.post_id, 'aria-label': `${entry.title}, geplant ${when(entry.scheduled_local)}`});
        tile.className = 'igTile isPlanned'; tile.draggable = editable; tile.dataset.revision = String(entry.revision);
        picture(tile, entry.thumb);
        tile.append(node('span', 'igTileTitle', entry.title), node('span', 'igTileDate', when(entry.scheduled_local)));
        return tile;
      });
      for (const entry of data.recent) {
        const link = node('a', 'igTile'); link.href = entry.permalink || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.dataset.igGridRecent = entry.id; link.setAttribute('aria-label', 'Veröffentlichter Beitrag auf Instagram');
        picture(link, entry.thumb); tiles.push(link);
      }
      board.replaceChildren(...tiles);
      if (data.note || !tiles.length) board.append(node('p', 'igEmpty igGridNote', data.note || 'Noch keine Beiträge für dieses Konto.'));
    }
    async function load() {
      board.replaceChildren(node('p', 'igEmpty igGridNote', 'Raster wird geladen …'));
      try { render(await request(`/api/instagram/grid/${encodeURIComponent(brand.value)}`)); }
      catch (error) { board.replaceChildren(node('p', 'igEmpty igGridNote', error.message)); }
    }
    board.addEventListener('click', event => {
      const tile = event.target.closest('[data-ig-grid-planned]'); if (tile) hooks.open(tile.dataset.igGridPlanned);
    });
    board.addEventListener('dragstart', event => {
      const tile = event.target.closest('[data-ig-grid-planned]');
      if (!tile || !editable) { event.preventDefault(); return; }
      dragged = tile; event.dataTransfer.setData('application/x-klartext-grid', tile.dataset.igGridPlanned); event.dataTransfer.effectAllowed = 'move';
    });
    board.addEventListener('dragover', event => { if (dragged && event.target.closest('[data-ig-grid-planned]')) event.preventDefault(); });
    board.addEventListener('dragend', () => { dragged = null; });
    board.addEventListener('drop', async event => {
      const target = event.target.closest('[data-ig-grid-planned]'), source = dragged; dragged = null;
      if (!source || !target || target === source || !editable) return;
      event.preventDefault();
      const ref = tile => ({id: tile.dataset.igGridPlanned, revision: Number(tile.dataset.revision)});
      try {
        await request('/api/instagram/grid/swap', 'POST', {a: ref(source), b: ref(target)});
        status.textContent = 'Termine getauscht.'; await load(); hooks.changed?.();
      } catch (error) { status.textContent = error.message; }
    });
    brand.addEventListener('change', () => { status.textContent = ''; load(); });
    load();
    return {reload: load};
  }
  // Setup dialog: token state, account per brand with its auto-post switch, locations, image pickup, notifications.
  const TOKEN = {fehlt: 'Kein Zugang hinterlegt. Leg den Meta-Zugang als Datei .meta\\token.txt in deinem Benutzerordner ab.',
    abgelaufen: 'Der Meta-Zugang ist abgelaufen. Erzeug einen neuen.', 'nicht erreichbar': 'Meta ist gerade nicht erreichbar. Öffne das später noch mal.'};
  const germanDate = iso => new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin'});
  function setup(root, snapshot) {
    let dialog = root.querySelector('[data-ig-setup-dialog]');
    if (!dialog) { dialog = node('dialog', 'dlg isWide igSetup'); dialog.dataset.igSetupDialog = ''; dialog.setAttribute('aria-labelledby', 'igSetupTitle'); root.append(dialog); }
    const title = node('h2', '', 'Instagram einrichten'); title.id = 'igSetupTitle';
    const close = button('Schließen', {'data-ig-setup-close': ''}), status = node('p', 'igSetupStatus');
    status.dataset.igSetupStatus = ''; status.setAttribute('role', 'status');
    const header = node('header', 'igSetupHeader'); header.append(title, close);
    const token = node('p', 'igSetupText', 'Wird geladen …'); token.dataset.igTokenState = '';
    const accounts = node('div', 'igSetupAccounts'), locations = node('ul', 'igSetupLocations'), funnel = node('p', 'igSetupText');
    funnel.dataset.igFunnel = '';
    const placeName = node('input'), placeId = node('input'), addPlace = button('Standort speichern', {'data-ig-location-add': ''});
    placeName.id = 'igLocationName'; placeName.maxLength = 100; placeId.id = 'igLocationPlace'; placeId.inputMode = 'numeric';
    const pushHint = node('p', 'igSetupText', 'Auf dem iPhone: Klartext in Safari über „Teilen“ und „Zum Home-Bildschirm“ hinzufügen, dort öffnen und hier Mitteilungen einschalten.');
    pushHint.dataset.igPushHint = ''; pushHint.hidden = !(/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone);
    const pushEnable = button('Mitteilungen auf diesem Gerät einschalten', {'data-ig-push-enable': ''}), pushTest = button('Testmitteilung senden', {'data-ig-push-test': ''});
    const section = (heading, ...children) => { const part = node('section', 'igSetupSection'); part.append(node('h3', '', heading), ...children); return part; };
    const placeRow = node('div', 'igSetupRow'); placeRow.append(field('Name', placeName), field('Facebook-Orts-Kennung', placeId), addPlace);
    const pushRow = node('div', 'igSetupRow'); pushRow.append(pushEnable, pushTest);
    dialog.replaceChildren(header, status, section('Zugang', token), section('Konten', accounts),
      section('Standorte', locations, placeRow), section('Bilder für Instagram', funnel), section('Mitteilungen', pushHint, pushRow));
    let data = null;
    function renderAccounts() {
      accounts.replaceChildren(...snapshot.brands.map(brand => {
        const mapped = data.accounts[brand.id], row = node('div', 'igSetupAccount'), pick = node('div', 'field'), choice = node('select'), wrap = node('label', 'igCheck check'), toggle = node('input');
        row.dataset.igAccount = brand.id; choice.setAttribute('aria-label', `Instagram-Konto für ${brand.name}`);
        choice.add(new Option('Kein Konto', ''));
        for (const found of data.found_accounts) choice.add(new Option(`@${found.username}`, found.ig_user_id));
        choice.value = mapped?.ig_user_id || '';
        toggle.type = 'checkbox'; toggle.dataset.igAutoPost = brand.id; toggle.checked = !!mapped?.auto_post; toggle.disabled = !mapped;
        wrap.append(toggle, document.createTextNode('Automatisch posten'));
        pick.append(choice); row.append(node('strong', '', brand.name), pick, wrap);
        const suggestion = data.found_accounts.find(found => found.suggested_brand === brand.id);
        if (suggestion && !mapped) row.append(node('span', 'igSetupHint', `Vorschlag: ${suggestion.username}`));
        return row;
      }));
    }
    function renderLocations() {
      locations.replaceChildren(...data.locations.map(entry => {
        const row = node('li', 'igSetupLocation'); row.dataset.igLocation = entry.id;
        row.append(node('span', '', `${entry.name} · ${entry.place_id}`), button('Entfernen', {'data-ig-location-remove': ''})); return row;
      }));
      if (!data.locations.length) locations.append(node('li', 'igEmpty', 'Noch keine Standorte gespeichert.'));
    }
    function render() {
      if (data.token === 'ok') {
        const missing = [!data.permissions.publish && 'Es fehlt das Recht zum Veröffentlichen (instagram_content_publish).',
          !data.permissions.comments && 'Es fehlt das Recht für den ersten Kommentar (instagram_manage_comments).'].filter(Boolean);
        token.textContent = [`Zugang aktiv${data.expires_at ? `, gültig bis ${germanDate(data.expires_at)}` : ''}.`, ...missing].join(' ');
      } else token.textContent = TOKEN[data.token] || data.token;
      funnel.textContent = data.funnel ? 'Aktiv. Instagram kann Bilder über kurze Einmal-Links abholen.'
        : 'Noch nicht eingerichtet: FUNNEL-EINRICHTEN.cmd im Klartext-Ordner am PC doppelt anklicken. Videos gehen auch ohne.';
      renderAccounts(); renderLocations();
    }
    async function run(work) { status.textContent = ''; try { await work(); } catch (error) { status.textContent = error.message; } }
    dialog.onclick = event => {
      const target = event.target.closest('button'); if (!target) return;
      if (target.hasAttribute('data-ig-setup-close')) dialog.close();
      else if (target.hasAttribute('data-ig-location-add')) run(async () => {
        data = {...data, ...(await request('/api/instagram/locations', 'POST', {name: placeName.value, place_id: placeId.value}))};
        placeName.value = ''; placeId.value = ''; renderLocations(); status.textContent = 'Standort gespeichert.';
      });
      else if (target.hasAttribute('data-ig-location-remove')) run(async () => {
        data = {...data, ...(await request(`/api/instagram/locations/${encodeURIComponent(target.closest('[data-ig-location]').dataset.igLocation)}`, 'DELETE'))};
        renderLocations();
      });
      else if (target.hasAttribute('data-ig-push-enable')) run(async () => {
        await window.KlartextPush.enable();
        status.textContent = 'Mitteilungen sind eingeschaltet.';
      });
      else if (target.hasAttribute('data-ig-push-test')) run(async () => {
        const {sent} = await request('/api/push/test', 'POST');
        status.textContent = `Testmitteilung an ${sent} ${sent === 1 ? 'Gerät' : 'Geräte'} gesendet.`;
      });
    };
    dialog.onchange = event => {
      const row = event.target.closest('[data-ig-account]'); if (!row) return;
      const brand = row.dataset.igAccount;
      if (event.target.matches('select') && event.target.value) run(async () => {
        data = {...data, ...(await request('/api/instagram/accounts', 'POST', {brand_id: brand, ig_user_id: event.target.value}))};
        renderAccounts(); status.textContent = 'Konto zugeordnet. Automatisches Posten ist noch aus.';
      });
      else if (event.target.matches('[data-ig-auto-post]')) {
        const toggle = event.target, wanted = toggle.checked, name = snapshot.brands.find(entry => entry.id === brand)?.name || brand;
        // Stays as clicked while saving; the redraw afterwards shows what the server really stored.
        toggle.disabled = true;
        run(async () => {
          try {
            data = {...data, ...(await request(`/api/instagram/accounts/${encodeURIComponent(brand)}`, 'PATCH', {auto_post: wanted}))};
            status.textContent = `Automatisches Posten für ${name} ${wanted ? 'eingeschaltet' : 'ausgeschaltet'}.`;
          } finally { renderAccounts(); }
        });
      }
    };
    dialog.showModal();
    request('/api/instagram/setup').then(result => { data = result; render(); }).catch(error => { token.textContent = error.message; });
  }
  window.KlartextInstagram = Object.freeze({editor, grid, setup});
})();
