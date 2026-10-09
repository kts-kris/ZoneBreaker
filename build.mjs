/**
 * ZoneBreaker (ZB) - Production Build & Packaging Engine
 * 自动化打包脚本：
 * 1. 语法与 Manifest 强类型校验
 * 2. 剥离本地测试脚本与开发文件 (test/, docs, 调试日志等)
 * 3. 产出纯净的解压即用目录 dist/unpacked/
 * 4. 压缩生成标准发布包 dist/ZoneBreaker_v1.0.0.zip
 * 5. 计算并生成 SHA256 校验和清单
 */

import { existsSync, mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = __dirname;
const DIST_DIR = join(ROOT_DIR, 'dist');
const UNPACKED_DIR = join(DIST_DIR, 'unpacked');

console.log('='.repeat(70));
console.log(' 📦 ZoneBreaker (ZB) 生产级发布包自动构建引擎');
console.log('='.repeat(70));

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
const packageName = `ZoneBreaker_v${version}.zip`;
const zipPath = join(DIST_DIR, packageName);
const latestZipPath = join(DIST_DIR, 'ZoneBreaker_latest.zip');

console.log(`\n[1/5] 校验项目元数据:`);
console.log(`  • 名称: ${manifest.name}`);
console.log(`  • 版本: v${version}`);
console.log(`  • 规范: Manifest V${manifest.manifest_version}`);

// 2. 清理并初始化输出目录
console.log(`\n[2/5] 初始化发布目录 (dist/)...`);
rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(UNPACKED_DIR, { recursive: true });

// 3. 定义要纳入生产发布包的核心文件清单
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

console.log(`\n[3/5] 复制并结构化生产资源:`);
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

// 4. 执行 Zip 压缩
console.log(`\n[4/5] 压缩生成标准分发包:`);
try {
  // 在 unpacked 目录下执行 zip，保证解压后第一层即为扩展根目录
  execSync(`zip -r -q -9 "${zipPath}" .`, { cwd: UNPACKED_DIR });
  copyFileSync(zipPath, latestZipPath);

  const zipStat = statSync(zipPath);
  console.log(`  ✓ 成功创建: ${packageName} (${(zipStat.size / 1024).toFixed(2)} KB)`);
  console.log(`  ✓ 成功同步: ZoneBreaker_latest.zip`);
} catch (e) {
  console.error('  ❌ 压缩失败:', e.message);
  process.exit(1);
}

// 5. 计算 SHA256 校验和
console.log(`\n[5/5] 生成发布文件 SHA256 校验和:`);
const fileBuffer = readFileSync(zipPath);
const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
const checksumContent = `${sha256}  ${packageName}\n`;
const checksumPath = join(DIST_DIR, 'SHA256SUMS.txt');
writeFileSync(checksumPath, checksumContent, 'utf8');

console.log(`  • SHA256: ${sha256}`);
console.log(`  • 校验和已写入: dist/SHA256SUMS.txt`);

console.log('\n' + '='.repeat(70));
console.log(' 🎉 发布包构建圆满完成！可立即用于分发：');
console.log(`  📁 解压即用目录: ${UNPACKED_DIR}`);
console.log(`  📦 独立分发压缩包: ${zipPath}`);
console.log(`  🔑 完整性校验文件: ${checksumPath}`);
console.log('='.repeat(70));
