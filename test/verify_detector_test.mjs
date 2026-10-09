import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/' || url === '/detector_test.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(readFileSync('test/detector_test.html'));
  } else if (url === '/detector_test.js' || url === '/test/detector_test.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync('test/detector_test.js'));
  } else if (url.includes('stealth.js')) {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync('content/stealth.js'));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(8788);

const script = `
const task = await taskSpace("verify detector_test with stealth");
const page = task.page("p1");

await page.goto("http://127.0.0.1:8788/");
await new Promise(r => setTimeout(r, 1500));

const testResults = await page.evaluate(async () => {
  const scoreBadge = document.getElementById('riskScoreBadge');
  const cards = Array.from(document.querySelectorAll('.item-card')).map(card => {
    const title = card.querySelector('.item-title')?.textContent?.trim() || '';
    const weight = card.querySelector('.weight-tag')?.textContent?.trim() || '';
    const evidence = card.querySelector('.item-evidence')?.textContent?.trim() || '';
    const statusBadge = card.querySelector('.status-badge');
    const isSafe = statusBadge?.classList.contains('safe');
    const statusText = statusBadge?.textContent?.trim() || '';
    return { title, weight, evidence, isSafe, statusText };
  });

  return {
    scoreText: scoreBadge?.textContent?.trim() || 'Unknown',
    cardsCount: cards.length,
    cards,
    isZbActive: !!window.__ZONE_BREAKER_ACTIVE__,
    dtfLocale: Intl.DateTimeFormat().resolvedOptions().locale,
    dtfTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    langs: navigator.languages,
    offset: new Date().getTimezoneOffset()
  };
});

console.log("DETECTOR LAB RESULTS:", JSON.stringify(testResults, null, 2));
await task.finish({ keep: [] });
`;

const proc = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'inherit', 'inherit'] });
proc.stdin.write(script);
proc.stdin.end();

proc.on('close', () => {
  server.close();
  process.exit(0);
});
