'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

async function generateIcons(browser) {
  fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'docs', 'assets'), { recursive: true });

  const sizes = [16, 48, 128];
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`
      <!doctype html>
      <html>
        <body style="margin:0;padding:0;background:transparent;overflow:hidden;">
          <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
            <defs>
              <linearGradient id="shieldBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#2563EB"/>
                <stop offset="100%" stop-color="#1E40AF"/>
              </linearGradient>
              <linearGradient id="blurBar" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#93C5FD"/>
                <stop offset="100%" stop-color="#DBEAFE"/>
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="120" height="120" rx="28" fill="url(#shieldBg)"/>
            <path d="M64 20 L100 34 V62 C100 84 84 101 64 109 C44 101 28 84 28 62 V34 Z" fill="#FFFFFF" fill-opacity="0.96"/>
            <rect x="40" y="45" width="48" height="10" rx="5" fill="#2563EB" fill-opacity="0.28"/>
            <rect x="40" y="61" width="38" height="10" rx="5" fill="#2563EB" fill-opacity="0.48"/>
            <rect x="40" y="77" width="28" height="10" rx="5" fill="url(#blurBar)"/>
            <circle cx="92" cy="90" r="20" fill="#0F766E" stroke="#FFFFFF" stroke-width="5"/>
            <path d="M84 90 L89.5 95.5 L100 84.5" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </body>
      </html>
    `);
    const outPath = path.join(ROOT, 'icons', `icon${size}.png`);
    await page.screenshot({ path: outPath, omitBackground: true });
  }
  await page.close();

  fs.copyFileSync(path.join(ROOT, 'icons', 'icon128.png'), path.join(ROOT, 'docs', 'assets', 'icon128.png'));
  fs.copyFileSync(
    path.join(ROOT, 'assets', 'wechat-coffee-light.png'),
    path.join(ROOT, 'docs', 'assets', 'wechat-coffee-light.png')
  );
  fs.copyFileSync(
    path.join(ROOT, 'src', 'privacy', 'sensitive_patterns.js'),
    path.join(ROOT, 'docs', 'assets', 'sensitive_patterns.js')
  );
  fs.copyFileSync(path.join(ROOT, 'content.js'), path.join(ROOT, 'docs', 'assets', 'content.js'));
}

async function generateStoreScreenshots(browser) {
  fs.mkdirSync(path.join(ROOT, 'store-assets'), { recursive: true });
  const iconDataUrl =
    'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'icons', 'icon128.png')).toString('base64');

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

  // Screenshot 1: Before vs Auto-Blurred SaaS / Order Dashboard + Popup
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <body style="margin:0;width:1280px;height:800px;background:linear-gradient(135deg,#EFF6FF 0%,#F8FAFC 55%,#F0FDFA 100%);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;gap:38px;padding:42px;box-sizing:border-box;">
        <div style="width:740px;display:flex;flex-direction:column;gap:18px;">
          <div style="display:inline-flex;align-items:center;gap:8px;align-self:flex-start;background:#DBEAFE;color:#1D4ED8;padding:6px 14px;border-radius:999px;font-weight:700;font-size:13px;">
            100% 纯本地运行 · connect-src 'none' · 截图前无需上传云端
          </div>
          <h1 style="font-size:36px;line-height:1.22;margin:0;color:#0F172A;">
            截图 / 录屏前，1 秒自动打码页面敏感信息
          </h1>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div style="background:#FFFFFF;border:1px solid #FECACA;border-radius:14px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
              <div style="font-size:12px;font-weight:700;color:#DC2626;margin-bottom:10px;">✗ 打码前（直接截图易泄露隐私）</div>
              <div style="font-size:12px;color:#334155;line-height:1.85;">
                <div><strong>客户邮箱：</strong>zhangwei@acme-saas.cn</div>
                <div><strong>联系电话：</strong>13800138899</div>
                <div><strong>API 密钥：</strong><code style="background:#F1F5F9;padding:1px 4px;border-radius:4px;">ghp_9xK2mPqR7vL4wZ8nB3cT5yH6jD1fS</code></div>
                <div><strong>收款钱包：</strong><code style="background:#F1F5F9;padding:1px 4px;border-radius:4px;">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</code></div>
                <div><strong>本月净营收：</strong><span style="font-weight:700;color:#0F172A;">¥128,450.00</span></div>
              </div>
            </div>

            <div style="background:#FFFFFF;border:1px solid #99F6E4;border-radius:14px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
              <div style="font-size:12px;font-weight:700;color:#0F766E;margin-bottom:10px;">✓ BlurShield 一键自动打码后</div>
              <div style="font-size:12px;color:#334155;line-height:1.85;">
                <div><strong>客户邮箱：</strong><span style="filter:blur(6px);display:inline-block;">zhangwei@acme-saas.cn</span></div>
                <div><strong>联系电话：</strong><span style="filter:blur(6px);display:inline-block;">13800138899</span></div>
                <div><strong>API 密钥：</strong><span style="filter:blur(6px);display:inline-block;">ghp_9xK2mPqR7vL4wZ8nB3cT5yH6jD1fS</span></div>
                <div><strong>收款钱包：</strong><span style="filter:blur(6px);display:inline-block;">0x71C7656EC7ab88b098defB751B7401B5f6d8976F</span></div>
                <div><strong>本月净营收：</strong><span style="filter:blur(6px);display:inline-block;font-weight:700;">¥128,450.00</span></div>
              </div>
            </div>
          </div>

          <div style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:12px 16px;font-size:13px;color:#475569;display:flex;justify-content:space-between;">
            <span>✓ 非破坏性 Text-Node 包装，支持 <strong>一键全部还原</strong></span>
            <span>✓ 手动点选模糊或替换为 <strong>¥*,***.**</strong></span>
          </div>
        </div>

        <div style="width:380px;background:#F8FAFC;border:1px solid #CBD5E1;border-radius:18px;padding:14px;box-shadow:0 24px 60px rgba(15,23,42,0.16);flex-shrink:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:9px;">
              <img src="${iconDataUrl}" style="width:32px;height:32px;border-radius:8px;"/>
              <div>
                <div style="font-weight:700;font-size:15px;color:#0F172A;">BlurShield <span style="font-size:10px;background:#EFF6FF;color:#2563EB;padding:1px 6px;border-radius:999px;border:1px solid #BFDBFE;">100% 本地</span></div>
                <div style="font-size:11px;color:#64748B;">截图录屏前一键脱敏 · 零上传</div>
              </div>
            </div>
            <span style="background:#FFF7ED;border:1px solid #FED7AA;color:#C2410C;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:600;">☕ 请作者喝咖啡</span>
          </div>
          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;margin-bottom:9px;">
            <div style="font-weight:700;font-size:13px;color:#0F172A;">已隐藏 12 处敏感信息</div>
            <div style="font-size:11px;color:#64748B;">邮箱 3 · 手机 2 · 密钥/卡号 3 · 金额 4</div>
          </div>
          <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;margin-bottom:9px;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;font-size:12px;">
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:6px 9px;">☑ 邮箱</div>
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:6px 9px;">☑ 手机号</div>
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:6px 9px;">☑ 密钥与钱包</div>
              <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:7px;padding:6px 9px;">☑ 金额数字</div>
            </div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#475569;">
              <span>模糊强度</span><span style="color:#2563EB;font-weight:700;">8px</span>
            </div>
            <div style="height:6px;background:#E2E8F0;border-radius:999px;margin-top:6px;overflow:hidden;">
              <div style="width:40%;height:100%;background:#2563EB;"></div>
            </div>
          </div>
          <div style="background:#2563EB;color:#fff;text-align:center;padding:10px;border-radius:9px;font-weight:600;font-size:13px;margin-bottom:8px;">
            一键打码页面敏感信息
          </div>
          <div style="background:#EFF6FF;border:1px solid #93C5FD;color:#2563EB;text-align:center;padding:8px;border-radius:8px;font-weight:600;font-size:12px;margin-bottom:8px;">
            手动点选模糊/替换金额
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;font-size:12px;font-weight:600;">
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:7px;">撤销上一步</div>
            <div style="background:#fff;border:1px solid #FECACA;color:#DC2626;border-radius:8px;padding:7px;">一键全部还原</div>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(ROOT, 'store-assets', 'screenshot-1-auto-blur-1280x800.png') });

  // Screenshot 2: Click-to-Mask Placeholder & Privacy Architecture
  await page.setContent(`
    <!doctype html>
    <html lang="zh-CN">
      <body style="margin:0;width:1280px;height:800px;background:#0F172A;color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Segoe UI',sans-serif;display:flex;flex-direction:column;justify-content:center;padding:56px;box-sizing:border-box;">
        <div style="color:#60A5FA;font-weight:700;font-size:14px;margin-bottom:10px;">BLURSHIELD LOCAL PRIVACY ENGINE</div>
        <h1 style="font-size:38px;margin:0 0 28px;">为什么截图前需要先在本地 DOM 直接打码？</h1>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;">
          <div style="background:#1E293B;border:1px solid #334155;border-radius:16px;padding:26px;">
            <div style="color:#F87171;font-weight:700;font-size:18px;margin-bottom:14px;">✗ 传统截图工具痛点</div>
            <ul style="margin:0;padding-left:20px;line-height:2.05;color:#CBD5E1;font-size:16px;">
              <li>录屏/动态展示时，事后静态涂抹工具完全无法实时遮挡</li>
              <li>在线图片打码网站需把含密码/账单的截图上传到第三方服务器</li>
              <li>长页面手动框选几十处邮箱和手机号极易遗漏</li>
              <li>直接修改网页文字后无法一键无损恢复原始页面</li>
            </ul>
          </div>
          <div style="background:#0F2928;border:1px solid #115E59;border-radius:16px;padding:26px;">
            <div style="color:#2DD4BF;font-weight:700;font-size:18px;margin-bottom:14px;">✓ BlurShield 纯本地四重保障</div>
            <ul style="margin:0;padding-left:20px;line-height:2.05;color:#E2E8F0;font-size:16px;">
              <li><strong>正则自动识别</strong>：邮箱 / 手机号 / API Key / 0x 钱包 / 银行卡 / 金额</li>
              <li><strong>点选模糊或占位符替换</strong>：悬停红框标出，点击即变为 <code style="color:#5EEAD4;">¥*,***.**</code></li>
              <li><strong>无损 Text-Node 还原</strong>：不破坏原有布局，点击「一键全部还原」秒恢复</li>
              <li><strong>connect-src 'none'</strong>：零网络请求，可直接在页面上安全录屏或使用任意截图插件</li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  `);
  await page.screenshot({ path: path.join(ROOT, 'store-assets', 'screenshot-2-click-mask-1280x800.png') });

  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await generateIcons(browser);
    await generateStoreScreenshots(browser);
    console.log('Generated icons, docs/assets, and store-assets successfully.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
