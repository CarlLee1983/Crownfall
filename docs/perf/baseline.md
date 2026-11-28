# 戰場效能基準

[#109](https://github.com/CarlLee1983/Crownfall/issues/109) 以 `main` 的渲染內容
（`445adfaaaac380066aa87609da667938bbe28773`）量得以下基準。量測使用 MacBook Air M4、
Chrome 158.0.8127.37（headless、ANGLE Metal），1920×1080 CSS px、DPR 2，實際繪圖緩衝區
3840×2160。

| 指標 | 第 8 波 main 基準 | 第 8 波上限 | 第 9 波 main 基準 | 第 9 波上限 |
| --- | ---: | ---: | ---: | ---: |
| GPU 同步耗時 p95（手動） | 14.6 ms | 16.06 ms | 14.5 ms（複測 14.0 ms） | 15.95 ms |
| 每幀 draw calls（CI） | 400 | 400 | 697 | 836 |
| 每幀三角形（CI） | 116,971 | 250,000 | 230,139 | 250,000 |
| 場景點光源（CI） | 5 | 8 | 5 | 8 |

GPU 同步耗時每階段最多增加 10%。第 9 波基準超過 400 次 draw calls，因此 CI 採用
697 × 1.2 的整數下限。第 8 波以 #109 的量測程式（`a98bbf6`）切換波次後補測。

draw calls 與三角形來自瀏覽器的整幀 `renderer.info`，點光源由場景圖計數。CI 對可見場景圖
估算兩個圖層以及全螢幕像素合成的成本，兩波的估算均與瀏覽器基準相同。估算包含鏡頭外的物件，
場景有視錐剔除時，估計值可能高於實測。

## 固定場景

[#104](https://github.com/CarlLee1983/Crownfall/issues/104) 指定尖峰有 37 隻敵人。這組出兵在
`content.waves[8]`，遊戲介面顯示第 9 波。CI 也測介面顯示的第 8 波，尖峰有 16 隻敵人。
兩組都從選定波次的備戰狀態開始，在 tick 435 下達建造指令，於 tick 439 擷取場景。這個時間點
在 37 隻敵人同時存活的區間內，也包含射擊表現。

| 塔種 | 格子 (x, y) |
| --- | --- |
| 弓箭塔 | (2, 0)、(3, 0)、(4, 0)、(5, 0) |
| 弩砲塔 | (7, 0)、(8, 0)、(9, 0)、(10, 0) |
| 法師塔 | (6, 0)、(0, 0)、(1, 0)、(0, 6) |

## 重跑

在 MacBook Air M4 上安裝 Chrome 後，從要量測的 checkout 根目錄執行：

```sh
bun install --frozen-lockfile
bun run test src/render/performance-budget.test.ts
bun scripts/perf/measure.ts 8
bun scripts/perf/measure.ts 9
```

量測指令以 Vite 編譯獨立的正式版量測入口，重用遊戲的模型、戰場場景和像素渲染器。瀏覽器
固定場景於 tick 439，用 `requestAnimationFrame` 暖機 60 幀後，再量 180 幀。每幀的
`readPixels(1×1)` 同步等待剩餘的 GPU 佇列與像素讀回，所得為該幀的同步等待時間，不能直接
換算為遊戲幀率。比較後續精緻化階段時，使用相同硬體、Chrome 版本與固定場景。
