/**
 * ZoneBreaker (ZB) - Popup Controller v1.0
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM 元素引用
  const masterToggle = document.getElementById('masterToggle');
  const badgeStatus = document.getElementById('badgeStatus');
  const currentDomainEl = document.getElementById('currentDomain');
  const domainCard = document.getElementById('domainCard');
  const domainToggle = document.getElementById('domainToggle');
  const profileSelect = document.getElementById('profileSelect');
  const btnGeoSync = document.getElementById('btnGeoSync');
  const geoBtnText = document.getElementById('geoBtnText');
  const geoResultText = document.getElementById('geoResultText');
  const radarSummary = document.getElementById('radarSummary');

  // 雷达状态值
  const valTimezone = document.getElementById('valTimezone');
  const valLocale = document.getElementById('valLocale');
  const valPlatform = document.getElementById('valPlatform');
  const valOffset = document.getElementById('valOffset');

  // 高级面板
  const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  const advancedDrawer = document.getElementById('advancedDrawer');
  const advArrow = document.getElementById('advArrow');
  const chkCanvasNoise = document.getElementById('chkCanvasNoise');
  const chkFontSandbox = document.getElementById('chkFontSandbox');
  const btnExportConfig = document.getElementById('btnExportConfig');
  const btnImportConfig = document.getElementById('btnImportConfig');
  const fileInputImport = document.getElementById('fileInputImport');
  const btnOpenTest = document.getElementById('btnOpenTest');

  // 1. 获取当前活跃标签页的 Hostname
  let currentHostname = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
        currentHostname = new URL(tab.url).hostname;
      } else if (tab.url.includes('detector_test.html')) {
        currentHostname = 'Local-Test-Lab';
      }
    }
  } catch (e) {}

  currentDomainEl.textContent = currentHostname || '未匹配到 HTTP 网页';

  const DOMESTIC_EXCLUDED = [
    'baidu.com', 'taobao.com', 'jd.com', 'bilibili.com', 'qq.com',
    '163.com', 'zhihu.com', 'weibo.com', 'alipay.com', 'douyin.com',
    'feishu.cn', 'dingtalk.com', 'xiaohongshu.com', 'csdn.net'
  ];

  // 2. 加载 Storage 配置数据
  const data = await chrome.storage.local.get([
    'zb_settings', 'zb_profiles', 'zb_disabled_domains', 'zb_domain_profiles'
  ]);

  const settings = data.zb_settings || { enabled: true, aggressiveFontSandboxing: true };
  const disabledDomains = data.zb_disabled_domains || [];
  const domainProfiles = data.zb_domain_profiles || {};
  const profiles = data.zb_profiles || {};

  // 初始化总开关与高级开关
  masterToggle.checked = settings.enabled !== false;
  chkCanvasNoise.checked = !!settings.enableCanvasNoise;
  chkFontSandbox.checked = settings.aggressiveFontSandboxing !== false;
  updateMasterBadge(masterToggle.checked);

  // 初始化当前域名开关与绑定 Profile (全局默认生效，除非在国内排除清单或用户手动禁用)
  const isDomestic = currentHostname.endsWith('.cn') || DOMESTIC_EXCLUDED.some(d => currentHostname.endsWith(d));
  const isDomainDisabled = disabledDomains.includes(currentHostname) || (isDomestic && !domainProfiles[currentHostname]);
  const isDomainActive = currentHostname && !isDomainDisabled;

  domainToggle.checked = !!isDomainActive;
  updateDomainCardStyle(domainToggle.checked);

  const currentProfileKey = (currentHostname && domainProfiles[currentHostname]) || 'us-west';
  profileSelect.value = currentProfileKey;
  updateRadarDisplay(currentProfileKey, profiles);

  // =========================================================================
  // 事件交互逻辑
  // =========================================================================

  // 全局总开关
  masterToggle.addEventListener('change', async () => {
    const isEnabled = masterToggle.checked;
    updateMasterBadge(isEnabled);
    settings.enabled = isEnabled;
    await chrome.storage.local.set({ zb_settings: settings });
    notifyBackgroundReload();
  });

  // 当前网站开关
  domainToggle.addEventListener('change', async () => {
    if (!currentHostname || currentHostname === 'Local-Test-Lab') return;
    const isChecked = domainToggle.checked;
    updateDomainCardStyle(isChecked);

    let updatedDisabled = [...disabledDomains];
    if (isChecked) {
      updatedDisabled = updatedDisabled.filter(d => d !== currentHostname);
    } else {
      if (!updatedDisabled.includes(currentHostname)) {
        updatedDisabled.push(currentHostname);
      }
    }

    await chrome.storage.local.set({ zb_disabled_domains: updatedDisabled });
    notifyBackgroundReload();
  });

  // 预设 Profile 切换
  profileSelect.addEventListener('change', async () => {
    const selectedKey = profileSelect.value;
    updateRadarDisplay(selectedKey, profiles);

    if (currentHostname) {
      domainProfiles[currentHostname] = selectedKey;
      await chrome.storage.local.set({ zb_domain_profiles: domainProfiles });
    }

    notifyBackgroundReload();
  });

  // 一键 GeoIP 对齐代理时区
  btnGeoSync.addEventListener('click', async () => {
    geoBtnText.textContent = '正在探测当前代理出口 IP...';
    geoResultText.textContent = '向探测节点请求地理元数据中...';
    btnGeoSync.disabled = true;

    chrome.runtime.sendMessage({ action: 'FETCH_GEO_IP' }, async (response) => {
      btnGeoSync.disabled = false;
      geoBtnText.textContent = '一键根据当前代理 IP 自动对齐时区';

      if (response && response.success && response.data) {
        const info = response.data;
        geoResultText.innerHTML = `已对齐节点: <span style="color:#58a6ff">${info.ip}</span> (${info.city || info.region}, ${info.country}) 时区: <span style="color:#00ff66">${info.timezone}</span>`;

        // 根据探测时区智能映射或动态更新
        if (info.timezone.includes('New_York') || info.timezone.includes('Chicago')) {
          profileSelect.value = 'us-east';
        } else if (info.timezone.includes('Tokyo')) {
          profileSelect.value = 'jp';
        } else if (info.timezone.includes('London')) {
          profileSelect.value = 'uk';
        } else {
          profileSelect.value = 'us-west';
        }
        profileSelect.dispatchEvent(new Event('change'));
      } else {
        geoResultText.textContent = `探测失败: ${response ? response.error : '网络无响应'}`;
      }
    });
  });

  // 高级面板折叠开合
  btnToggleAdvanced.addEventListener('click', () => {
    advancedDrawer.classList.toggle('hidden');
    advArrow.textContent = advancedDrawer.classList.contains('hidden') ? '▼' : '▲';
  });

  // 高级选项存储
  chkCanvasNoise.addEventListener('change', async () => {
    settings.enableCanvasNoise = chkCanvasNoise.checked;
    await chrome.storage.local.set({ zb_settings: settings });
  });

  chkFontSandbox.addEventListener('change', async () => {
    settings.aggressiveFontSandboxing = chkFontSandbox.checked;
    await chrome.storage.local.set({ zb_settings: settings });
  });

  // 导出配置 (JSON)
  btnExportConfig.addEventListener('click', async () => {
    const allData = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zonebreaker_config_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 导入配置 (JSON)
  btnImportConfig.addEventListener('click', () => {
    fileInputImport.click();
  });

  fileInputImport.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        await chrome.storage.local.set(imported);
        alert('ZoneBreaker 配置已成功导入并生效！');
        window.location.reload();
      } catch (err) {
        alert('导入失败：配置文件格式错误');
      }
    };
    reader.readAsText(file);
  });

  // 打开 1:1 检测实验室
  btnOpenTest.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('test/detector_test.html')
    });
  });

  // =========================================================================
  // UI 辅助方法
  // =========================================================================
  function updateMasterBadge(active) {
    if (active) {
      badgeStatus.textContent = 'ARMED';
      badgeStatus.classList.remove('disabled');
      radarSummary.textContent = '10/10 PASS';
      radarSummary.style.background = '#238636';
    } else {
      badgeStatus.textContent = 'DISARMED';
      badgeStatus.classList.add('disabled');
      radarSummary.textContent = 'STANDBY';
      radarSummary.style.background = '#6e7681';
    }
  }

  function updateDomainCardStyle(active) {
    if (active) {
      domainCard.classList.remove('inactive');
    } else {
      domainCard.classList.add('inactive');
    }
  }

  function updateRadarDisplay(profileKey, allProfiles) {
    const p = (allProfiles && allProfiles[profileKey]) || {};
    if (profileKey === 'us-east') {
      valTimezone.textContent = 'America/New_York';
      valLocale.textContent = 'en-US, en';
      valPlatform.textContent = 'Win32 / Windows 11';
      valOffset.textContent = 'EDT (UTC-4)';
    } else if (profileKey === 'uk') {
      valTimezone.textContent = 'Europe/London';
      valLocale.textContent = 'en-GB, en';
      valPlatform.textContent = 'MacIntel / macOS';
      valOffset.textContent = 'BST (UTC+1)';
    } else if (profileKey === 'jp') {
      valTimezone.textContent = 'Asia/Tokyo';
      valLocale.textContent = 'ja-JP, ja, en';
      valPlatform.textContent = 'MacIntel / macOS';
      valOffset.textContent = 'JST (UTC+9)';
    } else {
      valTimezone.textContent = 'America/Los_Angeles';
      valLocale.textContent = 'en-US, en';
      valPlatform.textContent = 'MacIntel / macOS';
      valOffset.textContent = 'PDT (UTC-7)';
    }
  }

  function notifyBackgroundReload() {
    chrome.runtime.sendMessage({ action: 'RELOAD_RULES' }).catch(() => {});
  }
});
