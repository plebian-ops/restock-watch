// Replies to the chats that asked for a check with each store's status and link, from the fresh reading (reading.json).
// usage: node reply.js
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const api = (method, params) => fetch('https://api.telegram.org/bot' + token + '/' + method, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params || {}),
}).then(r => r.json()).catch(() => ({ ok: false }));
const when = d => d.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Manila time';
const AVAILABLE = /^(InStock|LimitedAvailability|PreOrder|BackOrder|OnlineOnly)$/i;
const word = a => (AVAILABLE.test(a) ? 'in stock' : 'sold out');
const last = s => { const p = String(s || '').split(' - '); return p[p.length - 1].trim(); };

function message(readings) {
  if (!readings.length) return 'The stores could not be read just now. Send "check" again in a few minutes.';
  const lines = ['Stock check, ' + when(new Date()), ''];
  for (const r of readings) {
    if (!r.readable) {
      lines.push(r.host + ': could not be read just now', r.link, '');
      continue;
    }
    const store = r.title.includes(' - ') ? last(r.title) : r.host;
    lines.push(store + ': ' + r.verdict);
    for (const i of r.items) lines.push((r.items.length > 1 ? last(i.name) : i.name) + ': ' + word(i.availability));
    lines.push(r.link, '');
  }
  return lines.join('\n').trim();
}

(async () => {
  if (!fs.existsSync('reply-to.json')) { console.log('Nobody asked.'); return; }
  const { chats, confirm } = JSON.parse(fs.readFileSync('reply-to.json', 'utf8'));
  const readings = fs.existsSync('reading.json') ? JSON.parse(fs.readFileSync('reading.json', 'utf8')) : [];
  const text = message(readings);
  let sent = 0;
  for (const id of chats) {
    const j = await api('sendMessage', { chat_id: id, text, disable_web_page_preview: true });
    if (j.ok) sent++;
    else console.log('Telegram did not accept a reply: ' + (j.description || ''));
  }
  if (confirm !== null && confirm !== undefined) await api('getUpdates', { offset: confirm, timeout: 0 });   // marks the messages as read
  console.log('replied to ' + sent + ' of ' + chats.length + ' chat(s)');
  if (process.argv.includes('--print')) console.log('\n' + text);
})();
