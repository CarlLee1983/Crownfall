# CC0 暗色奇幻音效與音樂來源

研究票：#71（母地圖 #69）。調查日期：2026-11-28。

## 結論

音效可以用「Kenney 三個包 + OpenGameArt 的幾個 CC0 小包」湊齊大部分需求，音樂有可用的暗色奇幻 CC0 曲目，但備戰與波次的張力分層、以及部分音效仍有缺口。以下授權皆已親自打開授權頁或解開附帶的授權檔確認，標「已驗證」；沒有明確證據的標「未確認」，不建議使用。

推薦來源與涵蓋範圍：

- **Kenney（RPG Audio、Impact Sounds、Interface Sounds、Music Jingles）**：官方 Support 頁與各包頁面都標示 CC0。涵蓋武器揮擊與金屬、木頭碰撞（弓箭、骷髏受擊的素材）、介面點擊，以及勝負與清波用的短 jingle。風格偏中性，不是專為暗色奇幻錄製，需要挑選。
- **OpenGameArt「Medieval sound effects - Weapon Textures」**（Ben Jaszczak、Brian Nelson）：含十字弓上弦、發射、長弓與 Scythian 反曲弓的拉弓、搭箭、射出與箭矢飛過。是目前找到最貼近弓箭與弩砲發射的真實錄音。授權有一個但書，見下表。
- **lentikula「Basic Spell Impacts」**（itch.io）：雷、火、冰、水各 5 個，共 20 個，WAV 48kHz 24-bit，作者明寫 CC0。涵蓋法術命中。
- **OpenGameArt「Deep Bone Crack/Break SFX」與「Bones rattle」**：前者 10 個骨裂聲，後者 9 個骷髏行走與喀啦聲，皆為 CC0。涵蓋骷髏碎裂與受擊。
- **OpenGameArt「War Horns」**（Eldritch Grim）：CC0，WAV 與 MP3，描述為開戰前的低沉戰號。涵蓋開波號角。
- **OpenGameArt「JRPG Pack 3 [Evil]」**（Juhani Junkala）：5 首 OGG，各約 1 到 1.5 分鐘，頁面與附帶 INFO.txt 皆聲明 CC0，頁面說明為「400 Indie Game Music Loops」的一部分。涵蓋背景音樂，是目前唯一確認 CC0 且風格契合的整組曲目。
- **OpenGameArt「Battle Theme」與「The Sad Battle」**：各一首 CC0，前者為管弦、適合緊張時刻，後者可當失敗氣氛。

缺口：

1. 備戰與波次兩種張力：目前只有一組風格一致的曲目（JRPG Pack 3），可用其中較沉靜的曲目當備戰、較強烈的當波次，但要自己聽過挑選；沒有現成的分層（stem）可以做自適應混音。
2. 漏怪警示、清波提示：沒有找到風格契合的專用 CC0 素材，需要從 Kenney Music Jingles 或 Interface Sounds 挑選改造，或自己用合成方式做。
3. 弩砲命中、弓箭命中、骷髏受擊的專屬錄音：找不到成套的 CC0；以 Kenney Impact Sounds 與 Medieval 包的風聲與箭矢聲組合。
4. Freesound：其網站需要登入才能顯示授權，這次沒有取得可驗證的 CC0 骷髏或戰號素材，列為未確認。若之後要補缺口，建議登入後用 CC0 篩選逐一檢查。
5. itch.io 上的暗色奇幻音樂包（Torone、Lisette Amago、loopnpixel）：頁面上找不到授權聲明，視為未確認，不採用。HZSmith 與 Cyberleaf 的包已確認不是 CC0（CC-BY）。

## 候選一覽

驗證狀態說明：「已驗證」指這次親自打開該連結看到明確 CC0 字樣或附帶授權檔；「推論」指內容、格式或風格契合度是依頁面描述或檔名推斷，沒有實際試聽。

| 名稱 | 連結 | 授權證據連結 | 內容 | 格式與大小 | 對應的需求 | 風格是否契合 |
| --- | --- | --- | --- | --- | --- | --- |
| Kenney RPG Audio | https://kenney.nl/assets/rpg-audio | https://kenney.nl/assets/rpg-audio（頁面標示 Creative Commons CC0，連到 CC0 1.0）；https://kenney.nl/support（「all game assets ... public domain licensed (CC0)」）。已驗證 | 50 個檔，標籤為 foley、rpg、footstep、weapon | 頁面未標格式與大小（推論：OGG／WAV，與 150 Combat 包內取自此包的 WAV 一致） | 弓箭揮動與命中、骷髏受擊（素材）、介面 | 中性寫實，推論可用 |
| Kenney Impact Sounds | https://kenney.nl/assets/impact-sounds | https://kenney.nl/assets/impact-sounds 與 https://kenney.nl/support。已驗證 | 130 個檔，標籤為 impact、foley | 頁面未標格式與大小 | 命中、骷髏受擊與碎裂（素材） | 中性，推論可用 |
| Kenney Interface Sounds | https://kenney.nl/assets/interface-sounds | https://kenney.nl/assets/interface-sounds 與 https://kenney.nl/support。已驗證 | 100 個檔，標籤為 interface、click、button | 頁面未標格式與大小 | 介面點擊 | 偏現代 UI，推論需挑選較木質、低調的音色 |
| Kenney Music Jingles | https://kenney.nl/assets/music-jingles | https://kenney.nl/assets/music-jingles 與 https://kenney.nl/support。已驗證 | 85 個檔，標籤為 music、jingle，2014 年版 | 頁面未標格式與大小 | 清波與勝負提示 | 推論：多為輕快風格，暗色調需挑選，可能不契合 |
| OGA Medieval sound effects - Weapon Textures（Ben Jaszczak、Brian Nelson） | https://opengameart.org/content/medieval-sound-effects-weapon-textures | 同頁，OGA 授權欄標 CC0；頁面引用作者「CC0 NO RIGHTS RESERVED」（來自其前身 FreeFirearmsSFX）與 Still North Media「無版稅、無須署名」。OGA 標示已驗證，但原作者條文有一句不是正式 CC0 文字，建議視為「已驗證（有但書）」，進用前保留此頁截圖 | 十字弓上弦與發射、長弓與反曲弓拉弓搭箭射出、箭矢飛過、刀劍揮動與收鞘 | 2 個 7z，各約 86 MB 與 82 MB（總約 168 MB，遠大於遊戲所需，只挑用到的幾個） | 弓箭與弩砲發射 | 寫實中世紀，契合；不含命中聲 |
| lentikula Basic Spell Impacts | https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx | 同頁，「I release this pack under a CC0 license」並連到 CC0 1.0。已驗證 | 雷、火、冰、水各 5 個，共 20 個 | WAV 48kHz 24-bit，13 MB | 法術命中 | 奇幻法術，推論契合；不含發射聲 |
| OGA 150 Combat Sound Effects | https://opengameart.org/node/195932 | 同頁標 CC0；下載後 `LICENSES.txt` 逐一列出來源並聲明全部 CC0（來源含 Kenney、lentikula、Kronbits、CoMiGo）。已驗證 | 近戰 23、遠程 26、爆破 23、法術 78 | WAV 48kHz 16-bit，約 37 MB | 法術與遠程的補充 | 推論：混有雷射與復古電子音，只能挑部分；這包本身是上述來源的再編，優先改用原始來源 |
| OGA Deep Bone Crack/Break SFX | https://opengameart.org/content/deep-bone-crackbreak-sfx | 同頁授權欄 CC0。已驗證 | 10 個骨裂聲 | zip 約 2.5 MB | 骷髏碎裂與受擊 | 契合（推論，未試聽） |
| OGA Bones rattle | https://opengameart.org/content/bones-rattle | 同頁授權欄 CC0（頁面註明改編自 Freesound blukotek 的素材，該來源授權這次沒有查證，屬上游未確認） | 9 個骷髏行走與喀啦聲 | zip 約 48 KB | 骷髏受擊、行走 | 契合（推論） |
| OGA War Horns（Eldritch Grim） | https://opengameart.org/node/153572 | 同頁授權欄 CC0。已驗證 | 一段「開戰前低沉戰號」 | WAV 約 8.4 MB，MP3 約 1.9 MB | 開波號角 | 契合（依頁面描述，推論） |
| OGA Their Coming (generic horn sound) | https://opengameart.org/content/their-coming-generic-horn-sound | 同頁授權欄 CC0。已驗證 | 電影式低頻號角，2 個檔 | OGG 約 115 KB | 開波號角、漏怪警示 | 推論：偏電影配樂，可當警示 |
| OGA JRPG Pack 3 [Evil]（Juhani Junkala） | https://opengameart.org/content/jrpg-pack-3-evil | 同頁授權欄 CC0；zip 內 `INFO.txt` 聲明「released under CC0」。已驗證（下載解壓確認） | 5 首：Ancient Evil Awakens（約 93 秒）、Catacombs（約 81 秒）、Apocalypse（約 59 秒）、Witch's Lair（80.0 秒）、Whispers From Beyond（約 81 秒） | OGG，zip 12.7 MB | 背景音樂：備戰、波次 | 標籤為 evil、dark，曲名契合暗色奇幻。是否能無縫循環只有 Witch's Lair 的整數 80 秒長度可作旁證，其餘為推論，需試聽 |
| OGA Battle Theme | https://opengameart.org/content/battle-theme-0 | 同頁授權欄 CC0。已驗證 | 一首管弦戰鬥曲 | MP3 約 4.4 MB | 波次張力 | 推論：管弦、偏史詩，循環與否未知 |
| OGA The Sad Battle | https://opengameart.org/content/the-sad-battle | 同頁授權欄 CC0。已驗證 | 一首失敗、悲壯氣氛曲 | MP3 約 2.6 MB，WAV 約 16 MB | 失敗提示 | 推論：可用於失敗畫面 |
| Kronbits 200 Free SFX | https://kronbits.itch.io/freesfx | 同頁「CC0 License」，資產授權欄為 Creative Commons Zero v1.0。已驗證 | 223 個檔，含魔法、事件、UI 提示與短語音 | WAV，約 98 MB | 法術、介面、事件提示 | 推論：偏街機與復古電子音，風格不契合，僅作補充 |
| Freesound（骷髏、戰號類） | https://freesound.org | 網站需登入才能顯示授權，這次無法驗證 | 未確認 | 未確認 | 骷髏碎裂、戰號 | 未確認，不採用 |
| itch.io Torone Music loops pack 1 - Dark Fantasy | https://torone.itch.io/music-loops-pack-1-dark-fantasy | 頁面沒有授權聲明（留言區有人詢問授權，未見回覆）。未確認 | 4 首循環 | OGG | 背景音樂 | 契合但授權不明，不採用 |
| itch.io Lisette Amago Free Dark Fantasy Music | https://lisetteamago.itch.io/free-dark-fantasy-music | 頁面沒有 CC0 聲明。未確認 | 暗色奇幻循環 | 約 88 MB | 背景音樂 | 契合但授權不明，不採用 |

## 已排除（確認不是 CC0）

- OpenGameArt「Evil Awaits」：授權欄為 CC-BY 3.0、OGA-BY。
- OpenGameArt「RPG Sound Package」（Tuomo Untinen）：CC-BY 3.0。
- OpenGameArt「Crossbow Shot」：CC-BY 3.0。
- OpenGameArt「JC Sounds - Fantasy SFX Pack Vol 1」：CC-BY 4.0。
- itch.io HZSmith「Free Medieval Epic Loops」：CC-BY 4.0。
- OpenGameArt「Fantasy Music and Drum Loops Pack」：CC-BY 4.0。
- itch.io「Fantasy Ambient Sound Effects Pack (CC0)」（kmontesdev）：頁面確實聲明 CC0，但約 2 GB、託管在外部 Google Drive、內容清單沒有列出弓、號角或介面音，風險與體積太高，沒有採用。

## 補充說明

- OpenGameArt 的「RPG Sound Pack」（artisticdude）授權欄標 CC0，含 2 個法術、5 個劍擊、6 個介面與大量怪物聲，共 95 個 WAV、約 12 MB，頁面為 https://opengameart.org/content/rpg-sound-pack，已驗證授權。因其法術只有 2 個、怪物聲偏奇幻生物而非不死族，列為次要補充。
- 以上都是針對來源的調查，沒有下載任何音訊進 repo。調查時為了讀授權檔，曾把 JRPG Pack 3 與 150 Combat 兩個壓縮檔下載到暫存目錄，已不在 repo 中。
- 實際選用時，請把每個檔案的來源頁面、作者與授權連結記錄在素材清單中，即使 CC0 不要求署名，也方便日後稽核。
