---
status: accepted
---

# 無頭純 TS 核心，Three.js 只當渲染層

遊戲邏輯（格子與高度層、路線、波次、塔與敵人、格子 picking 的數學）全部寫在 `src/core/`，是零引擎、零 DOM 依賴的純 TypeScript；`src/render/` 用 Three.js 讀 core 的快照畫面，並把滑鼠輸入轉成 core 的指令。這樣核心能在 Node 用 Vitest 對字面期望值測試，引擎降成可替換的薄層，選擇時只需比較體積、型別與生態（見 [3D 網頁塔防的引擎與工具鏈候選比較](https://github.com/CarlLee1983/Crownfall/issues/7)）。

邊界由結構守住而非慣例：`src/core/tsconfig.json` 的 `lib` 不含 DOM、不引入 `three` 型別，Biome 的 `noRestrictedImports` 禁止 core import `three` 與 `render/`。

## Considered Options

- **用 Three.js 的 `Raycaster` 做 picking**：要在 render 層才能測；放塔預覽、高台判定是最關鍵的互動，所以 picking 數學（射線對高度場求交）放在 core。
- **Babylon.js 的 `NullEngine`**：能在 Node 跑場景圖與 pick，但測試會綁在引擎場景圖上，正是這個切法要避免的。

**Falsified if:** 有一條玩法規則必須 import 引擎才能在 `src/core/` 實作，或 `src/core/tsconfig.json` 為了某個功能被迫加回 DOM 或 `three`。
