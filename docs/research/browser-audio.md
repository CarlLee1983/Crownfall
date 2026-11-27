# 瀏覽器遊戲的音訊實作方式

研究票：#70（母地圖 #69）。環境：Vite + Three.js 0.187.0，目標為桌面瀏覽器。調查日期：2026-11-28。

標記說明：**[已驗證]** 表示有一手來源（附連結）或本機實測；**[推論]** 表示根據已驗證事實推導，沒有來源直接陳述。

## 建議

直接用 Web Audio API，在 `src/` 下自寫一層薄封裝（主音量、SFX、音樂三個 `GainNode` 匯流排，加一個簡單的 SFX 同時發聲上限），不引入 Howler.js，也不用 Three.js 的 `Audio`/`AudioListener` 做主要路徑。**[推論]**

理由：

1. Crownfall 需要的是匯流排與 ducking。Howler 只有單一 `masterGain`，沒有分組節點；Three.js 的 `AudioListener` 同樣只有一個 master gain 加一個可選 filter。兩者都得在外面再補一層，補完之後與直接用 Web Audio 的工作量相近。**[已驗證]**（見下表來源）
2. Web Audio 的核心機制只有幾行：`AudioBufferSourceNode` 用完即丟、`GainNode` 搭配 `setTargetAtTime` 做平滑音量變化。自寫封裝很小。**[推論]**
3. 這是 2D 式的塔防音效（UI、射擊、波次提示），不需要 Three.js 的 3D 定位音訊；Three.js 的 `Audio.play()` 在播放中再呼叫會被拒絕，重複觸發同一音效得自己建多個物件，反而比直接建 source node 麻煩。**[已驗證]**（`Audio.js` 原始碼）
4. 不引入新依賴，符合「現有依賴優先」；Web Audio 是瀏覽器內建，零打包體積。**[已驗證]**

若之後發現自寫封裝在自動解鎖或格式選擇上出現難以處理的瀏覽器差異，Howler（gzip 約 10 KB）是最小的退路。**[推論]**

格式建議：以 Ogg（Opus 或 Vorbis）為單一格式，音樂循環點精準；是否需要 mp3/m4a 備援取決於 v0.1.0 要支援的最低 Safari 版本（見「仍未知」）。**[推論]**

## 比較表

| 項目 | 直接用 Web Audio API | Howler.js 2.2.4 | Three.js 0.187 `Audio`/`AudioListener` |
| --- | --- | --- | --- |
| 打包體積 | 0（瀏覽器內建）**[已驗證]** | 實測 `howler` 以 bun 打包壓縮後 37.8 KB，gzip 10.1 KB；官方宣稱 core 約 7 KB gzip **[已驗證]** | 已隨 Three.js 進入打包；單獨 import 這三個類別以 bun 打包得 gzip 58 KB，但那是 bun 未能 tree-shake 的上界，Vite/Rollup 結果未實測 **[已驗證]**（上界）/ **[推論]**（實際增量小） |
| 自動播放政策 | 自己處理：`AudioContext` 建立時若處於 `suspended`，在使用者手勢內呼叫 `resume()` **[已驗證]** | `autoUnlock` 預設開啟，掛 `touchstart`/`touchend`/`click`/`keydown` 捕獲監聽並播放靜音緩衝、呼叫 `ctx.resume()`；`autoSuspend` 閒置 30 秒後暫停 context **[已驗證]** | 套件不處理：`AudioContext.js` 只建立 context，沒有 `resume()` 也沒有事件監聽，需自己處理 **[已驗證]** |
| 匯流排與混音 | 自由組合 `GainNode`；`setTargetAtTime` 做平滑變化 **[已驗證]** | 只有 `Howler.masterGain`；每個 Sound 的 gain 直接接 master，沒有群組節點；`fade()` 是單一 Sound 的淡入淡出 **[已驗證]** | 一個 master gain（`setMasterVolume`）加單一 filter；無分類匯流排；每個 `Audio` 有自己的 gain **[已驗證]** |
| Ducking | 自建：音樂匯流排 gain 在 SFX 觸發時 `setTargetAtTime` 降低再回升 **[推論]**（機制已驗證，ducking 用法為推論） | 需在 Howl 層級手動 `fade` 音樂，沒有內建 **[推論]** | 需自己對音樂 `Audio` 呼叫 `setVolume`（內部為 `setTargetAtTime`，時間常數 0.01）**[已驗證]**（`setVolume`）/ **[推論]**（ducking 用法） |
| 重複觸發與數量上限 | `AudioBufferSourceNode` 只能播放一次，每次播放新建節點，節點建立成本低，可「發射後不管」；規格與 MDN 均未列出同時發聲上限，需自設上限 **[已驗證]** | `play()` 重用已結束的 Sound，否則新建；`pool`（預設 5）只裁剪已結束的閒置 Sound，不限制同時播放數 **[已驗證]** | `play()` 每次建新 source，但物件已在播放時再呼叫只會警告 `Audio is already playing.` 並回傳 `undefined`，同一個音效要重疊就得建多個 `Audio` **[已驗證]** |
| 音樂循環 | `loop`、`loopStart`、`loopEnd` 屬性；MDN 未說明是否無縫 **[已驗證]** | Web Audio 後端使用原生 `bufferSource.loop`；HTML5 後端在 `_ended()` 重啟，無縫性無說明 **[已驗證]** | `setLoop`、`setLoopStart`、`setLoopEnd`；loopStart/loopEnd 只在 `play()` 時複製到 source，播放中修改不生效 **[已驗證]** |
| 備戰與波次切換 | 兩條音樂各一個 gain，交叉淡入淡出（`setTargetAtTime`）**[推論]** | 兩個 Howl，以 `fade` 交叉 **[推論]** | 兩個 `Audio` 以 `setVolume` 交叉 **[推論]** |
| 格式偵測 | `decodeAudioData` 失敗即不支援；可用 `new Audio().canPlayType()` 預先挑選 **[推論]** | 內建 `canPlayType` 檢查 mp3、ogg、opus、m4a、webm 等，並自動挑可播的來源 **[已驗證]** | 無；`AudioLoader` 內部走 `decodeAudioData`，需自己挑格式 **[推論]** |

## 格式支援（Safari、Chrome、Firefox）

| 格式 | Chrome | Firefox | Safari |
| --- | --- | --- | --- |
| Ogg Opus | 33 起 | 15 起 | MDN 編解碼器頁未列 Ogg；WebKit 說明 Safari 18.4 加入 Ogg 容器的 Opus 與 Vorbis；WWDC25 頁面則寫成 Safari 19，兩者說法不一致，未能釐清 |
| Ogg Vorbis | 4 起 | 3.5 起 | MDN 頁寫「無」，與上列 WebKit 18.4 說明衝突（MDN 可能落後） |
| MP3 | 支援 | 支援（71 起內建解碼；之前靠平台函式庫） | 3.1 起 |
| AAC（m4a / MP4） | 僅 MP4、Main Profile | 僅靠平台支援，沒有內建解碼器 | MDN 頁未列明版本 |

以上均 **[已驗證]**（來源見下），Safari 的 Ogg 欄位為兩個一手來源互相矛盾。

取捨 **[推論]**：

- MP3 與 AAC 的編碼器會在檔頭／檔尾加入靜音填充，用於無縫循環的音樂容易出現縫隙；Ogg 沒有這個問題。此為業界常識，本次沒有取得一手來源直接證明，列為推論。
- Safari 對 Ogg 的支援在 18.4 之前缺席，所以若要支援舊版 Safari，備援格式用 m4a 或 mp3。
- 若 v0.1.0 只要求最新桌面瀏覽器，單一 Ogg Opus 最簡單；兩份檔案的維護成本值得在確認最低 Safari 版本後再決定。

## 自動播放政策摘要

- 規格：AudioContext 是否「允許啟動」由使用者代理決定，可以要求 sticky activation，因此可能需要使用者手勢 **[已驗證]**（W3C Web Audio API §1.2）。
- Chrome：Web Audio 自 71 版起受限制；在手勢前建立的 context 處於 `suspended`，需在手勢後呼叫 `resume()`；可監聽 `statechange` **[已驗證]**。
- Firefox：`media.autoplay.block-webaudio` 預設 `true`，需 sticky activation **[已驗證]**（MDN）。
- Safari：WebKit 的政策文章只講 `<video>`/`<audio>` 元素，未提 Web Audio；Safari 對 Web Audio 的規則本次沒有一手來源，沿用 W3C 規格與「在手勢內 `resume()`」的通用做法 **[推論]**。
- 做法 **[推論]**：標題畫面或「開始遊戲」按鈕的 click 處理器內建立／`resume()` 單一 `AudioContext`，之後不再需要解鎖。

## 仍未知

- Safari 對 Web Audio 自動播放的現行規則，WebKit 沒有找到專談 Web Audio 的一手文件。
- Safari 對 Ogg 支援的起始版本（18.4 或 19）與 MDN 描述互相矛盾。
- MP3/AAC 在 Safari、Chrome、Firefox 的循環是否出現縫隙，未實測。
- 同時發聲數量的實際效能上限：規格與 MDN 都沒有給數字，需在目標機器上實測以決定 SFX 上限。
- Three.js 音訊類別經 Vite 打包後的實際體積增量未實測。

## 來源

- MDN，Web Audio API best practices：https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- MDN，Autoplay guide：https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- MDN，Audio codecs：https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs
- MDN，AudioBufferSourceNode：https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
- MDN，AudioParam.setTargetAtTime：https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setTargetAtTime
- W3C，Web Audio API 1.1：https://www.w3.org/TR/webaudio-1.1/
- Chrome，Autoplay policy changes：https://developer.chrome.com/blog/autoplay/
- WebKit，Auto-Play Policy Changes for macOS：https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/
- WebKit，Features in Safari 18.4：https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- Apple，What's new in Safari and WebKit（WWDC25）：https://developer.apple.com/videos/play/wwdc2025/233/
- Howler.js README：https://github.com/goldfire/howler.js/blob/master/README.md
- Howler.js 原始碼 `src/howler.core.js`：https://github.com/goldfire/howler.js/blob/master/src/howler.core.js
- Three.js r187 `src/audio/Audio.js`：https://github.com/mrdoob/three.js/blob/r187/src/audio/Audio.js
- Three.js r187 `src/audio/AudioContext.js`：https://github.com/mrdoob/three.js/blob/r187/src/audio/AudioContext.js
- Three.js r187 `src/audio/AudioListener.js`：https://github.com/mrdoob/three.js/blob/r187/src/audio/AudioListener.js
- MDN browser-compat-data，`<audio>`：https://github.com/mdn/browser-compat-data/blob/main/html/elements/audio.json

體積數字為 2026-11-28 在本機以 `bun build --minify` 實測，three@0.187.0 與 howler@2.2.4。
