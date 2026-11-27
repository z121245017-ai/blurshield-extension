'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  detectSensitiveSpans,
  buildSafePlaceholder
} = require(path.join(ROOT, 'src', 'privacy', 'sensitive_patterns.js'));

test('detects emails, China 11-digit mobiles, and international phone numbers', () => {
  const input =
    'Contact zhang.wei+vip@acme-saas.cn or call 13800138899 / +86 139 1234 5678 / +1-415-555-0199 today.';
  const spans = detectSensitiveSpans(input);
  const found = spans.map((s) => `${s.category}:${s.text}`);

  assert.deepEqual(found, [
    'email:zhang.wei+vip@acme-saas.cn',
    'phone:13800138899',
    'phone:+86 139 1234 5678',
    'phone:+1-415-555-0199'
  ]);
});

test('detects API keys, GitHub PATs, AWS keys, EVM 0x addresses, bank cards, and China ID cards', () => {
  const input = [
    'OpenAI=sk-proj-abc123def456ghi789jkl012mno',
    'GH=ghp_9xK2mPqR7vL4wZ8nB3cT5yH6jD1fS',
    'GHPAT=github_pat_11ABCDE2345678901234567890',
    'AWS=AKIAIOSFODNN7EXAMPLE',
    'EVM=0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    'Card=6222 0202 0012 3456',
    'ID=11010119900307123X'
  ].join(' | ');

  const spans = detectSensitiveSpans(input);
  assert.equal(spans.length, 7);
  assert.ok(spans.every((s) => s.category === 'secret'));
  for (let i = 1; i < spans.length; i++) {
    assert.ok(spans[i].start >= spans[i - 1].end, 'Spans must be strictly non-overlapping');
  }
});

test('detects currency amounts and respects category toggle', () => {
  const input = '本月营收 ¥128,450.00，美元 MRR $48,920.50，另计 USD 12,340 与 5000 元。';
  const withAmounts = detectSensitiveSpans(input, {
    categories: { email: true, phone: true, secret: true, amount: true }
  });
  assert.equal(withAmounts.filter((s) => s.category === 'amount').length, 4);

  const withoutAmounts = detectSensitiveSpans(input, {
    categories: { email: true, phone: true, secret: true, amount: false }
  });
  assert.equal(withoutAmounts.length, 0);
});

test('does not mangle ordinary dates, years, versions, shell vars, or normal prose', () => {
  const cleanText =
    'Release v1.0.0 shipped on 2026-11-27 (also 2026/11/27 14:30:00). Order #1024 achieved 99.5% uptime. Export $HOME and $PATH safely.';
  const spans = detectSensitiveSpans(cleanText);
  assert.deepEqual(spans, []);
});

test('handles adjacent/overlapping candidate runs cleanly without overlapping output', () => {
  const input = 'Card 1380123456789012 belongs to 13800138000 and email dev@13800138000.com';
  const spans = detectSensitiveSpans(input);
  assert.deepEqual(
    spans.map((s) => `${s.category}:${s.text}`),
    [
      'secret:1380123456789012',
      'phone:13800138000',
      'email:dev@13800138000.com'
    ]
  );
});

test('buildSafePlaceholder preserves currency sign cleanly', () => {
  assert.equal(buildSafePlaceholder('¥128,450.00'), '¥*,***.**');
  assert.equal(buildSafePlaceholder('$48,920.50'), '$*,***.**');
  assert.equal(buildSafePlaceholder('¥999'), '¥*,***');
  assert.equal(buildSafePlaceholder('dev@example.com'), '***@***.***');
});

test('static zero-network and CSP security audit on extension runtime files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name.length <= 75);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));

  const runtimeFiles = [
    'popup.html',
    'popup.css',
    'popup.js',
    'content.js',
    'src/privacy/sensitive_patterns.js'
  ];

  const forbiddenPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /navigator\.sendBeacon/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /https?:\/\//
  ];

  for (const rel of runtimeFiles) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.equal(pat.test(content), false, `${rel} must not match forbidden pattern ${pat}`);
    }
  }
});
