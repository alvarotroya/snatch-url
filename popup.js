// Snatch URL - popup.js

import { toJson } from './url-model.js';
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
  removeSegment,
  removeEntry,
  clearQuery,
  restoreRemoved,
  revert,
  rebase,
} from './draft.js';

// --- State ---
// The draft (draft.js) holds both the URL the tab is on and the edited copy.
// Nothing here navigates the tab except applyDraft().
let draft = null;

const CANNOT_EDIT = "Can't edit this page.";

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** An icon button whose accessible name is a sentence, not the glyph (F10). */
function iconButton(glyph, label, className = 'btn btn-icon') {
  const btn = el('button', className);
  btn.setAttribute('aria-label', label);
  btn.title = label;
  const icon = el('span', 'glyph', glyph);
  icon.setAttribute('aria-hidden', 'true');
  btn.append(icon);
  return btn;
}

// One timer for the toast, reset on every message, so the newest message
// always gets its full three seconds instead of inheriting an older timer.
let toastTimer = null;

function showToast(msg, kind) {
  const node = $('error-msg');
  node.textContent = msg;
  node.classList.remove('hidden');
  node.classList.toggle('notice', kind === 'notice');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3000);
}

const showError = msg => showToast(msg, 'error');
const showNotice = msg => showToast(msg, 'notice');

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => showError('Clipboard access denied.'));
}

// --- Render ---

/**
 * The header URL and the status bar: everything outside the rows that has to
 * follow the draft. Typing in a field only ever redraws this much, because a
 * full re-render would destroy the input the user is tabbing out of.
 */
function renderChrome() {
  const url = draftUrl(draft);
  const urlBar = $('url-display');
  urlBar.textContent = url;
  urlBar.title = url;

  const dirty = isDirty(draft);
  urlBar.classList.toggle('staged', dirty);
  $('change-summary').textContent = changeSummary(draft);
  $('status-bar').classList.toggle('dirty', dirty);
  for (const id of ['apply-btn', 'apply-new-btn', 'revert-btn']) $(id).disabled = !dirty;
}

function render() {
  renderPath();
  renderQuery();
  renderChrome();
}

/**
 * Stage an edit made in an input. A rejected edit (a blank key or segment)
 * puts the old text back and shows why, so a refused value never reaches the
 * draft - and nothing navigates either way.
 */
function stage(result, input, previousText, row, kind, modelRow) {
  if (!result.ok) {
    input.value = previousText;
    showError(result.error);
    return false;
  }
  row.className = `param-row row-${rowStatus(draft, kind, modelRow)}`;
  renderChrome();
  return true;
}

/** Enter applies the draft; the plain change event only stages it (F3). */
function applyOnEnter(input, stageEdit) {
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (stageEdit()) applyDraft('current');
  });
}

/** A staged deletion, still on screen and still restorable. */
function ghostRow(removed, indexLabel) {
  const li = el('li', 'param-row row-removed');
  if (indexLabel !== undefined) li.append(el('span', 'path-index', indexLabel));
  li.append(el('span', 'removed-text', removed.label));

  const restore = iconButton('↩', `Restore ${removed.label}`, 'btn btn-sm');
  restore.addEventListener('click', () => { restoreRemoved(draft, removed.uid); render(); });
  li.append(restore);
  return li;
}

/** Appends the staged deletions of one kind; returns how many there were. */
function ghostsFor(kind, list) {
  const ghosts = draft.removed.filter(r => r.kind === kind);
  for (const removed of ghosts) {
    list.appendChild(ghostRow(removed, kind === 'segment' ? removed.index : undefined));
  }
  return ghosts.length;
}

function renderPath() {
  const { segments } = draft.work;
  const list = $('path-list');
  list.innerHTML = '';

  $('path-count').textContent = `${segments.length} segment${segments.length !== 1 ? 's' : ''}`;

  segments.forEach((seg, idx) => {
    const li = el('li', `param-row row-${rowStatus(draft, 'segment', seg)}`);
    li.dataset.idx = idx;

    const segEl = el('input');
    segEl.type = 'text';
    segEl.value = seg.text;
    segEl.className = 'param-value path-seg';
    segEl.setAttribute('aria-label', `Path segment ${idx + 1}`);

    // Read the input, not the value captured at render time: the row is not
    // re-rendered after an edit, so only the input holds what is on screen.
    const copyBtn = iconButton('⎘', `Copy path segment ${idx + 1}`);
    copyBtn.addEventListener('click', () => copyToClipboard(segEl.value));

    const delBtn = iconButton('✕', `Delete path segment ${idx + 1}`, 'btn btn-icon btn-danger');
    delBtn.addEventListener('click', () => {
      removeSegment(draft, Number(li.dataset.idx));
      render();
    });

    const stageSegment = () => {
      const i = Number(li.dataset.idx);
      const previous = draft.work.segments[i].text;
      const result = editSegment(draft, i, segEl.value);
      return stage(result, segEl, previous, li, 'segment', draft.work.segments[i]);
    };
    segEl.addEventListener('change', stageSegment);
    applyOnEnter(segEl, stageSegment);

    const sep = el('span', 'sep', '/');
    sep.setAttribute('aria-hidden', 'true');
    li.append(el('span', 'path-index', idx), sep, segEl, copyBtn, delBtn);
    list.appendChild(li);
  });

  const ghosts = ghostsFor('segment', list);
  $('no-path').classList.toggle('hidden', segments.length + ghosts > 0);
}

function renderQuery() {
  const { entries } = draft.work;
  const list = $('query-list');
  list.innerHTML = '';

  $('query-count').textContent = `${entries.length} param${entries.length !== 1 ? 's' : ''}`;

  entries.forEach((entry, idx) => {
    const li = el('li', `param-row row-${rowStatus(draft, 'entry', entry)}`);
    li.dataset.idx = idx;

    const keyEl = el('input');
    keyEl.type = 'text';
    keyEl.value = entry.key;
    keyEl.className = 'param-key';
    keyEl.setAttribute('aria-label', `Parameter ${idx + 1} name`);

    const valEl = el('input');
    valEl.type = 'text';
    valEl.value = entry.value;
    valEl.className = 'param-value';
    valEl.setAttribute('aria-label', `Value of parameter ${entry.key || idx + 1}`);

    const copyBtn = iconButton('⎘', `Copy value of parameter ${entry.key || idx + 1}`);
    copyBtn.addEventListener('click', () => copyToClipboard(valEl.value));

    const delBtn = iconButton('✕', `Delete parameter ${entry.key || idx + 1}`, 'btn btn-icon btn-danger');
    delBtn.addEventListener('click', () => {
      removeEntry(draft, Number(li.dataset.idx));
      render();
    });

    const stageKey = () => {
      const i = Number(li.dataset.idx);
      const previous = draft.work.entries[i].key;
      const result = editKey(draft, i, keyEl.value);
      return stage(result, keyEl, previous, li, 'entry', draft.work.entries[i]);
    };
    const stageValue = () => {
      const i = Number(li.dataset.idx);
      const previous = draft.work.entries[i].value;
      const result = editValue(draft, i, valEl.value);
      return stage(result, valEl, previous, li, 'entry', draft.work.entries[i]);
    };
    keyEl.addEventListener('change', stageKey);
    valEl.addEventListener('change', stageValue);
    applyOnEnter(keyEl, stageKey);
    applyOnEnter(valEl, stageValue);

    const sep = el('span', 'sep', '=');
    sep.setAttribute('aria-hidden', 'true');
    li.append(keyEl, sep, valEl, copyBtn, delBtn);
    list.appendChild(li);
  });

  const ghosts = ghostsFor('entry', list);
  $('no-query').classList.toggle('hidden', entries.length + ghosts > 0);
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

  navigateTab(url, () => { rebase(draft); render(); });
}

function loadCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.url) { showError('Cannot access this tab.'); return; }

    draft = createDraft(tab.url);
    if (!draft) {
      $('url-display').textContent = tab.url;
      showError('Invalid URL.');
      return;
    }

    render();

    $('copy-all-btn').onclick = () => {
      copyToClipboard(JSON.stringify(toJson(draft.work), null, 2));
    };

    // Staged, so the rows stay on screen struck through with a Restore
    // button each: that is Clear All's undo (F3).
    $('clear-btn').onclick = () => {
      if (draft.work.entries.length === 0) { showError('No query parameters to clear.'); return; }
      clearQuery(draft);
      render();
      showNotice('Cleared - use Restore or Revert to undo.');
    };

    $('add-btn').onclick = () => {
      const result = addParam(draft, $('new-key').value, $('new-value').value);
      if (!result.ok) { showError(result.error); return; }
      render();
      $('new-key').value = '';
      $('new-value').value = '';
      $('new-key').focus();
    };

    $('apply-btn').onclick = () => applyDraft('current');
    $('apply-new-btn').onclick = () => applyDraft('new');
    $('revert-btn').onclick = () => { revert(draft); render(); };

    [$('new-key'), $('new-value')].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') $('add-btn').click(); });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadCurrentTab);
