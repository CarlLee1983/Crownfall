# PROTOTYPE：像素化強度（拋棄式分支，不合併）

問題：在已決定的組合上，像素化要維持 3×、改 2×，還是取消（wayfinder 票 #103，地圖 #97）。

本分支以 `prototype/unit-readability` 為底（燈光基準 #99＋模型 ×1.5、取景、中性白發光 #100），再近似 #102：頂面一 texel 亮框、峭壁側面專屬較亮石材。`src/render/pixel-renderer.ts` 的 `PIXEL_SIZE` 改由 `?px=3|2|1` 切換。

- `sheet.png`：Retina（DPR 2）裁切，左到右 3×、2×、1×。
- `wave-{3,2,1}.png`：完整畫面，第 1 波開波 8 秒後暫停。
- `shoot.ts`：截圖腳本，`DPR=2 bun shoot.ts <dist> <out> 3 2 1`。

結論：採 2×。
