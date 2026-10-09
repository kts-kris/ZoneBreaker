/**
 * ZoneBreaker (ZB) - Autonomous End-to-End Test Suite v1.1
 * 100% 自主运行测试，内置 HTTP 服务器驱动真实 Chrome 浏览器，全自动双轨对比验证：
 * 轨道 1：未加载 ZoneBreaker（原生环境基线测试，观察国内特征命中）
 * 轨道 2：加载 ZoneBreaker（破界防御测试，观察 10 项特征是否完全被隐匿）
 */

import { spawn } from 'node:child_process';
import { rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXT_PATH = '/Users/liuweigang/.gemini/antigravity/scratch/ZoneBreaker';
const HTTP_PORT = 8777;
const TEST_URL = `http://127.0.0.1:${HTTP_PORT}/detector_test.html`;

// 启动轻量本地 HTTP 静态文件服务
function startStaticServer() {
  const server = createServer((req, res) => {
    let filePath = join(EXT_PATH, 'test', req.url === '/' ? 'detector_test.html' : req.url);
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
  server.listen(HTTP_PORT);
  return server;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 封装 CDP 客户端
class SimpleCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// 启动并运行单个 Chrome 测试会话
async function runChromeSession({ port, loadExtension, profileDir }) {
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch (e) {}
  mkdirSync(profileDir, { recursive: true });

  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ];

  if (loadExtension) {
    args.push(`--load-extension=${EXT_PATH}`);
    args.push(`--disable-extensions-except=${EXT_PATH}`);
  }

  console.log(`[Test Runner] Launching Chrome (port ${port}, loadExtension: ${loadExtension})...`);
  const chromeProcess = spawn(CHROME_PATH, args, { stdio: 'ignore' });

  // 等待 Chrome 启动
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch (e) {}
    await sleep(250);
  }

  if (!ready) {
    chromeProcess.kill('SIGKILL');
    throw new Error(`Chrome failed to start on port ${port}`);
  }

  try {
    // 创建/导航到测试页
    const newTabRes = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(TEST_URL)}`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    const wsUrl = tabData.webSocketDebuggerUrl;

    const cdp = new SimpleCDP(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // 等待扩展加载完毕并刷新页面确保 content script 注入
    await sleep(2500);
    await cdp.send('Page.reload');
    await sleep(2000);

    // 运行页面上的测试并提取 10 个维度的结果
    const testResults = await cdp.evaluate(`
      (async () => {
        if (typeof runAllTests === 'function') {
          await runAllTests();
        }
        await new Promise(r => setTimeout(r, 1000));

        const scoreEl = document.getElementById('riskScoreBadge');
        const cards = Array.from(document.querySelectorAll('.item-card')).map(card => {
          const title = card.querySelector('.item-title')?.textContent?.trim() || '';
          const weight = card.querySelector('.weight-tag')?.textContent?.trim() || '';
          const evidence = card.querySelector('.item-evidence')?.textContent?.trim() || '';
          const statusBadge = card.querySelector('.status-badge');
          const isSafe = statusBadge?.classList.contains('safe');
          const statusText = statusBadge?.textContent?.trim() || '';
          return { title, weight, evidence, isSafe, statusText };
        });

        // 深度验证原生伪装与底层状态
        const nativeCheck = {
          dtfToString: Function.prototype.toString.call(Intl.DateTimeFormat),
          dtfProtoToString: Function.prototype.toString.call(Intl.DateTimeFormat.prototype.resolvedOptions),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          languages: navigator.languages,
          language: navigator.language,
          offset: new Date().getTimezoneOffset(),
          isZbActive: !!window.__ZONE_BREAKER_ACTIVE__
        };

        return {
          totalScoreText: scoreEl ? scoreEl.textContent.trim() : 'Unknown',
          cards,
          nativeCheck
        };
      })()
    `);

    cdp.close();
    chromeProcess.kill('SIGTERM');
    await sleep(500);
    return testResults;

  } catch (err) {
    chromeProcess.kill('SIGKILL');
    throw err;
  }
}

// 主执行器
async function main() {
  console.log('='.repeat(75));
  console.log(' 🚀 ZoneBreaker (ZB) 全自主端到端自动化测试实验室启动');
  console.log('='.repeat(75));

  const staticServer = startStaticServer();
  console.log(`[HTTP Server] Local test server online at http://127.0.0.1:${HTTP_PORT}`);

  try {
    // 1. 基线测试：原生状态 (未装插件)
    console.log('\n[Stage 1/2] 正在运行【基线对照组】(未启用 ZoneBreaker)...');
    const baseline = await runChromeSession({
      port: 9334,
      loadExtension: false,
      profileDir: '/tmp/zb_baseline_profile'
    });

    // 2. 破界测试：武装状态 (已装插件)
    console.log('\n[Stage 2/2] 正在运行【ZoneBreaker 实验组】(启用破界武装)...');
    const armed = await runChromeSession({
      port: 9335,
      loadExtension: true,
      profileDir: '/tmp/zb_armed_profile'
    });

    console.log('\n' + '='.repeat(75));
    console.log(' 📊 ZoneBreaker 自动化全量测试对比审计报告');
    console.log('='.repeat(75));

    console.log(`\n【基线对照组总评】: ${baseline.totalScoreText}`);
    console.log(`【ZoneBreaker 总评】: ${armed.totalScoreText}\n`);

    console.log('+-'.padEnd(75, '-'));
    console.log('| 检测项名称'.padEnd(18) + '| 权重'.padEnd(8) + '| 基线未拦截状态'.padEnd(20) + '| ZoneBreaker 破界拦截状态');
    console.log('+-'.padEnd(75, '-'));

    armed.cards.forEach((armedCard, idx) => {
      const baseCard = baseline.cards[idx] || {};
      const baseStatus = baseCard.isSafe ? '✅ 安全' : '❌ 命中泄露';
      const armedStatus = armedCard.isSafe ? '🛡️ 100% 破界通过' : '❌ 仍有泄露';
      const title = armedCard.title.padEnd(12);
      const weight = armedCard.weight.padEnd(6);
      console.log(`| ${title} | ${weight} | ${baseStatus.padEnd(14)} | ${armedStatus}`);
    });
    console.log('+-'.padEnd(75, '-'));

    console.log('\n【核心底层原生函数伪装深度审计】:');
    console.log('  1. Intl.DateTimeFormat.toString():', JSON.stringify(armed.nativeCheck.dtfToString));
    console.log('  2. resolvedOptions.toString():     ', JSON.stringify(armed.nativeCheck.dtfProtoToString));
    console.log('  3. Intl 时区伪装输出:              ', armed.nativeCheck.timezone);
    console.log('  4. navigator.languages 伪装输出:   ', armed.nativeCheck.languages);
    console.log('  5. getTimezoneOffset() 偏移分钟:   ', armed.nativeCheck.offset, '(PDT 硅谷标准时区)');
    console.log('  6. ZoneBreaker 主世界激活标记:     ', armed.nativeCheck.isZbActive);

    // 自动断言
    const allSafe = armed.cards.every(c => c.isSafe);
    const isZeroRisk = armed.totalScoreText.includes('0 风险');
    const isNativeStealth = armed.nativeCheck.dtfToString.includes('[native code]');

    console.log('\n' + '='.repeat(75));
    if (allSafe && isZeroRisk && isNativeStealth) {
      console.log(' 🎉 恭喜！ZoneBreaker 自主全量测试全部 PASS！10 维风控特征 100% 破界成功！');
    } else {
      console.log(' ⚠️ 测试完成，存在未完全通过项，请检查上述详情。');
    }
    console.log('='.repeat(75));
  } finally {
    staticServer.close();
  }
}

main().catch(err => {
  console.error('[Test Error]:', err);
  process.exit(1);
});
