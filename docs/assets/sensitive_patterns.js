(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.BlurShieldPatterns = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_CATEGORIES = {
    email: true,
    phone: true,
    secret: true,
    amount: true
  };

  var CATEGORY_PRIORITY = {
    secret: 4,
    email: 3,
    phone: 2,
    amount: 1
  };

  var PATTERN_SPECS = [
    {
      category: 'secret',
      label: 'API Key / Token',
      regex: /\b(?:sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,})\b/g
    },
    {
      category: 'secret',
      label: 'EVM Wallet / Hash',
      regex: /\b0x[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?\b/g
    },
    {
      category: 'secret',
      label: 'ID Card',
      regex: /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g
    },
    {
      category: 'secret',
      label: 'Bank Card',
      regex: /(?<!\d)(?:\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}(?:[-\s]\d{1,3})?|\d{16,19})(?!\d)/g
    },
    {
      category: 'email',
      label: 'Email',
      regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
    },
    {
      category: 'phone',
      label: 'China Mobile',
      regex: /(?<!\d)(?:\+?86[-\s]?)?(?:1[3-9]\d{9}|1[3-9]\d[-\s]\d{4}[-\s]\d{4})(?!\d)/g
    },
    {
      category: 'phone',
      label: 'International Phone',
      regex: /(?<![\dA-Za-z])\+\d{1,3}[-\s]\d{2,4}[-\s]\d{3,4}(?:[-\s]\d{3,4})?(?!\d)/g
    },
    {
      category: 'amount',
      label: 'Currency Amount',
      regex: /(?:[¥￥$€£]|(?:RMB|USD|CNY|EUR|HKD)\s?)\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s?(?:万|亿|k|K|m|M|b|B))?(?![A-Za-z0-9_])|(?<!\d)\d+(?:,\d{3})*(?:\.\d{1,2})?\s?(?:元|万元|亿元|USD|CNY|RMB)(?![A-Za-z0-9_])/g
    }
  ];

  function normalizeCategories(categories) {
    var source = categories || {};
    return {
      email: source.email !== undefined ? Boolean(source.email) : DEFAULT_CATEGORIES.email,
      phone: source.phone !== undefined ? Boolean(source.phone) : DEFAULT_CATEGORIES.phone,
      secret: source.secret !== undefined ? Boolean(source.secret) : DEFAULT_CATEGORIES.secret,
      amount: source.amount !== undefined ? Boolean(source.amount) : DEFAULT_CATEGORIES.amount
    };
  }

  function isLikelyDateContext(text, start, end) {
    var before = text.slice(Math.max(0, start - 5), start);
    var after = text.slice(end, Math.min(text.length, end + 5));
    if (/[\/-]$/.test(before) && /^[\/-]/.test(after)) {
      return true;
    }
    return false;
  }

  /**
   * Detect non-overlapping sensitive spans in plain text.
   * @param {string} text
   * @param {{ categories?: Record<string, boolean> }} [options]
   * @returns {Array<{ start: number, end: number, category: string, label: string, text: string }>}
   */
  function detectSensitiveSpans(text, options) {
    if (typeof text !== 'string' || !text) {
      return [];
    }

    var cats = normalizeCategories(options && options.categories);
    var candidates = [];

    for (var i = 0; i < PATTERN_SPECS.length; i++) {
      var spec = PATTERN_SPECS[i];
      if (!cats[spec.category]) {
        continue;
      }
      var re = new RegExp(spec.regex.source, spec.regex.flags);
      var match;
      while ((match = re.exec(text)) !== null) {
        var matchedText = match[0];
        if (!matchedText) {
          re.lastIndex++;
          continue;
        }
        var start = match.index;
        var end = start + matchedText.length;

        if (spec.category === 'phone' && isLikelyDateContext(text, start, end)) {
          continue;
        }

        candidates.push({
          start: start,
          end: end,
          category: spec.category,
          label: spec.label,
          text: matchedText
        });
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    candidates.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      var lenDiff = (b.end - b.start) - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return (CATEGORY_PRIORITY[b.category] || 0) - (CATEGORY_PRIORITY[a.category] || 0);
    });

    var resolved = [];
    var cursor = 0;
    for (var j = 0; j < candidates.length; j++) {
      var item = candidates[j];
      if (item.start >= cursor) {
        resolved.push(item);
        cursor = item.end;
      }
    }

    return resolved;
  }

  /**
   * Generate a clean safe placeholder string for click-to-replace masking.
   * @param {string} rawText
   * @returns {string}
   */
  function buildSafePlaceholder(rawText) {
    var text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!text) return '***';
    if (/[¥￥]|元|RMB|CNY/i.test(text)) {
      return /\.\d{1,2}/.test(text) ? '¥*,***.**' : '¥*,***';
    }
    if (/\$|USD/i.test(text)) {
      return /\.\d{1,2}/.test(text) ? '$*,***.**' : '$*,***';
    }
    if (/€|EUR/i.test(text)) {
      return /\.\d{1,2}/.test(text) ? '€*,***.**' : '€*,***';
    }
    if (/£/.test(text)) {
      return /\.\d{1,2}/.test(text) ? '£*,***.**' : '£*,***';
    }
    if (/@/.test(text)) {
      return '***@***.***';
    }
    if (/\d/.test(text)) {
      return /\.\d+/.test(text) ? '*,***.**' : '***,***';
    }
    return '[已脱敏]';
  }

  return {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    detectSensitiveSpans: detectSensitiveSpans,
    buildSafePlaceholder: buildSafePlaceholder
  };
});
