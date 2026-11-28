# 音訊原始素材

在 repo 外建立一個空目錄。從下列作者頁面或發行頁面下載原檔，從壓縮檔取出表中的項目，平放到同一個目錄並保留檔名與大小寫。所有來源皆採 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)，每個輸出檔的作者與授權見[資產清單](asset-manifest.json)。

| 原始素材 | 要取出的檔案 | 授權依據 |
| --- | --- | --- |
| [War Horns](https://opengameart.org/node/153572) | `war_horns.wav` | 發行頁 |
| [Medieval Sound Effects – Weapon Textures](https://opengameart.org/content/medieval-sound-effects-weapon-textures) 的 `medieval_sfx_textures_1_of_2.7z` | `English Longbow Shoot.wav`、`Crossbow Shoot.wav` | 發行頁及[原作者條文存檔](https://web.archive.org/web/20220331020630/https://www.stillnorthmedia.com/libraries) |
| [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | `impactSoft_medium_002.ogg`、`impactPlate_heavy_001.ogg`、`impactPlank_medium_002.ogg`、`impactMining_004.ogg`、`impactWood_medium_003.ogg` | 壓縮檔內的 `License.txt` |
| [150 Combat Sound Effects](https://opengameart.org/content/150-combat-sound-effects) 的 `150gameeffectsounds.zip` | `04_magic_spells/Fire Spell Impact 2_s06.wav` | 壓縮檔內的 `LICENSES.txt` 將 `s06` 對應到 lentikula 的 [Basic Spell Impacts](https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx) |
| [Deep Bone Crack/Break SFX](https://opengameart.org/content/deep-bone-crackbreak-sfx) 的 `deep_breaks.zip` | `Deep Break 3.wav` | 發行頁 |
| [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack) 的 `rpg_sound_pack.zip` | `RPG Sound Pack/NPC/shade/shade1.wav` | 發行頁 |
| [Their Coming](https://opengameart.org/content/their-coming-generic-horn-sound) | `theircoming.ogg` | 發行頁 |
| [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | `jingles_STEEL10.ogg`、`jingles_STEEL02.ogg` | 壓縮檔內的 `License.txt` |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | `error_003.ogg` | 壓縮檔內的 `License.txt` |
| [JRPG Pack 3 [Evil]](https://opengameart.org/content/jrpg-pack-3-evil) 的 `JRPG Music Pack #3 [Evil] by Juhani Junkala.zip` | `Evil2 - Catacombs.ogg`、`Evil1 - Ancient Evil Awakens.ogg`、`Evil3 - Apocalypse.ogg` | 壓縮檔內的 `INFO.txt` |
| [The Sad Battle](https://opengameart.org/content/the-sad-battle) | `the_sad_battle.wav`（完整原檔，約 95 秒） | 發行頁 |

若 Kenney 封鎖命令列請求，可從素材頁的下載按鈕取得壓縮檔。若 OpenGameArt 回傳的檔案不完整，請從發行頁取得完整檔案再解壓或處理。腳本會先使用目錄中已備妥的檔案，缺少時才嘗試網路下載。

以下命令在 repo 根目錄執行。它會把重製結果寫到暫存目錄，並和版本庫內的檔案逐位元組比較。Bun 1.4.4、FFmpeg 9.0.2（含 libopus）已驗證可重製全部 19 個檔案。

```sh
rebuild=$(mktemp -d)
mkdir "$rebuild/scripts"
cp scripts/{build-audio,alerts-audio,combat-audio,music-clips}.ts "$rebuild/scripts/"
CROWNFALL_AUDIO_SOURCES=/absolute/path/to/originals bun "$rebuild/scripts/build-audio.ts"
diff -qr src/audio/clips "$rebuild/src/audio/clips"
```
