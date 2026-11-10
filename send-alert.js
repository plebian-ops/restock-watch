// Sends each alert in alerts.json to Telegram.
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (one or more chat numbers, comma separated) from the project secrets.
// usage: node send-alert.js [--test]     --test also sends one test message
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN || '';
const chats = (process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const when = d => d.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Manila time';

(async () => {
  if (!token || !chats.length) {
    console.log('Telegram is not set up yet, nothing sent.');
    return;
  }
  const alerts = fs.existsSync('alerts.json') ? JSON.parse(fs.readFileSync('alerts.json', 'utf8')) : [];
  if (process.argv.includes('--test')) {
    alerts.push({ title: 'Test alert', body: 'This is a test from the stock check. A real alert looks like this and carries the product link.\n\nSent ' + when(new Date()) });
  }
  let failed = 0;
  for (const a of alerts) {
    for (const chat of chats) {
      const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: a.title + '\n\n' + a.body }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.ok) console.log('sent: ' + a.title);
      else { failed++; console.log('Telegram did not accept the message: ' + (j.description || res.status)); }
    }
  }
  process.exit(failed ? 1 : 0);
})();
