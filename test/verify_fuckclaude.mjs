import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const stealthCode = readFileSync('content/stealth.js', 'utf8');

const script = `
const task = await taskSpace("verify fuckclaude with real stealth");
const page = task.page("p1");

// Navigate to a non-domestic test URL like https://example.com or http://localhost:8777
await page.goto("http://127.0.0.1:8777/detector_test.html");

// Now check what the environment in the page shows:
const testOutcome = await page.evaluate(() => {
  const FONTS_SC = [
    "Microsoft YaHei", "Microsoft YaHei UI", "SimSun", "NSimSun", "SimHei",
    "KaiTi", "FangSong", "DengXian", "PingFang SC", "Hiragino Sans GB",
    "STHeiti", "STSong", "Songti SC", "Source Han Sans CN", "Source Han Sans SC",
    "Noto Sans CJK SC", "Noto Serif CJK SC", "WenQuanYi Micro Hei", "WenQuanYi Zen Hei"
  ];
  const FONTS_TC = [
    "Microsoft JhengHei", "PMingLiU", "MingLiU", "DFKai-SB", "PingFang TC", "PingFang HK",
    "Source Han Sans TW", "Noto Sans CJK TC"
  ];
  const FONTS_CN_VENDOR = [
    "MiSans", "MIUI", "HarmonyOS Sans SC", "HarmonyOS Sans", "HONOR Sans",
    "OPPO Sans", "vivo Sans", "Alibaba PuHuiTi", "Alibaba Sans", "DingTalk JinBuTi",
    "Douyin Sans", "HYQiHei", "FZShuSong-Z01S", "FZKai-Z03S", "FZHei-B01S", "FZFangSong-Z02S"
  ];

  function isFontAvailable(font, ctx) {
    const testString = "中文字体检测ABCabc012";
    const size = "72px";
    const bases = ["monospace", "sans-serif", "serif"];
    return bases.some((base) => {
      ctx.font = size + " " + base;
      const baseWidth = ctx.measureText(testString).width;
      ctx.font = size + ' "' + font + '", ' + base;
      const testWidth = ctx.measureText(testString).width;
      return Math.abs(testWidth - baseWidth) > 0.5;
    });
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const scHits = FONTS_SC.filter(f => isFontAvailable(f, ctx));
  const tcHits = FONTS_TC.filter(f => isFontAvailable(f, ctx));
  const vendorHits = FONTS_CN_VENDOR.filter(f => isFontAvailable(f, ctx));

  const normLangs = navigator.languages ? Array.from(navigator.languages).map(l => l.toLowerCase()) : [navigator.language.toLowerCase()];
  const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isZbActive = !!window.__ZONE_BREAKER_ACTIVE__;

  return {
    isZbActive,
    scHits,
    tcHits,
    vendorHits,
    normLangs,
    intlLocale,
    tz
  };
});

console.log("Real Stealth Verification Output:", testOutcome);
await task.finish({ keep: [] });
`;

// Start http server for test
import http from 'node:http';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!DOCTYPE html><html><head><script>' + stealthCode + '</script></head><body><h1>Testing</h1></body></html>');
}).listen(8777);

const proc = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'inherit', 'inherit'] });
proc.stdin.write(script);
proc.stdin.end();

proc.on('close', () => {
  server.close();
});
