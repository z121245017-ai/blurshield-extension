(function () {
  'use strict';

  var STORAGE_KEYS = {
    CATEGORIES: 'blurshield_categories',
    BLUR_RADIUS: 'blurshield_blur_radius',
    PICK_MODE: 'blurshield_pick_mode',
    COFFEE_DONATED: 'blurshield_coffee_donated',
    COFFEE_DISMISSED: 'blurshield_coffee_dismissed'
  };

  var state = {
    tabId: null,
    categories: {
      email: true,
      phone: true,
      secret: true,
      amount: true
    },
    blurRadius: 8,
    pickMode: 'blur',
    pickActive: false,
    coffeeDonated: false,
    summary: {
      autoCount: 0,
      manualCount: 0,
      totalCount: 0,
      categoryCounts: { email: 0, phone: 0, secret: 0, amount: 0 }
    }
  };

  var els = {
    statusBadge: document.getElementById('statusBadge'),
    statusBreakdown: document.getElementById('statusBreakdown'),
    pickIndicator: document.getElementById('pickIndicator'),
    catEmail: document.getElementById('catEmail'),
    catPhone: document.getElementById('catPhone'),
    catSecret: document.getElementById('catSecret'),
    catAmount: document.getElementById('catAmount'),
    blurRadiusSlider: document.getElementById('blurRadiusSlider'),
    blurRadiusValue: document.getElementById('blurRadiusValue'),
    autoBlurBtn: document.getElementById('autoBlurBtn'),
    modeBlurBtn: document.getElementById('modeBlurBtn'),
    modePlaceholderBtn: document.getElementById('modePlaceholderBtn'),
    pickModeBtn: document.getElementById('pickModeBtn'),
    undoBtn: document.getElementById('undoBtn'),
    restoreAllBtn: document.getElementById('restoreAllBtn'),
    toastBar: document.getElementById('toastBar'),
    openCoffeeBtn: document.getElementById('openCoffeeBtn'),
    footerCoffeeLink: document.getElementById('footerCoffeeLink'),
    coffeeModal: document.getElementById('coffeeModal'),
    closeCoffeeModalBtn: document.getElementById('closeCoffeeModalBtn'),
    coffeeDonatedBtn: document.getElementById('coffeeDonatedBtn'),
    coffeeLaterBtn: document.getElementById('coffeeLaterBtn')
  };

  var toastTimer = null;

  function showToast(msg, isError) {
    if (!els.toastBar) return;
    els.toastBar.textContent = msg;
    els.toastBar.classList.toggle('error', Boolean(isError));
    els.toastBar.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toastBar.classList.add('hidden');
    }, 3200);
  }

  function storageGet(keys) {
    return new Promise(function (resolve) {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, function (res) {
        resolve(res || {});
      });
    });
  }

  function storageSet(obj) {
    return new Promise(function (resolve) {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }
      chrome.storage.local.set(obj, function () {
        resolve();
      });
    });
  }

  function updateCoffeeButton() {
    if (state.coffeeDonated) {
      els.openCoffeeBtn.textContent = '☕ 已支持作者';
      els.openCoffeeBtn.classList.add('supported');
    } else {
      els.openCoffeeBtn.textContent = '☕ 请作者喝咖啡';
      els.openCoffeeBtn.classList.remove('supported');
    }
  }

  function syncControlsFromState() {
    els.catEmail.checked = Boolean(state.categories.email);
    els.catPhone.checked = Boolean(state.categories.phone);
    els.catSecret.checked = Boolean(state.categories.secret);
    els.catAmount.checked = Boolean(state.categories.amount);
    els.blurRadiusSlider.value = String(state.blurRadius);
    els.blurRadiusValue.textContent = state.blurRadius + 'px';

    els.modeBlurBtn.classList.toggle('active', state.pickMode === 'blur');
    els.modePlaceholderBtn.classList.toggle('active', state.pickMode === 'placeholder');

    els.pickModeBtn.classList.toggle('active', state.pickActive);
    els.pickIndicator.classList.toggle('hidden', !state.pickActive);
    els.pickModeBtn.textContent = state.pickActive
      ? '退出手动点选模式 (ESC)'
      : '手动点选模糊/替换金额';
  }

  function renderSummary(summary) {
    if (summary) {
      state.summary = summary;
      if (typeof summary.pickActive === 'boolean') {
        state.pickActive = summary.pickActive;
      }
      if (summary.pickMode) {
        state.pickMode = summary.pickMode;
      }
    }

    var total = state.summary.totalCount || 0;
    els.statusBadge.textContent = '已隐藏 ' + total + ' 处敏感信息';

    if (total === 0) {
      els.statusBreakdown.textContent = '勾选类别后点击下方按钮即可非破坏性打码';
    } else {
      var c = state.summary.categoryCounts || {};
      var parts = [];
      if (c.email) parts.push('邮箱 ' + c.email);
      if (c.phone) parts.push('手机 ' + c.phone);
      if (c.secret) parts.push('密钥/卡号 ' + c.secret);
      if (c.amount) parts.push('金额 ' + c.amount);
      if (state.summary.manualCount) parts.push('手动点选 ' + state.summary.manualCount);
      els.statusBreakdown.textContent = parts.join(' · ') || '页面敏感数据已打码';
    }

    els.undoBtn.disabled = !(state.summary.manualCount > 0);
    els.restoreAllBtn.disabled = total === 0 && !state.pickActive;
    syncControlsFromState();
  }

  async function getActiveTab() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs.length) {
      throw new Error('未找到当前活动标签页');
    }
    var tab = tabs[0];
    if (!tab.url || /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      throw new Error('浏览器内置页面不支持注入脚本，请在普通网页中使用');
    }
    state.tabId = tab.id;
    return tab;
  }

  async function ensureInjected(tabId) {
    try {
      var res = await chrome.tabs.sendMessage(tabId, { type: 'BLURSHIELD_PING' });
      if (res && res.ok) {
        return res;
      }
    } catch (_err) {
      // Fall through to inject content scripts
    }

    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['src/privacy/sensitive_patterns.js', 'content.js']
    });

    return chrome.tabs.sendMessage(tabId, { type: 'BLURSHIELD_PING' });
  }

  async function sendToPage(message) {
    var tab = await getActiveTab();
    await ensureInjected(tab.id);
    var res = await chrome.tabs.sendMessage(tab.id, message);
    if (!res || !res.ok) {
      throw new Error((res && res.error) || '页面通信失败');
    }
    renderSummary(res.state);
    return res;
  }

  function readCategoriesFromInputs() {
    state.categories = {
      email: els.catEmail.checked,
      phone: els.catPhone.checked,
      secret: els.catSecret.checked,
      amount: els.catAmount.checked
    };
    return storageSet({ [STORAGE_KEYS.CATEGORIES]: state.categories });
  }

  async function handleAutoBlur() {
    try {
      await readCategoriesFromInputs();
      var res = await sendToPage({
        type: 'BLURSHIELD_AUTO_BLUR',
        categories: state.categories,
        blurRadius: state.blurRadius
      });
      var count = res.state ? res.state.autoCount : 0;
      if (count > 0) {
        showToast('已自动打码 ' + count + ' 处敏感信息，可安全截图');
      } else {
        showToast('当前勾选类别未命中敏感信息，可尝试手动点选模糊');
      }
    } catch (err) {
      showToast(err.message || '打码失败', true);
    }
  }

  async function handleRadiusChange() {
    state.blurRadius = Number(els.blurRadiusSlider.value) || 8;
    els.blurRadiusValue.textContent = state.blurRadius + 'px';
    await storageSet({ [STORAGE_KEYS.BLUR_RADIUS]: state.blurRadius });
    try {
      await sendToPage({
        type: 'BLURSHIELD_SET_RADIUS',
        blurRadius: state.blurRadius
      });
    } catch (_err) {
      // Ignore on restricted pages before action
    }
  }

  async function handlePickModeSelect(mode) {
    state.pickMode = mode;
    await storageSet({ [STORAGE_KEYS.PICK_MODE]: mode });
    syncControlsFromState();
    if (state.pickActive) {
      try {
        await sendToPage({
          type: 'BLURSHIELD_TOGGLE_PICK',
          active: true,
          mode: state.pickMode
        });
      } catch (err) {
        showToast(err.message || '切换点选方式失败', true);
      }
    }
  }

  async function handleTogglePick() {
    try {
      var nextActive = !state.pickActive;
      await sendToPage({
        type: 'BLURSHIELD_TOGGLE_PICK',
        active: nextActive,
        mode: state.pickMode
      });
      if (nextActive) {
        showToast('点选模式已开启：请在网页点击要遮挡的元素');
      } else {
        showToast('已退出手动点选模式');
      }
    } catch (err) {
      showToast(err.message || '无法开启点选模式', true);
    }
  }

  async function handleUndo() {
    try {
      await sendToPage({ type: 'BLURSHIELD_UNDO' });
      showToast('已撤销上一次手动打码');
    } catch (err) {
      showToast(err.message || '撤销失败', true);
    }
  }

  async function handleRestoreAll() {
    try {
      await sendToPage({ type: 'BLURSHIELD_RESTORE_ALL' });
      showToast('已一键全部还原网页原始内容');
    } catch (err) {
      showToast(err.message || '还原失败', true);
    }
  }

  function openCoffeeModal() {
    els.coffeeModal.classList.remove('hidden');
  }

  function closeCoffeeModal() {
    els.coffeeModal.classList.add('hidden');
  }

  async function handleCoffeeDonated() {
    state.coffeeDonated = true;
    await storageSet({
      [STORAGE_KEYS.COFFEE_DONATED]: true,
      [STORAGE_KEYS.COFFEE_DISMISSED]: true
    });
    updateCoffeeButton();
    closeCoffeeModal();
    showToast('感谢你的咖啡支持！祝截图发布顺顺利利 ☕');
  }

  async function handleCoffeeLater() {
    await storageSet({ [STORAGE_KEYS.COFFEE_DISMISSED]: true });
    closeCoffeeModal();
  }

  function bindEvents() {
    els.autoBlurBtn.addEventListener('click', handleAutoBlur);
    els.catEmail.addEventListener('change', readCategoriesFromInputs);
    els.catPhone.addEventListener('change', readCategoriesFromInputs);
    els.catSecret.addEventListener('change', readCategoriesFromInputs);
    els.catAmount.addEventListener('change', readCategoriesFromInputs);
    els.blurRadiusSlider.addEventListener('input', handleRadiusChange);

    els.modeBlurBtn.addEventListener('click', function () {
      handlePickModeSelect('blur');
    });
    els.modePlaceholderBtn.addEventListener('click', function () {
      handlePickModeSelect('placeholder');
    });
    els.pickModeBtn.addEventListener('click', handleTogglePick);
    els.undoBtn.addEventListener('click', handleUndo);
    els.restoreAllBtn.addEventListener('click', handleRestoreAll);

    els.openCoffeeBtn.addEventListener('click', openCoffeeModal);
    els.footerCoffeeLink.addEventListener('click', openCoffeeModal);
    els.closeCoffeeModalBtn.addEventListener('click', closeCoffeeModal);
    els.coffeeDonatedBtn.addEventListener('click', handleCoffeeDonated);
    els.coffeeLaterBtn.addEventListener('click', handleCoffeeLater);
    els.coffeeModal.addEventListener('click', function (evt) {
      if (evt.target === els.coffeeModal) {
        closeCoffeeModal();
      }
    });
  }

  async function init() {
    bindEvents();
    var stored = await storageGet([
      STORAGE_KEYS.CATEGORIES,
      STORAGE_KEYS.BLUR_RADIUS,
      STORAGE_KEYS.PICK_MODE,
      STORAGE_KEYS.COFFEE_DONATED
    ]);

    if (stored[STORAGE_KEYS.CATEGORIES]) {
      state.categories = Object.assign({}, state.categories, stored[STORAGE_KEYS.CATEGORIES]);
    }
    if (typeof stored[STORAGE_KEYS.BLUR_RADIUS] === 'number') {
      state.blurRadius = stored[STORAGE_KEYS.BLUR_RADIUS];
    }
    if (stored[STORAGE_KEYS.PICK_MODE] === 'placeholder' || stored[STORAGE_KEYS.PICK_MODE] === 'blur') {
      state.pickMode = stored[STORAGE_KEYS.PICK_MODE];
    }
    state.coffeeDonated = Boolean(stored[STORAGE_KEYS.COFFEE_DONATED]);

    updateCoffeeButton();
    syncControlsFromState();

    try {
      var tab = await getActiveTab();
      var ping = await ensureInjected(tab.id);
      if (ping && ping.state) {
        renderSummary(ping.state);
      }
    } catch (_err) {
      // Restricted tab; keep clean default UI until user navigates
    }
  }

  init();
})();
