'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ZIP_PATH = path.join(ROOT, 'dist', 'blurshield-extension-v1.0.0.zip');

function buildFixtureHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>BlurShield SaaS Billing Fixture</title>
  <link rel="icon" href="data:," />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; background: #f8fafc; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
    .metric { font-size: 22px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>企业账单与开发者配置后台</h1>
  <div class="card">
    <p id="dateLine">统计周期：2026-11-01 至 2026-11-27（普通日期不应被模糊）</p>
    <p id="emailLine">主账号邮箱：alice.wang@acme-saas.cn · 财务邮箱：finance@acme-saas.cn</p>
    <p id="phoneLine">紧急联系人：13800138899 · 海外备用：+1-415-555-0199</p>
    <p id="secretLine">GitHub Token：ghp_9xK2mPqR7vL4wZ8nB3cT5yH6jD1fS · OpenAI：sk-proj-abc123def456ghi789jkl012mno</p>
    <p id="walletLine">链上金库：0x71C7656EC7ab88b098defB751B7401B5f6d8976F · 结算卡：6222 0202 0012 3456</p>
    <p id="revenueLine">本月实收总额：¥128,450.00（美元折算 $48,920.50）</p>
  </div>
  <div class="card">
    <h3>自定义图表与说明区域（用于测试手动点选）</h3>
    <div id="customRevenueBox" class="metric">¥88,600.00</div>
    <div id="customNoteBox">内部大客户备注：华东区头部渠道重点续约客户</div>
  </div>
</body>
</html>`;
}

function startLocalServer(fixtureHtml) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath === '/fixture.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fixtureHtml);
        return;
      }
      const safePath = reqPath === '/' ? '/index.html' : reqPath;
      const fullPath = path.join(ROOT, 'docs', safePath);
      if (!fullPath.startsWith(path.join(ROOT, 'docs')) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png'
      };
      res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function getExtensionId(context) {
  const page = await context.newPage();
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' });
  const extId = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    if (!mgr || !mgr.shadowRoot) return null;
    const list = mgr.shadowRoot.querySelector('extensions-item-list');
    if (!list || !list.shadowRoot) return null;
    const items = list.shadowRoot.querySelectorAll('extensions-item');
    for (const item of items) {
      const nameEl = item.shadowRoot && item.shadowRoot.querySelector('#name');
      if (nameEl && nameEl.textContent && nameEl.textContent.includes('BlurShield')) {
        return item.getAttribute('id');
      }
    }
    return null;
  });
  await page.close();
  assert.ok(extId, 'Failed to locate BlurShield extension ID in chrome://extensions');
  return extId;
}

function createPopupDriver(bcdp) {
  let nextCmdId = 1;
  const pending = new Map();
  const popupErrors = [];
  const externalRequests = [];
  let activeSessionId = null;

  bcdp.on('Target.receivedMessageFromTarget', (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.message);
    } catch {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      popupErrors.push(JSON.stringify(msg.params.exceptionDetails));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      popupErrors.push(JSON.stringify(msg.params.args));
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request && msg.params.request.url;
      if (u && !u.startsWith('chrome-extension://') && !u.startsWith('data:') && !u.startsWith('blob:')) {
        externalRequests.push(u);
      }
    }
  });

  async function sendToSession(method, params = {}) {
    const id = nextCmdId++;
    const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    await bcdp.send('Target.sendMessageToTarget', {
      sessionId: activeSessionId,
      message: JSON.stringify({ id, method, params })
    });
    return p;
  }

  return {
    async attachToPopup(extId, tabTargetId) {
      await bcdp.send('Extensions.triggerAction', { id: extId, targetId: tabTargetId });

      let popTarget = null;
      for (let i = 0; i < 40; i++) {
        const { targetInfos } = await bcdp.send('Target.getTargets');
        popTarget = targetInfos.find(
          (t) => t.url && t.url.startsWith(`chrome-extension://${extId}/popup.html`)
        );
        if (popTarget) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(popTarget, 'Real extension popup target did not open');

      const { sessionId } = await bcdp.send('Target.attachToTarget', {
        targetId: popTarget.targetId,
        flatten: false
      });
      activeSessionId = sessionId;
      await sendToSession('Runtime.enable');
      await sendToSession('Network.enable');
      return popTarget;
    },

    async eval(expr) {
      const res = await sendToSession('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error('Popup eval exception: ' + JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    },

    async waitForCondition(expr, timeoutMs = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await this.eval(`Boolean(${expr})`)) return;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error(`Timed out waiting for condition: ${expr}`);
    },

    assertClean() {
      assert.deepEqual(popupErrors, [], `Popup console/runtime errors: ${popupErrors.join('; ')}`);
      assert.deepEqual(externalRequests, [], `Popup external requests: ${externalRequests.join('; ')}`);
    }
  };
}

async function main() {
  assert.ok(fs.existsSync(ZIP_PATH), `Release zip must exist at ${ZIP_PATH}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'blurshield-e2e-'));
  const unzippedDir = path.join(tmpRoot, 'ext');
  const userDataDir = path.join(tmpRoot, 'profile');
  fs.mkdirSync(unzippedDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  execFileSync('unzip', ['-q', ZIP_PATH, '-d', unzippedDir]);

  const fixtureHtml = buildFixtureHtml();
  const { server, baseUrl } = await startLocalServer(fixtureHtml);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    args: [
      '--enable-unsafe-extension-debugging',
      `--disable-extensions-except=${unzippedDir}`,
      `--load-extension=${unzippedDir}`
    ]
  });

  try {
    const extId = await getExtensionId(context);
    const bcdp = await context.browser().newBrowserCDPSession();
    const popup = createPopupDriver(bcdp);

    const page = await context.newPage();
    const pageErrors = [];
    const pageConsoleErrors = [];
    const pageExternalReqs = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageConsoleErrors.push(msg.text());
    });
    page.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(baseUrl) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        pageExternalReqs.push(u);
      }
    });

    await page.goto(`${baseUrl}/fixture.html`, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    const originalBodyText = await page.evaluate(() => document.body.innerText);

    const { targetInfos } = await bcdp.send('Target.getTargets', {
      filter: [{ type: 'tab' }]
    });
    const tabTarget = targetInfos.find((t) => t.url && t.url.includes('/fixture.html'));
    assert.ok(tabTarget, 'Fixture tab target not found');

    // 1. Open popup and verify clean 380px layout & initial badge
    await popup.attachToPopup(extId, tabTarget.targetId);
    await popup.waitForCondition(`document.getElementById('statusBadge') !== null`);
    const popupMetrics = await popup.eval(`({
      width: Math.round(document.body.getBoundingClientRect().width),
      badge: document.getElementById('statusBadge').textContent.trim()
    })`);
    assert.equal(popupMetrics.width, 380);
    assert.equal(popupMetrics.badge, '已隐藏 0 处敏感信息');

    // 2. Click Auto-Blur and verify DOM wrapping & date preservation
    await popup.eval(`document.getElementById('autoBlurBtn').click()`);
    await popup.waitForCondition(
      `document.getElementById('statusBadge').textContent.includes('已隐藏 11 处')`
    );

    const blurCheck = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span[data-blurshield-node="1"]'));
      return {
        count: spans.length,
        cats: spans.map((s) => s.getAttribute('data-blurshield-cat')),
        texts: spans.map((s) => s.textContent),
        filters: spans.map((s) => s.style.filter),
        dateLineHasSpan: Boolean(document.querySelector('#dateLine span[data-blurshield-node="1"]'))
      };
    });
    assert.equal(blurCheck.count, 11);
    assert.equal(blurCheck.dateLineHasSpan, false, 'Dates like 2026-11-27 must NOT be blurred');
    assert.ok(blurCheck.filters.every((f) => f === 'blur(8px)'));
    assert.ok(blurCheck.texts.includes('alice.wang@acme-saas.cn'));
    assert.ok(blurCheck.texts.includes('13800138899'));
    assert.ok(blurCheck.texts.includes('ghp_9xK2mPqR7vL4wZ8nB3cT5yH6jD1fS'));
    assert.ok(blurCheck.texts.includes('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'));
    assert.ok(blurCheck.texts.includes('¥128,450.00'));

    // 3. Adjust blur radius slider to 12px and verify live update
    await popup.eval(`(() => {
      const s = document.getElementById('blurRadiusSlider');
      s.value = '12';
      s.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await popup.waitForCondition(`document.getElementById('blurRadiusValue').textContent === '12px'`);
    await page.waitForFunction(() => {
      const spans = Array.from(document.querySelectorAll('span[data-blurshield-node="1"]'));
      return spans.length > 0 && spans.every((s) => s.style.filter === 'blur(12px)');
    });

    // 4. Test Interactive Click-to-Mask (Placeholder mode -> ¥*,***.**) and Blur mode
    await popup.eval(`document.getElementById('modePlaceholderBtn').click()`);
    await popup.eval(`document.getElementById('pickModeBtn').click()`);
    await popup.waitForCondition(`document.getElementById('pickModeBtn').classList.contains('active')`);

    await page.click('#customRevenueBox');
    const customRevAfter = await page.textContent('#customRevenueBox');
    assert.equal(customRevAfter, '¥*,***.**');

    // Switch pick mode to blur and click customNoteBox
    await popup.eval(`document.getElementById('modeBlurBtn').click()`);
    await page.click('#customNoteBox');
    const customNoteFilter = await page.$eval('#customNoteBox', (el) => ({
      attr: el.getAttribute('data-blurshield-el'),
      filter: el.style.filter
    }));
    assert.equal(customNoteFilter.attr, 'blur');
    assert.equal(customNoteFilter.filter, 'blur(12px)');

    // Exit pick mode
    await page.keyboard.press('Escape');
    await popup.eval(`document.getElementById('undoBtn').click()`);
    await popup.waitForCondition(`document.getElementById('statusBadge').textContent.includes('已隐藏 11 处')`);
    const afterUndoNoteAttr = await page.$eval('#customNoteBox', (el) => el.getAttribute('data-blurshield-el'));
    assert.equal(afterUndoNoteAttr, null);
    assert.equal(await page.textContent('#customRevenueBox'), '¥*,***.**');

    // 6. Restore All -> zero blurshield nodes/elements remain and original text matches 100%
    await popup.eval(`document.getElementById('restoreAllBtn').click()`);
    await popup.waitForCondition(`document.getElementById('statusBadge').textContent.includes('已隐藏 0 处')`);

    const restoredCheck = await page.evaluate(() => ({
      autoSpans: document.querySelectorAll('[data-blurshield-node]').length,
      manualEls: document.querySelectorAll('[data-blurshield-el]').length,
      bodyText: document.body.innerText
    }));
    assert.equal(restoredCheck.autoSpans, 0);
    assert.equal(restoredCheck.manualEls, 0);
    assert.equal(restoredCheck.bodyText, originalBodyText, 'Restored DOM text must match original byte-for-byte');

    // 7. Coffee QR modal + persistence check
    await popup.eval(`document.getElementById('openCoffeeBtn').click()`);
    await popup.waitForCondition(`!document.getElementById('coffeeModal').classList.contains('hidden')`);
    const qrLoaded = await popup.eval(`(() => {
      const img = document.querySelector('.qr-image');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    })()`);
    assert.equal(qrLoaded, true, 'Coffee QR image must load cleanly inside popup');

    await popup.eval(`document.getElementById('coffeeDonatedBtn').click()`);
    await popup.waitForCondition(`document.getElementById('openCoffeeBtn').textContent.includes('已支持作者')`);

    // Reopen popup to verify storage persistence
    await popup.eval(`window.close()`);
    await popup.attachToPopup(extId, tabTarget.targetId);
    await popup.waitForCondition(`document.getElementById('openCoffeeBtn').textContent.includes('已支持作者')`);

    // 8. Verify docs/index.html interactive sandbox and docs/privacy.html
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    const docsQrLoaded = await page.evaluate(() => {
      const img = document.querySelector('.coffee-qr');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    });
    assert.equal(docsQrLoaded, true, 'docs/index.html Coffee QR must load');

    await page.click('#sbAutoBlurBtn');
    const sbBlurredCount = await page.locator('#sandboxRoot span[data-blurshield-node="1"]').count();
    assert.ok(sbBlurredCount >= 10, `Expected >=10 blurred nodes in docs sandbox, got ${sbBlurredCount}`);

    await page.click('#sbPickPlaceholderBtn');
    await page.click('#sbRevenue');
    assert.equal(await page.textContent('#sbRevenue'), '¥*,***.**');
    await page.click('#sbRestoreBtn');
    assert.equal(await page.locator('#sandboxRoot span[data-blurshield-node="1"]').count(), 0);
    assert.equal(await page.textContent('#sbRevenue'), '¥128,450.00');

    await page.goto(`${baseUrl}/privacy.html`, { waitUntil: 'domcontentloaded' });
    const privacyTitle = await page.textContent('h1');
    assert.ok(privacyTitle.includes('BlurShield'));

    popup.assertClean();
    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('; ')}`);
    assert.deepEqual(pageConsoleErrors, [], `Page console errors: ${pageConsoleErrors.join('; ')}`);
    assert.deepEqual(pageExternalReqs, [], `External requests detected: ${pageExternalReqs.join('; ')}`);

    console.log(
      JSON.stringify({
        ok: true,
        extId,
        autoBlurredCount: blurCheck.count,
        sandboxBlurredCount: sbBlurredCount,
        consoleErrors: 0,
        pageErrors: 0,
        externalRequests: 0
      })
    );
  } finally {
    await context.close();
    server.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
