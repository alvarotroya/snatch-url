// Snatch URL - popup.js

import {
  parseUrl,
  buildUrl,
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

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const el = $('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
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
  updateTabUrl(buildUrl(state));
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

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(seg.text)
        .catch(() => showError('Clipboard access denied.'));
    });

    delBtn.addEventListener('click', () => {
      deleteSegment(state, idx);
      updateTabUrl(buildUrl(state));
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

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).catch(() => showError('Clipboard access denied.'));
    });

    delBtn.addEventListener('click', () => {
      deleteEntry(state, idx);
      updateTabUrl(buildUrl(state));
      renderQuery();
    });

    li.append(keyEl, sep, valEl, copyBtn, delBtn);
    list.appendChild(li);
  });
}

// --- Tab interaction ---

function updateTabUrl(newUrl) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.update(tab.id, { url: newUrl });
  });
}

function loadCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.url) { showError('Cannot access this tab.'); return; }

    const urlBar = $('url-display');
    try {
      const u = new URL(tab.url);
      urlBar.textContent = u.hostname + u.pathname;
      urlBar.title = tab.url;
    } catch {
      urlBar.textContent = tab.url;
    }

    state = parseUrl(tab.url);
    if (!state) { showError('Invalid URL.'); return; }

    renderPath();
    renderQuery();

    $('copy-all-btn').onclick = () => {
      const obj = Object.fromEntries(state.entries.map(({ key, value }) => [key, value]));
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2))
        .catch(() => showError('Clipboard access denied.'));
    };

    $('clear-btn').onclick = () => {
      clearEntries(state);
      updateTabUrl(buildUrl(state));
      renderQuery();
    };

    $('add-btn').onclick = () => {
      const result = addEntry(state, $('new-key').value, $('new-value').value);
      if (!result.ok) { showError(result.error); return; }
      updateTabUrl(buildUrl(state));
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
