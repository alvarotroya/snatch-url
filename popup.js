// Snatch URL - popup.js

import {
  parseUrl,
  buildUrl,
  toJson,
  setSegment,
  deleteSegment,
  setKey,
  setValue,
  deleteEntry,
  addEntry,
  clearEntries,
} from './url-model.js';

// --- State ---
// state is the UrlModel from url-model.js: it holds the raw path and query
// text, so an edit only rewrites the part it touches.
let state = null;

const CANNOT_EDIT = "Can't edit this page.";

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

// One timer for the toast, reset on every message, so the newest message
// always gets its full three seconds instead of inheriting an older timer.
let errorTimer = null;

function showError(msg) {
  const el = $('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => showError('Clipboard access denied.'));
}

/**
 * Push the model to the tab and to the header. Every change goes through
 * here, so the header URL can never drift from the model.
 */
function commit() {
  const url = buildUrl(state);
  showUrl(url);
  updateTabUrl(url);
}

function showUrl(url) {
  const urlBar = $('url-display');
  urlBar.textContent = url;
  urlBar.title = url;
}

/**
 * Apply a model edit made from an input. A rejected edit (a blank key or
 * segment) puts the old text back and shows why, so the URL is never
 * navigated to something the model refused.
 */
function applyEdit(result, input, previousText) {
  if (!result.ok) {
    input.value = previousText;
    showError(result.error);
    return;
  }
  commit();
}

// --- Render path ---

function renderPath() {
  const { segments } = state;
  const list = $('path-list');
  list.innerHTML = '';

  $('path-count').textContent = `${segments.length} segment${segments.length !== 1 ? 's' : ''}`;
  $('no-path').classList.toggle('hidden', segments.length > 0);

  segments.forEach((seg, idx) => {
    const li = document.createElement('li');
    li.className = 'param-row';
    li.dataset.idx = idx;

    const idxEl = document.createElement('span');
    idxEl.className = 'path-index';
    idxEl.textContent = idx;

    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '/';

    const segEl = document.createElement('input');
    segEl.type = 'text';
    segEl.value = seg.text;
    segEl.className = 'param-value path-seg';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-icon';
    copyBtn.title = 'Copy segment';
    copyBtn.textContent = '⎘';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-icon btn-danger';
    delBtn.title = 'Delete segment';
    delBtn.textContent = '✕';

    segEl.addEventListener('change', () => {
      const i = parseInt(li.dataset.idx, 10);
      const previous = state.segments[i].text;
      applyEdit(setSegment(state, i, segEl.value), segEl, previous);
    });

    // Read the input, not the value captured at render time: the row is not
    // re-rendered after an edit, so only the input holds what is on screen.
    copyBtn.addEventListener('click', () => copyToClipboard(segEl.value));

    delBtn.addEventListener('click', () => {
      deleteSegment(state, idx);
      commit();
      renderPath();
    });

    li.append(idxEl, sep, segEl, copyBtn, delBtn);
    list.appendChild(li);
  });
}

// --- Render query ---

function renderQuery() {
  const { entries } = state;
  const list = $('query-list');
  list.innerHTML = '';

  $('query-count').textContent = `${entries.length} param${entries.length !== 1 ? 's' : ''}`;
  $('no-query').classList.toggle('hidden', entries.length > 0);

  entries.forEach(({ key, value }, idx) => {
    const li = document.createElement('li');
    li.className = 'param-row';
    li.dataset.idx = idx;

    const keyEl = document.createElement('input');
    keyEl.type = 'text';
    keyEl.value = key;
    keyEl.className = 'param-key';

    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '=';

    const valEl = document.createElement('input');
    valEl.type = 'text';
    valEl.value = value;
    valEl.className = 'param-value';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-icon';
    copyBtn.title = 'Copy value';
    copyBtn.textContent = '⎘';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-icon btn-danger';
    delBtn.title = 'Delete param';
    delBtn.textContent = '✕';

    keyEl.addEventListener('change', () => {
      const previous = state.entries[idx].key;
      applyEdit(setKey(state, idx, keyEl.value), keyEl, previous);
    });

    valEl.addEventListener('change', () => {
      const previous = state.entries[idx].value;
      applyEdit(setValue(state, idx, valEl.value), valEl, previous);
    });

    copyBtn.addEventListener('click', () => copyToClipboard(valEl.value));

    delBtn.addEventListener('click', () => {
      deleteEntry(state, idx);
      commit();
      renderQuery();
    });

    li.append(keyEl, sep, valEl, copyBtn, delBtn);
    list.appendChild(li);
  });
}

// --- Tab interaction ---

/**
 * `activeTab` does not cover restricted pages such as `chrome://` or the Web
 * Store, and a navigation there fails through `lastError` rather than by
 * throwing, so it has to be read inside the callback or the edit is silent.
 */
function updateTabUrl(newUrl) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (chrome.runtime.lastError || !tab) { showError(CANNOT_EDIT); return; }
    chrome.tabs.update(tab.id, { url: newUrl }, () => {
      if (chrome.runtime.lastError) showError(CANNOT_EDIT);
    });
  });
}

function loadCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.url) { showError('Cannot access this tab.'); return; }

    state = parseUrl(tab.url);
    if (!state) {
      showUrl(tab.url);
      showError('Invalid URL.');
      return;
    }

    showUrl(buildUrl(state));
    renderPath();
    renderQuery();

    $('copy-all-btn').onclick = () => {
      copyToClipboard(JSON.stringify(toJson(state), null, 2));
    };

    $('clear-btn').onclick = () => {
      clearEntries(state);
      commit();
      renderQuery();
    };

    $('add-btn').onclick = () => {
      const result = addEntry(state, $('new-key').value, $('new-value').value);
      if (!result.ok) { showError(result.error); return; }
      commit();
      renderQuery();
      $('new-key').value = '';
      $('new-value').value = '';
    };

    [$('new-key'), $('new-value')].forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') $('add-btn').click(); });
    });
  });
}

document.addEventListener('DOMContentLoaded', loadCurrentTab);
