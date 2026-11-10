# restock-watch

Checks the product pages in `links.txt` with Screaming Frog, on GitHub's computers, and reads each full page for its stock status.

- `links.txt` holds the exact product links, one per line. Nothing else gets crawled.
- Each page is saved exactly as Screaming Frog receives it and read by `read-page.js`: status per colour, the label on the page, the buy button, any restock note.
- `state/last.json` holds the last reading of each page. A run reports SOLD OUT or IN STOCK for each link and what changed since the last check.
- An alert goes out only on a stock change: the run opens an issue titled "IN STOCK" when an item becomes available, and "SOLD OUT" when it sells out again. Other page changes are saved without an alert.
- A run that cannot read a link ends as failed.

## Timing

Once an hour in November. Every 15 minutes from December 1, 12:00 AM Manila time, and ongoing until it is paused.

- Start one by hand: Actions > Stock check > Run workflow.
- Pause: Actions > Stock check > ... > Disable workflow.
