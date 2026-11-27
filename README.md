# Crownfall

在瀏覽器上遊玩的塔防遊戲（暫定名稱），目前在規劃階段。

## 狀態

規劃中：路線圖記錄在 GitHub issue 的 `wayfinder:map`，詞彙表見 [GLOSSARY.md](GLOSSARY.md)。

## 建置與驗證

使用與 CI 相同的 Bun 1.4.4，在專案根目錄執行：

```sh
bun install --frozen-lockfile
bun run build
bunx playwright install chromium
bun run test:smoke
```

建置產物位於 `dist/`。冒煙測試會從子目錄提供該目錄的靜態檔案，並用 Chromium 實際操作遊戲。

## 打包上傳 itch.io

在專案根目錄執行：

```sh
(cd dist && zip -qr - .) > crownfall.zip
```

確認 ZIP 根目錄直接包含 `index.html` 和 `assets/`。在 itch.io 專案頁將作品類型設為 **HTML**，上傳 `crownfall.zip`，勾選 **This file will be played in the browser**，儲存後在預覽頁載入遊戲。

## 授權

尚未決定。
