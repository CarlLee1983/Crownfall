# Crownfall

在桌面瀏覽器上遊玩的塔防遊戲（暫定名稱）。

## 狀態

目前可在本機從開局玩到勝利或敗北，itch.io 版本尚未發佈。路線圖記錄在 GitHub issue 的 `wayfinder:map`，遊戲用語見 [詞彙表](GLOSSARY.md)。

## 本機試玩

使用 Bun 1.4.4，在專案根目錄執行下列指令，再用桌面瀏覽器開啟終端機顯示的網址。

```sh
bun install --frozen-lockfile
bun run dev
```

## 建置與驗證

使用與 CI 相同的 Bun 1.4.4，在專案根目錄執行下列指令。

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run balance
bun run build
bunx playwright install chromium
bun run test:smoke
```

建置產物位於 `dist/`，可用 `bun run preview` 在本機試玩。冒煙測試會從子目錄提供該目錄的靜態檔案，並用 Chromium 實際操作遊戲。本機預設顯示版本 `dev`。

## 發佈到 itch.io

發佈前，在 GitHub 儲存庫的 Actions 設定中新增變數 `ITCH_TARGET`，值為 itch.io 的 `owner/project`，並將 Butler API 金鑰存為 secret `BUTLER_API_KEY`。

推送符合 `v*` 的 Git 標籤（例如 `v0.1.0`）會觸發 [發佈流程](.github/workflows/release.yml)。流程以標籤名稱設定 `APP_VERSION`，讓遊戲 HUD 與冒煙測試使用同一個版本。Lint、型別檢查、單元測試、平衡測試、建置與冒煙測試全部通過後，Butler 才會將驗證過的 `dist/` 上傳到 itch.io 的 `html5` 頻道，並以標籤名稱記錄版本。

### 手動打包備援

完成上述建置與驗證後，在專案根目錄執行下列指令。

```sh
(cd dist && zip -qr - .) > crownfall.zip
```

確認 ZIP 根目錄直接包含 `index.html` 和 `assets/`。在 itch.io 專案頁將作品類型設為 **HTML**，上傳 `crownfall.zip`，勾選 **This file will be played in the browser**，並在專案頁介紹加入「3D 模型：KayKit by Kay Lousberg (CC0)」。儲存後在預覽頁載入遊戲。

## 模型前處理

執行 `bun run models` 會從[資產清單](docs/art/asset-manifest.json)指定的 KayKit 版本下載原檔，把精簡後的 GLB 寫到 `src/render/models/`。

## 音訊前處理

安裝 curl、unzip 和含 libopus 的 FFmpeg 後，執行 `bun run audio` 會下載原始素材、裁切與正規化響度，並把通過峰值檢查的 Ogg Opus 檔寫到 `src/audio/clips/`。

## 授權

程式碼採 [MIT 授權](LICENSE)。

3D 模型：KayKit by Kay Lousberg (CC0)
