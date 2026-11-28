import type { Clip } from './build-audio';

const evilPack =
  'https://opengameart.org/sites/default/files/JRPG%20Music%20Pack%20%233%20%5BEvil%5D%20by%20Juhani%20Junkala.zip';

// JRPG Pack 3 [Evil] by Juhani Junkala and The Sad Battle by Eldritch Grim (CC0).
export const musicClips: readonly Clip[] = [
  {
    name: 'catacombs',
    download: evilPack,
    archiveMember: 'Evil2 - Catacombs.ogg',
  },
  {
    name: 'ancient-evil-awakens',
    download: evilPack,
    archiveMember: 'Evil1 - Ancient Evil Awakens.ogg',
  },
  {
    name: 'apocalypse',
    download: evilPack,
    archiveMember: 'Evil3 - Apocalypse.ogg',
  },
  {
    name: 'the-sad-battle',
    download: 'https://opengameart.org/sites/default/files/the_sad_battle.wav',
    // The original is 95 seconds. Reject a truncated download before encoding.
    minimumSourceSeconds: 95,
  },
];
