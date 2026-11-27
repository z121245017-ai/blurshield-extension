# BlurShield — One-Click Blur Sensitive Data Before Screenshots

> **100% Local-First · `connect-src 'none'` · Auto-Blur PII/Keys/Revenue + Click-to-Mask · Non-Destructive Restore**

BlurShield 是一款纯本地运行的 Chrome 扩展（Manifest V3），专为产品经理、开发者、运营与客服团队在**截图、录屏、远程共享屏幕前**快速脱敏而打造——无需把隐私截图上传到任何第三方网站，也不用逐个手动涂鸦。

## 核心能力

- **一键自动正则识别与非破坏性模糊**：
  - 支持分类开关：`邮箱`、`手机号`（中国 11 位及国际号码）、`密钥与钱包`（`sk-` / `ghp_` / `github_pat_` / `AKIA` / JWT / `0x` EVM 地址 / 18 位身份证 / 16–19 位银行卡）、`金额数字`（`¥` / `$` / `€` / `RMB` / `USD` 等）。
  - 采用纯本地 Text-Node 包装（`<span data-blurshield-node="1">` + `filter: blur(...)`），精准规避 `2026-11-27` 等普通日期与常规文本。
- **手动点选模糊 / 替换安全占位符**：
  - 开启点选模式后，鼠标悬停即显示红色虚线框，点击即可直接模糊任意元素，或将其替换为干净的 `¥*,***.**` / `$*,***.**` 安全占位符。
- **实时模糊强度调节 + 无损一键还原**：
  - 支持 `6px`–`16px` 模糊强度实时滑块，支持「撤销上一步」与「一键全部还原」，还原后恢复完全一致的原始 DOM 文本节点。
- **极简安全权限**：
  - 仅申请 `activeTab`、`scripting`、`storage`，CSP 严格锁定 `connect-src 'none'`，零网络请求、零登录、零收费墙。

## 下载与安装

1. 前往 [GitHub Releases v1.0.0](https://github.com/z121245017-ai/blurshield-extension/releases/download/v1.0.0/blurshield-extension-v1.0.0.zip) 下载并解压 `blurshield-extension-v1.0.0.zip`。
2. 打开 Chrome 地址栏输入 `chrome://extensions/`，开启右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择解压后的目录即可使用。

## 本地开发与验证

```bash
# 运行 Node 单元测试（正则精确度、防误伤、静态零网络审计）
/Users/zhufan/.local/share/today-node/bin/node --test tests/unit.test.js

# 运行 Playwright Chromium 真实扩展端到端测试
NODE_PATH=/Users/zhufan/Code/today-qa/web-e2e/node_modules /Users/zhufan/.local/share/today-node/bin/node tests/e2e.js
```

## 在线演示与隐私政策

- 在线互动沙盒：[https://z121245017-ai.github.io/blurshield-extension/](https://z121245017-ai.github.io/blurshield-extension/)
- 隐私政策：[https://z121245017-ai.github.io/blurshield-extension/privacy.html](https://z121245017-ai.github.io/blurshield-extension/privacy.html)
