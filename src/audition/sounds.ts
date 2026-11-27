import type { Candidate } from './types';

const cc0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const impact = 'https://kenney.nl/assets/impact-sounds';
const jingles = 'https://kenney.nl/assets/music-jingles';
const ui = 'https://kenney.nl/assets/interface-sounds';
const bones = 'https://opengameart.org/content/deep-bone-crackbreak-sfx';
const shade = 'https://opengameart.org/content/rpg-sound-pack';
const leak = 'https://opengameart.org/content/their-coming-generic-horn-sound';
// The CC0 150 Combat Sound Effects archive identifies these WAVs as source s06.
const spells = 'https://lentikula.itch.io/freecc0-basic-spell-impacts-sfx';
const weapons = 'https://opengameart.org/content/medieval-sound-effects-weapon-textures';
// OpenGameArt lists CC0. The archived author's terms express royalty-free use and no attribution.
const archivedWeaponsTerms =
  'https://web.archive.org/web/20220331020630/https://www.stillnorthmedia.com/libraries';

function clip(label: string, file: string, source: string, license = cc0): Candidate {
  return {
    label,
    url: `${import.meta.env.BASE_URL}audition-clips/sounds/${file}.opus`,
    source,
    license,
  };
}

export const sounds: Record<string, Candidate[]> = {
  archer: [
    clip(
      '長弓 2 柔化（低通 2.2k）· Jaszczak / Nelson',
      'longbow-soft',
      weapons,
      archivedWeaponsTerms,
    ),
    clip(
      '長弓 2 悶化（低通 1.4k＋短殘響）· Jaszczak / Nelson',
      'longbow-muffled',
      weapons,
      archivedWeaponsTerms,
    ),
    clip('英式長弓發射 1 · Jaszczak / Nelson', 'longbow-1', weapons, archivedWeaponsTerms),
    clip('英式長弓發射 2 · Jaszczak / Nelson', 'longbow-2', weapons, archivedWeaponsTerms),
  ],
  ballista: [
    clip('十字弓發射 1 · Jaszczak / Nelson', 'crossbow-1', weapons, archivedWeaponsTerms),
    clip('十字弓發射 2 · Jaszczak / Nelson', 'crossbow-2', weapons, archivedWeaponsTerms),
  ],
  mage: [
    clip('Fire Spell Impact 2 · lentikula', 'spell-fire-2', spells),
    clip('Lightning Spell Impact 3 · lentikula', 'spell-lightning-3', spells),
    clip('Ice Spell Impact 4 · lentikula', 'spell-ice-4', spells),
  ],
  archerHit: [
    clip('輕木擊 001 · Kenney', 'archer-hit-wood', impact),
    clip('軟質撞擊 002 · Kenney', 'archer-hit-soft', impact),
  ],
  ballistaHit: [
    clip('重板擊 001 · Kenney', 'ballista-hit-plate', impact),
    clip('金屬撞擊 003 · Kenney', 'ballista-hit-metal', impact),
  ],
  killed: [
    clip('Deep Break 3 · Zane Little Music', 'bone-break-3', bones),
    clip('Deep Break 6 · Zane Little Music', 'bone-break-6', bones),
  ],
  lich: [
    clip('Shade 1 · artisticdude', 'lich-shade-1', shade),
    clip('Shade 14 · artisticdude', 'lich-shade-14', shade),
  ],
  leaked: [
    clip('Their Coming 3 · StumpyStrust', 'leak-horn-3', leak),
    clip('Their Coming（節錄）· StumpyStrust', 'leak-horn-1', leak),
    clip('重鐘 003 · Kenney', 'leak-bell', impact),
  ],
  startWave: [
    clip('War Horns（節錄）· Eldritch Grim', 'war-horns', 'https://opengameart.org/node/153572'),
  ],
  waveCleared: [
    clip('Pizzicato 04 · Kenney', 'jingle-pizzi-04', jingles),
    clip('Steel 10 · Kenney', 'jingle-steel-10', jingles),
  ],
  victory: [
    clip('Hit 10 · Kenney', 'jingle-hit-10', jingles),
    clip('Steel 02 · Kenney', 'jingle-steel-02', jingles),
  ],
  defeat: [
    clip('Hit 02 · Kenney', 'jingle-hit-02', jingles),
    clip('Pizzicato 11 · Kenney', 'jingle-pizzi-11', jingles),
  ],
  placeTower: [clip('木板 002 · Kenney', 'place-plank', impact)],
  upgradeTower: [clip('鑿石 004 · Kenney', 'upgrade-stone', impact)],
  sellTower: [clip('木擊 003 · Kenney', 'sell-wood', impact)],
  rejected: [
    clip('Error 003 · Kenney', 'ui-error-03', ui),
    clip('Error 006 · Kenney', 'ui-error-06', ui),
  ],
};
