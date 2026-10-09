/**
 * =========================================================================
 * ZoneBreaker (ZB) - Infiltrator Core Engine v1.1 (stealth.js)
 * 执行环境：MAIN World (页面主执行上下文，零隔离，无痕劫持)
 * 执行时机：document_start (在任何页面脚本执行前注入)
 * =========================================================================
 */

(function () {
  'use strict';

  // =========================================================================
  // 0. 预设配置库（必须置于最顶部声明，杜绝异步回调 TDZ ReferenceError）
  // =========================================================================
  const PROFILES = {
    'us-west': {
      timezone: 'America/Los_Angeles',
      timezoneName: 'Pacific Daylight Time',
      timezoneShort: 'PDT',
      locale: 'en-US',
      languages: Object.freeze(['en-US', 'en']),
      platform: 'MacIntel',
      platformUACH: 'macOS',
      platformVersionUACH: '15.0.0',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      brands: Object.freeze([
        { brand: 'Chromium', version: '128' },
        { brand: 'Not;A=Brand', version: '24' },
        { brand: 'Google Chrome', version: '128' }
      ])
    },
    'us-east': {
      timezone: 'America/New_York',
      timezoneName: 'Eastern Daylight Time',
      timezoneShort: 'EDT',
      locale: 'en-US',
      languages: Object.freeze(['en-US', 'en']),
      platform: 'Win32',
      platformUACH: 'Windows',
      platformVersionUACH: '15.0.0',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      brands: Object.freeze([
        { brand: 'Chromium', version: '128' },
        { brand: 'Not;A=Brand', version: '24' },
        { brand: 'Google Chrome', version: '128' }
      ])
    },
    'uk': {
      timezone: 'Europe/London',
      timezoneName: 'British Summer Time',
      timezoneShort: 'BST',
      locale: 'en-GB',
      languages: Object.freeze(['en-GB', 'en']),
      platform: 'MacIntel',
      platformUACH: 'macOS',
      platformVersionUACH: '15.0.0',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      brands: Object.freeze([
        { brand: 'Chromium', version: '128' },
        { brand: 'Not;A=Brand', version: '24' },
        { brand: 'Google Chrome', version: '128' }
      ])
    },
    'jp': {
      timezone: 'Asia/Tokyo',
      timezoneName: 'Japan Standard Time',
      timezoneShort: 'JST',
      locale: 'ja-JP',
      languages: Object.freeze(['ja-JP', 'ja', 'en-US', 'en']),
      platform: 'MacIntel',
      platformUACH: 'macOS',
      platformVersionUACH: '15.0.0',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      vendor: 'Google Inc.',
      brands: Object.freeze([
        { brand: 'Chromium', version: '128' },
        { brand: 'Not;A=Brand', version: '24' },
        { brand: 'Google Chrome', version: '128' }
      ])
    }
  };

  const hostname = window.location.hostname || '';
  const href = window.location.href || '';
  const isTestPage = href.includes('detector_test.html') || hostname === 'localhost' || hostname === '127.0.0.1';

  // 国内常用生活/办公网站排除清单（保持原生中文环境直通，不干扰日常使用）
  const DOMESTIC_EXCLUDED = [
    'baidu.com', 'taobao.com', 'jd.com', 'bilibili.com', 'qq.com',
    '163.com', 'zhihu.com', 'weibo.com', 'alipay.com', 'douyin.com',
    'feishu.cn', 'dingtalk.com', 'xiaohongshu.com', 'csdn.net'
  ];

  const isDomesticSite = hostname.endsWith('.cn') || DOMESTIC_EXCLUDED.some(d => hostname.endsWith(d));
  const isExplicitlyDisabled = sessionStorage.getItem('__ZB_DISABLED_' + hostname) === 'true' || sessionStorage.getItem('__ZB_DOMAIN_DISABLED__') === 'true';

  // 决定当前生效的 Profile (优先从 sessionStorage 取，默认 us-west)
  const initialProfileKey = sessionStorage.getItem('__ZB_PROFILE_KEY__') || 'us-west';
  let CURRENT_CONFIG = PROFILES[initialProfileKey] || PROFILES['us-west'];
  let ADVANCED_OPTIONS = {
    enableCanvasNoise: false,
    enableAudioNoise: false
  };

  // 监听来自 Content Bridge 的动态配置广播 (支持热更新与按需激活)
  window.addEventListener('__ZB_CONFIG_BROADCAST__', (e) => {
    if (!e.detail) return;
    if (e.detail.profileKey && PROFILES[e.detail.profileKey]) {
      CURRENT_CONFIG = PROFILES[e.detail.profileKey];
    }
    if (e.detail.settings) {
      ADVANCED_OPTIONS = Object.assign(ADVANCED_OPTIONS, e.detail.settings);
    }
    if (e.detail.isCustomActive && !window.__ZONE_BREAKER_ACTIVE__) {
      initZoneBreaker(e.detail.settings, e.detail.profileKey);
    }
  });

  // 全局默认武装原则：除了明确排除的国内生活网站外，默认对所有海外、AI 及风控测试网站全面武装！
  if ((isDomesticSite || isExplicitlyDisabled) && !isTestPage) {
    return;
  }

  initZoneBreaker();

  function initZoneBreaker(customSettings, customProfileKey) {
    if (window.__ZONE_BREAKER_ACTIVE__) return;

    Object.defineProperty(window, '__ZONE_BREAKER_ACTIVE__', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false
    });

    if (customProfileKey && PROFILES[customProfileKey]) {
      CURRENT_CONFIG = PROFILES[customProfileKey];
    }
    if (customSettings) {
      ADVANCED_OPTIONS = Object.assign(ADVANCED_OPTIONS, customSettings);
    }

    // =========================================================================
    // 1. 原生 Function.prototype.toString 隐蔽保护 (反探测第一道防线)
    // =========================================================================
    const originalToString = Function.prototype.toString;
    const hookedFunctionsMap = new WeakMap();

    function disguiseAsNative(customFn, originalFnOrName) {
      const fnName = typeof originalFnOrName === 'string'
        ? originalFnOrName
        : (originalFnOrName ? originalFnOrName.name : customFn.name);
      hookedFunctionsMap.set(customFn, `function ${fnName}() { [native code] }`);
      return customFn;
    }

    const patchedToString = function toString() {
      if (hookedFunctionsMap.has(this)) {
        return hookedFunctionsMap.get(this);
      }
      return originalToString.call(this);
    };
    disguiseAsNative(patchedToString, 'toString');

    try {
      Object.defineProperty(Function.prototype, 'toString', {
        value: patchedToString,
        writable: true,
        configurable: true,
        enumerable: false
      });
    } catch (e) {}

    // =========================================================================
    // 2. 浏览器语言与客户端环境 (navigator.languages / language / platform / UA)
    // =========================================================================
    function redefineGetter(proto, prop, getterFn) {
      try {
        disguiseAsNative(getterFn, `get ${prop}`);
        Object.defineProperty(proto, prop, {
          get: getterFn,
          set: undefined,
          enumerable: true,
          configurable: true
        });
      } catch (e) {}
    }

    redefineGetter(Navigator.prototype, 'language', () => CURRENT_CONFIG.locale);
    redefineGetter(Navigator.prototype, 'languages', () => CURRENT_CONFIG.languages);
    redefineGetter(Navigator.prototype, 'platform', () => CURRENT_CONFIG.platform);
    redefineGetter(Navigator.prototype, 'userAgent', () => CURRENT_CONFIG.ua);
    redefineGetter(Navigator.prototype, 'appVersion', () => CURRENT_CONFIG.appVersion);
    redefineGetter(Navigator.prototype, 'vendor', () => CURRENT_CONFIG.vendor);

    // =========================================================================
    // 3. User-Agent Client Hints (UA-CH) 深度重构（国产设备品牌与型号清除）
    // =========================================================================
    if (navigator.userAgentData) {
      const fakeUAData = {
        brands: CURRENT_CONFIG.brands,
        mobile: false,
        platform: CURRENT_CONFIG.platformUACH,
        getHighEntropyValues: disguiseAsNative(function getHighEntropyValues(hints) {
          return Promise.resolve({
            architecture: 'arm',
            bitness: '64',
            brands: CURRENT_CONFIG.brands,
            fullVersionList: CURRENT_CONFIG.brands,
            mobile: false,
            model: '', // 彻底抹杀 Xiaomi, HUAWEI, vivo, OPPO 等型号
            platform: CURRENT_CONFIG.platformUACH,
            platformVersion: CURRENT_CONFIG.platformVersionUACH,
            uaFullVersion: '128.0.6613.120'
          });
        }, 'getHighEntropyValues'),
        toJSON: disguiseAsNative(function toJSON() {
          return {
            brands: CURRENT_CONFIG.brands,
            mobile: false,
            platform: CURRENT_CONFIG.platformUACH
          };
        }, 'toJSON')
      };

      redefineGetter(Navigator.prototype, 'userAgentData', () => fakeUAData);
    }

    // =========================================================================
    // 4. 系统时区与时区偏移伪装 (Intl.DateTimeFormat & Date prototype)
    // =========================================================================
    const OriginalDTF = Intl.DateTimeFormat;
    const originalResolvedOptions = OriginalDTF.prototype.resolvedOptions;

    const patchedResolvedOptions = disguiseAsNative(function resolvedOptions() {
      const opts = originalResolvedOptions.call(this);
      opts.timeZone = CURRENT_CONFIG.timezone;
      opts.locale = CURRENT_CONFIG.locale;
      return opts;
    }, 'resolvedOptions');
    OriginalDTF.prototype.resolvedOptions = patchedResolvedOptions;

    const PatchedDateTimeFormat = disguiseAsNative(function (...args) {
      let locales = args[0];
      let options = args[1] || {};

      if (!locales || locales === 'default' || (typeof locales === 'string' && locales.startsWith('zh'))) {
        locales = CURRENT_CONFIG.locale;
      }
      if (!options.timeZone) {
        options = Object.assign({}, options, { timeZone: CURRENT_CONFIG.timezone });
      }
      return new OriginalDTF(locales, options);
    }, 'DateTimeFormat');

    PatchedDateTimeFormat.prototype = OriginalDTF.prototype;
    PatchedDateTimeFormat.supportedLocalesOf = OriginalDTF.supportedLocalesOf;
    Intl.DateTimeFormat = PatchedDateTimeFormat;

    // 全面重写所有 Intl 工具的 resolvedOptions locale
    ['NumberFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'DisplayNames', 'ListFormat', 'Segmenter'].forEach(apiName => {
      if (Intl[apiName] && Intl[apiName].prototype.resolvedOptions) {
        const origRes = Intl[apiName].prototype.resolvedOptions;
        Intl[apiName].prototype.resolvedOptions = disguiseAsNative(function resolvedOptions() {
          const res = origRes.call(this);
          res.locale = CURRENT_CONFIG.locale;
          return res;
        }, 'resolvedOptions');
      }
    });

    function getTargetTimezoneOffset(date) {
      const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
      const targetDate = new Date(date.toLocaleString('en-US', { timeZone: CURRENT_CONFIG.timezone }));
      return Math.round((utcDate.getTime() - targetDate.getTime()) / 60000);
    }

    Date.prototype.getTimezoneOffset = disguiseAsNative(function getTimezoneOffset() {
      return getTargetTimezoneOffset(this);
    }, 'getTimezoneOffset');

    const originalDateToString = Date.prototype.toString;
    const originalToTimeString = Date.prototype.toTimeString;

    Date.prototype.toString = disguiseAsNative(function toString() {
      const raw = originalDateToString.call(this);
      const offsetMin = getTargetTimezoneOffset(this);
      const sign = offsetMin <= 0 ? '+' : '-';
      const absMin = Math.abs(offsetMin);
      const hours = String(Math.floor(absMin / 60)).padStart(2, '0');
      const mins = String(absMin % 60).padStart(2, '0');
      const offsetStr = `GMT${sign}${hours}${mins}`;

      return raw.replace(/GMT[+-]\d{4}\s*\(.*?\)/, `${offsetStr} (${CURRENT_CONFIG.timezoneName})`);
    }, 'toString');

    Date.prototype.toTimeString = disguiseAsNative(function toTimeString() {
      const raw = originalToTimeString.call(this);
      const offsetMin = getTargetTimezoneOffset(this);
      const sign = offsetMin <= 0 ? '+' : '-';
      const absMin = Math.abs(offsetMin);
      const hours = String(Math.floor(absMin / 60)).padStart(2, '0');
      const mins = String(absMin % 60).padStart(2, '0');
      const offsetStr = `GMT${sign}${hours}${mins}`;

      return raw.replace(/GMT[+-]\d{4}\s*\(.*?\)/, `${offsetStr} (${CURRENT_CONFIG.timezoneName})`);
    }, 'toTimeString');

    // =========================================================================
    // 5. 字体双重隐形装甲：彻底覆盖简繁体与厂商中文字体
    //    (针对 FuckClaude 等高精测试库的 Canvas 测宽探针全面反制)
    // =========================================================================
    const CHINESE_FONTS_LIST = [
      // 简体中文字体 (FuckClaude FONTS_SC)
      'Microsoft YaHei', 'Microsoft YaHei UI', '微软雅黑',
      'SimSun', '宋体', 'NSimSun', '新宋体', 'SimHei', '黑体',
      'KaiTi', '楷体', 'FangSong', '仿宋', 'DengXian', '等线',
      'PingFang SC', '苹方', 'Hiragino Sans GB', '冬青黑体',
      'STHeiti', 'STSong', 'STKaiti', 'STFangsong',
      'Songti SC', 'Heiti SC', 'Kaiti SC',
      'Source Han Sans CN', 'Source Han Sans SC', '思源黑体',
      'Noto Sans CJK SC', 'Noto Serif CJK SC',
      'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', '文泉驿微米黑', '文泉驿正黑',
      'Lantinghei SC', '兰亭黑',
      // 繁体中文字体 (FuckClaude FONTS_TC)
      'Microsoft JhengHei', '微軟正黑體', 'PMingLiU', '新細明體', 'MingLiU', '細明體',
      'DFKai-SB', '標楷體', 'PingFang TC', 'PingFang HK', '苹方-繁',
      'Source Han Sans TW', 'Noto Sans CJK TC',
      // 国产厂商/软件字体 (FuckClaude FONTS_CN_VENDOR)
      'MiSans', 'MIUI', 'HarmonyOS Sans SC', 'HarmonyOS Sans', 'HarmonyOS', '鸿蒙黑体',
      'HONOR Sans', 'HonorSans', 'OPPO Sans', 'OPPOSans', 'vivo Sans', 'vivoSans',
      'Alibaba PuHuiTi', 'Alibaba Sans', 'DingTalk JinBuTi', 'Douyin Sans',
      'HYQiHei', '汉仪旗黑', 'FZShuSong-Z01S', 'FZKai-Z03S', 'FZHei-B01S', 'FZFangSong-Z02S',
      'WPS Office', 'FZShuTi', 'FangZheng', '方正'
    ];

    const sortedFonts = [...CHINESE_FONTS_LIST].sort((a, b) => b.length - a.length);
    const CHINESE_FONTS_REGEX = new RegExp(sortedFonts.join('|'), 'i');

    function sanitizeFontString(fontStr) {
      if (!fontStr || typeof fontStr !== 'string') return fontStr;
      if (!CHINESE_FONTS_REGEX.test(fontStr)) return fontStr;

      const parts = fontStr.split(',');
      const cleanedParts = [];

      // 提取字体大小与样式前缀（如 "72px" 或 "italic bold 16px"）
      const firstPrefixMatch = parts[0].trim().match(/^(.*?\d+(?:px|pt|em|rem|%))\b/i);
      const prefix = firstPrefixMatch ? firstPrefixMatch[1] : '72px';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (i === 0) {
          const prefixMatch = part.match(/^(.*?\d+(?:px|pt|em|rem|%))\s+(.*)$/i);
          if (prefixMatch) {
            const fontName = prefixMatch[2].replace(/^['"]+|['"]+$/g, '');
            if (!CHINESE_FONTS_REGEX.test(fontName)) {
              cleanedParts.push(part);
            }
          } else {
            const fontName = part.replace(/^['"]+|['"]+$/g, '');
            if (!CHINESE_FONTS_REGEX.test(fontName)) {
              cleanedParts.push(part);
            }
          }
        } else {
          const fontName = part.replace(/^['"]+|['"]+$/g, '');
          if (!CHINESE_FONTS_REGEX.test(fontName)) {
            cleanedParts.push(part);
          }
        }
      }

      if (cleanedParts.length === 0) {
        return prefix + ' monospace';
      }

      // 如果首个保留的字体未携带大小前缀，补全前缀保证 CSS 规范有效
      if (!cleanedParts[0].match(/\d+(?:px|pt|em|rem|%)/i)) {
        cleanedParts[0] = prefix + ' ' + cleanedParts[0];
      }

      return cleanedParts.join(', ');
    }

    // 劫持标准 CanvasRenderingContext2D.prototype.measureText
    const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = disguiseAsNative(function measureText(text) {
      const currentFont = this.font;
      if (CHINESE_FONTS_REGEX.test(currentFont)) {
        this.font = sanitizeFontString(currentFont);
        const metrics = originalMeasureText.call(this, text);
        this.font = currentFont;
        return metrics;
      }
      return originalMeasureText.call(this, text);
    }, 'measureText');

    // 劫持现代 OffscreenCanvasRenderingContext2D (防止后台线程探测)
    if (typeof OffscreenCanvasRenderingContext2D !== 'undefined' && OffscreenCanvasRenderingContext2D.prototype.measureText) {
      const origOffscreenMeasure = OffscreenCanvasRenderingContext2D.prototype.measureText;
      OffscreenCanvasRenderingContext2D.prototype.measureText = disguiseAsNative(function measureText(text) {
        const currentFont = this.font;
        if (CHINESE_FONTS_REGEX.test(currentFont)) {
          this.font = sanitizeFontString(currentFont);
          const metrics = origOffscreenMeasure.call(this, text);
          this.font = currentFont;
          return metrics;
        }
        return origOffscreenMeasure.call(this, text);
      }, 'measureText');
    }

    // 劫持 document.fonts.check 与 document.fonts.has
    if (document.fonts) {
      if (document.fonts.check) {
        const originalFontsCheck = document.fonts.check;
        document.fonts.check = disguiseAsNative(function check(font, text) {
          if (CHINESE_FONTS_REGEX.test(font)) {
            return false;
          }
          return originalFontsCheck.call(document.fonts, font, text);
        }, 'check');
      }
      if (document.fonts.has) {
        const origFontsHas = document.fonts.has;
        document.fonts.has = disguiseAsNative(function has(fontFace) {
          if (fontFace && fontFace.family && CHINESE_FONTS_REGEX.test(fontFace.family)) {
            return false;
          }
          return origFontsHas.call(document.fonts, fontFace);
        }, 'has');
      }
    }

    // 劫持 Local Font Access API (window.queryLocalFonts)
    if (typeof window.queryLocalFonts === 'function') {
      const origQueryLocalFonts = window.queryLocalFonts;
      window.queryLocalFonts = disguiseAsNative(async function queryLocalFonts() {
        const fonts = await origQueryLocalFonts.call(window);
        return fonts.filter(f => !CHINESE_FONTS_REGEX.test(f.family) && !CHINESE_FONTS_REGEX.test(f.fullName));
      }, 'queryLocalFonts');
    }

    // =========================================================================
    // 6. Iframe 逃逸拦截（防止新建干净 iframe 探测）
    // =========================================================================
    try {
      const origContentWin = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
      if (origContentWin && origContentWin.get) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
          get: disguiseAsNative(function () {
            const win = origContentWin.get.call(this);
            if (win && win.Navigator && win.Navigator.prototype) {
              try {
                redefineGetter(win.Navigator.prototype, 'language', () => CURRENT_CONFIG.locale);
                redefineGetter(win.Navigator.prototype, 'languages', () => CURRENT_CONFIG.languages);
              } catch (e) {}
            }
            return win;
          }, 'get contentWindow'),
          configurable: true,
          enumerable: true
        });
      }
    } catch (e) {}

    // =========================================================================
    // 7. WebRTC 前端兜底防线
    // =========================================================================
    if (window.RTCPeerConnection) {
      const OriginalPC = window.RTCPeerConnection;
      const originalCreateOffer = OriginalPC.prototype.createOffer;

      OriginalPC.prototype.createOffer = disguiseAsNative(function createOffer(...args) {
        this.addEventListener('icecandidate', (e) => {
          if (e.candidate && e.candidate.candidate) {
            const cand = e.candidate.candidate;
            if (/192\.168\.|10\.\d+|172\.(1[6-9]|2\d|3[01])\./.test(cand)) {
              try {
                Object.defineProperty(e, 'candidate', { value: null });
              } catch (err) {}
            }
          }
        }, true);
        return originalCreateOffer.apply(this, args);
      }, 'createOffer');
    }

    console.log(`%c[ZoneBreaker ZB]%c Infiltrator Armed for [${hostname || 'All'}] using [${CURRENT_CONFIG.timezone}].`,
      'background: #0d1117; color: #00ff66; font-weight: bold; padding: 2px 6px; border-radius: 3px; border: 1px solid #00ff66;',
      'color: #00ff66;');
  }

  // 监听来自 Bridge 的热更新广播
  window.addEventListener('__ZB_CONFIG_BROADCAST__', (e) => {
    if (e.detail && e.detail.profileKey && PROFILES[e.detail.profileKey]) {
      CURRENT_CONFIG = PROFILES[e.detail.profileKey];
      sessionStorage.setItem('__ZB_PROFILE_KEY__', e.detail.profileKey);
    }
  });

})();
