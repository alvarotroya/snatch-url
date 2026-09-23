// Snatch URL - docs/demo/demo.js
//
// The mock browser around the real popup: a fake tab, a stub for the three
// chrome.tabs calls popup.js makes, and a log of what the popup asked for.
// See index.html for what the demo can and cannot show.

// The review's three sample URLs (docs/ux-review/src/proto-core.js).
const SAMPLES = {
  short: 'https://example.com/docs/guide?page=2',
  typical:
    'https://shop.example.com:8443/eu/catalog/women%27s%20shoes/item'
    + '?q=running%20shoes&sort=price_desc&tags=sale,new'
    + '&ref=https%3A%2F%2Fpartner.io%2Fgo%3Fcid%3D42%26utm%3Demail'
    + '&debug&tag=a&tag=b#reviews',
  monster:
    'https://analytics.example.co.uk:8443/v2/reports/2026/q3/campaign%20roll-up/export'
    + '?state=eyJ1c2VyIjoiYWx2YXJvIiwicm9sZSI6ImFkbWluIiwic2NvcGUiOlsicmVhZCIsIndyaXRlIl19'
    + '&filters=country%3Ade%2Ces%7Cdevice%3Amobile%7Cplan%3Apro%2Cteam'
    + '&from=2026-07-01&to=2026-09-30&granularity=week&currency=EUR'
    + '&next=https%3A%2F%2Fapp.example.co.uk%2Fdash%3Ftab%3Dspend%26range%3D90d'
    + '&utm_source=newsletter&utm_medium=email&utm_campaign=q3%20wrap&debug#panel-spend',
};

const $ = id => document.getElementById(id);
let tabUrl = SAMPLES.monster;

function log(kind, text) {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = text;
  $('log').append(li);
  li.scrollIntoView({ block: 'nearest' });
}

function showTab() {
  $('omni-url').textContent = tabUrl;
  try {
    $('tab-title').textContent = new URL(tabUrl).hostname;
  } catch {
    $('tab-title').textContent = 'Snatch URL demo';
  }
}

/**
 * Exactly the three calls popup.js makes, answered from the fake tab.
 * `chrome.runtime.lastError` stays undefined, so nothing is ever refused.
 */
window.snatchDemo = {
  chromeStub() {
    return {
      runtime: {},
      tabs: {
        query(_query, cb) { cb([{ id: 1, url: tabUrl }]); },
        update(_id, { url }, cb) {
          tabUrl = url;
          showTab();
          log('nav', `tabs.update → ${url}`);
          cb();
        },
        create({ url }, cb) {
          log('new', `tabs.create → ${url}`);
          cb();
        },
      },
    };
  },
};

let popupHtml = null;

/** Open the popup as the toolbar icon would: a fresh document on the current tab. */
async function openPopup() {
  if (popupHtml === null) {
    const res = await fetch('../../popup.html');
    if (!res.ok) { log('', `could not load popup.html (${res.status}); serve the repository root`); return; }
    popupHtml = await res.text();
  }
  // The real markup: its two relative paths pointed at the repository root
  // (popup.js then resolves its own imports from there), and the stub
  // installed before popup.js runs.
  const doc = popupHtml
    .replace('href="styles.css"', 'href="../../styles.css"')
    .replace('src="popup.js"', 'src="../../popup.js"')
    .replace('<head>', '<head><script>window.chrome = parent.snatchDemo.chromeStub();<' + '/script>');
  const frame = $('popup-frame');
  $('popup').classList.remove('closed');
  frame.srcdoc = doc;
  frame.addEventListener('load', () => {
    const app = frame.contentDocument && frame.contentDocument.getElementById('app');
    if (!app) return;
    // Chrome sizes a popup from its content, up to 600 tall.
    const fit = () => { frame.style.height = `${Math.min(600, app.offsetHeight)}px`; };
    new ResizeObserver(fit).observe(app);
    fit();
  }, { once: true });
}

function setTab(url, label) {
  tabUrl = url;
  showTab();
  for (const b of document.querySelectorAll('[data-sample]')) {
    b.setAttribute('aria-pressed', String(b.dataset.sample === label));
  }
  log('', `tab is now ${url}`);
  openPopup();
}

for (const btn of document.querySelectorAll('[data-sample]')) {
  btn.addEventListener('click', () => setTab(SAMPLES[btn.dataset.sample], btn.dataset.sample));
}
$('custom').addEventListener('submit', e => {
  e.preventDefault();
  const url = $('custom-url').value.trim();
  if (!url) return;
  setTab(url, null);
});
$('reopen-btn').addEventListener('click', () => { log('', 'popup reopened'); openPopup(); });
$('icon-btn').addEventListener('click', () => { log('', 'popup reopened'); openPopup(); });

showTab();
openPopup();
