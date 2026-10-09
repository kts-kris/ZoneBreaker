/**
 * ZoneBreaker (ZB) - Content Bridge (Isolated World) v1.1
 * 职责：连接 Chrome Extension 权限环境 (chrome.storage/runtime) 与页面主世界 (MAIN World)
 */

(async function () {
  'use strict';

  const hostname = window.location.hostname || '';
  const href = window.location.href || '';
  const isTestPage = href.includes('detector_test.html') || hostname === 'localhost' || hostname === '127.0.0.1';

  const DOMESTIC_EXCLUDED = [
    'baidu.com', 'taobao.com', 'jd.com', 'bilibili.com', 'qq.com',
    '163.com', 'zhihu.com', 'weibo.com', 'alipay.com', 'douyin.com',
    'feishu.cn', 'dingtalk.com', 'xiaohongshu.com', 'csdn.net'
  ];

  const isDomesticSite = hostname.endsWith('.cn') || DOMESTIC_EXCLUDED.some(d => hostname.endsWith(d));

  try {
    const data = await chrome.storage.local.get(['zb_settings', 'zb_domain_profiles', 'zb_disabled_domains']);
    const settings = data.zb_settings || { enabled: true };
    const domainProfiles = data.zb_domain_profiles || {};
    const disabledDomains = data.zb_disabled_domains || [];

    const isExplicitlyDisabled = disabledDomains.includes(hostname);
    const isGlobalActive = settings.enabled !== false;
    const isArmable = isGlobalActive && (!isDomesticSite || isTestPage) && !isExplicitlyDisabled;

    const assignedProfileKey = domainProfiles[hostname] || 'us-west';

    // 缓存至 sessionStorage，供后续页面主世界在 document_start 第一毫秒同步读取
    if (isExplicitlyDisabled) {
      sessionStorage.setItem('__ZB_DISABLED_' + hostname, 'true');
      sessionStorage.setItem('__ZB_DOMAIN_DISABLED__', 'true');
    } else {
      sessionStorage.removeItem('__ZB_DISABLED_' + hostname);
      sessionStorage.removeItem('__ZB_DOMAIN_DISABLED__');
      sessionStorage.setItem('__ZB_PROFILE_KEY__', assignedProfileKey);
    }

    // 广播配置给 MAIN World 中的 stealth.js
    window.dispatchEvent(new CustomEvent('__ZB_CONFIG_BROADCAST__', {
      detail: {
        globalEnabled: isGlobalActive,
        isCustomActive: isArmable,
        profileKey: assignedProfileKey,
        settings: settings
      }
    }));

    // 通知 background 更新当前 Tab 的角标
    chrome.runtime.sendMessage({
      action: 'UPDATE_TAB_BADGE',
      hostname: hostname,
      isArmable: isArmable
    }).catch(() => {});

  } catch (e) {
    // 忽略异常
  }

  // 监听来自 Popup 的即时热更新指令
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'HOT_RELOAD_ZB') {
      window.dispatchEvent(new CustomEvent('__ZB_CONFIG_BROADCAST__', {
        detail: message.payload
      }));
      sendResponse({ status: 'ok' });
    }
  });
})();
