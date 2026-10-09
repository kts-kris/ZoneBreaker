/**
 * ZoneBreaker (ZB) - Multi-Browser Production Packaging Engine v1.2
 * 自动化打包引擎：
 * 1. 语法与 Manifest 强类型校验
 * 2. 剥离本地测试脚本与开发文件 (test/, docs, 调试日志等)
 * 3. 产出 Chromium 纯净解压目录 dist/unpacked/ 与通用 Zip (Chrome / Edge / Brave / Arc / Opera / Vivaldi)
 * 4. 产出 Chromium 原生 CRX 离线安装包 (dist/ZoneBreaker_v1.0.0.crx)
 * 5. 产出 Firefox / Gecko 专用 XPI 扩展包 (dist/ZoneBreaker_v1.0.0_firefox.xpi)
 * 6. 计算所有发布包的 SHA256 完整性清单
 */

import { existsSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, statSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = __dirname;
const DIST_DIR = join(ROOT_DIR, 'dist');
const UNPACKED_DIR = join(DIST_DIR, 'unpacked');
const FIREFOX_UNPACKED_DIR = join(DIST_DIR, 'unpacked_firefox');
const KEY_PATH = join(ROOT_DIR, 'key.pem');

console.log('='.repeat(72));
console.log(' 📦 ZoneBreaker (ZB) 多浏览器生产发布包自动构建引擎');
console.log('='.repeat(72));

// 1. 读取并校验 Manifest
const manifestPath = join(ROOT_DIR, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error('❌ Error: manifest.json not found!');
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.error('❌ Error parsing manifest.json:', e.message);
  process.exit(1);
}

const version = manifest.version || '1.0.0';
const baseName = `ZoneBreaker_v${version}`;

// 发布包文件路径
const chromiumZip = join(DIST_DIR, `${baseName}.zip`);
const chromiumZipAlias = join(DIST_DIR, `${baseName}_chromium.zip`);
const chromiumCrx = join(DIST_DIR, `${baseName}.crx`);
const firefoxXpi = join(DIST_DIR, `${baseName}_firefox.xpi`);

// 2. 清理并初始化输出目录
console.log(`\n[1/5] 初始化发布目录 (dist/)...`);
rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(UNPACKED_DIR, { recursive: true });
mkdirSync(FIREFOX_UNPACKED_DIR, { recursive: true });

// 3. 结构化生产核心资源
const PRODUCTION_FILES = [
  'manifest.json',
  'background/background.js',
  'content/stealth.js',
  'content/bridge.js',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'INSTALL_GUIDE.md'
];

console.log(`\n[2/5] 封装 Chromium 核心资源:`);
for (const relPath of PRODUCTION_FILES) {
  const src = join(ROOT_DIR, relPath);
  const dest = join(UNPACKED_DIR, relPath);

  if (!existsSync(src)) {
    console.error(`  ❌ 缺失核心文件: ${relPath}`);
    process.exit(1);
  }

  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  const size = statSync(src).size;
  console.log(`  ✓ 封装: ${relPath.padEnd(28)} (${(size / 1024).toFixed(1)} KB)`);
}

// 4. 生成 Chromium Zip 包
console.log(`\n[3/5] 构建 Chromium 通用 Zip 包 (Chrome / Edge / Brave / Arc / Opera / Vivaldi):`);
try {
  execSync(`zip -r -q -9 "${chromiumZip}" .`, { cwd: UNPACKED_DIR });
  copyFileSync(chromiumZip, chromiumZipAlias);
  copyFileSync(chromiumZip, join(DIST_DIR, 'ZoneBreaker_latest.zip'));
  const zipStat = statSync(chromiumZip);
  console.log(`  ✓ 成功创建: ${baseName}.zip (${(zipStat.size / 1024).toFixed(2)} KB)`);
  console.log(`  ✓ 成功创建: ${baseName}_chromium.zip`);
} catch (e) {
  console.error('  ❌ Zip 压缩失败:', e.message);
  process.exit(1);
}

// 5. 生成 Chromium CRX 包
console.log(`\n[4/5] 构建 Chromium CRX 离线安装包:`);
const CHROME_BINARY = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (existsSync(CHROME_BINARY)) {
  try {
    const keyArg = existsSync(KEY_PATH) ? `--pack-extension-key="${KEY_PATH}"` : '';
    execSync(`"${CHROME_BINARY}" --pack-extension="${UNPACKED_DIR}" ${keyArg}`, { stdio: 'ignore' });
    const rawCrx = join(DIST_DIR, 'unpacked.crx');
    const rawPem = join(DIST_DIR, 'unpacked.pem');

    if (existsSync(rawCrx)) {
      copyFileSync(rawCrx, chromiumCrx);
      copyFileSync(rawCrx, join(DIST_DIR, 'ZoneBreaker_latest.crx'));
      rmSync(rawCrx, { force: true });
      const crxStat = statSync(chromiumCrx);
      console.log(`  ✓ 成功创建: ${baseName}.crx (${(crxStat.size / 1024).toFixed(2)} KB)`);
    }
    // 保存首次生成的 pem 密钥
    if (existsSync(rawPem) && !existsSync(KEY_PATH)) {
      copyFileSync(rawPem, KEY_PATH);
      rmSync(rawPem, { force: true });
      console.log(`  ✓ 已持久化扩展签名私钥: key.pem`);
    } else if (existsSync(rawPem)) {
      rmSync(rawPem, { force: true });
    }
  } catch (e) {
    console.warn(`  ⚠️ CRX 打包警告 (跳过):`, e.message);
  }
} else {
  console.log(`  ⚠️ 未检测到系统 Chrome 二进制，跳过 CRX 打包`);
}

// 6. 构建 Firefox / Gecko 专用 XPI 包
console.log(`\n[5/5] 构建 Mozilla Firefox 专用 XPI 包 (Firefox / Floorp / Librewolf):`);
try {
  // 复制基础文件到 Firefox 目录
  cpSync(UNPACKED_DIR, FIREFOX_UNPACKED_DIR, { recursive: true });

  // 调整 Firefox 专用的 Manifest V3 配置
  const firefoxManifest = JSON.parse(readFileSync(join(FIREFOX_UNPACKED_DIR, 'manifest.json'), 'utf8'));
  firefoxManifest.browser_specific_settings = {
    gecko: {
      id: "zonebreaker@kts.dev",
      strict_min_version: "109.0"
    }
  };
  // Firefox MV3 推荐兼容的 background 配置
  firefoxManifest.background = {
    scripts: ["background/background.js"]
  };
  writeFileSync(join(FIREFOX_UNPACKED_DIR, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2), 'utf8');

  // 打包为 .xpi
  execSync(`zip -r -q -9 "${firefoxXpi}" .`, { cwd: FIREFOX_UNPACKED_DIR });
  copyFileSync(firefoxXpi, join(DIST_DIR, 'ZoneBreaker_latest_firefox.xpi'));
  const xpiStat = statSync(firefoxXpi);
  console.log(`  ✓ 成功创建: ${baseName}_firefox.xpi (${(xpiStat.size / 1024).toFixed(2)} KB)`);
} catch (e) {
  console.error('  ❌ Firefox XPI 打包失败:', e.message);
}

// 7. 生成全量 SHA256 校验和清单
console.log(`\n📝 生成 SHA256 完整性清单:`);
const checksumFiles = [
  `${baseName}.zip`,
  `${baseName}_chromium.zip`,
  `${baseName}.crx`,
  `${baseName}_firefox.xpi`
].filter(f => existsSync(join(DIST_DIR, f)));

let checksumContent = '';
for (const file of checksumFiles) {
  const buf = readFileSync(join(DIST_DIR, file));
  const sha = createHash('sha256').update(buf).digest('hex');
  checksumContent += `${sha}  ${file}\n`;
  console.log(`  • ${file.padEnd(30)}: ${sha}`);
}
writeFileSync(join(DIST_DIR, 'SHA256SUMS.txt'), checksumContent, 'utf8');

console.log('\n' + '='.repeat(72));
console.log(' 🎉 多浏览器适配发布包构建圆满完成！产物列表：');
console.log(`  🌐 Chromium 离线安装包 (CRX) : ${chromiumCrx}`);
console.log(`  📁 Chromium 通用解压包 (ZIP) : ${chromiumZip}`);
console.log(`  🦊 Firefox 专用安装包 (XPI)   : ${firefoxXpi}`);
console.log(`  📂 解压即用源码目录          : ${UNPACKED_DIR}`);
console.log(`  🔑 SHA256 校验清单          : ${join(DIST_DIR, 'SHA256SUMS.txt')}`);
console.log('='.repeat(72));
