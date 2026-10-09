import http from 'node:http';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const stealthCode = readFileSync('content/stealth.js', 'utf8');
const testHtml = readFileSync('test/detector_test.html', 'utf8');

// Inject stealth.js at the very top of <head>
const injectedHtml = testHtml.replace('<head>', '<head><script>' + stealthCode + '</script>');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(injectedHtml);
}).listen(8788);

const script = `
const task = await taskSpace("verify detector_test with stealth");
const page = task.page("p1");

await page.goto("http://127.0.0.1:8788/");
await new Promise(r => setTimeout(r, 1000));

const testResults = await page.evaluate(async () => {
  if (typeof runAllTests === 'function') {
    await runAllTests();
  }
  await new Promise(r => setTimeout(r, 1000));

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
