// Snatch URL - popup.js
//
// The popup as a second address bar. The draft URL is shown as one coloured
// line, one button per part; under it a strip of section cells (host, path,
// query, #) each of which opens a shallow drawer of that section's parts.
// Clicking a part types over it, in the bar or in the drawer.
//
// Every edit goes through draft.js and from there through url-model.js; this
// file never splices URL text. Nothing here navigates the tab except
// applyDraft().

import { tokenizeModel, groupRange, isPunct, ROLE_LABEL } from './url-tokens.js';
import { peel, badgeFor, plainText } from './value-inspect.js';
import { safeDecode, decodeQueryPart, toJson } from './url-model.js';
import {
  createDraft,
  draftUrl,
  rowStatus,
  changeSummary,
  isDirty,
  editSegment,
  editKey,
  editValue,
  addParam,
  discardAdded,
  removeSegment,
  removeEntry,
  clearQuery,
  cleanTracking,
  restoreRemoved,
  revert,
  rebase,
} from './draft.js';

// --- State ---

let draft = null;                 // draft.js: the tab's URL and the edited copy
let tok = { text: '', tokens: [] }; // url-tokens.js, laid over draft.work
let openSection = null;           // 'origin' | 'path' | 'query' | 'hash' | null
let activeId = null;              // the token id of the part being worked on
let peelId = null;                // the token id whose decode stack is unfolded
let decodedView = false;          // show the bar decoded instead of as written
let editing = null;               // the open type-over input, if any

const CANNOT_EDIT = "Can't edit this page.";
const SECTION_NAME = { origin: 'host', path: 'path', query: 'query', hash: 'fragment' };
const EDITABLE = new Set(['seg', 'key', 'val']);

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** An icon button whose accessible name is a sentence, not the glyph (F10). */
function iconButton(glyph, label, className = 'iconb') {
  const btn = el('button', className);
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  const icon = el('span', 'glyph', glyph);
  icon.setAttribute('aria-hidden', 'true');
  btn.append(icon);
  return btn;
}

let toastTimer = null;

function showToast(msg, kind) {
  const node = $('toast');
  node.textContent = msg;
  node.classList.remove('hidden');
  node.classList.toggle('notice', kind === 'notice');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3000);
}

const showError = msg => showToast(msg, 'error');
const showNotice = msg => showToast(msg, 'notice');

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showNotice(`Copied: ${text.length > 60 ? text.slice(0, 60) + '…' : text}`),
    () => showError('Clipboard access denied.'),
  );
}

// --- Tokens over the draft ---

function retokenize() {
  tok = tokenizeModel(draft.work);
}

function tokenById(id) {
  return tok.tokens.find(t => t.id === id) || null;
}

/** Every part (not punctuation), in URL order. */
function parts() {
  return tok.tokens.filter(t => !isPunct(t.role));
}

function isEditable(t) {
  return EDITABLE.has(t.role);
}

/** A part decoded the way its section is: only the query reads `+` as a space. */
function decoderOf(t) {
  return t.group === 'query' ? decodeQueryPart : safeDecode;
}

function layersOf(t) {
  return peel(t.raw, decoderOf(t));
}

function plainOf(t) {
  return plainText(t.raw, decoderOf(t));
}

/** The draft row a token belongs to, for rowStatus and the edit functions. */
function rowOf(t) {
  if (t.role === 'seg') return { kind: 'segment', row: draft.work.segments[t.index] };
  if (t.role === 'key' || t.role === 'val') return { kind: 'entry', row: draft.work.entries[t.index] };
  return null;
}

function statusOf(t) {
  const r = rowOf(t);
  return r ? rowStatus(draft, r.kind, r.row) : 'unchanged';
}

/** The parameter a key or value token belongs to: `key`, `val` (or null). */
function paramOf(index) {
  return {
    key: tok.tokens.find(t => t.role === 'key' && t.index === index),
    val: tok.tokens.find(t => t.role === 'val' && t.index === index) || null,
  };
}

/** A sentence naming a part, for aria-labels. */
function describe(t) {
  if (t.role === 'seg') return `path segment ${t.index + 1}`;
  if (t.role === 'key') return `name of parameter ${t.index + 1}`;
  if (t.role === 'val') return `value of ${paramOf(t.index).key.text || `parameter ${t.index + 1}`}`;
  return ROLE_LABEL[t.role];
}

// --- Render ---

/**
 * The bar: the draft URL as text, every part a button. Rebuilt whole - it is
 * a few dozen spans - and the focused part is put back by its key.
 */
function renderBar() {
  const line = $('url-line');
  line.replaceChildren();

  let sect = null;
  let current = null;
  const firstPart = parts()[0];

  for (const t of tok.tokens) {
    if (t.group !== current) {
      current = t.group;
      sect = el('span', `sect${openSection === current ? ' on' : ''}`);
      sect.dataset.section = current;
      line.append(sect);
    }
    if (isPunct(t.role)) {
      sect.append(el('span', `r-${t.role}`, t.raw));
      continue;
    }
    const shown = t.role === 'hash' ? `#${t.text}` : t.text;
    const part = el('span', `pt r-${t.role}`, decodedView ? shown : t.raw);
    part.dataset.id = t.id;
    part.dataset.fk = `pt:${t.id}`;
    part.setAttribute('role', 'button');
    // Roving tabindex: one part is in the tab order, arrows move between them.
    part.tabIndex = (activeId ? t.id === activeId : t === firstPart) ? 0 : -1;
    const editable = isEditable(t);
    part.classList.toggle('readonly', !editable);
    part.setAttribute('aria-label', editable
      ? `Edit ${describe(t)}: ${t.text}`
      : `${describe(t)}: ${t.text}, opens the ${SECTION_NAME[t.group]} section`);
    part.title = ROLE_LABEL[t.role];
    if (statusOf(t) !== 'unchanged') part.classList.add('changed');
    if (t.id === activeId) part.classList.add('on');
    sect.append(part);
  }
}

function renderStrip() {
  const counts = {
    origin: tok.tokens.filter(t => t.group === 'origin' && !isPunct(t.role)).length,
    path: draft.work.segments.length,
    query: draft.work.entries.length,
    hash: tok.tokens.filter(t => t.role === 'hash').length,
  };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const host = tok.tokens.find(t => t.role === 'host');
  const hash = tok.tokens.find(t => t.role === 'hash');
  const label = {
    origin: host ? host.text : '',
    path: plural(counts.path, 'segment'),
    query: plural(counts.query, 'param'),
    hash: hash ? hash.text : 'none',
  };
  for (const cell of document.querySelectorAll('.cell')) {
    const key = cell.dataset.section;
    $(`cell-${key}`).textContent = label[key];
    cell.classList.toggle('on', openSection === key);
    cell.classList.toggle('empty', counts[key] === 0);
    cell.setAttribute('aria-expanded', String(openSection === key));
  }
}

function rowActions(t, canPeel, canDelete) {
  const acts = el('span', 'acts');
  const what = describe(t);
  if (canPeel) {
    const peelBtn = iconButton('⌄', `Look inside ${what}`);
    peelBtn.dataset.act = 'peel';
    peelBtn.dataset.id = t.id;
    peelBtn.dataset.fk = `act:peel:${t.id}`;
    peelBtn.setAttribute('aria-expanded', String(peelId === t.id));
    acts.append(peelBtn);
  }
  const copyBtn = iconButton('⎘', `Copy ${what}`);
  copyBtn.dataset.act = 'copy';
  copyBtn.dataset.id = t.id;
  copyBtn.dataset.fk = `act:copy:${t.id}`;
  acts.append(copyBtn);
  if (canDelete) {
    const delBtn = iconButton('✕', t.role === 'seg' ? `Delete ${what}` : `Delete parameter ${paramOf(t.index).key.text}`, 'iconb danger');
    delBtn.dataset.act = 'del';
    delBtn.dataset.id = t.id;
    delBtn.dataset.fk = `act:del:${t.id}`;
    acts.append(delBtn);
  }
  return acts;
}

/** A clickable field in a drawer row: editable parts type over, others just select. */
function field(t, className) {
  const editable = isEditable(t);
  const span = el('span', `${className}${editable ? '' : ' ro'}`, t.role === 'key' ? t.text : plainOf(t));
  if (editable) {
    span.dataset.edit = t.id;
    span.dataset.fk = `ed:${t.id}`;
    span.setAttribute('role', 'button');
    span.tabIndex = 0;
    span.setAttribute('aria-label', `Edit ${describe(t)}: ${t.text}`);
  }
  return span;
}

function badge(t) {
  const kind = badgeFor(t.raw, decoderOf(t));
  if (!kind) return null;
  const b = el('span', `badge ${kind}`, kind === 'encoded' ? '%' : kind);
  b.title = { encoded: 'percent-encoded', url: 'a URL inside the value', base64: 'base64', json: 'JSON', jwt: 'a JWT' }[kind];
  return b;
}

function simpleRow(t, n) {
  const row = el('div', 'drow');
  row.dataset.id = t.id;
  if (statusOf(t) !== 'unchanged') row.classList.add('changed');
  if (activeId === t.id) row.classList.add('on');
  row.append(el('span', 'n', String(n)), field(t, `v${t.role === 'seg' ? ' seg' : ''}`));
  const b = badge(t);
  if (b) row.append(b);
  row.append(rowActions(t, layersOf(t).length > 1, t.role === 'seg'));
  return [row, peelId === t.id ? peelBox(t) : null];
}

function paramRow(index, n) {
  const { key, val } = paramOf(index);
  const t = val || key;
  const row = el('div', 'drow');
  row.dataset.id = t.id;
  if (statusOf(key) !== 'unchanged') row.classList.add('changed');
  if (activeId === key.id || (val && activeId === val.id)) row.classList.add('on');
  row.append(el('span', 'n', String(n)), field(key, 'k'));
  if (val) {
    row.append(el('span', 'eq', '='), field(val, 'v'));
    const b = badge(val);
    if (b) row.append(b);
  } else {
    row.append(el('span', 'eq none', 'no value'), el('span', 'v'));
  }
  row.append(rowActions(t, !!(val && layersOf(val).length > 1), true));
  return [row, val && peelId === val.id ? peelBox(val) : null];
}

/** A staged deletion: struck through, with its Restore button (F3). */
function ghostRow(removed) {
  const row = el('div', 'drow removed');
  row.append(el('span', 'n', ''), el('span', 'gone', removed.label));
  const acts = el('span', 'acts');
  const restore = iconButton('↩', `Restore ${removed.label}`);
  restore.dataset.act = 'restore';
  restore.dataset.uid = removed.uid;
  restore.dataset.fk = `restore:${removed.uid}`;
  acts.append(restore);
  row.append(acts);
  return row;
}

function peelBox(t) {
  const layers = layersOf(t);
  const box = el('div', 'peelbox');
  layers.forEach((layer, i) => {
    const lbl = el('div', 'lbl', layer.label);
    if (layer.isUrl) lbl.append(el('span', 'badge url', 'nested url'));
    const pre = el('pre', i === layers.length - 1 ? 'last' : '', layer.text);
    box.append(lbl, pre);
  });
  const tools = el('div', 'peel-tools');
  const copyBtn = el('button', 'btn btn-sm', 'Copy decoded');
  copyBtn.type = 'button';
  copyBtn.dataset.act = 'copy-plain';
  copyBtn.dataset.id = t.id;
  copyBtn.dataset.fk = `act:copy-plain:${t.id}`;
  tools.append(copyBtn);
  if (isEditable(t)) {
    const editBtn = el('button', 'btn btn-sm', 'Edit');
    editBtn.type = 'button';
    editBtn.dataset.act = 'edit';
    editBtn.dataset.id = t.id;
    editBtn.dataset.fk = `act:edit:${t.id}`;
    editBtn.title = 'Type over the decoded value; it is re-encoded when you commit';
    tools.append(editBtn);
  }
  box.append(tools);
  return box;
}

function renderDrawer() {
  const box = $('drawer');
  box.replaceChildren();
  if (!openSection) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  const rows = [];
  if (openSection === 'query') {
    draft.work.entries.forEach((_, i) => rows.push(...paramRow(i, i + 1)));
  } else {
    tok.tokens.filter(t => t.group === openSection && !isPunct(t.role))
      .forEach((t, i) => rows.push(...simpleRow(t, i + 1)));
  }
  const ghosts = draft.removed
    .filter(r => r.kind === (openSection === 'path' ? 'segment' : openSection === 'query' ? 'entry' : ''))
    .map(ghostRow);
  const live = rows.filter(r => r && r.classList.contains('drow')).length;

  const head = el('div', 'drawer-head');
  head.append(el('span', 't', SECTION_NAME[openSection]));
  const sub = el('span', 'sub');
  const unit = openSection === 'query' ? 'param' : 'part';
  sub.textContent = `${live} ${unit}${live === 1 ? '' : 's'}`
    + (ghosts.length ? ` · ${ghosts.length} removed` : '')
    + (openSection === 'origin' || openSection === 'hash' ? '' : ' · click a part to type over it');
  head.append(sub);
  const copyRaw = el('button', 'btn btn-sm', '⎘ Copy section');
  copyRaw.type = 'button';
  copyRaw.dataset.sec = 'copy';
  copyRaw.setAttribute('aria-label', `Copy the ${SECTION_NAME[openSection]} section as written`);
  const copyPlain = el('button', 'btn btn-sm', '⎘ Copy decoded');
  copyPlain.type = 'button';
  copyPlain.dataset.sec = 'copy-plain';
  copyPlain.setAttribute('aria-label', `Copy the ${SECTION_NAME[openSection]} section decoded`);
  head.append(copyRaw, copyPlain);
  if (openSection === 'query') {
    const copyJson = el('button', 'btn btn-sm', '{} Copy All');
    copyJson.type = 'button';
    copyJson.dataset.sec = 'copy-json';
    copyJson.setAttribute('aria-label', 'Copy every path segment and parameter as JSON');
    head.append(copyJson);
    const clear = el('button', 'btn btn-sm btn-danger', 'Clear');
    clear.type = 'button';
    clear.dataset.sec = 'clear';
    clear.setAttribute('aria-label', 'Clear all query parameters');
    head.append(clear);
  }
  box.append(head);

  for (const r of rows) if (r) box.append(r);
  for (const g of ghosts) box.append(g);
  if (live + ghosts.length === 0) box.append(el('div', 'hint', 'Nothing here.'));
}

/** The status bar: everything outside the bar and drawer that follows the draft. */
function renderChrome() {
  const dirty = isDirty(draft);
  $('change-summary').textContent = changeSummary(draft);
  $('status-bar').classList.toggle('dirty', dirty);
  for (const id of ['apply-btn', 'apply-new-btn', 'revert-btn']) $(id).disabled = !dirty;
}

/**
 * Rebuild everything from the draft. Whatever had focus is refocused by its
 * key afterwards, so committing an edit with Tab or Enter does not drop the
 * keyboard user on the floor.
 */
function render(focusKey = document.activeElement?.dataset?.fk) {
  renderPending = false;
  retokenize();
  renderBar();
  renderStrip();
  renderDrawer();
  renderChrome();
  if (focusKey) {
    const target = document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (target) target.focus({ preventScroll: true });
  }
}

// A blur commit must not rebuild the DOM under a click that is still in
// flight (mousedown blurred the input, click has not fired yet), so it
// schedules the render instead; a render in between cancels it.
let renderPending = false;
function scheduleRender(focusKey) {
  renderPending = true;
  setTimeout(() => { if (renderPending) render(focusKey); }, 0);
}

/** Cheap highlight update when only the active part changed. */
function markActive() {
  for (const node of document.querySelectorAll('.pt, .drow')) {
    node.classList.toggle('on', node.dataset.id === activeId);
  }
  for (const node of document.querySelectorAll('.pt')) {
    node.tabIndex = node.dataset.id === activeId ? 0 : -1;
  }
}

// --- Edits ---

/**
 * Stage what was typed over a part. Nothing typed is nothing staged, so
 * clicking a part and clicking away leaves the URL byte for byte alone; a
 * rejected edit (a blank key or segment) is explained and the old text stays.
 */
function commitEdit(t, text) {
  if (text === t.text) return true;
  const result = t.role === 'seg' ? editSegment(draft, t.index, text)
    : t.role === 'key' ? editKey(draft, t.index, text)
      : editValue(draft, t.index, text);
  if (!result.ok) showError(result.error);
  return result.ok;
}

/**
 * Type over a part, in the bar or in the drawer: the part's span becomes an
 * input with its decoded text pre-selected. Enter commits, Escape cancels,
 * blur commits; Ctrl+Enter commits and applies.
 */
function editPart(id, where, { then, initial, cancel } = {}) {
  const t = tokenById(id);
  if (!t || !isEditable(t)) return;
  if (editing) editing.finish(true);
  const host = where === 'bar'
    ? $('url-line').querySelector(`.pt[data-id="${CSS.escape(id)}"]`)
    : $('drawer').querySelector(`[data-edit="${CSS.escape(id)}"]`);
  if (!host) return;

  const input = el('input', 'type-over');
  input.type = 'text';
  input.value = initial ?? t.text;
  input.size = Math.max(4, Math.min(80, input.value.length + 1));
  input.setAttribute('aria-label', `Edit ${describe(t)}`);
  input.dataset.fk = host.dataset.fk;
  host.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (ok, { focusKey = host.dataset.fk, defer = false, apply = false, chain = false } = {}) => {
    if (done) return;
    done = true;
    editing = null;
    const cancelled = !!cancel && (!ok || input.value.trim() === '');
    if (cancelled) cancel();
    const staged = !cancelled && ok && commitEdit(t, input.value);
    if (defer) scheduleRender(focusKey); else render(focusKey);
    if (staged && apply) applyDraft('current');
    // Only Enter carries on to the next step; clicking away means away.
    if (!cancelled && ok && chain && then) then(staged);
  };
  editing = { finish };

  input.addEventListener('blur', e => finish(true, { focusKey: e.relatedTarget?.dataset?.fk, defer: true }));
  input.addEventListener('input', () => { input.size = Math.max(4, Math.min(80, input.value.length + 1)); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true, { apply: e.ctrlKey || e.metaKey, chain: true }); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

/**
 * Delete the part's row - the whole parameter for a key or a value. Focus
 * lands on the part that now sits where the deleted one was, in the bar or
 * in the drawer, so a keyboard user can keep going without re-aiming.
 */
function deletePart(t, where = 'bar') {
  const r = rowOf(t);
  if (!r) return;
  const before = parts();
  const at = before.indexOf(t.role === 'val' ? paramOf(t.index).key : t);
  if (r.kind === 'segment') removeSegment(draft, t.index); else removeEntry(draft, t.index);
  openSection = t.group;
  peelId = null;
  retokenize();
  const after = parts();
  const next = after[Math.min(at, after.length - 1)];
  activeId = next ? next.id : null;
  const key = next && where === 'drawer' && next.group === openSection ? `ed:${next.id}`
    : next && where === 'bar' ? `pt:${next.id}`
      : `cell:${openSection}`;
  render(key);
}

function copySection(mode) {
  const range = groupRange(tok.tokens, openSection);
  if (!range) { showError('Nothing to copy.'); return; }
  if (mode === 'copy') { copyToClipboard(tok.text.slice(range.start, range.end)); return; }
  if (mode === 'copy-json') { copyToClipboard(JSON.stringify(toJson(draft.work), null, 2)); return; }
  // The section as it reads, not as it is written: every part decoded,
  // punctuation left alone.
  copyToClipboard(tok.tokens
    .filter(t => t.group === openSection)
    .map(t => (isPunct(t.role) ? t.raw : plainOf(t)))
    .join(''));
}

/**
 * + param: a `key=value` placeholder is staged at the end of the query and
 * the drawer opens with an empty name armed for typing; committing the name
 * arms the value. Escaping, or leaving the name empty, takes the placeholder
 * back out, so nothing is staged.
 */
function addParamFlow() {
  const result = addParam(draft, 'key', 'value');
  if (!result.ok) { showError(result.error); return; }
  const index = draft.work.entries.length - 1;
  openSection = 'query';
  peelId = null;
  activeId = `key-${index}`;
  render();
  editPart(`key-${index}`, 'drawer', {
    initial: '',
    cancel: () => { discardAdded(draft, index); activeId = null; },
    then: () => { activeId = `val-${index}`; render(); editPart(`val-${index}`, 'drawer'); },
  });
}

function clean() {
  const { count } = cleanTracking(draft);
  if (count === 0) { showNotice('No tracking parameters to strip.'); return; }
  openSection = 'query';
  activeId = null;
  peelId = null;
  render();
  showNotice(`Stripped ${count} tracking parameter${count === 1 ? '' : 's'} - Restore or Revert puts them back.`);
}

function setActive(id, { open = true } = {}) {
  activeId = id;
  const t = tokenById(id);
  if (open && t) openSection = t.group;
  render(`pt:${id}`);
}

// --- Interaction ---

function bindBar() {
  const line = $('url-line');

  line.addEventListener('click', e => {
    // A dragged text selection in the bar is the user's; a rebuild would
    // destroy it, and the copy they are about to make with it.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && line.contains(sel.anchorNode)) return;

    const part = e.target.closest('.pt');
    if (part) {
      const t = tokenById(part.dataset.id);
      if (!t) return;
      activeId = t.id;
      openSection = t.group;
      peelId = null;
      render();
      if (isEditable(t)) editPart(t.id, 'bar');
      return;
    }
    const sect = e.target.closest('.sect');
    if (sect) {
      openSection = openSection === sect.dataset.section ? null : sect.dataset.section;
      activeId = null;
      render();
    }
  });

  line.addEventListener('mouseover', e => {
    const sect = e.target.closest('.sect');
    for (const s of line.querySelectorAll('.sect.hot')) s.classList.remove('hot');
    if (sect) sect.classList.add('hot');
  });
  line.addEventListener('mouseleave', () => {
    for (const s of line.querySelectorAll('.sect.hot')) s.classList.remove('hot');
  });

  // Tabbing into the bar lands on one part; from there the arrows move.
  line.addEventListener('focusin', e => {
    const part = e.target.closest('.pt');
    if (part && part.dataset.id !== activeId) { activeId = part.dataset.id; markActive(); }
  });

  line.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const list = parts();
    const at = list.findIndex(t => t.id === activeId);
    const go = t => { if (t) setActive(t.id, { open: openSection !== null }); };
    if (e.key === 'ArrowRight' && !e.altKey) { e.preventDefault(); go(list[Math.min(list.length - 1, at + 1)]); }
    else if (e.key === 'ArrowLeft' && !e.altKey) { e.preventDefault(); go(list[Math.max(0, at - 1)]); }
    else if (e.key === 'Home') { e.preventDefault(); go(list[0]); }
    else if (e.key === 'End') { e.preventDefault(); go(list[list.length - 1]); }
    else if ((e.key === 'Enter' || e.key === ' ') && activeId && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const t = tokenById(activeId);
      if (!t) return;
      openSection = t.group;
      peelId = null;
      render();
      if (isEditable(t)) editPart(t.id, 'bar');
    }
  });
}

function bindStrip() {
  $('strip').addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    openSection = openSection === cell.dataset.section ? null : cell.dataset.section;
    activeId = null;
    peelId = null;
    render();
  });
  $('clean-btn').addEventListener('click', clean);
  $('add-btn').addEventListener('click', addParamFlow);
}

function bindDrawer() {
  const drawer = $('drawer');

  const act = (btn) => {
    const name = btn.dataset.act;
    if (name === 'restore') { restoreRemoved(draft, btn.dataset.uid); render(); return; }
    const t = tokenById(btn.dataset.id);
    if (!t) return;
    if (name === 'copy') copyToClipboard(t.raw);
    else if (name === 'copy-plain') copyToClipboard(plainOf(t));
    else if (name === 'del') deletePart(t, 'drawer');
    else if (name === 'peel') { peelId = peelId === t.id ? null : t.id; activeId = t.id; render(`act:peel:${t.id}`); }
    else if (name === 'edit') { activeId = t.id; render(); editPart(t.id, 'drawer'); }
  };

  drawer.addEventListener('click', e => {
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      if (sec.dataset.sec === 'clear') {
        if (draft.work.entries.length === 0) { showError('No query parameters to clear.'); return; }
        clearQuery(draft);
        activeId = null;
        peelId = null;
        render();
        showNotice('Cleared - use Restore or Revert to undo.');
      } else {
        copySection(sec.dataset.sec);
      }
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn) { act(btn); return; }

    const fieldEl = e.target.closest('[data-edit]');
    if (fieldEl) { activeId = fieldEl.dataset.edit; markActive(); editPart(fieldEl.dataset.edit, 'drawer'); return; }

    const row = e.target.closest('.drow:not(.removed)');
    if (row) { activeId = row.dataset.id; markActive(); }
  });

  drawer.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const fieldEl = e.target.closest('[data-edit]');
    if (fieldEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      activeId = fieldEl.dataset.edit;
      editPart(fieldEl.dataset.edit, 'drawer');
    }
  });
}

function bindKeys() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); applyDraft('current'); return; }

    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const list = parts();
      const at = list.findIndex(t => t.id === activeId);
      const next = list[Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))];
      if (next) setActive(next.id);
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && activeId) {
      const t = tokenById(activeId);
      if (t && isEditable(t)) { e.preventDefault(); deletePart(t); }
      return;
    }
    if (e.key === 'Escape' && (openSection || activeId)) {
      e.preventDefault();
      openSection = null;
      activeId = null;
      peelId = null;
      render();
    }
  });
}

function bindChrome() {
  $('oneline-btn').addEventListener('click', () => {
    const on = $('url-line').classList.toggle('oneline');
    $('oneline-btn').setAttribute('aria-pressed', String(on));
  });
  $('decoded-btn').addEventListener('click', () => {
    decodedView = !decodedView;
    $('decoded-btn').setAttribute('aria-pressed', String(decodedView));
    render();
  });
  $('copy-url-btn').addEventListener('click', () => copyToClipboard(draftUrl(draft)));
  $('apply-btn').addEventListener('click', () => applyDraft('current'));
  $('apply-new-btn').addEventListener('click', () => applyDraft('new'));
  $('revert-btn').addEventListener('click', () => {
    revert(draft);
    activeId = null;
    peelId = null;
    render();
    showNotice('Reverted.');
  });
}

// --- Tab interaction ---

/**
 * `activeTab` does not cover restricted pages such as `chrome://` or the Web
 * Store, and a navigation there fails through `lastError` rather than by
 * throwing, so it has to be read inside the callback or the edit is silent.
 */
function navigateTab(newUrl, done) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (chrome.runtime.lastError || !tab) { showError(CANNOT_EDIT); return; }
    chrome.tabs.update(tab.id, { url: newUrl }, () => {
      if (chrome.runtime.lastError) { showError(CANNOT_EDIT); return; }
      done();
    });
  });
}

/**
 * The only place the draft leaves the popup.
 *
 * Applying to this tab rebases the draft, so the popup - which stays open -
 * shows no outstanding changes afterwards. Applying in a new tab leaves the
 * draft staged, because this tab is still on the old URL.
 */
function applyDraft(where) {
  if (!isDirty(draft)) return;
  const url = draftUrl(draft);

  if (where === 'new') {
    chrome.tabs.create({ url }, () => {
      if (chrome.runtime.lastError) { showError('Could not open a new tab.'); return; }
      showNotice('Opened in a new tab.');
    });
    return;
  }

  navigateTab(url, () => {
    rebase(draft);
    activeId = null;
    peelId = null;
    render();
    showNotice('Applied.');
  });
}

function loadCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.url) { showError('Cannot access this tab.'); return; }

    draft = createDraft(tab.url);
    if (!draft) {
      $('url-line').textContent = tab.url;
      showError('Invalid URL.');
      return;
    }

    render();
    bindBar();
    bindStrip();
    bindDrawer();
    bindKeys();
    bindChrome();
  });
}

document.addEventListener('DOMContentLoaded', loadCurrentTab);
