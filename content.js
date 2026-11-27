(function () {
  'use strict';

  if (window.__blurshieldInjected) {
    return;
  }
  window.__blurshieldInjected = true;

  var SKIP_TAGS = {
    SCRIPT: true,
    STYLE: true,
    NOSCRIPT: true,
    TEXTAREA: true,
    INPUT: true,
    SELECT: true,
    OPTION: true,
    SVG: true,
    CANVAS: true,
    IFRAME: true
  };

  var state = {
    blurRadius: 8,
    pickActive: false,
    pickMode: 'blur', // 'blur' | 'placeholder'
    autoCounts: { email: 0, phone: 0, secret: 0, amount: 0 },
    manualStack: [] // array of { el, type, originalHtml, originalFilter, originalTransition, originalUserSelect }
  };

  var manualOriginalMap = new Map();
  var hoverOverlay = null;
  var hoverBadge = null;
  var currentHoverTarget = null;

  function clampRadius(val) {
    var n = Number(val);
    if (!Number.isFinite(n)) return 8;
    return Math.max(4, Math.min(20, Math.round(n)));
  }

  function isNodeHidden(el) {
    if (!el || el.nodeType !== 1) return false;
    var style = window.getComputedStyle(el);
    if (!style) return false;
    return style.display === 'none' || style.visibility === 'hidden';
  }

  function shouldSkipTextNode(node) {
    if (!node || !node.nodeValue || !node.nodeValue.trim()) return true;
    var parent = node.parentElement;
    if (!parent) return true;
    if (SKIP_TAGS[parent.tagName]) return true;
    if (parent.closest('[data-blurshield-ui="1"]')) return true;
    if (parent.closest('[data-blurshield-node="1"]')) return true;
    if (parent.closest('[data-blurshield-el]')) return true;
    if (parent.isContentEditable) return true;
    if (isNodeHidden(parent)) return true;
    return false;
  }

  function applyBlurStyles(el, radius) {
    el.style.filter = 'blur(' + radius + 'px)';
    el.style.transition = 'filter 120ms ease';
    el.style.userSelect = 'none';
  }

  function unwrapAutoBlurNodes(rootEl) {
    var root = rootEl || document.body;
    if (!root) return 0;
    var spans = root.querySelectorAll('span[data-blurshield-node="1"]');
    var parentsToNormalize = new Set();
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var cat = span.getAttribute('data-blurshield-cat');
      if (cat && state.autoCounts[cat] > 0) {
        state.autoCounts[cat]--;
      }
      var parent = span.parentNode;
      if (!parent) continue;
      var textNode = document.createTextNode(span.textContent || '');
      parent.replaceChild(textNode, span);
      parentsToNormalize.add(parent);
    }
    parentsToNormalize.forEach(function (parent) {
      parent.normalize();
    });
    if (!rootEl || rootEl === document.body) {
      state.autoCounts = { email: 0, phone: 0, secret: 0, amount: 0 };
    }
    return spans.length;
  }

  function autoBlurDocument(options) {
    var opts = options || {};
    var root = opts.root || document.body;
    if (!root || !window.BlurShieldPatterns) {
      return getSummary();
    }

    if (opts.blurRadius !== undefined) {
      state.blurRadius = clampRadius(opts.blurRadius);
    }

    unwrapAutoBlurNodes(root);

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var textNodes = [];
    var current;
    while ((current = walker.nextNode())) {
      if (!shouldSkipTextNode(current)) {
        textNodes.push(current);
      }
    }

    var counts = { email: 0, phone: 0, secret: 0, amount: 0 };

    for (var i = 0; i < textNodes.length; i++) {
      var textNode = textNodes[i];
      var raw = textNode.nodeValue;
      var spans = window.BlurShieldPatterns.detectSensitiveSpans(raw, {
        categories: opts.categories
      });
      if (!spans.length || !textNode.parentNode) {
        continue;
      }

      var frag = document.createDocumentFragment();
      var cursor = 0;
      for (var j = 0; j < spans.length; j++) {
        var sp = spans[j];
        if (sp.start > cursor) {
          frag.appendChild(document.createTextNode(raw.slice(cursor, sp.start)));
        }
        var el = document.createElement('span');
        el.setAttribute('data-blurshield-node', '1');
        el.setAttribute('data-blurshield-cat', sp.category);
        el.setAttribute('title', 'BlurShield 已打码: ' + sp.label);
        el.style.display = 'inline';
        el.style.borderRadius = '3px';
        applyBlurStyles(el, state.blurRadius);
        el.textContent = sp.text;
        frag.appendChild(el);

        counts[sp.category] = (counts[sp.category] || 0) + 1;
        cursor = sp.end;
      }
      if (cursor < raw.length) {
        frag.appendChild(document.createTextNode(raw.slice(cursor)));
      }

      textNode.parentNode.replaceChild(frag, textNode);
    }

    state.autoCounts = counts;
    return getSummary();
  }

  function setBlurRadius(radius) {
    state.blurRadius = clampRadius(radius);
    var autoNodes = document.querySelectorAll('[data-blurshield-node="1"]');
    for (var i = 0; i < autoNodes.length; i++) {
      autoNodes[i].style.filter = 'blur(' + state.blurRadius + 'px)';
    }
    var manualNodes = document.querySelectorAll('[data-blurshield-el="blur"]');
    for (var j = 0; j < manualNodes.length; j++) {
      manualNodes[j].style.filter = 'blur(' + state.blurRadius + 'px)';
    }
    return getSummary();
  }

  function ensureOverlay() {
    if (hoverOverlay) return;
    hoverOverlay = document.createElement('div');
    hoverOverlay.setAttribute('data-blurshield-ui', '1');
    hoverOverlay.style.position = 'fixed';
    hoverOverlay.style.zIndex = '2147483646';
    hoverOverlay.style.pointerEvents = 'none';
    hoverOverlay.style.border = '2px dashed #ef4444';
    hoverOverlay.style.background = 'rgba(239, 68, 68, 0.08)';
    hoverOverlay.style.borderRadius = '6px';
    hoverOverlay.style.boxSizing = 'border-box';
    hoverOverlay.style.display = 'none';

    hoverBadge = document.createElement('div');
    hoverBadge.setAttribute('data-blurshield-ui', '1');
    hoverBadge.style.position = 'absolute';
    hoverBadge.style.top = '-24px';
    hoverBadge.style.left = '0';
    hoverBadge.style.padding = '2px 8px';
    hoverBadge.style.borderRadius = '999px';
    hoverBadge.style.background = '#ef4444';
    hoverBadge.style.color = '#ffffff';
    hoverBadge.style.fontSize = '11px';
    hoverBadge.style.fontWeight = '600';
    hoverBadge.style.fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    hoverBadge.style.whiteSpace = 'nowrap';
    hoverOverlay.appendChild(hoverBadge);

    (document.body || document.documentElement).appendChild(hoverOverlay);
  }

  function hideOverlay() {
    currentHoverTarget = null;
    if (hoverOverlay) {
      hoverOverlay.style.display = 'none';
    }
  }

  function isValidPickTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    if (target === document.body || target === document.documentElement) return false;
    if (target.closest('[data-blurshield-ui="1"]')) return false;
    if (target.closest('[data-blurshield-el]')) return false;
    return true;
  }

  function resolvePickTarget(rawTarget) {
    if (!rawTarget || rawTarget.nodeType !== 1) return null;
    var target = rawTarget.hasAttribute('data-blurshield-node')
      ? rawTarget.parentElement
      : rawTarget;
    if (!isValidPickTarget(target)) return null;
    return target;
  }

  function onPickMouseMove(evt) {
    if (!state.pickActive) return;
    var target = resolvePickTarget(evt.target);
    if (!target) {
      hideOverlay();
      return;
    }
    currentHoverTarget = target;
    ensureOverlay();
    var rect = target.getBoundingClientRect();
    hoverOverlay.style.left = rect.left + 'px';
    hoverOverlay.style.top = rect.top + 'px';
    hoverOverlay.style.width = rect.width + 'px';
    hoverOverlay.style.height = rect.height + 'px';
    hoverOverlay.style.display = 'block';
    hoverBadge.textContent =
      state.pickMode === 'placeholder'
        ? '点击替换为安全占位符 · ESC 退出'
        : '点击模糊该区域 · ESC 退出';
  }

  function applyManualMask(target, mode) {
    if (!isValidPickTarget(target)) return false;

    unwrapAutoBlurNodes(target);

    var record = {
      el: target,
      type: mode,
      originalHtml: target.innerHTML,
      originalFilter: target.style.filter,
      originalTransition: target.style.transition,
      originalUserSelect: target.style.userSelect,
      hadTitle: target.hasAttribute('title'),
      originalTitle: target.getAttribute('title')
    };

    manualOriginalMap.set(target, record);
    state.manualStack.push(record);

    if (mode === 'placeholder' && window.BlurShieldPatterns) {
      var placeholder = window.BlurShieldPatterns.buildSafePlaceholder(target.textContent || '');
      target.textContent = placeholder;
      target.setAttribute('data-blurshield-el', 'placeholder');
      target.setAttribute('title', 'BlurShield 已替换为占位符');
    } else {
      target.setAttribute('data-blurshield-el', 'blur');
      target.setAttribute('title', 'BlurShield 已手动模糊');
      applyBlurStyles(target, state.blurRadius);
    }
    return true;
  }

  function onPickClick(evt) {
    if (!state.pickActive) return;
    var target = resolvePickTarget(evt.target);
    if (!target) return;
    evt.preventDefault();
    evt.stopPropagation();
    evt.stopImmediatePropagation();
    applyManualMask(target, state.pickMode);
    hideOverlay();
  }

  function onPickKeyDown(evt) {
    if (state.pickActive && evt.key === 'Escape') {
      evt.preventDefault();
      setPickMode(false, state.pickMode);
    }
  }

  function setPickMode(active, mode) {
    if (mode === 'blur' || mode === 'placeholder') {
      state.pickMode = mode;
    }
    var nextActive = Boolean(active);
    if (nextActive === state.pickActive) {
      return getSummary();
    }
    state.pickActive = nextActive;
    if (state.pickActive) {
      ensureOverlay();
      document.addEventListener('mousemove', onPickMouseMove, true);
      document.addEventListener('click', onPickClick, true);
      document.addEventListener('keydown', onPickKeyDown, true);
      document.documentElement.style.cursor = 'crosshair';
    } else {
      document.removeEventListener('mousemove', onPickMouseMove, true);
      document.removeEventListener('click', onPickClick, true);
      document.removeEventListener('keydown', onPickKeyDown, true);
      document.documentElement.style.cursor = '';
      hideOverlay();
    }
    return getSummary();
  }

  function restoreManualRecord(record) {
    if (!record || !record.el) return;
    var el = record.el;
    if (record.type === 'placeholder') {
      el.innerHTML = record.originalHtml;
    } else {
      el.style.filter = record.originalFilter || '';
      el.style.transition = record.originalTransition || '';
      el.style.userSelect = record.originalUserSelect || '';
    }
    el.removeAttribute('data-blurshield-el');
    if (record.hadTitle) {
      el.setAttribute('title', record.originalTitle);
    } else {
      el.removeAttribute('title');
    }
    manualOriginalMap.delete(el);
  }

  function undoLastManual() {
    var record = state.manualStack.pop();
    if (record) {
      restoreManualRecord(record);
    }
    return getSummary();
  }

  function restoreAll(rootEl) {
    setPickMode(false, state.pickMode);
    unwrapAutoBlurNodes(rootEl || document.body);
    while (state.manualStack.length > 0) {
      var record = state.manualStack.pop();
      restoreManualRecord(record);
    }
    manualOriginalMap.clear();
    return getSummary();
  }

  function getSummary() {
    var autoTotal =
      (state.autoCounts.email || 0) +
      (state.autoCounts.phone || 0) +
      (state.autoCounts.secret || 0) +
      (state.autoCounts.amount || 0);
    var manualCount = state.manualStack.length;
    return {
      autoCount: autoTotal,
      manualCount: manualCount,
      totalCount: autoTotal + manualCount,
      categoryCounts: Object.assign({}, state.autoCounts),
      blurRadius: state.blurRadius,
      pickActive: state.pickActive,
      pickMode: state.pickMode
    };
  }

  window.__blurShieldApi = {
    autoBlurDocument: autoBlurDocument,
    setBlurRadius: setBlurRadius,
    setPickMode: setPickMode,
    undoLastManual: undoLastManual,
    restoreAll: restoreAll,
    getSummary: getSummary
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
      if (!msg || typeof msg.type !== 'string') return;
      if (msg.type === 'BLURSHIELD_PING') {
        sendResponse({ ok: true, state: getSummary() });
        return;
      }
      if (msg.type === 'BLURSHIELD_AUTO_BLUR') {
        var summaryAfterAuto = autoBlurDocument({
          categories: msg.categories,
          blurRadius: msg.blurRadius
        });
        sendResponse({ ok: true, state: summaryAfterAuto });
        return;
      }
      if (msg.type === 'BLURSHIELD_SET_RADIUS') {
        sendResponse({ ok: true, state: setBlurRadius(msg.blurRadius) });
        return;
      }
      if (msg.type === 'BLURSHIELD_TOGGLE_PICK') {
        sendResponse({ ok: true, state: setPickMode(msg.active, msg.mode) });
        return;
      }
      if (msg.type === 'BLURSHIELD_UNDO') {
        sendResponse({ ok: true, state: undoLastManual() });
        return;
      }
      if (msg.type === 'BLURSHIELD_RESTORE_ALL') {
        sendResponse({ ok: true, state: restoreAll() });
      }
    });
  }
})();
