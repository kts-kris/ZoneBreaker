/**
 * ZoneBreaker (ZB) - Background Service Worker v1.0
 * 职责：
 * 1. WebRTC 底层非代理 UDP 封禁策略
 * 2. 扩展图标 Badge 动态状态更新 (绿色 ZB / 灰度关闭)
 * 3. 智能 GeoIP 单次探测对齐接口
 * 4. 动态 HTTP 请求头清洗规则 (User-Agent, Accept-Language, sec-ch-ua)
 */

const PRESET_PROFILES = {
  'us-west': {
    name: '🇺🇸 美国西岸 (硅谷原生 macOS)',
    timezone: 'America/Los_Angeles',
    timezoneName: 'Pacific Daylight Time',
    timezoneShort: 'PDT',
    locale: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'MacIntel',
    platformUACH: 'macOS',
    platformVersionUACH: '15.0.0',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Chromium', version: '128' },
      { brand: 'Not;A=Brand', version: '24' },
      { brand: 'Google Chrome', version: '128' }
    ]
  },
  'us-east': {
    name: '🇺🇸 美国东岸 (纽约商务 Windows 11)',
    timezone: 'America/New_York',
    timezoneName: 'Eastern Daylight Time',
    timezoneShort: 'EDT',
    locale: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'Win32',
    platformUACH: 'Windows',
    platformVersionUACH: '15.0.0',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Chromium', version: '128' },
      { brand: 'Not;A=Brand', version: '24' },
      { brand: 'Google Chrome', version: '128' }
    ]
  },
  'uk': {
    name: '🇬🇧 英国伦敦 (London macOS)',
    timezone: 'Europe/London',
    timezoneName: 'British Summer Time',
    timezoneShort: 'BST',
    locale: 'en-GB',
    languages: ['en-GB', 'en'],
    platform: 'MacIntel',
    platformUACH: 'macOS',
    platformVersionUACH: '15.0.0',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Chromium', version: '128' },
      { brand: 'Not;A=Brand', version: '24' },
      { brand: 'Google Chrome', version: '128' }
    ]
  },
  'jp': {
    name: '🇯🇵 日本东京 (Tokyo macOS)',
    timezone: 'Asia/Tokyo',
    timezoneName: 'Japan Standard Time',
    timezoneShort: 'JST',
    locale: 'ja-JP',
    languages: ['ja-JP', 'ja', 'en-US', 'en'],
    platform: 'MacIntel',
    platformUACH: 'macOS',
    platformVersionUACH: '15.0.0',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Chromium', version: '128' },
      { brand: 'Not;A=Brand', version: '24' },
      { brand: 'Google Chrome', version: '128' }
    ]
  }
};

const DEFAULT_WHITELIST = [
  'claude.ai',
  'chatgpt.com',
  'oaistatic.com',
  'openai.com',
  'perplexity.ai',
  'cursor.com',
  'poe.com'
];

// 初始化插件存储
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['zb_settings', 'zb_profiles', 'zb_custom_domains', 'zb_domain_profiles']);
  
  if (!current.zb_settings) {
    await chrome.storage.local.set({
      zb_settings: {
        enabled: true,
        webRTCProtection: true,
        enableCanvasNoise: false,
        enableAudioNoise: false,
        aggressiveFontSandboxing: true
      },
      zb_profiles: PRESET_PROFILES,
      zb_custom_domains: DEFAULT_WHITELIST,
      zb_domain_profiles: {
        'claude.ai': 'us-west',
        'chatgpt.com': 'us-west',
        'perplexity.ai': 'us-west',
        'cursor.com': 'us-west',
        'poe.com': 'us-west'
      }
    });
  }

  applyWebRTCPolicy(true);
  await syncDeclarativeNetRules();
  console.log('[ZoneBreaker ZB] Background Engine armed.');
});

// 应用 WebRTC 底层拦截策略
function applyWebRTCPolicy(enable) {
  if (chrome.privacy && chrome.privacy.network && chrome.privacy.network.webRTCIPHandlingPolicy) {
    const policy = enable ? 'disable_non_proxied_udp' : 'default';
    chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: policy }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[ZoneBreaker ZB] WebRTC Policy error:', chrome.runtime.lastError);
      }
    });
  }
}

const DOMESTIC_EXCLUDED = [
  'baidu.com', 'taobao.com', 'jd.com', 'bilibili.com', 'qq.com',
  '163.com', 'zhihu.com', 'weibo.com', 'alipay.com', 'douyin.com',
  'feishu.cn', 'dingtalk.com', 'xiaohongshu.com', 'csdn.net'
];

// 动态同步 declarativeNetRequest 规则 (全局默认清洗，排除国内网站与特定禁用网站)
async function syncDeclarativeNetRules() {
  if (!chrome.declarativeNetRequest) return;

  const data = await chrome.storage.local.get(['zb_settings', 'zb_disabled_domains', 'zb_profiles']);
  const settings = data.zb_settings || { enabled: true };
  const disabledDomains = data.zb_disabled_domains || [];
  const profile = (data.zb_profiles && data.zb_profiles['us-west']) || PRESET_PROFILES['us-west'];

  if (!settings.enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1001]
    });
    return;
  }

  const excluded = Array.from(new Set([...DOMESTIC_EXCLUDED, ...disabledDomains]));

  const rule = {
    id: 1001,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Accept-Language', operation: 'set', value: `${profile.locale},${profile.languages.join(',')};q=0.9` },
        { header: 'sec-ch-ua', operation: 'set', value: '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"' },
        { header: 'sec-ch-ua-mobile', operation: 'set', value: '?0' },
        { header: 'sec-ch-ua-platform', operation: 'set', value: `"${profile.platformUACH}"` },
        { header: 'User-Agent', operation: 'set', value: profile.ua }
      ]
    },
    condition: {
      urlFilter: '|http*',
      excludedRequestDomains: excluded,
      resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest', 'ping', 'other']
    }
  };

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1001],
    addRules: [rule]
  });
}

// 监听消息 (Badge 更新 / GeoIP 探测)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'UPDATE_TAB_BADGE') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      if (message.isArmable) {
        chrome.action.setBadgeText({ text: 'ZB', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#00ff66', tabId });
        try {
          chrome.action.setBadgeTextColor({ color: '#0d1117', tabId });
        } catch(e) {}
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    }
    sendResponse({ status: 'ok' });
  } else if (message.action === 'FETCH_GEO_IP') {
    fetchGeoIPData()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === 'RELOAD_RULES') {
    syncDeclarativeNetRules().then(() => sendResponse({ status: 'ok' }));
    return true;
  }
});

// 单次 GeoIP 探测函数
async function fetchGeoIPData() {
  const response = await fetch('https://ipapi.co/json/');
  if (!response.ok) {
    throw new Error(`GeoIP probe failed with HTTP ${response.status}`);
  }
  const json = await response.json();
  return {
    ip: json.ip,
    city: json.city,
    region: json.region,
    country: json.country_name,
    countryCode: json.country_code,
    timezone: json.timezone || 'America/Los_Angeles',
    utcOffset: json.utc_offset
  };
}

// 标签页切换时更新 Badge
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab || !tab.url) return;
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const isTest = tab.url.includes('detector_test.html');

    const data = await chrome.storage.local.get(['zb_settings', 'zb_disabled_domains']);
    const settings = data.zb_settings || { enabled: true };
    const disabledDomains = data.zb_disabled_domains || [];

    const isDomesticSite = hostname.endsWith('.cn') || DOMESTIC_EXCLUDED.some(d => hostname.endsWith(d));
    const isArmable = settings.enabled && (!isDomesticSite || isTest) && !disabledDomains.includes(hostname);

    if (isArmable) {
      chrome.action.setBadgeText({ text: 'ZB', tabId: activeInfo.tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#00ff66', tabId: activeInfo.tabId });
      try {
        chrome.action.setBadgeTextColor({ color: '#0d1117', tabId: activeInfo.tabId });
      } catch(e) {}
    } else {
      chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
    }
  } catch (e) {}
});
