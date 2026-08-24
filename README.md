# 來約我嘛 🥺 — 整人邀請函產生器

把手朋友「騙」出門的可愛小工具:做出一份客製化邀請頁,傳連結給朋友——

- 「**同意**」按鈕永遠按不成功:會逃跑、跳假錯誤、假裝載入失敗、越按越小…五種花樣自由組合
- 「**不同意**」則走你設計的多段哀求流程(可無限循環 😈)
- 朋友的每個動作(開啟/狂點同意/投降)透過 [ntfy.sh](https://ntfy.sh) **即時推播到你的手機**
- 全部文字、配色、流程都在內建編輯器調整,一鍵產生分享連結 / QR code
- 響應式 PWA:手機、電腦瀏覽器直接開;可加到主畫面像 App

## 快速開始

```bash
npm install        # 安裝依賴
npm run dev        # 本機開發 http://localhost:5173
npm run build      # 型別檢查 + 產出 dist/
npm test           # Vitest 單元測試
npm run e2e        # Playwright E2E(需先 npx playwright install chromium)
```

## 使用方式

1. 打開網站 → 編輯器分區設定主題/文案/整人手法/不同意流程
2. 開啟通知:手機安裝 [ntfy App](https://ntfy.sh) 訂閱編輯器生成的頻道(附一鍵連結與 QR)
3. 按「產生邀請連結」→ 複製或掃 QR 傳給朋友
4. 等著收通知,看他被「同意」按鈕玩得團團轉

> 隱私:所有設定打包在連結本身(#hash),沒有伺服器儲存任何資料;通知頻道名為隨機 UUID,只有拿到完整連結的人能觸發。

## 部署

### GitHub Pages(預設管線)

`.github/workflows/deploy.yml` 已就緒:push 到 `main` 即自動建置部署。
**注意**:私有 repo 的 Pages 需要 GitHub **Pro**(付費)方案;免費帳號請用以下替代或將 repo 轉公開:

```bash
gh repo edit --visibility public --accept-visibility-change-consequences
```

啟用:Settings → Pages → Source 選 **GitHub Actions**。

### Vercel / Netlify(零設定替代)

`npm run build` 後把 `dist/` 資料夾拖進 [Netlify Drop](https://app.netlify.com/drop) 或 Vercel 即可上線(base 已設相對路徑,任何子路徑都能跑)。

## 技術棧

Vite 6 · React 18 · TypeScript(strict)· Tailwind CSS 3 · fflate(連結壓縮)· qrcode · vite-plugin-pwa · Vitest + Playwright

## 授權

僅供個人娛樂使用;請溫柔地整朋友 🥺
