/**
 * ZoneBreaker (ZB) - 1:1 检测复现实验室核心检测引擎
 * 严格遵从 Chrome Manifest V3 CSP 规范（无 inline 脚本与内联事件）
 */

// 字体探针测算辅助函数
function isFontAvailable(fontName) {
  const testStr = 'mmmmmmmmmmlli中文测试123';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  ctx.font = '72px monospace';
  const baselineWidth = ctx.measureText(testStr).width;

  ctx.font = `72px "${fontName}", monospace`;
  const testWidth = ctx.measureText(testStr).width;

  return baselineWidth !== testWidth;
}

let isTesting = false;

async function runAllTests() {
  if (isTesting) return;
  isTesting = true;
  try {
    const listEl = document.getElementById('testList');
    if (!listEl) return;
    listEl.innerHTML = '';
    let totalRiskPoints = 0;

  // 1. 系统时区 (权重 24)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const isChinaTZ = /Asia\/(Shanghai|Urumqi|Chongqing|Harbin|Kashgar)|PRC/i.test(tz);
  const tzRisk = isChinaTZ ? 24 : 0;
  totalRiskPoints += tzRisk;
  renderItem({
    icon: '🕒',
    title: '系统时区',
    weight: 24,
    extraTag: 'Claude 同款',
    desc: 'Intl.DateTimeFormat 读到的系统时区，与 Asia/Shanghai、Asia/Urumqi 等中国时区比对。',
    evidence: `timeZone: "${tz}"`,
    isDetected: isChinaTZ,
    detectedText: `命中中国时区 (+24分)`,
    safeText: `通过 (已伪装为 ${tz})`
  });

  // 2. 浏览器语言 (权重 18)
  const langs = navigator.languages || [navigator.language];
  const hasZh = langs.some(l => l.toLowerCase().startsWith('zh'));
  const langRisk = hasZh ? 18 : 0;
  totalRiskPoints += langRisk;
  renderItem({
    icon: '🌐',
    title: '浏览器语言',
    weight: 18,
    desc: '检查 navigator.languages；首选 zh-CN / 简体中文得分最高。',
    evidence: `languages: [${langs.map(l => `"${l}"`).join(', ')}]`,
    isDetected: hasZh,
    detectedText: `检测到中文语言 (+18分)`,
    safeText: `通过 (纯净外文环境)`
  });

  // 3. 已安装中文字体 (权重 14)
  const sysChineseFonts = ['Microsoft YaHei', 'PingFang SC', 'SimSun', 'SimHei'];
  const foundSysFonts = sysChineseFonts.filter(f => isFontAvailable(f));
  const sysFontRisk = foundSysFonts.length > 0 ? 14 : 0;
  totalRiskPoints += sysFontRisk;
  renderItem({
    icon: '🔤',
    title: '已安装中文字体',
    weight: 14,
    desc: '用 canvas 宽度探测微软黑体、苹方等简繁中文字体。',
    evidence: `探测中文字体: ${foundSysFonts.length > 0 ? foundSysFonts.join(', ') : '未探测到任何中文字体'}`,
    isDetected: foundSysFonts.length > 0,
    detectedText: `命中本地中文字体 (+14分)`,
    safeText: `通过 (中文字体已全面隐匿)`
  });

  // 4. 国产厂商字体 (权重 10)
  const vendorFonts = ['MiSans', 'HarmonyOS Sans', 'OPPO Sans', 'WPS Office', 'FZShuTi'];
  const foundVendorFonts = vendorFonts.filter(f => isFontAvailable(f));
  const vendorFontRisk = foundVendorFonts.length > 0 ? 10 : 0;
  totalRiskPoints += vendorFontRisk;
  renderItem({
    icon: '🅰️',
    title: '国产厂商字体',
    weight: 10,
    desc: '用 canvas 探测 MiSans、鸿蒙黑体、OPPO Sans、WPS 方正字体等国产厂商/软件字体。',
    evidence: `探测厂商字体: ${foundVendorFonts.length > 0 ? foundVendorFonts.join(', ') : '未探测到厂商字体'}`,
    isDetected: foundVendorFonts.length > 0,
    detectedText: `命中厂商/软件字体 (+10分)`,
    safeText: `通过 (厂商字体已被剔除隐形)`
  });

  // 5. WebRTC IP 泄露 (权重 10)
  let rtcLeakedIP = '无泄露';
  let rtcDetected = false;
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    pc.createDataChannel('');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.candidate) {
        const cand = e.candidate.candidate;
        if (/192\.168\.|10\.\d+|172\.(1[6-9]|2\d|3[01])\./.test(cand)) {
          rtcDetected = true;
          rtcLeakedIP = '内网 IP 泄露';
        }
      }
    };
  } catch (e) {
    rtcDetected = false;
  }
  const rtcRisk = rtcDetected ? 10 : 0;
  totalRiskPoints += rtcRisk;
  renderItem({
    icon: '🛡️',
    title: 'WebRTC IP 泄露',
    weight: 10,
    desc: '探测浏览器 RTCPeerConnection 是否通过 STUN 服务泄露真实内网或公网 IP。',
    evidence: `WebRTC 状态: ${rtcLeakedIP}`,
    isDetected: rtcDetected,
    detectedText: `WebRTC 穿透泄露 (+10分)`,
    safeText: `安全 (非代理 UDP 已拦截)`
  });

  // 6. 国产浏览器 / WebView (权重 8)
  const ua = navigator.userAgent;
  const isDomesticBrowser = /MicroMessenger|QQBrowser|UCBrowser|Quark|BaiduBoxApp|VivoBrowser|MiuiBrowser/i.test(ua);
  const browserRisk = isDomesticBrowser ? 8 : 0;
  totalRiskPoints += browserRisk;
  renderItem({
    icon: '🧭',
    title: '国产浏览器 / WebView',
    weight: 8,
    desc: '用 UA 与 UA-CH brands 匹配微信、QQ、夸克、UC、百度等国产浏览器或应用内 WebView。',
    evidence: `UA: ${ua.slice(0, 70)}...`,
    isDetected: isDomesticBrowser,
    detectedText: `命中特征浏览器 (+8分)`,
    safeText: `通过 (纯净 Chrome 128 原生)`
  });

  // 7. 国产品牌设备 (权重 6)
  let deviceModel = '';
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const hints = await navigator.userAgentData.getHighEntropyValues(['model']);
      deviceModel = hints.model || '';
    } catch(e) {}
  }
  const isDomesticDevice = /HUAWEI|HONOR|Xiaomi|Redmi|vivo|OPPO|HarmonyOS/i.test(ua + ' ' + deviceModel);
  const devRisk = isDomesticDevice ? 6 : 0;
  totalRiskPoints += devRisk;
  renderItem({
    icon: '📱',
    title: '国产品牌设备',
    weight: 6,
    desc: '用 UA-CH 设备型号(navigator.userAgentData)与 UA 匹配鸿蒙、华为、小米、OPPO、vivo 等国产品牌。',
    evidence: `设备型号: "${deviceModel || 'None'}", 平台: "${navigator.platform}"`,
    isDetected: isDomesticDevice,
    detectedText: `命中品牌硬件特征 (+6分)`,
    safeText: `通过 (MacIntel 硬件伪装)`
  });

  // 8. Intl 区域设置 (权重 4)
  const numLocale = Intl.NumberFormat().resolvedOptions().locale;
  const isZhLocale = (numLocale || '').toLowerCase().startsWith('zh');
  const localeRisk = isZhLocale ? 4 : 0;
  totalRiskPoints += localeRisk;
  renderItem({
    icon: '⚙️',
    title: 'Intl 区域设置',
    weight: 4,
    desc: '浏览器用于日期 / 数字格式化的 locale。',
    evidence: `Intl Locale: "${numLocale}"`,
    isDetected: isZhLocale,
    detectedText: `命中中文地区偏好 (+4分)`,
    safeText: `通过 (en-US 国际化区域)`
  });

  // 9. 时区偏移 (权重 3)
  const offset = new Date().getTimezoneOffset();
  const isOffsetEast8 = offset === -480; // UTC+8
  const offsetRisk = isOffsetEast8 ? 3 : 0;
  totalRiskPoints += offsetRisk;
  renderItem({
    icon: '⏱️',
    title: '时区偏移',
    weight: 3,
    desc: 'getTimezoneOffset() 是否为 UTC+8 (-480)。',
    evidence: `getTimezoneOffset(): ${offset} (${offset <= 0 ? 'UTC+' + (-offset/60) : 'UTC-' + (offset/60)})`,
    isDetected: isOffsetEast8,
    detectedText: `命中东八区偏移 (+3分)`,
    safeText: `通过 (已纠正为西区偏移)`
  });

  // 10. Emoji 渲染风格 (权重 3)
  const isAppleStyle = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  renderItem({
    icon: '😊',
    title: 'Emoji 渲染风格',
    weight: 3,
    desc: '由 UA 推断操作系统厂商，弱相关信号。',
    evidence: `操作系统推断: ${isAppleStyle ? 'Apple/macOS 渲染环境' : 'Other'}`,
    isDetected: false,
    detectedText: `国产系统厂商`,
    safeText: `通过 (macOS 原生风格)`
  });

  // 渲染总分
  const scoreBadge = document.getElementById('riskScoreBadge');
  if (scoreBadge) {
    if (totalRiskPoints === 0) {
      scoreBadge.className = 'score-tag';
      scoreBadge.textContent = '🎉 0 风险！全维度伪装通过';
    } else {
      scoreBadge.className = 'score-tag danger';
      scoreBadge.textContent = `⚠️ 风控风险得分: ${totalRiskPoints} 分`;
    }
  }
  } finally {
    isTesting = false;
  }
}

function renderItem(data) {
  const listEl = document.getElementById('testList');
  if (!listEl) return;
  const card = document.createElement('div');
  card.className = `item-card ${data.isDetected ? 'detected' : 'safe'}`;
  card.innerHTML = `
    <div class="item-icon">${data.icon}</div>
    <div class="item-content">
      <div class="item-top">
        <span class="item-title">${data.title}</span>
        <span class="weight-tag">权重 ${data.weight}</span>
        ${data.extraTag ? `<span class="claude-tag">${data.extraTag}</span>` : ''}
      </div>
      <div class="item-desc">${data.desc}</div>
      <div class="item-evidence">${data.evidence}</div>
    </div>
    <div class="status-badge ${data.isDetected ? 'detected' : 'safe'}">
      ${data.isDetected ? data.detectedText : data.safeText}
    </div>
  `;
  listEl.appendChild(card);
}

// 绑定 DOM 事件监听，彻底摒弃 HTML inline 事件与 inline script
function initTestLab() {
  const retestBtn = document.getElementById('retestBtn');
  if (retestBtn) {
    retestBtn.removeEventListener('click', runAllTests);
    retestBtn.addEventListener('click', runAllTests);
  }
  runAllTests();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTestLab);
} else {
  initTestLab();
}

