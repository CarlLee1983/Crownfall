# 可用的 CC0 地形素材

研究票 [#101](https://github.com/CarlLee1983/Crownfall/issues/101)，隸屬地圖 [#97](https://github.com/CarlLee1983/Crownfall/issues/97)；結果餵給 [#102](https://github.com/CarlLee1983/Crownfall/issues/102)（程序化方塊加細節，還是模組化地形磚）。研究日期 2026-11-28。

## 結論

沒有哪個 CC0 包能直接當成「方格、一層 0.6」的完整地形套件。KayKit 的地形磚是六角形；Dungeon 是室內地下城，單位是 4×4；唯一原生 1×1 方格的是 Kenney Tower Defense Kit，但它沒有峭壁側面，坡道一格只升 0.4。可行的路是「程序化方塊負責幾何與高度，CC0 模型負責細節」：石牆邊緣、低矮護欄、地面碎石與墓園道具都能用縮放對上格距。峭壁側面和坡道本體沒有現成資產，要自製或沿用程序化幾何加貼圖。

## 現況（對照用）

- 地圖是方格：`src/content/level.ts` 為 11×13，高度層只有 0 與 1（`#`、`+` 為 1）。
- `src/render/terrain.ts`：每格一個 `BoxGeometry(1, max(top, 0.6), 1)`，坡道是頂面頂點被拉成楔形的方塊，貼圖是程式生成的 16×16 `DataTexture`；`LAYER_HEIGHT = 0.6`。
- `placeableScenery()`（`src/render/scenery-model.ts`）已經會把任何模型依 `footprint / max(size.x, size.z)` 縮放並貼地，所以模型的原生單位不是障礙，障礙在於縱橫比。
- 現有 KayKit 模型：塔 ×0.7、骷髏 ×0.26（`docs/art/art-direction.md`）。

## 授權依據（一手來源）

下表的授權字句都來自我實際取得的授權檔，不是第三方清單。克隆或下載到暫存目錄，未進 repo。

| 來源 | 版本／commit | 授權檔位置 | 結果 |
| --- | --- | --- | --- |
| KayKit Dungeon Remastered | v1.0，`b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07` | repo 根目錄與 `addons/kaykit_dungeon_remastered/Assets/LICENSE.txt` | `License: (Creative Commons Zero, CC0)` |
| KayKit Medieval Hexagon Pack | v1.0，`84fa4e91af6a88989be7c99e0891cede11f2ca38`（與現有 manifest 同一個 commit） | `addons/kaykit_medieval_hexagon_pack/LICENSE.txt` | CC0 |
| KayKit Halloween Bits | v1.0，`6dc69bf6b2fa766a985754f35ec6a0324090e6c6` | `addons/kaykit_halloween_bits/Assets/LICENSE.txt` | CC0 |
| KayKit Prototype Bits | v1.0，`bb159596f4f5106b663741d002c8eb45c80c0f41` | `addons/kaykit_prototype_bits/Assets/LICENSE.txt` | CC0 |
| Kenney Tower Defense Kit | 2.1 | zip 內 `License.txt` | `Creative Commons Zero, CC0` |
| Kenney Graveyard Kit | 5.0 | zip 內 `License.txt` | CC0 |
| Kenney Castle Kit | 2.0 | zip 內 `License.txt` | CC0 |

補充：

- Kenney 支援頁（<https://kenney.nl/support>）寫明「all game assets on the asset pages are public domain licensed (CC0)」，不要求署名。
- KayKit GitHub 上只有 v1.0 的 repo。itch.io 頁面（<https://kaylousberg.itch.io/kaykit-dungeon-remastered>）的更新紀錄寫 2026-07-16 起改名為 Dungeon Pack 1.1，免費版新增「modular stair pieces、less steep stairs、ceiling」，並宣稱 CC0。我沒有下載 1.1 的 zip，所以這個版本的授權檔與坡度更緩的樓梯**未驗證**；下載前不能列入候選。
- KayKit Forest Nature Pack（<https://kaylousberg.itch.io/kaykit-forest>）頁面寫免費層是樹、石、灌木、草，**模組化地形只在付費 EXTRA 層**。付費素材不在範圍內，排除。
- **Quaternius 排除。** <https://quaternius.com/license.html> 現在是自訂的 Quaternius Asset License v1.0（更新日 2026-08-28），不是 CC0，並禁止轉售或再散布素材本身。依「只用 CC0 或自製」不列入候選。

## 格距對照

換算以「1 格 = 1 世界單位、一層 = 0.6」為準，縮放是推算，未在引擎內實測。

| 來源 | 原生一格 | 縮到 1 格 | 一層高度怎麼對 |
| --- | --- | --- | --- |
| Medieval Hexagon 磚 | 六角形，寬 2、深 2.31；厚 1，一階高 1，坡磚升 0.5／1.0 | ×0.5 後寬 1、深 1.155，一階 0.5 | 方格排不上去，一階 0.5 也不是 0.6 |
| Dungeon Remastered | 地板 4×4（large）與 2×2（small） | ×0.25 或 ×0.5，剛好 1 格 | 牆高 4 → 1.0（約 1.7 層）；要 0.6 得 Y 向再壓 |
| Kenney Tower Defense | 1×1，磚厚 0.2 | 不用縮放 | `tile-slope` 升 0.4，Y ×1.5 得 0.6；`tile-hill`、`tile-rock` 高 0.615，約等於一層 |
| Halloween Bits | 地板 4×4、石徑 1.9 | ×0.25／×0.5 | 道具為主 |

## 候選

三角面與尺寸由 glTF accessor 的 POSITION min/max 與 index 數量算出（我寫的腳本，只讀不改）。

### A. 峭壁側面與高台底座

- Dungeon `floor_foundation_*`（allsides 360 面、front 123、corner 202、front_and_sides 281、front_and_back 202、diagonal_corner 111）：footprint 約 2.0–2.2、高 0–2，四邊或部分邊是磚牆側面。×0.5 後是 1×1 佔地、高 1.0；要 0.6 得 Y 向再乘 0.6（等於 ×(0.5, 0.3, 0.5)），磚縫會被壓扁約 40%。這是唯一看起來能當「峭壁側面」的 KayKit 模型，但壓扁後像素化下好不好看**沒有試過**。
- 峭壁沒有 Kenney 對應物：Tower Defense Kit 的磚都是 0.2 的薄片。

### B. 高台邊緣的石牆與護欄

- Dungeon `barrier`（90 面，4×1.1×0.5）：×0.25 後 1×0.275×0.125，是低矮胸牆，貼在高台邊緣很合。另有 `barrier_half`（42）、`barrier_column`（110）、`barrier_corner`（128）、`column`（44，0.7×1.4×0.7，×0.25 後 0.35 高）。
- Dungeon `wall`（494 面，4×4×1）、`wall_half`（272）、`wall_broken`（784）：×0.25 後 1 寬、1.0 高、0.25 厚，比一層高得多，適合城堡外牆，不適合高台邊緣。
- Kenney Graveyard `stone-wall`（60 面，1×0.73×0.2）、`stone-wall-damaged`（144）、`stone-wall-curve`（266）、`stone-wall-column`（138）：原生 1 格寬、0.73 高，不用縮放。
- Kenney Castle `wall`（178 面，1×1.31×1）。

### C. 坡道

- 沒有符合的 KayKit 坡磚：Hexagon 的 `hex_road_A_sloped_*` 是六角形；Dungeon 的 `stairs`／`stairs_narrow`（358 面）升 5.1，×0.25 後升 1.275（約 2.1 層），要 Y ×0.47 才是 0.6；`wall_sloped` 是牆。
- Kenney `tile-slope`（24 面）、`tile-straight-slope`（152 面）、`tile-corner-inner`（24 面）：1×1、升 0.4，Y ×1.5 得 0.6，面數極低。
- 現有程序化楔形已經正確對上 0.6，換掉的理由只能是貼圖與細節。

### D. 地面磚與地面細節

- Dungeon `floor_tile_large`（188 面，4×4，厚 0.15）、`floor_tile_small`（66 面）、`floor_tile_small_broken_A/B`（94／76）、`floor_dirt_large`（104）、`floor_dirt_large_rocky`（187）、`floor_tile_large_rocks`（338）：×0.25／×0.5 剛好 1 格，但厚度只有 0.04，只能當鋪在方塊頂面的貼片。整張 143 格地圖若全用 large 約 2.7 萬面（188×143）。
- Halloween Bits `floor_dirt`（120 面，4×4，厚 0.53）、`floor_dirt_small`（80）、`path_A–D`（275–393 面，約 1.9×1.9、厚 0.1，石徑）。
- Kenney Tower Defense 的 `tile`／`tile-straight`／`tile-end` 等 20–152 面，是草地加土路的方格磚，配色是明亮的草綠與橘土，和暗色方向差距大。

### E. 地面道具（石塊、枯木、墓碑）

- Medieval Hexagon 的 `rock_single_A–E`（18–71 面，約 0.3）、`hill_single_A–C`（60 面）、`tree_single_A/B`（50／220 面，1.2 高）：現有塔與城堡就來自這個包。
- Halloween Bits：`tree_dead_small/medium/large`（184／216／256 面，3–5 高）、`gravestone`（271）、`grave_A/B`（323／190）、`gravemarker_A/B`（56／136）、`bone_A–C`（約 204）、`skull`（344）、`fence`（380）、`lantern_standing`（264）、`candle` 系列。全部用同一張 1024×1024 色表，與現有 Skeletons、Hexagon、Dungeon 模型同作者，主題也是不死／墓園。
- Dungeon `trunk_*`（148–204 面）、`torch_mounted`（278 面，已使用）、`rubble_half`（390）。
- Kenney Graveyard：`gravestone-*`（92–266 面）、`rocks`（364）、`fire-basket`（196）、`pine`（336）、`crypt-*`。原生尺寸約 0.2–1.0，剛好是格距尺度。

## 貼圖規格與畫風

| 包 | 貼圖 | 風格 |
| --- | --- | --- |
| KayKit Dungeon／Hexagon／Halloween | 單張 1024×1024 RGBA 漸層色表，官方說可降到 128×128 | 與現有模型完全同一系統，已證明能用「降飽和烘進貼圖」處理 |
| Kenney TD／Graveyard／Castle | 單張 512×512 調色盤 `colormap.png`（Castle 另有 variation-a–g） | 圓潤、平塗、飽和度高；與 KayKit 同屬低面數卡通，但顏色更亮、更像玩具 |

「畫風一致」是我看過兩邊的預覽圖後的判斷，沒有做過引擎內並排。Kenney 與 KayKit 混用的風險在於飽和度與倒角風格，現有的整張降飽和（約 35%–45%）加像素化多半能蓋過，但需要實測。

## 給 #102 的事實

1. 方格與六角形不相容，所以 Medieval Hexagon 的地形磚不能用，只能取它的石塊、樹、建築。
2. 沒有 CC0 資產同時滿足「方格、一層 0.6、有峭壁側面」。模組化地形磚路線會需要自製或大量非等比縮放（`floor_foundation_*` 的 Y 向 0.6）。
3. 現有程序化方塊已經正確對上 0.6，缺的是側面細節與貼圖。Dungeon 的 `barrier` 與 `floor_tile_*` 貼片、Halloween Bits 與 Kenney Graveyard 的道具，都可以疊在程序化方塊上，不改動幾何與高度規則。
4. 面數預算沒有問題：單格細節多在 20–400 面，143 格全鋪也只有數萬面；現有敵人 5,300、塔 2,100 的預算量級更大。
5. 若要考慮坡道換成模型，Kenney `tile-slope` 是唯一量級對得上的（Y ×1.5），但只有一格等級的楔形，優勢有限。
6. Dungeon Pack 1.1 的緩坡樓梯可能補上坡道缺口，但授權與尺寸要下載後才知道。

## 沒有做的事

- 沒有把任何模型放進 Three.js 場景並排比較，所有畫風與縮放結論都是由尺寸數字與官方預覽圖推算。
- 沒有檢查 Kenney 與 KayKit 的 UV 是否支援改色。
- 沒有下載 itch.io 的 Dungeon Pack 1.1。
