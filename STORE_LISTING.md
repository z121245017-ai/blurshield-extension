# Chrome Web Store Listing (ASO Ready)

## Extension Name (<= 75 chars)
`BlurShield - One-Click Blur Sensitive Data Before Screenshots` (61 chars)

## Short Description (EN, <= 132 chars)
`1-click local privacy blur & click-to-mask for emails, phones, API keys, wallets, and revenue before screenshots. Zero uploads.` (128 chars)

## Short Description (ZH-CN, <= 132 chars)
`截图录屏前一键局部打码！纯本地识别模糊邮箱、手机号、API 密钥、0x 钱包与营收金额，支持点选替换为 ¥*,***.** 并无损还原。`

## Detailed Description (EN)
Tired of manually painting over customer emails, phone numbers, API keys, or revenue metrics after taking a screenshot — or risking privacy leaks by uploading sensitive screenshots to online editors?

**BlurShield** masks sensitive data directly on the live webpage in your browser before you capture a screenshot or start a screen recording:

- **1-Click Auto-Redact Engine**: Automatically detects and blurs Emails, China/International Mobile Numbers, API Keys & Tokens (`sk-...`, `ghp_...`, `github_pat_...`, `AKIA...`), EVM `0x` wallet addresses, Bank/ID card runs, and Currency Amounts — while safely ignoring ordinary dates like `2026-11-27`.
- **Category Toggles & Adjustable Blur**: Toggle individual categories (`Email`, `Phone`, `Secrets & Wallets`, `Amounts`) and slide blur strength smoothly between `6px` and `16px`.
- **Interactive Click-to-Blur & Safe Placeholders**: Hover any DOM element (highlighted with a crisp red dashed box) and click to blur it or cleanly replace revenue figures with safe placeholders (`¥*,***.**` / `$*,***.**`).
- **Non-Destructive Restore All**: Wraps matched text spans cleanly so **Restore All** and **Undo** bring back the exact original page DOM with zero layout breakage.
- **100% Local-First Privacy**: Strict `connect-src 'none'` CSP, zero external requests, zero accounts, zero paywalls.

## Detailed Description (ZH-CN)
做产品演示、写教程、提 Bug 或对外发截图/录屏时，每次都要事后涂抹邮箱、手机号、API Key 和后台金额，或者担心把原图传到在线打码网站泄露数据？

**BlurShield** 是一款 100% 纯本地运行的截图前网页脱敏扩展：
- **一键自动识别打码**：自动扫描页面中的邮箱、中国 11 位手机号与国际号码、API 密钥（`sk-` / `ghp_` / `AKIA`）、`0x` 钱包地址、银行卡/身份证与金额数字，同时精准放行 `2026-11-27` 等普通日期。
- **分项开关 + 6px–16px 模糊强度滑块**：按需开关任意敏感类别，拖动滑块实时预览模糊程度。
- **手动点选模糊 / 替换为安全占位符**：悬停红框标出任意图表或订单块，点击即可模糊或替换为 `¥*,***.**` / `$*,***.**`。
- **无损撤销与一键全部还原**：采用非破坏性 Text-Node 包装，点击「一键全部还原」即可 100% 恢复页面原始文本节点。

## Permission Justifications
- `activeTab`: Reads and modifies the currently active tab's DOM only when the user clicks the BlurShield toolbar icon.
- `scripting`: Injects the local redaction engine (`src/privacy/sensitive_patterns.js`, `content.js`) into the active tab on user action.
- `storage`: Stores user preferences locally in `chrome.storage.local` (enabled categories, blur radius, pick mode, and coffee support status).

## Privacy Disclosures
- Single purpose: Blur or mask sensitive text and elements locally on the active webpage prior to screenshots or screen recordings.
- Zero data collection, zero analytics, zero remote servers (`connect-src 'none'`).
