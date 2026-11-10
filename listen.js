// Reads the new messages sent to the Telegram bot and works out who asked for a check.
// A chat asks by sending "check" or "check stock". Chats not listed in TELEGRAM_CHAT_ID are ignored.
// Writes reply-to.json for reply.js when someone asked. Nothing about the chats is printed.
// usage: node listen.js [--everyone]     --everyone treats every chat on the list as having asked
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const allowed = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const api = (method, params) => fetch('https://api.telegram.org/bot' + token + '/' + method, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params || {}),
}).then(r => r.json()).catch(() => ({ ok: false }));
const out = v => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'ask=' + v + '\n'); };

(async () => {
  if (!token || !allowed.length) { console.log('Telegram is not set up, nothing to read.'); out(false); return; }
  const j = await api('getUpdates', { timeout: 0, allowed_updates: ['message'] });
  if (!j.ok) { console.log('Telegram did not answer.'); out(false); return; }

  const asking = new Set(process.argv.includes('--everyone') ? allowed : []);
  const other = new Set();
  let confirm = null;
  for (const u of j.result) {
    confirm = u.update_id + 1;
    const m = u.message;
    if (!m || !m.chat) continue;
    const id = String(m.chat.id);
    if (!allowed.includes(id)) continue;
    const text = (m.text || '').trim();
    if (/^\/?(check(\s+stocks?)?|stocks?)\s*[?!.]*$/i.test(text)) asking.add(id);
    else if (!/^\/start/i.test(text)) other.add(id);
  }
  console.log(j.result.length + ' new message(s), ' + asking.size + ' asking for a check');

  for (const id of other) {
    if (asking.has(id)) continue;
    await api('sendMessage', { chat_id: id, text: 'Send "check" to get the current stock of both stores.' });
  }
  if (!asking.size) {
    if (confirm !== null) await api('getUpdates', { offset: confirm, timeout: 0 });   // marks the messages as read
    out(false);
    return;
  }
  // The messages are marked as read by reply.js, after the reply has gone out.
  fs.writeFileSync('reply-to.json', JSON.stringify({ chats: [...asking], confirm }));
  out(true);
})();
