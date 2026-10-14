/* Galeria de baralhos: comportamento da página.
 *
 * Seções (procure pelos comentários /* ---------- ... ---------- *\/):
 *   dados e utilidades · desenho das cartas · prateleira · baralho/grade · visualizador
 *   · publicação (modo do dono) · editor de baralhos e cartas · detecção do dono
 *
 * Abrindo o index.html direto no navegador, o site funciona só para leitura:
 * o modo editor depende do ambiente onde o site é publicado e não aparece aqui.
 * Use o build.py para gerar o arquivo único que vai para a publicação.
 */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Monta a página a partir do molde ---------- */
const HEAD = typeof __HEAD__ !== 'undefined' ? __HEAD__ : '';  // o build.py preenche __HEAD__ com o conteúdo do <head> do index.html
const cssEl = document.getElementById('css');
const appEl = document.getElementById('app');
const shellEl = document.getElementById('shell');
const dataEl = document.getElementById('data');
if (shellEl) document.body.append(shellEl.content.cloneNode(true));   // no site publicado o corpo vem de um <template>; abrindo o index.html direto ele já está na página
const BASE_SIZE = (cssEl ? cssEl.textContent.length : 0) + (appEl ? appEl.textContent.length : 0) + (shellEl ? shellEl.innerHTML.length : 0) + HEAD.length + 800;
const LIMIT = 16 * 1048576;

/* ---------- Baralhos do dono: dados embutidos na própria página ---------- */
let data;
try { data = dataEl ? JSON.parse(dataEl.textContent) : (window.__DADOS__ ? JSON.parse(JSON.stringify(window.__DADOS__)) : null); } catch (e) { data = null; }
if (!data || !Array.isArray(data.decks)) data = {v: 2, decks: [], images: {}};

const uid = p => p + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
const clone = o => JSON.parse(JSON.stringify(o));
const safeColor = (c, f) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : f;
const DATA_IMG = /^data:image\/(jpeg|png|webp);base64,/;
const imgSrc = id => {
  const im = data.images && data.images[id];
  const s = im && im.src;
  return (typeof s === 'string' && DATA_IMG.test(s) && !/["'<>\s]/.test(s)) ? s : '';
};
const firstChars = (s, n) => Array.from(String(s || '')).slice(0, n).join('');
const lum = hex => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
function ensureDark(hex){
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255, k = 0;
  while ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > .5 && k++ < 12){
    r = Math.round(r * .85); g = Math.round(g * .85); b = Math.round(b * .85);
  }
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* Converte dados antigos (imagens embutidas por carta, versos com estilos) para a biblioteca de imagens */
function migrate(d){
  d.v = 2;
  if (!d.images || typeof d.images !== 'object' || Array.isArray(d.images)) d.images = {};
  const bySrc = new Map(Object.entries(d.images).map(([id, im]) => [im.src, id]));
  const toId = (ref, kind) => {
    if (typeof ref !== 'string' || !ref) return null;
    if (d.images[ref]) return ref;
    if (!DATA_IMG.test(ref)) return null;
    let id = bySrc.get(ref);
    if (!id){ id = uid('i'); d.images[id] = {kind, name: 'imagem', src: ref}; bySrc.set(ref, id); }
    return id;
  };
  for (const dk of d.decks){
    const b = dk.back || {};
    if (b.kind === 'image') dk.back = {kind: 'image', src: toId(b.src, 'full')};
    else if (b.kind === 'emblem') dk.back = {kind: 'emblem', bg: b.bg, frame: b.frame, emblem: toId(b.emblem, 'emblem')};
    else dk.back = {kind: 'emblem', bg: b.c1 || dk.color, frame: b.c2 || '#FFFFFF', emblem: null};
    for (const c of dk.cards || []){
      const f = c.front || {};
      c.front = f.kind === 'image' ? {kind: 'image', src: toId(f.src, 'full')} : {kind: 'template', bg: f.bg, emoji: f.emoji || '', img: toId(f.img, 'panel')};
      if (c.back){ const s = toId(c.back.src, 'full'); c.back = s ? {src: s} : null; }
    }
  }
}
migrate(data);
let saved = JSON.stringify(data);

/* ---------- Desenho das cartas personalizadas ---------- */
function customBackHtml(b, alt){
  if (b && b.kind === 'image' && imgSrc(b.src))
    return `<div class="face back f-img"><img src="${imgSrc(b.src)}" alt="${esc(alt || 'Verso da carta')}" draggable="false"></div>`;
  const p = (b && b.kind === 'emblem') ? b : {};
  const em = imgSrc(p.emblem);
  return `<div class="face back b-emb" style="--p1:${safeColor(p.bg, '#3B3A8C')};--p2:${safeColor(p.frame, '#FFFFFF')}">` +
         (em ? `<img src="${em}" alt="" draggable="false">` : '') + `</div>`;
}
function customFrontHtml(c){
  const f = c.front || {};
  const title = c.title || 'Sem título';
  if (f.kind === 'image' && imgSrc(f.src))
    return `<div class="face front f-img"><img src="${imgSrc(f.src)}" alt="${esc(title)}" draggable="false"></div>`;
  const bg = safeColor(f.bg, '#3B3A8C');
  const img = imgSrc(f.img);
  const pic = img ? `<img src="${img}" alt="" draggable="false">` : `<span class="ce">${esc(firstChars(f.emoji, 2) || '✦')}</span>`;
  return `<div class="face front f-cust ${lum(bg) > .62 ? 'lt' : 'dk'}" style="--cb:${bg}"><div class="cpic">${pic}</div>` +
    `<div><div class="cname">${esc(title)}</div>${c.subtitle ? `<div class="csub">${esc(c.subtitle)}</div>` : ''}</div>` +
    (c.group ? `<div class="cgrp">${esc(c.group)}</div>` : '') + `</div>`;
}
function wrapCustom(d){
  return {
    id: d.id, custom: true, raw: d,
    name: d.name || 'Sem nome',
    color: ensureDark(safeColor(d.color, '#3B3A8C')),
    desc: d.desc || '',
    back: () => customBackHtml(d.back),
    cards: (d.cards || []).map(c => ({
      id: c.id,
      title: c.title || 'Sem título',
      subtitle: c.subtitle || '',
      text: c.text || '',
      details: (c.details || []).filter(r => r && (r[0] || r[1])).map(r => [String(r[0] || ''), String(r[1] || '')]),
      group: c.group || '',
      front: customFrontHtml(c),
      backHtml: (c.back && imgSrc(c.back.src)) ? customBackHtml({kind: 'image', src: c.back.src}, 'Verso de ' + (c.title || 'carta')) : null,
    })),
  };
}

/* ---------- Estado e elementos ---------- */
const shelf = $('#shelf'), chipsEl = $('#chips'), gridEl = $('#grid');
const dlg = $('#viewer'), flip = $('#flip'), tilt = $('#tilt'), bigbtn = $('#bigbtn');
const vflip = $('#vflip'), vprev = $('#vprev'), vnext = $('#vnext'), vstatus = $('#vstatus');
let DECKS = [], deck = null, filter = 'all', list = [], current = 0;
let selecting = false; const selected = new Set();
let editing = false, isOwner = false, artifactNS = null, busy = false, allowUnload = false, msg = '';

function rebuildDecks(){
  DECKS = data.decks.map(wrapCustom);
  deck = (deck && DECKS.find(d => d.id === deck.id)) || visibleDecks()[0] || null;
}
const visibleDecks = () => DECKS.filter(d => !d.custom || isOwner || d.cards.length);

/* ---------- Prateleira ---------- */
function renderShelf(){
  shelf.innerHTML = visibleDecks().map(d => {
    const back = `<span class="cw">${d.back()}</span>`;
    return `<button class="deck" data-id="${esc(d.id)}" style="--dc:${d.color}" aria-pressed="${!!deck && d.id === deck.id}">` +
      `<span class="stack"><span class="layer l3">${back}</span><span class="layer l2">${back}</span><span class="layer l1">${back}</span></span>` +
      `<span class="dname">${esc(d.name)}</span><span class="dcount">${d.cards.length} ${d.cards.length === 1 ? 'carta' : 'cartas'}</span></button>`;
  }).join('') + (editing
    ? `<button class="deck newdeck" data-new="1" style="--dc:#3B3A8C"><span class="stack"><span class="ph"><span class="plus" aria-hidden="true">+</span></span></span>` +
      `<span class="dname">Novo baralho</span><span class="dcount">Crie o seu</span></button>`
    : '');
}
shelf.addEventListener('click', e => {
  const b = e.target.closest('.deck');
  if (!b) return;
  if (b.dataset.new){ openDeckEditor(null); return; }
  deck = DECKS.find(d => d.id === b.dataset.id);
  filter = 'all';
  selecting = false; selected.clear();
  renderShelf();
  renderDeck();
});

/* ---------- Baralho selecionado ---------- */
function renderDeck(){
  if (!deck){
    document.body.style.setProperty('--deck', '#3B3A8C');
    shelf.style.setProperty('--deck', '#3B3A8C');
    $('#deckname').textContent = isOwner ? 'Nenhum baralho ainda' : 'Nenhum baralho por aqui ainda';
    const d0 = $('#deckdesc');
    d0.textContent = !isOwner ? 'Volte em breve.' : (editing ? 'Use o botão "Novo baralho" na prateleira acima para criar o primeiro.' : 'Clique em "Editar baralhos" no topo da página para criar o primeiro baralho.');
    d0.hidden = false;
    $('#dtools').innerHTML = '';
    chipsEl.hidden = true; chipsEl.innerHTML = '';
    gridEl.innerHTML = ''; list = [];
    return;
  }
  document.body.style.setProperty('--deck', deck.color);
  shelf.style.setProperty('--deck', deck.color);
  $('#deckname').textContent = deck.name;
  const d = $('#deckdesc');
  d.textContent = deck.desc; d.hidden = !deck.desc;
  renderDtools();
  const groups = [...new Set(deck.cards.map(c => c.group).filter(Boolean))];
  if (filter !== 'all' && !groups.includes(filter)) filter = 'all';
  chipsEl.hidden = groups.length < 2;
  chipsEl.innerHTML =
    `<button class="chip" data-g="all" aria-pressed="${filter === 'all'}">Todas <span>${deck.cards.length}</span></button>` +
    groups.map(g => `<button class="chip" data-g="${esc(g)}" aria-pressed="${filter === g}">${esc(g)} <span>${deck.cards.filter(c => c.group === g).length}</span></button>`).join('');
  renderGrid();
}
function renderDtools(){
  const box = $('#dtools');
  if (!deck){ box.innerHTML = ''; return; }
  const was = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.dact : '';
  const n = selected.size;
  box.innerHTML = selecting
    ? `<span class="hint">${n} ${n === 1 ? 'selecionada' : 'selecionadas'}</span>` +
      `<button type="button" class="btn sm primary" data-dact="selimg"${n ? '' : ' disabled'}>Definir imagem do painel</button>` +
      `<button type="button" class="btn sm" data-dact="selall">Selecionar todas</button>` +
      `<button type="button" class="btn sm" data-dact="selnone"${n ? '' : ' disabled'}>Limpar seleção</button>` +
      `<button type="button" class="btn sm" data-dact="seldone">Concluir</button>`
    : `<button type="button" class="btn sm" data-dact="edit">Editar baralho</button>` +
      `<button type="button" class="btn sm" data-dact="add">Nova carta</button>` +
      (deck.cards.length ? `<button type="button" class="btn sm" data-dact="sel">Selecionar cartas</button>` : '') +
      `<button type="button" class="btn sm danger" data-dact="del">Excluir baralho</button>`;
  if (was){ const b = box.querySelector(`[data-dact="${was}"]`); if (b && !b.disabled) b.focus(); }
}
function syncSelDom(){
  gridEl.querySelectorAll('.gitem').forEach(it => {
    const on = selected.has(it.dataset.id);
    it.classList.toggle('sel', on);
    const cb = it.querySelector('[data-sel]');
    if (cb) cb.checked = on;
  });
  renderDtools();
}
function renderGrid(){
  list = deck.cards.filter(c => filter === 'all' || c.group === filter);
  if (!list.length){
    gridEl.innerHTML = `<p class="empty">${deck.custom && !deck.cards.length ? 'Este baralho ainda não tem cartas.' : 'Nenhuma carta neste filtro.'}</p>`;
    return;
  }
  const tools = deck.custom && isOwner;
  gridEl.innerHTML = list.map((c, i) => {
    let t = '';
    if (tools && selecting){
      t = `<div class="gtools"><label class="radio selbox"><input type="checkbox" data-sel="${esc(c.id)}"${selected.has(c.id) ? ' checked' : ''}> Selecionar</label></div>`;
    } else if (tools){
      t = `<div class="gtools">` +
        (filter === 'all' ? `<button type="button" class="btn" data-act="left" data-id="${esc(c.id)}" aria-label="Mover ${esc(c.title)} para antes"${i === 0 ? ' disabled' : ''}>‹</button>` : '') +
        `<button type="button" class="btn" data-act="edit" data-id="${esc(c.id)}">Editar</button>` +
        `<button type="button" class="btn danger" data-act="del" data-id="${esc(c.id)}">Excluir</button>` +
        (filter === 'all' ? `<button type="button" class="btn" data-act="right" data-id="${esc(c.id)}" aria-label="Mover ${esc(c.title)} para depois"${i === list.length - 1 ? ' disabled' : ''}>›</button>` : '') +
        `</div>`;
    }
    const sel = tools && selecting && selected.has(c.id);
    return `<div class="gitem${sel ? ' sel' : ''}" data-id="${esc(c.id)}"><button class="gcard" data-i="${i}" aria-label="${tools && selecting ? 'Selecionar' : 'Abrir'} ${esc(c.title)}"><span class="cw">${c.front}</span></button>${t}</div>`;
  }).join('');
}
chipsEl.addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if (!b) return;
  filter = b.dataset.g;
  chipsEl.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  renderGrid();
});
gridEl.addEventListener('click', async e => {
  if (selecting){
    const cb = e.target.closest('[data-sel]');
    const gc = e.target.closest('.gcard');
    if (cb){ if (cb.checked) selected.add(cb.dataset.sel); else selected.delete(cb.dataset.sel); syncSelDom(); }
    else if (gc){ const id = list[+gc.dataset.i].id; if (selected.has(id)) selected.delete(id); else selected.add(id); syncSelDom(); }
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act){
    if (!deck || !deck.custom) return;
    const raw = deck.raw, id = act.dataset.id, a = act.dataset.act;
    const ix = raw.cards.findIndex(c => c.id === id);
    if (ix < 0) return;
    if (a === 'edit') openCardEditor(raw, raw.cards[ix]);
    else if (a === 'del'){
      if (await askConfirm(`Excluir a carta "${raw.cards[ix].title}"?`, 'Excluir carta')){ raw.cards.splice(ix, 1); commit(); }
    } else {
      const jx = a === 'left' ? ix - 1 : ix + 1;
      if (jx >= 0 && jx < raw.cards.length){
        [raw.cards[ix], raw.cards[jx]] = [raw.cards[jx], raw.cards[ix]];
        commit();
        const again = gridEl.querySelector(`[data-act="${a}"][data-id="${id}"]`);
        if (again && !again.disabled) again.focus();
      }
    }
    return;
  }
  const b = e.target.closest('.gcard');
  if (b) openViewer(+b.dataset.i);
});
$('#dtools').addEventListener('click', async e => {
  const b = e.target.closest('[data-dact]');
  if (!b || !deck || !deck.custom || b.disabled) return;
  const a = b.dataset.dact;
  if (a === 'edit') openDeckEditor(deck.raw);
  else if (a === 'add') openCardEditor(deck.raw, null);
  else if (a === 'sel'){ selecting = true; selected.clear(); renderGrid(); renderDtools(); }
  else if (a === 'seldone'){ selecting = false; selected.clear(); renderGrid(); renderDtools(); }
  else if (a === 'selall'){ list.forEach(c => selected.add(c.id)); syncSelDom(); }
  else if (a === 'selnone'){ selected.clear(); syncSelDom(); }
  else if (a === 'selimg') openBulkImage(deck.raw, new Set(selected));
  else if (a === 'del' && await askConfirm(`Excluir o baralho "${deck.name}" e todas as suas cartas?`, 'Excluir baralho')){
    data.decks = data.decks.filter(x => x.id !== deck.id);
    filter = 'all';
    commit();
  }
});

/* ---------- Visualizador ---------- */
function setFlipped(on){
  flip.classList.toggle('is-back', on);
  vflip.textContent = on ? 'Ver frente' : 'Ver verso';
  vstatus.textContent = on ? 'Mostrando o verso da carta' : 'Mostrando a frente da carta';
}
function showCard(){
  const c = list[current];
  flip.innerHTML = c.front + (c.backHtml || deck.back());
  setFlipped(false);
  $('#vmeta').textContent = `Carta ${current + 1} de ${list.length} em ${deck.name}`;
  $('#vtitle').textContent = c.title;
  const sub = $('#vsub'), txt = $('#vtext'), dl = $('#vdl');
  sub.textContent = c.subtitle; sub.hidden = !c.subtitle;
  txt.textContent = c.text; txt.hidden = !c.text;
  dl.innerHTML = c.details.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
  dl.hidden = !c.details.length;
  vprev.disabled = current === 0;
  vnext.disabled = current === list.length - 1;
  if (vprev.disabled && document.activeElement === vprev) vflip.focus();
  if (vnext.disabled && document.activeElement === vnext) vflip.focus();
}
function openViewer(i){
  current = i;
  showCard();
  if (!dlg.open) dlg.showModal();
}
function go(d){
  const n = current + d;
  if (n < 0 || n >= list.length) return;
  current = n;
  showCard();
}
const toggle = () => setFlipped(!flip.classList.contains('is-back'));
bigbtn.addEventListener('click', toggle);
vflip.addEventListener('click', toggle);
vprev.addEventListener('click', () => go(-1));
vnext.addEventListener('click', () => go(1));
$('#vclose').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'ArrowLeft') go(-1);
});
dlg.addEventListener('close', () => {
  const b = gridEl.querySelector(`[data-i="${current}"]`);
  if (b){ b.focus({preventScroll: true}); b.scrollIntoView({block: 'nearest'}); }
});
if (!reduceMotion){
  bigbtn.addEventListener('pointermove', e => {
    const r = bigbtn.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - .5;
    const py = (e.clientY - r.top) / r.height - .5;
    tilt.style.setProperty('--ry', (px * 14).toFixed(1) + 'deg');
    tilt.style.setProperty('--rx', (-py * 14).toFixed(1) + 'deg');
  });
  const reset = () => { tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--ry', '0deg'); };
  bigbtn.addEventListener('pointerleave', reset);
  bigbtn.addEventListener('blur', reset);
}

/* ---------- Confirmação própria (sem confirm() do navegador) ---------- */
function askConfirm(text, okLabel){
  return new Promise(res => {
    const d = $('#confirm');
    $('#cfmmsg').textContent = text;
    $('#cfmyes').textContent = okLabel || 'Confirmar';
    d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'yes'), {once: true});
    d.showModal();
  });
}
$('#cfmyes').addEventListener('click', () => $('#confirm').close('yes'));
$('#cfmno').addEventListener('click', () => $('#confirm').close('no'));

/* ---------- Rascunho, tamanho e publicação ---------- */
const STASH = 'baralhos:rascunho';
const isDirty = () => JSON.stringify(data) !== saved;
function usedIds(d){
  const s = new Set();
  for (const dk of d.decks){
    const b = dk.back || {};
    if (b.src) s.add(b.src);
    if (b.emblem) s.add(b.emblem);
    for (const c of dk.cards || []){
      const f = c.front || {};
      if (f.src) s.add(f.src);
      if (f.img) s.add(f.img);
      if (c.back && c.back.src) s.add(c.back.src);
    }
  }
  return s;
}
function pruned(d){
  const u = usedIds(d), images = {};
  for (const [id, im] of Object.entries(d.images || {})) if (u.has(id)) images[id] = im;
  return Object.assign({}, d, {images});
}
function pruneDraft(){ data.images = pruned(data).images; }
const sizeBytes = () => BASE_SIZE + JSON.stringify(pruned(data)).length;
function stashNow(){
  try { if (isDirty()) sessionStorage.setItem(STASH, JSON.stringify(data)); else sessionStorage.removeItem(STASH); } catch (e) {}
}
let stashTimer = 0;
function scheduleStash(){ clearTimeout(stashTimer); stashTimer = setTimeout(stashNow, 700); }

function refreshBar(){
  if (!isOwner) return;
  const dirty = isDirty();
  const mb = sizeBytes() / 1048576;
  $('#estatus').textContent = msg || (dirty ? 'Alterações ainda não publicadas' : 'Tudo publicado');
  const sz = $('#esize');
  sz.textContent = `${mb.toFixed(1)} de 16 MB`;
  sz.classList.toggle('warn', mb > 14);
  $('#epub').disabled = !dirty || busy;
  $('#edisc').disabled = !dirty || busy;
}
function commit(){
  msg = '';
  rebuildDecks();
  renderShelf();
  renderDeck();
  refreshBar();
  scheduleStash();
}
function buildDocument(d){
  const json = JSON.stringify(d).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '<!doctype html>\n<html lang="pt-BR">\n<head>\n' + HEAD +
    '<style id="css">' + cssEl.textContent + '</style>\n</head>\n<body>\n' +
    '<template id="shell">' + shellEl.innerHTML + '</template>\n' +
    '<scr' + 'ipt type="application/json" id="data">' + json + '</scr' + 'ipt>\n' +
    '<scr' + 'ipt id="app">' + appEl.textContent + '</scr' + 'ipt>\n</body>\n</html>\n';
}
async function publishNow(){
  if (!artifactNS || busy || !isDirty()) return;
  if (sizeBytes() > LIMIT - 524288){
    msg = 'O site passou do limite de 16 MB. Remova imagens ou use imagens menores.';
    refreshBar();
    return;
  }
  busy = true; allowUnload = true; msg = 'Publicando…'; refreshBar();
  stashNow();
  try {
    await artifactNS.publish(buildDocument(pruned(data)));
    msg = 'Publicado! Recarregando…';
    refreshBar();
  } catch (e) {
    busy = false; allowUnload = false;
    const code = e && e.code;
    if (code === 'conflict') msg = 'Outra versão foi publicada antes. A página vai recarregar.';
    else if (code === 'not_writer' || code === 'not_granted' || code === 'not_declared' || code === 'consent_required' || code === 'capability_disabled' || code === 'capability_removed')
      msg = 'Este acesso não permite publicar. O rascunho continua na página.';
    else if (code === 'too_large') msg = 'O site ficou grande demais. Remova imagens ou use imagens menores.';
    else if (code === 'rate_limited') msg = 'Publicações demais em pouco tempo. Espere um pouco e tente de novo.';
    else msg = 'Não foi possível publicar agora. Tente de novo em instantes.';
    refreshBar();
  }
}
async function discardNow(){
  if (!isDirty() || busy) return;
  if (!(await askConfirm('Descartar todas as alterações que ainda não foram publicadas?', 'Descartar'))) return;
  data = JSON.parse(saved);
  try { sessionStorage.removeItem(STASH); } catch (e) {}
  commit();
}
window.addEventListener('beforeunload', e => {
  if (isOwner && !allowUnload && isDirty()){ e.preventDefault(); e.returnValue = ''; }
});

/* ---------- Modo editor: liga e desliga ---------- */
const editToggle = $('#editToggle');
function setEditing(on){
  editing = on;
  if (!on){ selecting = false; selected.clear(); }
  document.body.classList.toggle('editing', on);
  editToggle.setAttribute('aria-pressed', String(on));
  editToggle.textContent = on ? 'Sair do modo editor' : 'Editar baralhos';
  renderShelf();
  renderDeck();
  refreshBar();
}
editToggle.addEventListener('click', () => setEditing(!editing));
$('#epub').addEventListener('click', publishNow);
$('#edisc').addEventListener('click', discardNow);

/* ---------- Editor de baralhos e cartas ---------- */
const editorDlg = $('#editor'), eform = $('#eform'), efields = $('#efields'), epv = $('#epv'), eerr = $('#eerr');
let ed = null;
const q = n => efields.querySelector(`[name="${n}"]`);
const setErr = m => { eerr.textContent = m || ''; };
const accentOf = color => ensureDark(safeColor(color, '#3B3A8C'));

const fldWrap = (label, inner, hint) =>
  `<label class="fld"><span class="lt">${label}</span>${inner}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;

/* campo de imagem: escolher uma já enviada (compartilhada) ou enviar uma nova */
const imgField = (key, label, kind, optional) =>
  `<div class="fld imgctl" data-kind="${kind}"><span class="lt">${label}</span>` +
  `<div class="pick" data-pick="${key}" hidden></div>` +
  `<input type="file" accept="image/*" data-img="${key}" aria-label="Enviar nova imagem: ${label}">` +
  `<div class="row">` +
  (kind === 'emblem' ? '' :
    `<label class="fld grow"><span class="hint">Ajuste da próxima imagem enviada</span><select data-fit="${key}">` +
    `<option value="cover">Preencher (corta as bordas)</option><option value="contain">Mostrar inteira (bordas pretas)</option></select></label>`) +
  (optional ? `<button type="button" class="btn sm" data-rm="${key}">Tirar imagem</button>` : '') +
  `</div><span class="hint" data-info="${key}"></span></div>`;

function readFile(f){
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
}
function loadImg(src){
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagem')); i.src = src; });
}
const IMG_SIZE = {full: [700, 980], panel: [720, 560]};
async function processImage(src, kind, fit){
  const img = await loadImg(src);
  const iw = img.naturalWidth || 512, ih = img.naturalHeight || 512;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  if (kind === 'emblem'){
    const s = Math.min(1, 400 / Math.max(iw, ih));
    cv.width = Math.max(1, Math.round(iw * s));
    cv.height = Math.max(1, Math.round(ih * s));
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    const out = cv.toDataURL('image/webp', .9);
    return out.startsWith('data:image/webp') ? out : cv.toDataURL('image/png');
  }
  const [w, h] = IMG_SIZE[kind];
  cv.width = w; cv.height = h;
  cx.fillStyle = '#111111';
  cx.fillRect(0, 0, w, h);
  const s = fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih);
  cx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
  return cv.toDataURL('image/jpeg', .84);
}

/* biblioteca: cada imagem é guardada uma só vez e referenciada por id */
function addImage(kind, src, name){
  const hit = Object.entries(data.images).find(([, im]) => im.src === src);
  if (hit) return hit[0];
  const id = uid('i');
  data.images[id] = {kind, name: String(name || 'imagem').replace(/\.[^.]+$/, '').slice(0, 24) || 'imagem', src};
  return id;
}
function countUses(id, skipCard, skipDeck){
  let n = 0;
  for (const dk of data.decks){
    const b = dk.back || {};
    if (dk.id !== skipDeck && (b.src === id || b.emblem === id)) n++;
    for (const c of dk.cards || []){
      if (c.id === skipCard) continue;
      const f = c.front || {};
      if (f.src === id || f.img === id || (c.back && c.back.src === id)) n++;
    }
  }
  return n;
}
function wireImg(key, kind, get, set){
  const fileIn = efields.querySelector(`[data-img="${key}"]`);
  const root = fileIn.closest('.imgctl');
  const fitSel = root.querySelector('[data-fit]');
  const info = root.querySelector('[data-info]');
  const rm = root.querySelector('[data-rm]');
  const pick = root.querySelector('[data-pick]');
  const drawPick = () => {
    const items = Object.entries(data.images).filter(([id, im]) => im.kind === kind && imgSrc(id));
    pick.hidden = !items.length;
    pick.innerHTML = items.map(([id, im]) =>
      `<button type="button" class="thumb ${kind}" data-tid="${esc(id)}" aria-pressed="${get() === id}" aria-label="Usar a imagem ${esc(im.name)}" title="${esc(im.name)}">` +
      `<img src="${imgSrc(id)}" alt=""><span>${esc(im.name)}</span></button>`).join('');
  };
  const show = () => {
    const s = get();
    const n = s ? countUses(s, ed.selfCard, ed.selfDeck) : 0;
    info.textContent = s
      ? (n ? `Imagem escolhida. Também usada em ${n} ${n === 1 ? 'outro lugar' : 'outros lugares'}, sem ocupar espaço extra.` : 'Imagem escolhida.')
      : (pick.hidden && !Object.values(data.images).some(im => im.kind === kind) ? 'Nenhuma imagem escolhida. Envie uma abaixo.' : 'Nenhuma imagem escolhida. Clique em uma já enviada ou envie uma nova.');
    if (rm) rm.hidden = !s;
    drawPick();
  };
  const run = async base => {
    try {
      setErr('');
      info.textContent = 'Preparando a imagem…';
      const src = await processImage(base, kind, fitSel ? fitSel.value : 'cover');
      set(addImage(kind, src, ed.names[key]));
      show();
      ed.sync();
    } catch (err) {
      setErr('Não consegui ler essa imagem. Use um arquivo JPG, PNG ou WebP.');
      show();
    }
  };
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    if (!f) return;
    if (f.size > 25 * 1048576){ setErr('Esse arquivo é grande demais (máximo de 25 MB).'); fileIn.value = ''; return; }
    try { ed.orig[key] = await readFile(f); ed.names[key] = f.name; } catch (err) { setErr('Não consegui ler esse arquivo.'); return; }
    fileIn.value = '';
    run(ed.orig[key]);
  });
  if (fitSel) fitSel.addEventListener('change', () => { if (ed.orig[key]) run(ed.orig[key]); });
  pick.addEventListener('click', e => {
    const b = e.target.closest('[data-tid]');
    if (!b) return;
    set(b.dataset.tid);
    show();
    ed.sync();
  });
  if (rm) rm.addEventListener('click', () => { set(''); show(); ed.sync(); });
  show();
}

function showEditor(title, saveLabel, accent){
  $('#etitle').textContent = title;
  $('#esave').textContent = saveLabel;
  editorDlg.style.setProperty('--deck', accent);
  setErr('');
  editorDlg.showModal();
}
efields.addEventListener('click', e => { if (ed && ed.onClick) ed.onClick(e); });
eform.addEventListener('input', () => ed && ed.sync());
eform.addEventListener('change', () => ed && ed.sync());
eform.addEventListener('submit', e => {
  e.preventDefault();
  if (ed && ed.save()){ ed = null; editorDlg.close(); commit(); }
});
$('#ecancel').addEventListener('click', () => editorDlg.close());
editorDlg.addEventListener('close', () => {
  ed = null;
  pruneDraft();
  refreshBar();
  scheduleStash();
});

/* --- baralho --- */
function openDeckEditor(raw){
  const isNew = !raw;
  const w = raw ? clone(raw) : {id: uid('d'), name: '', desc: '', color: '#3B3A8C', back: null, cards: []};
  const b = w.back || {};
  const st = {
    kind: b.kind === 'image' ? 'image' : 'emblem',
    bg: safeColor(b.bg, safeColor(w.color, '#3B3A8C')),
    frame: safeColor(b.frame, '#FFFFFF'),
    emblem: b.kind === 'emblem' ? (b.emblem || '') : '',
    img: b.kind === 'image' ? (b.src || '') : '',
  };
  ed = {orig: {}, names: {}, selfDeck: w.id};
  efields.innerHTML =
    fldWrap('Nome do baralho', '<input type="text" name="name" maxlength="40" autocomplete="off">') +
    fldWrap('Descrição', '<textarea name="desc" rows="3" maxlength="300"></textarea>') +
    fldWrap('Cor do baralho', '<input type="color" name="color">', 'É a cor de destaque do site quando este baralho está selecionado. Cores muito claras são escurecidas.') +
    `<fieldset class="fld"><legend>Verso das cartas</legend>` +
    `<div class="row"><label class="radio"><input type="radio" name="bkind" value="emblem">Cor e símbolo</label>` +
    `<label class="radio"><input type="radio" name="bkind" value="image">Imagem inteira</label></div>` +
    `<div class="stackf" id="bk-emblem"><div class="row">` + fldWrap('Cor de fundo', '<input type="color" name="pbg">') + fldWrap('Cor da moldura', '<input type="color" name="pfr">') + `</div>` +
    imgField('emblem', 'Símbolo no centro (opcional)', 'emblem', true) +
    `<p class="hint">Use uma imagem com fundo transparente (PNG ou WebP) para o símbolo aparecer direto sobre a cor. O símbolo é reduzido para ocupar pouco espaço.</p></div>` +
    `<div class="stackf" id="bk-image">${imgField('dback', 'Imagem do verso', 'full', false)}</div></fieldset>`;
  q('name').value = w.name; q('desc').value = w.desc; q('color').value = safeColor(w.color, '#3B3A8C');
  efields.querySelector(`[name="bkind"][value="${st.kind}"]`).checked = true;
  q('pbg').value = st.bg; q('pfr').value = st.frame;
  const backObj = () => st.kind === 'image' ? {kind: 'image', src: st.img} : {kind: 'emblem', bg: st.bg, frame: st.frame, emblem: st.emblem || null};
  ed.sync = () => {
    w.name = q('name').value.trim(); w.desc = q('desc').value.trim(); w.color = q('color').value;
    st.kind = efields.querySelector('[name="bkind"]:checked').value;
    st.bg = q('pbg').value; st.frame = q('pfr').value;
    efields.querySelector('#bk-emblem').hidden = st.kind !== 'emblem';
    efields.querySelector('#bk-image').hidden = st.kind !== 'image';
    editorDlg.style.setProperty('--deck', accentOf(w.color));
    epv.innerHTML = `<div class="pvrow"><figure class="pvitem"><span class="cw">${customBackHtml(backObj(), 'Verso')}</span><figcaption>Verso do baralho</figcaption></figure></div>`;
  };
  wireImg('emblem', 'emblem', () => st.emblem, v => { st.emblem = v; });
  wireImg('dback', 'full', () => st.img, v => { st.img = v; });
  ed.save = () => {
    ed.sync();
    if (!w.name){ setErr('Dê um nome ao baralho.'); q('name').focus(); return false; }
    if (st.kind === 'image' && !st.img){ setErr('Escolha ou envie a imagem do verso, ou use "Cor e símbolo".'); return false; }
    w.back = backObj();
    if (isNew) data.decks.push(w);
    else Object.assign(raw, {name: w.name, desc: w.desc, color: w.color, back: w.back});
    deck = {id: w.id};
    filter = 'all';
    return true;
  };
  showEditor(isNew ? 'Novo baralho' : 'Editar baralho', 'Salvar baralho', accentOf(w.color));
  ed.sync();
  q('name').focus();
}

/* --- carta --- */
function openCardEditor(deckRaw, raw){
  const isNew = !raw;
  const w = raw ? clone(raw) : {id: uid('c'), title: '', subtitle: '', text: '', group: '', details: [], front: null, back: null};
  w.details = (w.details || []).map(r => [String(r[0] || ''), String(r[1] || '')]);
  const f = w.front || {};
  const st = {
    kind: f.kind === 'image' ? 'image' : 'template',
    bg: safeColor(f.bg, safeColor(deckRaw.color, '#3B3A8C')),
    emoji: f.emoji || '',
    pic: f.img || '',
    full: f.kind === 'image' ? (f.src || '') : '',
    own: !!(w.back && w.back.src),
    cback: w.back ? (w.back.src || '') : '',
  };
  const groups = [...new Set(deckRaw.cards.map(c => c.group).filter(Boolean))];
  ed = {orig: {}, names: {}, selfCard: w.id};
  efields.innerHTML =
    fldWrap('Título', '<input type="text" name="title" maxlength="40" autocomplete="off">') +
    fldWrap('Subtítulo', '<input type="text" name="subtitle" maxlength="60" autocomplete="off">', 'Opcional. Aparece abaixo do título.') +
    fldWrap('Descrição', '<textarea name="text" rows="4" maxlength="400"></textarea>') +
    fldWrap('Grupo', `<input type="text" name="group" maxlength="30" list="glist" autocomplete="off"><datalist id="glist">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`, 'Opcional. Cartas do mesmo grupo aparecem juntas nos filtros do baralho.') +
    `<div class="fld"><span class="lt">Detalhes</span><div id="drows"></div><div><button type="button" class="btn sm" id="dadd">Adicionar detalhe</button></div></div>` +
    `<fieldset class="fld"><legend>Frente da carta</legend>` +
    `<div class="row"><label class="radio"><input type="radio" name="fkind" value="template">Modelo com título</label>` +
    `<label class="radio"><input type="radio" name="fkind" value="image">Imagem inteira</label></div>` +
    `<div class="stackf" id="fk-template"><div class="row">` + fldWrap('Cor de fundo', '<input type="color" name="bg">') +
    fldWrap('Emoji ou símbolo', '<input type="text" name="emoji" maxlength="4" autocomplete="off">') + `</div>` +
    imgField('pic', 'Imagem do painel (opcional, no lugar do emoji)', 'panel', true) +
    `<p class="hint">Várias cartas podem usar a mesma imagem: escolha uma já enviada e ela é guardada uma só vez.</p></div>` +
    `<div class="stackf" id="fk-image">${imgField('front', 'Imagem da carta inteira', 'full', false)}</div></fieldset>` +
    `<fieldset class="fld"><legend>Verso da carta</legend>` +
    `<label class="radio"><input type="checkbox" name="ownback">Usar uma imagem própria no verso desta carta</label>` +
    `<p class="hint">Sem isso, a carta usa o verso do baralho.</p>` +
    `<div class="stackf" id="bk-own">${imgField('cback', 'Imagem do verso desta carta', 'full', false)}</div></fieldset>`;
  q('title').value = w.title; q('subtitle').value = w.subtitle; q('text').value = w.text; q('group').value = w.group;
  q('bg').value = st.bg; q('emoji').value = st.emoji; q('ownback').checked = st.own;
  efields.querySelector(`[name="fkind"][value="${st.kind}"]`).checked = true;

  const drows = efields.querySelector('#drows');
  const drawRows = () => {
    drows.innerHTML = w.details.map((r, i) =>
      `<div class="drow"><input type="text" data-d="${i}" data-k="0" maxlength="30" placeholder="Rótulo" aria-label="Rótulo ${i + 1}" value="${esc(r[0])}">` +
      `<input type="text" data-d="${i}" data-k="1" maxlength="80" placeholder="Valor" aria-label="Valor ${i + 1}" value="${esc(r[1])}">` +
      `<button type="button" class="btn sm" data-ddel="${i}" aria-label="Remover detalhe ${i + 1}">×</button></div>`).join('');
    efields.querySelector('#dadd').disabled = w.details.length >= 6;
  };
  ed.onClick = e => {
    if (e.target.closest('#dadd')){
      ed.sync();
      if (w.details.length < 6){ w.details.push(['', '']); drawRows(); const ins = drows.querySelectorAll('input'); ins[ins.length - 2].focus(); }
      return;
    }
    const del = e.target.closest('[data-ddel]');
    if (del){ ed.sync(); w.details.splice(+del.dataset.ddel, 1); drawRows(); }
  };
  drawRows();

  const frontObj = () => st.kind === 'image' ? {kind: 'image', src: st.full} : {kind: 'template', bg: st.bg, emoji: firstChars(st.emoji, 2), img: st.pic || null};
  ed.sync = () => {
    w.title = q('title').value.trim(); w.subtitle = q('subtitle').value.trim(); w.text = q('text').value.trim(); w.group = q('group').value.trim();
    efields.querySelectorAll('[data-d]').forEach(inp => { if (w.details[+inp.dataset.d]) w.details[+inp.dataset.d][+inp.dataset.k] = inp.value; });
    st.kind = efields.querySelector('[name="fkind"]:checked').value;
    st.bg = q('bg').value; st.emoji = q('emoji').value; st.own = q('ownback').checked;
    efields.querySelector('#fk-template').hidden = st.kind !== 'template';
    efields.querySelector('#fk-image').hidden = st.kind !== 'image';
    efields.querySelector('#bk-own').hidden = !st.own;
    const tmp = {title: w.title || 'Título da carta', subtitle: w.subtitle, group: w.group, front: frontObj()};
    const back = (st.own && st.cback) ? customBackHtml({kind: 'image', src: st.cback}, 'Verso') : customBackHtml(deckRaw.back, 'Verso');
    epv.innerHTML = `<div class="pvrow"><figure class="pvitem"><span class="cw">${customFrontHtml(tmp)}</span><figcaption>Frente</figcaption></figure>` +
      `<figure class="pvitem"><span class="cw">${back}</span><figcaption>Verso</figcaption></figure></div>`;
  };
  wireImg('pic', 'panel', () => st.pic, v => { st.pic = v; });
  wireImg('front', 'full', () => st.full, v => { st.full = v; });
  wireImg('cback', 'full', () => st.cback, v => { st.cback = v; });
  ed.save = () => {
    ed.sync();
    if (!w.title){ setErr('Dê um título à carta.'); q('title').focus(); return false; }
    if (st.kind === 'image' && !st.full){ setErr('Escolha ou envie a imagem da frente, ou use o modelo com título.'); return false; }
    if (st.own && !st.cback){ setErr('Escolha ou envie a imagem do verso, ou desmarque a opção de verso próprio.'); return false; }
    const out = {
      id: w.id, title: w.title, subtitle: w.subtitle, text: w.text, group: w.group,
      details: w.details.map(r => [r[0].trim(), r[1].trim()]).filter(r => r[0] || r[1]),
      front: frontObj(),
      back: (st.own && st.cback) ? {src: st.cback} : null,
    };
    const ix = deckRaw.cards.findIndex(c => c.id === w.id);
    if (ix >= 0) deckRaw.cards[ix] = out; else deckRaw.cards.push(out);
    return true;
  };
  showEditor(isNew ? 'Nova carta' : 'Editar carta', 'Salvar carta', accentOf(deckRaw.color));
  ed.sync();
  q('title').focus();
}

/* --- imagem do painel para várias cartas de uma vez --- */
function openBulkImage(deckRaw, ids){
  const targets = deckRaw.cards.filter(c => ids.has(c.id) && c.front && c.front.kind === 'template');
  if (!targets.length){
    msg = 'As cartas selecionadas usam imagem inteira. Selecione cartas do modelo com título.';
    refreshBar();
    return;
  }
  const skipped = ids.size - targets.length;
  const st = {pic: ''};
  ed = {orig: {}, names: {}};
  efields.innerHTML =
    `<p class="hint">A imagem escolhida vira o painel de ${targets.length} ${targets.length === 1 ? 'carta' : 'cartas'}` +
    (skipped ? ` (${skipped} ${skipped === 1 ? 'carta com imagem inteira foi ignorada' : 'cartas com imagem inteira foram ignoradas'})` : '') +
    `. O arquivo é guardado uma única vez, não importa quantas cartas o usem.</p>` +
    imgField('bulk', 'Imagem do painel', 'panel', false);
  ed.sync = () => {
    const t = targets[0];
    const tmp = {title: t.title, subtitle: t.subtitle, group: t.group, front: {kind: 'template', bg: t.front.bg, emoji: t.front.emoji, img: st.pic || null}};
    epv.innerHTML = `<div class="pvrow"><figure class="pvitem"><span class="cw">${customFrontHtml(tmp)}</span><figcaption>Prévia: ${esc(t.title)}</figcaption></figure></div>`;
  };
  wireImg('bulk', 'panel', () => st.pic, v => { st.pic = v; });
  ed.save = () => {
    if (!st.pic){ setErr('Escolha ou envie uma imagem.'); return false; }
    targets.forEach(c => { c.front.img = st.pic; });
    selecting = false;
    selected.clear();
    return true;
  };
  showEditor('Imagem para as cartas selecionadas', 'Aplicar às cartas', accentOf(deckRaw.color));
  ed.sync();
}

/* ---------- Quem é o dono? Só ele vê o modo editor ---------- */
async function detectOwner(){
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    const [u, a] = await Promise.all([window.claude.use('user'), window.claude.use('artifact')]);
    if (!u || !a) return;
    const [own, can] = await Promise.all([u.isOwner(), u.canEdit()]);
    if (!own || !can) return;
    isOwner = true;
    artifactNS = a;
  } catch (e) { return; }
  $('#ownerrow').hidden = false;
  renderShelf();
  renderDeck();
  refreshBar();
  try {
    const s = sessionStorage.getItem(STASH);
    if (s){
      if (s === saved){ sessionStorage.removeItem(STASH); }
      else if (await askConfirm('Encontrei um rascunho de alterações que não chegou a ser publicado. Quer recuperá-lo?', 'Recuperar rascunho')){
        data = JSON.parse(s);
        migrate(data);
        setEditing(true);
        commit();
      } else { sessionStorage.removeItem(STASH); }
    }
  } catch (e) {}
}

rebuildDecks();
renderShelf();
renderDeck();
detectOwner();
})();
