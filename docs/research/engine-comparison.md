# 2D 塔防遊戲引擎／函式庫比較

日期：2026-11-26　｜　性質：研究紀錄（建議，不是決策）

## 問題與前提

問題：用 TypeScript 做一款 2D 塔防，桌面瀏覽器、滑鼠操作，發佈到 itch.io，由一位業餘開發者在 4 到 6 週的零碎時間內完成。要在 Phaser（最新主版本）、PixiJS（自寫 game loop）、Excalibur、KAPLAY、純 Canvas 2D 之間比較。

前提：同屏約數百敵人加投射物；需要場景切換、滑鼠輸入、補間、（可選）tilemap 與尋路；遊戲邏輯希望能在 Vitest／bun test 下無頭執行。

標註規則：「已驗證」表示我在 2026-11-26 直接讀過 npm registry、GitHub API、套件原始碼或官方文件，並附連結；「推論」表示由已驗證事實推得，附理由。版本號與日期皆取自 npm／GitHub。

## 結論摘要

建議把遊戲邏輯寫成純 TypeScript 的無頭核心（波次、路徑移動、塔攻擊、傷害結算），渲染只是一層薄殼，引擎選擇因此變成低風險。在這個前提下首選 PixiJS 8（自寫 loop）：它是唯一在 Node 直接 import 成功、維護最活躍、TS 原生的渲染器，成本是場景、補間、尋路要自己補。若想要內建場景與補間、少寫膠水，Phaser 4 是次選，但它在 Node import 會失敗（需要 `window`），2026-08 後主分支無推送，且打包體積最大。最終選擇屬於 grilling ticket #4，本文件只是建議。

## 比較表

| 準則 | Phaser | PixiJS | Excalibur | KAPLAY | 純 Canvas 2D |
| --- | --- | --- | --- | --- | --- |
| 最新版本（npm） | 4.2.1（2026-07-09） | 8.23.0（2026-11-11） | 1.0.1（2026-11-13） | 3001.0.19（2025-06-15）；4000 為 alpha | 無（瀏覽器 API） |
| 維護狀態 | 最後 push 2026-08-21，之後無提交 | 非常活躍 | 活躍 | 主線 repo 活躍，但穩定版一年多未發 | 不適用 |
| TS 型別 | 原始碼為 JS，型別為產生的 .d.ts | 原生 TS | 原生 TS | 原生 TS，單檔 doc.d.ts | lib.dom 內建 |
| 數百實體效能 | 足夠（推論） | 足夠（推論） | 足夠（推論） | 足夠（推論），KAPLAY 無官方基準 | 足夠，若自己做髒矩形／離屏快取（推論） |
| 場景 | 有 | 無 | 有 | 有 | 無 |
| 輸入 | 有 | 有（指標事件） | 有 | 有 | 原生事件 |
| 補間 | 有 | 無 | 有（Actions easeTo） | 有 | 無 |
| Tilemap | 有（含 Tiled 解析） | 無 | 有（TileMap） | 有（addLevel） | 無 |
| 尋路 | 無 | 無 | 有（Graph.aStar／dijkstra） | 有（navigation 元件） | 無 |
| Node 無頭 import | 失敗（`window is not defined`） | 成功 | 成功 | 成功 | 不適用 |
| 最小打包（min+gzip） | 369 KB | 178 KB | 152 KB | 69 KB | 0 KB |
| Vite 整合 | 官方 vite-ts 範本 | create-pixi 範本 | 官方 vite 範本 | create-kaplay | 任意 |

## 各候選逐項說明

### 方法備註（已驗證）

在 scratchpad 內以 `npm i` 安裝各套件，用 Node v24.21.0 執行 `import()`；打包大小用 esbuild `--bundle --minify` 配 `gzip -9`，入口只建立最小遊戲物件。這是 tree-shaking 後的最小用量，實際遊戲會更大。完成後已刪除暫存目錄。

### Phaser 4

- 最新為 4.2.1，發佈於 2026-07-09；v4.0.0 於 2026-04-10 發佈，之後 4.1.0（04-30）、4.2.0（06-19）。已驗證：[npm registry](https://registry.npmjs.org/phaser)、[GitHub releases](https://github.com/phaserjs/phaser/releases)。
- 最後一次 push 為 2026-08-21，內容是 `CHANGELOG-v4.3.md`，此後 90 天內無提交；開放 issue 130 個，近 90 天關閉 2 個。已驗證：[GitHub API](https://api.github.com/repos/phaserjs/phaser)。推論：4.3 開發可能進行中但未公開推送，或進入低活動期，這是風險訊號但不是停止維護的證據。
- 型別：repo 語言為 JavaScript，npm 套件的 `types/phaser.d.ts` 約 14.8 萬行。已驗證（套件內檔案與 GitHub 語言欄位）。推論：型別由原始碼註解產生，常見缺點是泛型與回呼型別較鬆，需實際寫碼確認。
- 效能：官方宣稱 v4 渲染器重寫，SpriteGPULayer 可「單次 draw call 渲染一百萬個 sprite」。已驗證（官方宣稱，非獨立基準）：[v4.0.0 release](https://github.com/phaserjs/phaser/releases/tag/v4.0.0)。數百敵人遠低於此量級，推論：不是瓶頸。
- 內建：場景、輸入、補間（`src/tweens`）、tilemap（`src/tilemaps`，含 Tiled 解析）、Arcade 物理。已驗證：套件原始碼目錄。無尋路：原始碼搜尋 astar／pathfind／dijkstra 僅命中 shader 與 TweenManager 的無關字串。已驗證（本機搜尋），結論性表述屬推論。
- 無頭測試：`node --input-type=module -e "import('phaser')"` 與 `require('phaser')` 都回報 `window is not defined`。已驗證（本機實測，Node v24.21.0）。要在 Vitest 測試，必須 jsdom／happy-dom 加 canvas 模擬，或邏輯完全不 import Phaser。
- 打包：min+gzip 369 KB（esbuild 最小入口）；官方 `dist/phaser.min.js` 為 1,375,976 位元組，gzip 後 352,455 位元組。已驗證（本機量測）。
- Vite：官方有 [template-vite-ts](https://github.com/phaserjs/template-vite-ts)，最後 push 2026-04-21。已驗證。

### PixiJS 8

- 最新為 8.23.0，發佈於 2026-11-11；npm modified 為 2026-11-26，近 90 天最多 100 筆提交（API 上限），開放 issue 319，近 90 天關閉 42。已驗證：[npm](https://registry.npmjs.org/pixi.js)、[GitHub](https://github.com/pixijs/pixijs)。
- 型別：repo 語言為 TypeScript，`lib/index.d.ts` 隨套件發佈。已驗證。
- 效能：官方效能指南給的是批次規則（sprite 最多 16 種貼圖同批、Graphics 100 點以內可批次、混用物件類型會增加 draw call），沒有「N 個 sprite 幾 fps」的基準數字。已驗證：[Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)。推論：塔防只用 sprite 並共用 spritesheet，數百物件屬於常見量級。
- 內建：只有渲染、場景圖、指標事件、資源載入、ticker。沒有場景管理、補間、tilemap、尋路。已驗證（lib 目錄無對應模組，`lib/*.d.ts` 搜尋 tween／pathfind 無結果）。補間與尋路要另配套件或自寫，推論：自寫 A* 約數十行，補間可用 gsap 或自寫。
- 無頭測試：Node 直接 `import('pixi.js')` 成功（匯出 795 項）。已驗證（本機實測）。注意：能 import 不代表能建立 Application，需要 DOM／WebGL。
- 打包：min+gzip 178 KB（含預設擴充，tree-shaking 空間有限）。已驗證（本機量測）。
- Vite：有官方 [create-pixi](https://github.com/pixijs/create-pixi)，最後 push 2026-11-13。已驗證。

### Excalibur

- 最新為 1.0.1，發佈於 2026-11-13（1.0.0 剛發佈不久，release notes 稱 1.0.1 為 1.0.0 的後續修正）；近 90 天提交活躍，開放 issue 35，近 90 天關閉 14。已驗證：[npm](https://registry.npmjs.org/excalibur)、[GitHub](https://github.com/excaliburjs/Excalibur/releases/latest)。社群規模較小（約 2.4k stars，API 值），推論：遇到冷門問題時可搜尋到的答案較少。
- 型別：原生 TS，`type: module`，`sideEffects: false`。已驗證。
- 效能：本次未找到官方基準，數百實體標為推論（WebGL 批次渲染的 2D 引擎，量級常見）。
- 內建：場景與 Director（轉場）、輸入（指標／鍵盤／手把）、Actions（含 easeTo 補間）、TileMap、碰撞、粒子、相機。已驗證（套件 d.ts 目錄）。尋路：公開匯出 `Graph`，具 `dijkstra` 與 `aStar`，已驗證（`'Graph' in import('excalibur')` 為 true，d.ts 中有方法簽名）；但它是通用圖結構，需自己把網格建成節點，推論。
- 無頭測試：Node import 成功（匯出 433 項）。已驗證（本機實測）。
- 打包：min+gzip 152 KB。已驗證（本機量測）。
- Vite：官方 [template-ts-vite](https://github.com/excaliburjs/template-ts-vite)，最後 push 2026-11-26。已驗證。

### KAPLAY

- npm 最新穩定版 3001.0.19，發佈於 2025-06-15；`next` 標籤為 4000.0.0-alpha.27.1（2026-05-12）。GitHub 最新 release 也是該 alpha。倉庫主線 2026-11-26 仍有提交，開放 issue 60。已驗證：[npm](https://registry.npmjs.org/kaplay)、[GitHub](https://github.com/kaplayjs/kaplay)。推論：穩定版一年半沒更新，v4 仍在 alpha，採用需決定押穩定線或 alpha。
- 型別：原生 TS，`dist/doc.d.ts` 單檔。已驗證。
- 效能：本次未找到官方基準，標為推論；KAPLAY 以易用為主，大量實體時缺少 Pixi／Phaser 那種批次最佳化文件。
- 內建：`scene`／`go`、輸入、`tween`、`addLevel`（網格關卡）、導航元件（`navigate`／`navigateTo`，tile 有 obstacle 與 cost 屬性）。已驗證（doc.d.ts 行 2111、2118、2277 起、4315、4724）。
- 無頭測試：Node import 成功，但只匯出 3 個項目（主要是 `kaplay()` 工廠）。已驗證（本機實測）。推論：功能必須先呼叫 `kaplay()` 建立實例，而該實例需要 canvas，因此邏輯元件難以脫離渲染。
- 打包：min+gzip 69 KB。已驗證（本機量測）。
- Vite：[create-kaplay](https://registry.npmjs.org/create-kaplay) 目前為 3.1.5（npm 讀取），已驗證。

### 純 Canvas 2D

- 無維護問題與依賴；型別來自 TypeScript 的 lib.dom。已驗證：[MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)（標準 API）。
- 效能：2D context 不批次，數百個帶旋轉的 sprite 加投射物通常可行，但沒有官方基準。推論，需用原型實測。
- 內建：什麼都沒有，場景、補間、tilemap、尋路、資源載入、點擊命中測試都要自寫。4 到 6 週的預算下，這些膠水可能吃掉可觀比例的時間（推論）。
- 無頭測試：邏輯與渲染天然可分，是最容易的一種，但這取決於寫法而非 canvas 本身。
- 打包：0 KB 函式庫成本，Vite 直接建置。

## 對塔防的建議與風險

建議架構：`core/`（純 TS，零 DOM 依賴）放狀態、固定步長 tick、波次、路徑、塔與敵人邏輯，用 Vitest 對字面期望值測試；`render/` 只讀取核心狀態並繪製，輸入層把滑鼠事件翻成核心的指令。這樣核心不受所選引擎影響，也避開 Phaser 在 Node 無法 import 的問題。這是建議，推論來自上面的實測。

風險：

1. 塔防的路徑通常是固定路線或小網格，A* 需求很低，「引擎有無尋路」的權重不該太高（推論）。
2. Phaser 近三個月無公開提交，且為最大打包；若選它，需接受 v4 剛發佈半年、生態文件仍混有 v3 內容（推論）。
3. KAPLAY 穩定版停在 2025-06，v4 為 alpha，版本路線不確定。
4. Excalibur 1.0 發佈未滿兩個月，API 剛穩定，但社群較小。
5. PixiJS 與純 Canvas 要自寫場景、補間、UI 元件（按鈕、面板），這是 4 到 6 週內最容易低估的工作量（推論）。
6. 效能數字多為推論，建議在決策前用 500 敵人加 500 投射物的小原型實測，這比任何文件都可靠。

## 待 grilling 決定的問題

- 是否接受「無頭核心加薄渲染層」作為硬性架構？若接受，引擎選擇的權重該放在哪些準則？
- 可接受的自寫膠水範圍：場景管理、補間、UI 元件要不要自寫？
- 打包大小對 itch.io 載入體驗的門檻是多少（約 70 KB 到約 370 KB 的差異是否重要）？
- 能否接受 Phaser 近期的低活動與 KAPLAY 的 alpha 路線？
- 是否需要 Tiled 地圖流程，還是關卡用自訂 JSON 網格？
- 是否先做一個小型效能原型再決定？

## 來源清單

- npm registry：[phaser](https://registry.npmjs.org/phaser)、[pixi.js](https://registry.npmjs.org/pixi.js)、[excalibur](https://registry.npmjs.org/excalibur)、[kaplay](https://registry.npmjs.org/kaplay)、[create-kaplay](https://registry.npmjs.org/create-kaplay)
- GitHub：[phaserjs/phaser](https://github.com/phaserjs/phaser)、[pixijs/pixijs](https://github.com/pixijs/pixijs)、[excaliburjs/Excalibur](https://github.com/excaliburjs/Excalibur)、[kaplayjs/kaplay](https://github.com/kaplayjs/kaplay)
- 範本：[phaserjs/template-vite-ts](https://github.com/phaserjs/template-vite-ts)、[pixijs/create-pixi](https://github.com/pixijs/create-pixi)、[excaliburjs/template-ts-vite](https://github.com/excaliburjs/template-ts-vite)
- Phaser v4.0.0 發佈說明：https://github.com/phaserjs/phaser/releases/tag/v4.0.0
- PixiJS 效能指南：https://pixijs.com/8.x/guides/concepts/performance-tips
- MDN Canvas API：https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- 本機實測（2026-11-26，Node v24.21.0，npm 安裝上述版本）：Node import、esbuild 打包與 gzip -9 大小、套件內 d.ts 與原始碼搜尋
