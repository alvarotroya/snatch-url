// Snatch URL - popup.js

// --- State ---
// state = { base: URL, segments: string[], entries: { key, value }[] }
let state = null;

// --- URL helpers ---

function parseUrl(url) {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(s => s !== '');
    const entries = [];
    u.searchParams.forEach((value, key) => entries.push({ key, value }));
    return { base: u, segments, entries };
  } catch {
    return null;
  }
}

function buildUrl({ base, segments, entries }) {
  const u = new URL(base.href);
  u.pathname = segments.length ? '/' + segments.join('/') : '/';
  u.search = '';
  entries.forEach(({ key, value }) => u.searchParams.append(key, value));
  return u.href;
}

// --- DOM helpers ---

function $(id) { return document.getElementById(id); }

function showError(msg) {
  const el = $('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
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
    segEl.value = decodeURIComponent(seg);
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
      state.segments[i] = encodeURIComponent(segEl.value.trim());
      updateTabUrl(buildUrl(state));
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(decodeURIComponent(seg))
        .catch(() => showError('Clipboard access denied.'));
    });

    delBtn.addEventListener('click', () => {
      state.segments.splice(idx, 1);
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
      state.entries[idx].key = keyEl.value.trim();
      updateTabUrl(buildUrl(state));
    });

    valEl.addEventListener('change', () => {
      state.entries[idx].value = valEl.value;
      updateTabUrl(buildUrl(state));
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(value).catch(() => showError('Clipboard access denied.'));
    });

    delBtn.addEventListener('click', () => {
      state.entries.splice(idx, 1);
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
      state.entries.length = 0;
      updateTabUrl(buildUrl(state));
      renderQuery();
    };

    $('add-btn').onclick = () => {
      const key = $('new-key').value.trim();
      const value = $('new-value').value;
      if (!key) { showError('Key cannot be empty.'); return; }
      state.entries.push({ key, value });
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
