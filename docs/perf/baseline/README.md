# RESEARCH：渲染效能基準（拋棄式分支，不合併）

wayfinder 票 #104「效能預算：目標硬體與幀率」（地圖 #97）的原始依據。

量測於 2026-11-28，Apple M4（ANGLE Metal，真 GPU），headless Chromium，DPR 2。場景：第 1 波換成第 8 波（18 grunt、14 runner、5 tank，尖峰 37 隻），未放塔。`renderer.info.autoReset=false`，每個 rAF 取整幀合計後 reset。GPU 同步耗時用 rAF 內 `readPixels(1×1)` 量，含佇列內剩餘工作，視為上限；`gl.finish()` 在 ANGLE 上量到 0，不可用。

| 狀態 / 視窗 | rAF p50/p95 (ms) | GPU 同步 p50/p95/max (ms) | draw calls p50/max | triangles p50/max |
|---|---|---|---|---|
| main（px=3）1280×800 | 16.7 / 18.2 | 6.8 / 9.7 / 10.9 | 484 / 655 | 136,679 / 206,407 |
| main 1920×1080 | 16.8 / 21.5 | 11.2 / 14.6 / 16.7 | 484 / 655 | 136,679 / 206,407 |
| prototype/pixel-size `?px=2` 1280×800 | 16.7 / 18.6 | 7.0 / 8.7 / 14.0 | 1194 / 1365 | 同上 |
| prototype/pixel-size `?px=2` 1920×1080 | 16.9 / 23.4 | 9.8 / 14.5 / 18.6 | 1194 / 1365 | 同上 |

燈：1 Hemisphere、1 Directional、5 PointLight（火把）。geometries 220、textures 331、programs 10。原型 draw calls 增加來自地形 6 面多材質。

重跑：在 worktree 內於 `src/main.ts` 暴露 `__renderer`、`__scene`，把第 1 波換成第 8 波，`bunx vite build --base ./ --outDir <dist>`，再以 `bun measure.ts` 執行（dist 路徑見腳本開頭）。
