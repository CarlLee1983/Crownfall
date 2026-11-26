# 3D 網頁塔防引擎與工具鏈候選比較

日期：2026-11-26　｜　性質：研究紀錄（建議，不是決策）　｜　對應 issue：#7

## 問題與前提

問題：Vertical Slice 就用 3D 呈現，固定斜俯視相機，地形高度影響玩法。用 TypeScript 做瀏覽器 3D 塔防，Three.js、Babylon.js、PlayCanvas engine 各自能撐到什麼程度？

前提：沿用 2D 研究（`research/engine-comparison`）的架構建議，遊戲邏輯寫成純 TypeScript 的無頭核心（Node 直接 import、用字面期望值測試），引擎只負責渲染與輸入轉譯。2D 研究的引擎結論（PixiJS／Phaser 等）不適用於 3D。

標註規則：「已驗證」表示我在 2026-11-26 直接讀過 npm registry、GitHub API、官方文件、套件內檔案，或在本機實測（Node v24.21.0、esbuild）；「推論」表示由已驗證事實推得並附理由。找不到官方基準的效能數字一律標推論。

## 結論摘要

建議首選 Three.js（0.187.0）加自寫的薄渲染層：生態與範例最多、核心套件最小（最小場景 min+gzip 約 136 KB）、Node 可直接 import 並在無 GPU 下做 Raycaster 運算；代價是它是「函式庫不是引擎」，場景管理、資源載入流程、UI 都要自己搭，且型別在另一個套件 `@types/three`。次選 Babylon.js（9.38.0）：原生 TypeScript、內建 `NullEngine` 無頭模式、內建高度圖地形與 thin instances、維護最勤，但打包約 280 KB gzip，約為 Three.js 的兩倍。PlayCanvas engine（2.24.3）技術上可行，但沒有內建地形與格子 picking 輔助，型別由 JSDoc 產生，且它的優勢（編輯器、資產管線）在「純程式碼加無頭核心」的做法下用不到，排第三。

Threlte 與 react-three-fiber 在這個專案多餘：它們是 Svelte／React 宣告式包裝層，價值在於讓場景樹跟著元件狀態走，而無頭核心加命令式渲染層已經把狀態與渲染切開；除非 HUD 另外決定用 React 或 Svelte，否則只是多一層抽象與依賴。最終選擇屬於 #4 grilling，本文件只是建議。

## 比較表

| 準則 | Three.js | Babylon.js | PlayCanvas engine |
| --- | --- | --- | --- |
| 最新版本（npm） | 0.187.0（2026-10-30） | 9.38.0（2026-11-26） | 2.24.3（2026-11-23） |
| GitHub 活躍度 | 最後 push 2026-11-26；119k stars；404 open issues | 最後 push 2026-11-26；26k stars；33 open issues | 最後 push 2026-11-26；17k stars；508 open issues |
| 授權 | MIT | Apache-2.0 | MIT |
| 型別 | 套件本身不含，另裝 `@types/three` 0.187.0（社群維護，版本號對齊） | 原生 TypeScript（repo 語言為 TypeScript） | 套件內附 `build/playcanvas.d.ts`（約 8.9 萬行，由 JSDoc 產生；repo 語言為 JavaScript） |
| Node import | 成功（443 項匯出） | 成功（3,216 項匯出） | 成功（1,390 項匯出） |
| 官方無頭模式 | 無（但 Raycaster、數學類別不需 GPU） | `NullEngine`（已實測 pick 成功） | `NullGraphicsDevice`（已實測可建立） |
| 格子 picking | `Raycaster`；Node 實測對平面命中 | `scene.pick`；NullEngine 下實測命中 | `Ray`、`BoundingBox.intersectsRay`；另有 GPU `Picker` |
| 斜俯視相機 | `OrthographicCamera`／`PerspectiveCamera` + `lookAt` | `ArcRotateCamera`，可切正交模式 | camera component，可設正交投影 |
| 高度地形 | 無內建高度圖元件，用 `PlaneGeometry` 加手動改頂點（推論，見下） | `CreateGroundFromHeightMap` 內建 | 引擎型別檔未見地形／高度圖 API（已驗證搜尋），需自寫 |
| Instancing | `InstancedMesh` | thin instances（無逐實例剔除） | `MeshInstance.setInstancing`（硬體 instancing） |
| 最小打包（min+gzip） | 136 KB | 280 KB | 299 KB（我的入口含 `AppBase`，偏保守） |

## 各候選逐項說明

### 方法備註（已驗證）

在 scratchpad 以 `npm i` 安裝 `three@0.187.0`、`@types/three@0.187.0`、`@babylonjs/core@9.38.0`、`playcanvas@2.24.3`，用 Node v24.21.0 執行 `import()`。打包大小用 esbuild `--bundle --minify` 加 `gzip -9`，每個入口只建立最小場景：渲染器、一個正交相機、500 個實例的 instancing、一個 raycast／pick 呼叫、一盞光。這是 tree-shaking 後的下限，實際遊戲會更大；三者的入口寫法不完全對等（Babylon 要手動 import 副作用模組、PlayCanvas 我用了 `AppBase` 與兩個元件系統），所以比較只看量級，不看個位數百分比。完成後暫存目錄在 scratchpad，不進 repo。

### Three.js

- 最新為 0.187.0（r187），發佈於 2026-10-30。已驗證：[npm](https://registry.npmjs.org/three)、[GitHub release](https://github.com/mrdoob/three.js/releases/latest)。版本號仍是 0.x，每次發版都可能有破壞性變更；官方遷移指南建議「每次升 10 個版本以內」，因為棄用警告維持 10 個版本。已驗證：[Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)。
- 型別：`package.json` 沒有 `types` 欄位，型別在另一個套件 `@types/three`，也是 0.187.0（2026-10-30），依賴 `fflate`、`@types/webxr` 等。遷移指南寫明自 r126 起型別宣告搬到獨立的 `three-types/three-ts-types` repo。已驗證。推論：型別與引擎由不同人維護，兩者版本必須鎖同一版，升級時多一個失敗點。
- 無頭：`import * as T from 'three'` 在 Node 成功。在 Node 內建立正交相機（`position (10,10,10)`、`lookAt(0,0,0)`）、一個 20x20 平面，`Raycaster.setFromCamera` 後 `intersectObject` 得到 1 個命中，命中點 `(0, 0, ≈0)`。已驗證（本機實測）。注意：`WebGLRenderer` 需要 canvas，不能在 Node 建立；但把格子 picking 寫在核心時，用自己的射線與平面／高度場相交算法比依賴 Raycaster 更乾淨（推論，見「架構」）。
- 相機：標準 `OrthographicCamera` 與 `PerspectiveCamera`，固定斜俯視只要設定位置與 `lookAt`。已驗證（API 存在並在上面的實測中使用）。
- 高度地形：`three/src/geometries` 目錄沒有 terrain／heightmap 幾何（已驗證，本機 `ls` 搜尋）。做法是 `PlaneGeometry` 加 `rotateX`，再依高度圖改頂點 y。推論：寫起來不難，但屬於自己維護的程式碼。
- Instancing：`InstancedMesh(geometry, material, count)`，用 `setMatrixAt`、`setColorAt`，改完需設 `instanceMatrix.needsUpdate = true`，官方說明用途是減少 draw call。已驗證：[InstancedMesh 文件](https://threejs.org/docs/pages/InstancedMesh.html)。500 個實例在 Node 內建立成功（已驗證）。文件沒有明說 raycast 是否逐實例命中，只提到邊界球用於 raycast 與視錐剔除，因此逐實例 picking（例如點選單一敵人）不要預設可用（推論）；格子 picking 不受影響，因為點的是地面。
- 效能：官方文件只說「減少 draw call」，沒有「N 個實例幾 fps」的基準數字。數百個簡單幾何實體加 instancing 屬於常見量級，推論：不是瓶頸。
- 打包：最小場景（WebGLRenderer、OrthographicCamera、InstancedMesh、MeshStandardMaterial、DirectionalLight、Raycaster）min 543,105 位元組，gzip 135,816 位元組。已驗證（本機量測）。`package.json` 的 `sideEffects` 只標示 `./src/nodes/**/*`，其餘可 tree-shake。另有 `three.webgpu.js` 入口（已驗證檔案存在），本次不評估 WebGPU，因為 itch.io iframe 內的 WebGPU 可用性我沒有查到官方說法。

### Babylon.js

- 最新為 9.38.0，發佈於 2026-11-26（今天）。repo 語言為 TypeScript，open issue 僅 33。已驗證：[npm @babylonjs/core](https://registry.npmjs.org/@babylonjs/core)、[GitHub](https://github.com/BabylonJS/Babylon.js)。推論：發版節奏很快，需要鎖版本。
- 型別：原生 TypeScript，`@babylonjs/core` 套件 `types` 指向 `index.d.ts`。已驗證。需注意：官方 ES module 版本是 `@babylonjs/core`（可 tree-shake），舊的 `babylonjs` 單檔套件 unpacked 約 118 MB、不適合打包（已驗證 npm 資料）。
- 無頭：`NullEngine` 是官方的無頭引擎。實測 `new NullEngine()`、建立 `ArcRotateCamera` 與 20x20 地面後，`scene.pick(畫面中心)` 回傳 `hit: true`，命中點約 `(0, 0, 0)`。已驗證（本機實測，輸出含「Babylon.js v9.38.0 - Null engine」）。意義：連 picking 都能不靠 GPU 在 Node 測，但這代表測試會依賴 Babylon 的場景圖；採用無頭純 TS 核心時，核心不應 import Babylon（推論）。
- 相機：`ArcRotateCamera` 可設 `mode = Camera.ORTHOGRAPHIC_CAMERA`，固定 alpha／beta 即為固定斜俯視。已驗證（類別存在，打包實測使用 `mode` 欄位）；具體正交設定的視覺結果未實測。
- 高度地形：內建 `CreateGroundFromHeightMap`，以灰階圖建地形，參數有 `minHeight`、`maxHeight`、`subdivisions`，函式存在於套件的 `groundBuilder.d.ts`。已驗證：[Height Map 文件](https://doc.babylonjs.com/features/featuresDeepDive/mesh/creation/set/height_map)。注意：我們要的是「高度影響玩法」的分層／格子地形，高度資料的來源應是核心的資料而不是圖片（推論），所以這個內建的價值有限。
- Instancing：thin instances（4.2 起），每個實例只是一個矩陣；`thinInstanceAdd`、`thinInstanceSetMatrixAt`、`thinInstanceSetBuffer`。文件說明支援 collisions、picking、rendering、shadows，但「全有或全無剔除」，沒有逐實例剔除，且「物件常被剔除或常變動時一般實例可能更合適」。已驗證：[Thin Instances 文件](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)。文件無基準數字（已驗證）。
- 打包：最小場景（Engine、Scene、ArcRotateCamera、CreateBox、HemisphericLight、thin instances、ray 副作用模組）min 1,141,495 位元組，gzip 279,956 位元組。已驗證（本機量測）。Babylon 的 tree-shaking 需要逐一 import 子路徑與副作用模組，漏掉副作用模組（例如 `Culling/ray`）會在執行期才失敗，這是學習曲線（推論）。

### PlayCanvas engine

- 最新為 2.24.3，發佈於 2026-11-23；npm modified 為 2026-11-26；open issue 508。已驗證：[npm](https://registry.npmjs.org/playcanvas)、[GitHub](https://github.com/playcanvas/engine)。
- 型別：套件內附 `build/playcanvas.d.ts`，約 89,787 行，來源為 JSDoc，repo 語言為 JavaScript（已驗證）。推論：型別完整度取決於 JSDoc 品質，大型 `any` 或鬆散的元件設定物件常見（例如 `addComponent('camera', {...})` 的字串鍵），需實際寫碼確認。
- 無頭：Node import 成功；`new NullGraphicsDevice({width:100,height:100}, {})` 可建立；`BoundingBox.intersectsRay` 對一個薄盒的射線測試命中，命中點 `(0, 0.1, 0)`。已驗證（本機實測）。我沒有在 Node 內跑完整 `AppBase` 加 camera 的 screen-to-world picking，這一段未驗證。
- 相機：camera component 的 `projection` 可設正交（打包實測使用 `projection: 1`）。已驗證（欄位存在）；視覺結果未實測。
- 高度地形：引擎型別檔中搜尋 terrain／heightmap 無結果（已驗證，本機 grep）。推論：需自寫網格或用 `Mesh` 手動建頂點。
- Instancing：`MeshInstance.setInstancing(vertexBuffer)` 做硬體 instancing，預設格式佔用 TEXCOORD6／7，材質若取樣這兩組 UV 要自訂格式；預設不做視錐剔除（第二參數可開啟群組級剔除）；官方說明所有裝置皆支援（因為最低需求 WebGL2）。已驗證：[Hardware Instancing](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/hardware-instancing/)（由搜尋結果摘要取得，我沒有直接開啟該頁全文）與型別檔 `playcanvas.d.ts` 的 JSDoc。
- 打包：最小場景 min 1,134,279 位元組，gzip 298,954 位元組。已驗證（本機量測）。我的入口含 `AppBase` 與兩個元件系統，若改用更精簡的入口可能更小（推論），所以 PlayCanvas 與 Babylon 的差距不具意義，兩者都約為 Three.js 的兩倍。
- 定位：PlayCanvas 的主要賣點是雲端編輯器與資產管線（我沒有在本次查證，屬已知背景，不作為依據）；本專案做法是程式碼加無頭核心，用不到編輯器，推論：優勢無法發揮。

### 包裝層：Threlte 與 react-three-fiber

- react-three-fiber 9.8.2（2026-10-14）、`@threlte/core` 8.7.0（2026-11-02）；repo 皆活躍（react-three-fiber 最後 push 2026-10-21，Threlte 2026-11-22）。已驗證：[npm](https://registry.npmjs.org/@react-three/fiber)、[npm](https://registry.npmjs.org/@threlte/core)、GitHub。npm 上的 `threlte` 套件停在 3.13.1（2022-07），是舊的不相關版本，必須用 `@threlte/core`（已驗證）。
- 它們是 React／Svelte 的宣告式綁定：場景樹由元件狀態驅動。已驗證（套件依賴 React 生態的 `zustand`、`its-fine`、`scheduler`）。
- 推論：本專案的狀態在無頭核心，渲染層只需讀快照畫圖，用命令式 Three.js 即可；包裝層引入框架依賴與它自己的更新模型，除非 HUD 另外決定要用 React 或 Svelte，否則不需要。若 #4 決定 HUD 用 React／Svelte，再評估這兩者只管 3D 畫布、不碰核心。

## itch.io 發佈限制（三者共通）

官方文件的限制，與引擎無關（已驗證：[itch.io HTML5 文件](https://itch.io/docs/creators/html5)）：ZIP 解壓後最多 1,000 個檔案、全部內容最多 500 MB、單檔最多 200 MB、檔名含路徑最多 240 字元；必須有 `index.html`；路徑要用相對路徑且區分大小寫；外部資源必須 HTTPS；遊戲嵌在 iframe；`html、js、css、svg、wasm、wav、glb、pck` 由 CDN 自動 gzip，`.br` 需用副檔名標示。頁面沒有提到 SharedArrayBuffer、執行緒、COOP／COEP（已驗證，頁面無此內容），所以任何依賴 SharedArrayBuffer 的功能（例如多執行緒 wasm 物理）不應預設可用（推論）。三個候選的打包都遠低於上述上限，體積差異只影響首次載入時間，不是發佈阻礙（推論）。

## 對本專案的建議與風險

架構（建議）：`core/` 純 TS，零引擎依賴，擁有格子資料與每格高度、路徑、波次、塔與敵人邏輯；格子 picking 的數學（螢幕座標轉射線，射線對高度場求交，得出格子索引）也放核心，只吃相機參數與滑鼠座標，因此能用 Vitest 對字面期望值測試。`render/` 讀快照畫 Three.js 物件：地形用一個依格高度建的 mesh，敵人與投射物用 `InstancedMesh`，塔數量少可用一般 mesh。這個切法讓「引擎的 raycast 能不能在 Node 跑」不再重要，三者都過關（已驗證），因此決策可以放在打包體積、型別與生態，而不是無頭能力。

風險：

1. Three.js 是 0.x，加上型別在 `@types/three`，升版要同時鎖兩個套件並跟遷移指南走（已驗證版本號與遷移指南，風險判斷為推論）。
2. Three.js 的逐實例 picking 文件沒有說明，若之後要「點選單一敵人」，要自己用核心位置做命中判定（推論，與建議架構一致）。
3. Babylon 與 PlayCanvas 的 instancing 都沒有逐實例剔除（Babylon 已驗證，PlayCanvas 預設無剔除已驗證）；數百個實體且多在畫面內，影響不大（推論）。
4. 所有效能數字（數百實體是否流暢）皆為推論；官方文件對三者都沒有給 N 個實例的基準。建議做 500 敵人加 500 投射物的小原型實測，這比任何文件都可靠。
5. 高度地形對三者都要自己決定「高度資料表示」（分層格子 vs 連續高度圖）；這是遊戲設計決定，不是引擎能力差異，應先在 #4 定案再選地形做法。
6. WebGPU 路線（Three.js 的 `three.webgpu.js`、Babylon 的 WebGPU 引擎）在 itch.io iframe 內的可用性我沒有找到官方說法，Slice 建議以 WebGL2 為準（推論）。

## 待 grilling 決定的問題

- 是否接受「無頭核心加薄渲染層」為硬性架構，並把 picking 數學放進核心？
- 打包體積重不重要（約 136 KB vs 約 280 至 300 KB gzip 的差異）？
- 能否接受 Three.js 的 0.x 破壞性升級與外部型別套件，或更看重 Babylon 的原生 TS 與內建工具？
- 高度資料要用分層格子還是連續高度圖？這決定地形做法。
- HUD 用 DOM、React 還是 Svelte？這決定包裝層有沒有存在價值。
- 是否先做 500 實體的小型效能原型再決定？

## 來源清單

- npm registry：[three](https://registry.npmjs.org/three)、[@types/three](https://registry.npmjs.org/@types/three)、[@babylonjs/core](https://registry.npmjs.org/@babylonjs/core)、[babylonjs](https://registry.npmjs.org/babylonjs)、[playcanvas](https://registry.npmjs.org/playcanvas)、[@react-three/fiber](https://registry.npmjs.org/@react-three/fiber)、[@threlte/core](https://registry.npmjs.org/@threlte/core)
- GitHub：[mrdoob/three.js](https://github.com/mrdoob/three.js)、[BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js)、[playcanvas/engine](https://github.com/playcanvas/engine)、[pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber)、[threlte/threlte](https://github.com/threlte/threlte)
- Three.js：[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)、[Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- Babylon.js：[Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances)、[Height Map](https://doc.babylonjs.com/features/featuresDeepDive/mesh/creation/set/height_map)
- PlayCanvas：[Hardware Instancing](https://developer.playcanvas.com/user-manual/graphics/advanced-rendering/hardware-instancing/)、[MeshInstance API](https://api.playcanvas.com/engine/classes/MeshInstance.html)
- itch.io：[HTML5 games](https://itch.io/docs/creators/html5)
- 本機實測（2026-11-26，Node v24.21.0）：三個引擎的 Node import、Three.js 正交相機 Raycaster 對平面命中、Babylon `NullEngine` 的 `scene.pick`、PlayCanvas `NullGraphicsDevice` 與射線對 AABB、esbuild 打包與 `gzip -9` 大小、套件內 d.ts 與目錄搜尋
