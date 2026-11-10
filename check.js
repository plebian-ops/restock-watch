// Reads the full pages Screaming Frog fetched for the links in links.txt, works out the stock status of each,
// and compares it with the last saved reading (state/last.json).
// usage: node check.js <folder with the Screaming Frog exports> <folder with the saved pages>
const fs = require('fs');
const path = require('path');
const { readPage } = require('./read-page.js');

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function load(file) {
  if (!fs.existsSync(file)) return [];
  const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const head = rows[0] || [];
  return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const when = iso => new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Manila time';
const AVAILABLE = /^(InStock|LimitedAvailability|PreOrder|BackOrder|OnlineOnly)$/i;
const plain = a => ({ InStock: 'in stock', OutOfStock: 'sold out', SoldOut: 'sold out', PreOrder: 'open for pre-order', BackOrder: 'open for back-order', LimitedAvailability: 'in stock, limited', OnlineOnly: 'in stock, online only', Discontinued: 'discontinued' }[a] || a);

const exportsFolder = process.argv[2] || 'out';
const pagesFolder = process.argv[3] || '/tmp/captured';
const stateFile = path.join(__dirname, 'state', 'last.json');
const links = fs.readFileSync(path.join(__dirname, 'links.txt'), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const crawled = load(path.join(exportsFolder, 'internal_all.csv'));
const last = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const next = JSON.parse(JSON.stringify(last));
const now = new Date().toISOString();

// Saved pages: <name>.txt holds the address, response code and crawler name; <name>.html holds the page.
const saved = {};
if (fs.existsSync(pagesFolder)) {
  for (const f of fs.readdirSync(pagesFolder).filter(f => f.endsWith('.txt'))) {
    const [url, code, agent] = fs.readFileSync(path.join(pagesFolder, f), 'utf8').split(/\r?\n/);
    saved[url] = { code, agent, file: path.join(pagesFolder, f.replace(/\.txt$/, '.html')) };
  }
}

const lines = [];
const alerts = [];
const readings = [];   // the current status of each link, for the reply to a "check" message
let unreadable = false, save = false;

for (const link of links) {
  const host = new URL(link).host;
  const row = crawled.find(r => r['Address'] === link);
  const code = row ? row['Status Code'] : 'not crawled';
  const page = saved[link];
  lines.push(link);
  if (code !== '200' || !page || !fs.existsSync(page.file)) {
    unreadable = true;
    lines.push('  COULD NOT READ: response code ' + code + (page ? '' : ', page not saved'));
    readings.push({ link, host, readable: false });
    continue;
  }
  const r = readPage(fs.readFileSync(page.file, 'utf8'));
  if (r.verdict === 'UNKNOWN') {
    unreadable = true;
    lines.push('  COULD NOT READ: the page has no product data');
    readings.push({ link, host, readable: false });
    continue;
  }
  const reading = {
    verdict: r.verdict,
    title: r.title,
    items: r.items.map(i => ({ name: i.name, price: i.price + ' ' + i.currency, availability: i.availability })),
    labels: [...new Set(r.labels)],
    buyButton: r.buyButton ? (r.buyButton.text || '') + (r.buyButton.disabled ? ' (switched off)' : '') : '',
    notes: r.notes,
  };
  readings.push({ link, host, readable: true, title: reading.title, verdict: reading.verdict, items: reading.items.map(i => ({ name: i.name, availability: i.availability })) });
  lines.push('  ' + reading.verdict + (page.agent ? '   [fetched by ' + page.agent + ']' : ''));
  for (const i of reading.items) lines.push('    ' + i.name + ', ' + i.price + ': ' + plain(i.availability));
  if (reading.labels.length) lines.push('    label on page: ' + reading.labels.join(' / '));
  if (reading.buyButton) lines.push('    buy button: ' + reading.buyButton);
  for (const n of reading.notes) lines.push('    store note: ' + n);

  // An alert goes out only for a stock change: an item becoming available, or going back to sold out.
  const alertFor = stock => {
    if (!stock.length) return;
    const up = stock.filter(s => s.available);
    const title = (up.length ? 'IN STOCK: ' + up.map(s => s.name).join(', ') : 'SOLD OUT: ' + stock.map(s => s.name).join(', ')) + ' (' + host + ')';
    const body = [link, '', ...stock.map(s => '- ' + s.text), '', 'Checked ' + when(now)].join('\n');
    alerts.push({ title: title.slice(0, 240), body });
  };

  const before = last[link];
  if (!before || !before.verdict) {
    next[link] = { ...reading, changedAt: now };
    save = true;
    lines.push('  first full reading saved');
    alertFor(reading.items.filter(i => AVAILABLE.test(i.availability)).map(i => ({ name: i.name, available: true, text: i.name + ', ' + i.price + ': ' + plain(i.availability) })));
    continue;
  }
  const same = k => JSON.stringify(before[k]) === JSON.stringify(reading[k]);
  const stock = [];   // stock changes, these alert
  const other = [];   // anything else that changed on the page, saved but no alert
  for (const i of reading.items) {
    const was = (before.items || []).find(b => b.name === i.name);
    const isUp = AVAILABLE.test(i.availability);
    if (!was) {
      if (isUp) stock.push({ name: i.name, available: true, text: i.name + ', ' + i.price + ': new on the page and ' + plain(i.availability) });
      else other.push(i.name + ' is new on the page: ' + plain(i.availability));
      continue;
    }
    const wasUp = AVAILABLE.test(was.availability);
    if (wasUp !== isUp) stock.push({ name: i.name, available: isUp, text: i.name + ', ' + i.price + ': was ' + plain(was.availability) + ', now ' + plain(i.availability) });
    else if (was.availability !== i.availability) other.push(i.name + ': was ' + plain(was.availability) + ', now ' + plain(i.availability));
    if (was.price !== i.price) other.push(i.name + ' price: was ' + was.price + ', now ' + i.price);
  }
  for (const b of before.items || []) {
    if (reading.items.find(i => i.name === b.name)) continue;
    if (AVAILABLE.test(b.availability)) stock.push({ name: b.name, available: false, text: b.name + ': was ' + plain(b.availability) + ', now gone from the page' });
    else other.push(b.name + ' is no longer on the page');
  }
  if (!same('labels')) other.push('label on page: was "' + (before.labels || []).join(' / ') + '", now "' + reading.labels.join(' / ') + '"');
  if (!same('buyButton')) other.push('buy button: was "' + before.buyButton + '", now "' + reading.buyButton + '"');
  if (!same('notes')) other.push('store note: was "' + (before.notes || []).join(' ') + '", now "' + reading.notes.join(' ') + '"');

  if (!stock.length && !other.length) {
    lines.push('  no change since ' + when(before.changedAt));
    continue;
  }
  save = true;
  next[link] = { ...reading, changedAt: now };
  if (stock.length) {
    lines.push('  STOCK CHANGE (alert sent):');
    for (const s of stock) lines.push('    ' + s.text);
  }
  if (other.length) {
    lines.push('  other page changes (saved, no alert):');
    for (const c of other) lines.push('    ' + c);
  }
  alertFor(stock);
}

if (save) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(next, null, 2) + '\n');
}
fs.writeFileSync(path.join(__dirname, 'alerts.json'), JSON.stringify(alerts, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'reading.json'), JSON.stringify(readings, null, 2) + '\n');

const text = lines.join('\n');
console.log(text);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'alert=' + (alerts.length > 0) + '\nsave=' + save + '\nunreadable=' + unreadable + '\n');
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const headline = unreadable ? 'A link could not be read' : alerts.length ? alerts.map(a => a.title).join(' | ') : 'No change';
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### ' + headline + '\n\n```\n' + text + '\n```\n');
}
process.exit(unreadable ? 1 : 0);
