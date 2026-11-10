// Reads one saved product page and returns what it says about stock.
// usage: node read-page.js <html file>   (prints the reading as JSON)
const fs = require('fs');

const strip = s => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&ndash;/g, '-').replace(/\s+/g, ' ').trim();

function readPage(html) {
  const out = { title: strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]), items: [], labels: [], buyButton: null, notes: [] };

  // Product data the store publishes inside the page: one entry per colour, each with its own availability.
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    if (!/availability/.test(b)) continue;
    try {
      const j = JSON.parse(b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, ''));
      for (const v of (j.hasVariant || [j])) {
        for (const o of [].concat(v.offers || [])) {
          out.items.push({ name: strip(v.name || j.name), price: String(o.price || ''), currency: o.priceCurrency || '', availability: String(o.availability || '').split('/').pop() });
        }
      }
      const d = strip(j.description || '');
      const m = d.match(/[^.]*\b(restock|pre-?order|limit to)\b[^.]*\./gi);
      if (m) out.notes.push(...m.map(s => s.trim()));
    } catch (e) { /* not readable, the visible wording below still counts */ }
  }

  // Wording a shopper sees next to the buy area.
  for (const m of html.matchAll(/class="[^"]*(sold-out-label|price__badge-sold-out|variant-item__sold-out)[^"]*"[^>]*>([\s\S]*?)</g)) out.labels.push(strip(m[2]));
  const btn = html.match(/<(?:input|button)[^>]*(?:id="product-add-to-cart"|name="add")[^>]*>/i);
  if (btn) {
    const value = (btn[0].match(/value="([^"]*)"/) || [])[1];
    out.buyButton = { text: value || null, disabled: /\sdisabled(\s|=|>)/.test(btn[0]) };
  }

  const inStock = out.items.filter(i => /InStock|LimitedAvailability|PreOrder|BackOrder/i.test(i.availability));
  out.inStock = inStock.length > 0;
  out.verdict = !out.items.length ? 'UNKNOWN' : out.inStock ? 'IN STOCK' : 'SOLD OUT';
  return out;
}

module.exports = { readPage };
if (require.main === module) console.log(JSON.stringify(readPage(fs.readFileSync(process.argv[2], 'utf8')), null, 2));
