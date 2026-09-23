// Snatch URL - options.js
//
// The settings page: one textarea holding the host groups, parsed as you
// type and saved on demand. The grammar and the storage are settings.js's;
// this file only moves text between the textarea and the settings.

import { parseGroups, formatGroups, loadSettings, saveSettings } from './settings.js';

const $ = id => document.getElementById(id);

let saved = '';   // the text as last loaded or saved, to say when there is something to save

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Parse the textarea, show any problems, and say what would be saved. */
function check() {
  const { groups, errors } = parseGroups($('groups').value);
  const problems = $('problems');
  problems.replaceChildren();
  for (const e of errors) {
    const row = document.createElement('div');
    row.append(`Line ${e.line}: `);
    const code = document.createElement('code');
    code.textContent = e.text;
    row.append(code, ` - ${e.error}`);
    problems.append(row);
  }
  const hosts = groups.reduce((n, g) => n + g.length, 0);
  const summary = $('summary');
  summary.className = 'summary';
  summary.textContent = groups.length === 0 && errors.length === 0
    ? 'No host groups yet.'
    : `${plural(groups.length, 'group')}, ${plural(hosts, 'host')}`
      + ($('groups').value === saved ? '' : ' - not saved yet');
  $('save-btn').disabled = errors.length > 0;
  return { groups, errors };
}

async function save() {
  const { groups, errors } = check();
  if (errors.length > 0) return;
  const summary = $('summary');
  try {
    const area = await saveSettings(chrome, { groups });
    saved = formatGroups(groups);
    $('groups').value = saved;
    check();
    summary.className = 'summary saved';
    summary.textContent = `Saved: ${plural(groups.length, 'group')}.`;
    showWhere(area);
  } catch (e) {
    summary.className = 'summary failed';
    summary.textContent = `Could not save: ${e.message || e}`;
  }
}

function showWhere(area) {
  $('where').textContent = area === 'sync'
    ? 'Settings are kept in your browser profile\'s synced extension storage, so they follow you to other devices signed in to the same profile.'
    : 'Settings are kept on this device only: synced extension storage is not available here.';
}

async function load() {
  const settings = await loadSettings(chrome);
  saved = formatGroups(settings.groups);
  $('groups').value = saved;
  check();
  // Which area holds them is only known from a write; say the likely one.
  showWhere(chrome.storage && chrome.storage.sync ? 'sync' : 'local');
}

$('groups').addEventListener('input', check);
$('save-btn').addEventListener('click', save);
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); save(); }
});

load();
