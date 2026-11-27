import type { Candidate } from './types';

// JRPG Pack 3 [Evil] by Juhani Junkala (SubspaceAudio), released under CC0.
const source = 'https://opengameart.org/content/jrpg-pack-3-evil';
const license = 'https://creativecommons.org/publicdomain/zero/1.0/';
const directory = `${import.meta.env.BASE_URL}audition-clips/music`;

export const music: Candidate[] = [
  { label: 'Ancient Evil Awakens', url: `${directory}/ancient-evil-awakens.ogg`, source, license },
  { label: 'Catacombs', url: `${directory}/catacombs.ogg`, source, license },
  { label: 'Apocalypse', url: `${directory}/apocalypse.ogg`, source, license },
  { label: "Witch's Lair", url: `${directory}/witchs-lair.ogg`, source, license },
  { label: 'Whispers From Beyond', url: `${directory}/whispers-from-beyond.ogg`, source, license },
];

// The Sad Battle by Eldritch Grim, released under CC0.
export const sadBattle: Candidate = {
  label: 'The Sad Battle',
  url: `${directory}/the-sad-battle.ogg`,
  source: 'https://opengameart.org/content/the-sad-battle',
  license,
};
