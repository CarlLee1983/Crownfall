# PROTOTYPE：環境裝飾密度（拋棄式分支，不合併）

問題：胸牆、墓碑、枯木放多少才不干擾辨識度（wayfinder 票 #106，地圖 #97）。

底：`origin/prototype/pixel-size`（已決定的燈光、敵人 ×1.5、取景、地形近似、`?px=`）。一律用 `?px=2`。

## 變體：`?decor=a|b|c|d`（預設 a），左下角固定標籤

- a：無裝飾（基準）。
- b：格外環帶 3 格寬、頂面低於可玩格 0.12、比可玩苔蘚暗，越外越暗；散放墓碑、枯木、破石牆／矮牆／碎石（種子固定，約 30–40% 的環格有一件）。朝鏡頭的兩側（+x、+z）只放矮物件，枯木只放在遠側。可玩格上沒有任何東西。
- c：b + 高台外緣的 `barrier` 胸牆（規則見下）+ 懸崖腳邊界上的小墓標／碎石／骨頭。
- d：c + 約 10% 的可玩低地苔蘚空格放小物件，物件偏向離車道較遠的那一側；放塔當下立刻消失（`decorStats.removed()` 實測放 3 座塔消失 3 件）。

裝飾全在 `WORLD_LAYER`（會被像素化），`raycast` 為空操作（點選本來就走 core 的數學，不經 raycaster）。每種模型用 `InstancedMesh`，所以多放物件只增加繪製呼叫的個位數。

## 與任務書的差異或解讀

- c 的胸牆規則：邊的另一側是坡道，或兩格同層且都是車道（例如 `+` 接城堡 `g`），才算「車道通過」而略過。貼在懸崖下方、只是沿著高台跑的低層車道不算通過，所以高台沿車道那一面也有胸牆。第一版把「鄰格是車道」一律略過，結果高台幾乎沒有胸牆，改掉了。
- d 的「遠離車道」：除了車道本身，幾乎所有低地空格都與車道相鄰（地圖太緊），所以改成「物件偏離相鄰車道那一側 0.28」，而不是排除相鄰格。
- 取景下環帶只有近側約 3 格看得到；遠側被相機與暈邊切掉一部分。
- 為了在第 1 波放得起六座塔，`main.ts` 把初始金錢設成 2000（只為截圖，非本票的決定）。
- 為了截圖腳本，`window` 掛了 `renderer`、`enqueue`、`cameraView`、`decorStats`。
- `terrain.ts` 只多了兩個 `export`（`terrainColor`、`terrainTexture`），環帶地面重用它們。

## 素材與授權

只下載 GLB／glTF 進 `src/render/models/prototype-decor/`，無預處理。Halloween Bits 的 glTF 用小腳本把 `.bin` 與 PNG 貼圖封成 GLB，內容未改。授權檔我實際讀過，兩者都寫 `License: (Creative Commons Zero, CC0)`（`LICENSE.txt` 在 repo 根目錄與 `Assets/` 內）。

| 來源 | commit | 用到的模型 |
| --- | --- | --- |
| KayKit Dungeon Remastered 1.0（`KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0`） | `b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07` | `barrier`、`barrier_half`、`rubble_half`、`wall_broken`（另複製了 `column`、`rubble_large`，未用） |
| KayKit Halloween Bits 1.0（`KayKit-Game-Assets/KayKit-Halloween-Bits-1.0`） | `6dc69bf6b2fa766a985754f35ec6a0324090e6c6` | `gravestone`、`grave_A/B`、`gravemarker_A/B`、`tree_dead_small/medium/large`、`bone_A` |

沒有用 Kenney Graveyard Kit：KayKit 已涵蓋所需物件，且與現有模型共用同一套色表。縮放約 ×0.25（`barrier` 長 4 → 1 格）；`rubble_half` ×0.1、`wall_broken` ×0.2。

## 執行

```
bun install --frozen-lockfile   # 或從主 repo 連結 node_modules
bunx vite --port 5174           # ?px=2&decor=a|b|c|d
bunx vite build --outDir dist
bun shoot.mjs dist out 1280 800 1 a b c d   # 另用 1920 1080 2 做 DPR 2
bun perf.mjs dist                           # 1920×1080 DPR 2，第 1 波 25 秒
```

## 量測

裝飾物件數與三角面（`window.decorStats`，不含環帶地面；環帶地面是 180 個實例、2,160 面）：

| 變體 | 物件數 | 裝飾三角面 |
| --- | --- | --- |
| a | 0 | 0 |
| b | 88 | 17,397 |
| c | 109 | 19,553 |
| d | 122 | 22,779 |

每幀繪製呼叫與三角面（1920×1080 DPR 2、`renderer.info`、`autoReset=false` 每個 rAF 取樣、第 1 波 25 秒約 1,530 幀，見 `perf.log`）：

| 變體 | 呼叫 p50 / max | Δ呼叫 | 三角面 p50 / max | Δ三角面 p50 |
| --- | --- | --- | --- | --- |
| a | 910 / 917 | — | 30,230 / 30,337 | — |
| b | 921 / 928 | +11 | 49,787 / 49,894 | +19,557 |
| c | 922 / 929 | +12 | 51,943 / 52,050 | +21,713 |
| d | 922 / 929 | +12 | 55,169 / 55,276 | +24,939 |

基準 a 的呼叫數本來就是 910，高於預算 400，因為這個底分支的地形仍是每格一個 mesh、尚未合併；所以只能看差值。三角面遠低於 250k。點光源數沒有增加。

## 遮擋與觀察

- 胸牆（c、d）：把高台輪廓畫得很清楚（見 `dpr2-c.png`），回應 #98 的第 5 項。代價是近側（+z）胸牆高 0.275，會遮住台上塔底座與火把光池的前緣；最下一排台上塔的底座約一半被蓋住，塔身與頂部仍清楚。它也蓋掉 #102 近似的頂面亮框，亮框改由胸牆頂取代。
- 敵人：1280×800 截圖中沒有任何胸牆或裝飾蓋住敵人（車道不加裝飾，遠側胸牆在敵人後方）。敵人像素高度未改動（模型與取景同底分支）；目視骷髏兵約 45–60 px，骷髏騎士約 85 px。這個量測是用眼睛，不是程式量的。
- d 的可玩格小物件（約 0.1–0.2 高）在 DPR 1 下只有幾個像素，暗褐色，幾乎看不到，也就沒有遮到任何東西；但它們的辨識價值也很低。
- 枯木在暗環帶上對比太低，幾乎隱形；墓碑（灰藍）與碎石牆最容易讀到。
- 閘門（出口）旁的環帶沒有特別處理，環帶與暈邊之間偶有突兀的黑色邊角（相機遠側）。
