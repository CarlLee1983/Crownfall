# PROTOTYPE：敵人受擊與死亡表現（wayfinder #105，map #97）

用過即丟的原型，不含測試、不打磨，也不併入 main。比較四種呈現：沿用閃白與碎片，或改用 KayKit 的 Hit／Death 動畫。

## 改了什麼

- `scripts/enemy-models.ts`：除 `Walking_A` 外再保留 `Hit_A`、`Death_A`、`Death_C_Skeletons`（四個骨架都有這三個 clip）；`ENEMY_CLIPS=a,b` 可覆寫保留清單，用來量單一 clip 的體積。
- `src/render/fx.ts`：解析 `?fx=now|hit|death|crumble`，並在左下角顯示 `PROTOTYPE #105 fx=…` 標籤。
- `src/render/enemy-model.ts`：加入 hit／death 一次性動作，用手動權重與走路動作交叉淡化（約 0.08 秒）。hit 播放中不重播；death 播完停在最後一格。
- `src/render/enemies.ts`：把 reaction 的 `start`／`death` 傳進模型；死亡動畫播完後讓屍體下沉 0.3 秒（會被地形遮住）。
- `src/render/combat-feedback.ts`：`death`／`crumble` 時敵人保留到「動畫＋下沉」結束才 release，不產生碎片，閃白照舊。
- `src/main.ts`（量測與擷取用）：`?stress=N` 以第 N 波的出兵取代第 1 波並加滿金錢、`?n=K` 只在離入口最近的 K 格蓋塔；`window.renderer`、`window.cameraView`、`window.startStress()`、`window.heldEnemies()`。

變體：

| fx | 受擊 | 死亡 |
| --- | --- | --- |
| `now` | 不變 | 不變（85 ms 後 release＋3 片碎片） |
| `hit` | 疊播 `Hit_A`（淡入淡出約 0.08 秒） | 不變 |
| `death` | 不變 | 停住並播 `Death_A`（0.8 秒）→ 下沉 0.3 秒 → release；無碎片 |
| `crumble` | 不變 | 同上，改播 `Death_C_Skeletons` 2 倍速（約 1.0 秒） |

## 怎麼跑

```
bunx vite --port 5174
# http://127.0.0.1:5174/?px=2&fx=death
# 近看：?px=2&fx=death&stress=1&n=4，進遊戲後在主控台執行 startStress()
```

## 模型體積（位元組）

| clip 組合 | skeleton（grunt） | ghoul（runner） | knight（tank） | lich（boss） |
| --- | --- | --- | --- | --- |
| 現況（只留 Walking_A） | 357,752 | 366,120 | 404,480 | 353,112 |
| ＋Hit_A | 388,748 | 396,892 | 435,252 | 383,880 |
| ＋Death_A | 393,032 | 401,196 | 439,556 | 388,184 |
| ＋Hit_A＋Death_A＋Death_C_Skeletons | 466,584 | 474,328 | 512,684 | 461,316 |

每個 clip 約 +31 至 +36 KB；三個一起約 +109 KB／隻、四隻合計約 +435 KB。

## 量測（1920×1080、DPR 2、`?px=2`，各跑約 48 秒，`renderer.info.autoReset=false`，每個 rAF 取樣一次）

`stress` 為第幾波出兵、`n` 為塔數（未給＝離入口 3 格內的所有非車道格，約 40 座，法師塔與弓箭塔各半）。這些塔把敵人幾乎都殺在入口，所以同時存活的敵人只有 2 至 4 隻。基底分支還沒有新地形，繪製呼叫數的絕對值（約 1,100）不能對 #104 的 ≤ 400 預算下結論，請看與 `now` 的差。

| 情境 | fx | draw calls max／p50 | triangles max／p50 | 同時 held（垂死）最多 | 同時存活最多 |
| --- | --- | --- | --- | --- | --- |
| 第 8 波（坦克 6＋骷髏 10），全塔 | now | 1175／1100 | 179,840／163,082 | 3 | 2 |
| | death | 1193／1100 | 195,426／163,082 | 4 | 2 |
| | crumble | 1193／1100 | 195,426／163,082 | 4 | 2 |
| 第 9 波（骷髏 18＋食屍鬼 14＋坦克 5），全塔 | now | 1215／1100 | 196,160／163,082 | 6 | 3 |
| | death | 1254／1100 | 217,388／163,082 | 8 | 3 |
| | crumble | 1274／1100 | 222,716／163,082 | 8 | 3 |
| 第 9 波，n=10 | now | 1022／894 | 65,273／26,815 | 6 | 4 |
| | death | 1065／894 | 86,601／26,815 | 8 | 4 |
| | crumble | 1072／894 | 86,855／26,815 | 8 | 4 |

與 `now` 相比：p50 沒有變化；最大值多約 +18 至 +59 次 draw call、+15k 至 +26k 三角形，來源是垂死敵人多留約 1 秒。held 數是 now 的 1.3 至 1.5 倍（8 對 6）。點光源數量沒有改動（未量）。

## 畫面（1280×800、DPR 1、`?px=2`，`stress=1&n=4` 近看入口，約 7 秒、20 fps）

`now.gif`、`hit.gif`、`death.gif`、`crumble.gif`，以及四格並排的 `side-by-side.mp4`（左上 now、右上 hit、左下 death、右下 crumble）。

## 已知問題

- core 在受擊時照常移動敵人，`hit` 的 `Hit_A` 是疊在持續前進的敵人身上，不是原地僵直。
- 血條在垂死期間照舊顯示。
- 斜坡、巫妖腳部補償與騎士武器在死亡姿勢下的表現沒有逐一檢查，只看了入口平地的畫面。
