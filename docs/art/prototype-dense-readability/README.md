# PROTOTYPE：密集波次的辨識度（wayfinder #107，map #97）

用過即丟的原型，不含測試、不打磨，不併入 main。基底是 `prototype/enemy-death`（模型 ×1.5、中性白發光、`?px=2`、`fx=crumble`、`?stress=N&n=K`）；裝飾（#106）不在此基底。

## 怎麼跑

```
bunx vite --port 5174
# http://127.0.0.1:5174/?px=2&fx=crumble&read=none|outline|rim|accent&stress=9&n=0
# 進遊戲後主控台執行 startStress()；window.setSpeed(0) 暫停；window.measureEnemies() 量螢幕尺寸
```

`capture.mjs`（截圖與量測）與 `perf.mjs`（效能）是 Playwright 腳本，路徑寫死在原 scratchpad，只作紀錄。

## 變體（`?read=`，左下角有標籤）

| read | 做法 |
| --- | --- |
| none | 基準 |
| outline | 螢幕空間邊緣：敵人材質（`onBeforeCompile`）把每隻敵人的編號寫進低解析度 world target 的 alpha（其餘為 1.0）；`pixel-renderer.ts` 的 blit 在 4 鄰居 alpha 比自己低時塗近黑。1 個渲染像素（`px=2` 下為 2 CSS 像素），沒有額外 draw call 或三角形，也會分開互相重疊的敵人。blit 輸出 alpha 固定為 1。 |
| rim | 敵人材質 fresnel 邊緣光（`pow(1-N·V, 2.5)`，中性冷白，強度 0.9） |
| accent | 發光色依種類著色（grunt 暖黃、runner 綠、tank 藍、boss 洋紅；發光乘上貼圖，所以淡）。沒有退到地面環 |

## 量測（none，暫停在隊伍最長：第一隻漏怪的瞬間，n=0）

螢幕高度＝把每個蒙皮頂點投影到畫面後的外框，單位 CSS 像素（`px=2` 下除以 2 為渲染像素）。

| 情境 | 種類（隻數） | 1280×800 最小／中位／最大 | 1920×1080 最小／中位／最大 |
| --- | --- | --- | --- |
| 第 8 波（同時 15） | grunt（9） | 37／42／44 | 50／56／60 |
| | tank（6） | 51／54／62 | 69／74／84 |
| 第 9 波（同時 36） | grunt（18） | 45／53／60 | 61／72／81 |
| | runner（13） | 39／45／57 | 53／60／77 |
| | tank（5） | 46／51／67 | 62／69／91 |
| 第 10 波（同時 18，僅取 boss） | boss（1） | 58 | 79 |

第 9 波 36 隻的外框重疊：14 對有交集、6 對超過較小者面積的 25%、3 對超過 50%（外框會高估實際輪廓重疊）。第 8 波只有 1 對。1280×800 下最遠的 runner 為 39 px，略低於「其他 ≥ 40」，其餘都達標。

## 效能（1920×1080 DPR 2，第 9 波，6 至 18 秒，約 710 影格；每個 rAF 取樣；`autoReset=false`）

每影格含 world、blit、overlay 三次 render。跑兩輪。基底沒有新地形，絕對值遠超 400，只看差。

| read | draw calls p50／max | triangles p50／max | GPU 同步 p95（ms） | 影格 p95（ms） |
| --- | --- | --- | --- | --- |
| none | 1314／1365（二輪 1320／1365） | 185,023／206,407 | 15.4／14.8 | 20.5／20.4 |
| outline | 1314／1365（1319／1365） | 185,023／206,407 | 15.0／16.3 | 20.0／21.1 |
| rim | 1319／1365（1320／1365） | 189,975／206,407 | 12.4／15.7 | 18.5／20.5 |
| accent | 1314／1365（1314／1365） | 185,023／206,407 | 14.1／15.8 | 19.6／21.0 |

三種變體都沒有增加 draw call 或三角形（p50 差異來自同時存活數 33 對 34），GPU 同步時間差在輪間雜訊內（±1.5 ms）。

## 畫面

`sheet-w8.png`、`sheet-w9.png`：1280×800，由左到右 none、outline、rim、accent。`sheet-w*-1920.png`：1920×1080 DPR 2，2×2（左上 none、右上 outline、左下 rim、右下 accent）。`crop-w9-right.png`、`crop-w9-left.png`、`crop-w8-top.png`：最密處最近鄰 ×2，同樣 2×2 排列。

## 觀察

- none：隊伍沿車道攤得很開，模型沒有糊成一團；問題是顏色：骷髏（grunt）亮灰頭加紅身體清楚，tank 與 runner 都是暗灰藍，和藍紫車道石板接近，轉角處 tank 疊在 grunt 後面時只剩剪影。
- outline：輪廓與疊在一起的敵人被分開，暗色 tank 從車道上浮出來，但不分種類。
- rim：邊緣出現雜點、輪廓不穩定，在 2× 像素化下偏髒，對暗模型幫助有限。
- accent：tank 變藍、runner 變綠、grunt 偏暖，種類一眼分開；原色沒有被洗掉；不改善外形重疊。
