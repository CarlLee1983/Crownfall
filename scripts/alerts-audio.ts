import type { Clip } from './build-audio';
import { kenneyImpactSounds } from './combat-audio';

const kenneyJingles = 'https://kenney.nl/assets/music-jingles';
const kenneyInterface = 'https://kenney.nl/assets/interface-sounds';

export const alertClips = [
  {
    name: 'leak-bell',
    download: kenneyImpactSounds,
    rawFile: 'impactBell_heavy_000.ogg',
    archiveMember: '*impactBell_heavy_000.ogg',
  },
  {
    name: 'jingle-steel-10',
    download: kenneyJingles,
    rawFile: 'jingles_STEEL10.ogg',
    archiveMember: '*jingles_STEEL10.ogg',
  },
  {
    name: 'jingle-steel-02',
    download: kenneyJingles,
    rawFile: 'jingles_STEEL02.ogg',
    archiveMember: '*jingles_STEEL02.ogg',
  },
  {
    name: 'place-plank',
    download: kenneyImpactSounds,
    rawFile: 'impactPlank_medium_002.ogg',
    archiveMember: '*impactPlank_medium_002.ogg',
  },
  {
    name: 'upgrade-stone',
    download: kenneyImpactSounds,
    rawFile: 'impactMining_004.ogg',
    archiveMember: '*impactMining_004.ogg',
  },
  {
    name: 'sell-wood',
    download: kenneyImpactSounds,
    rawFile: 'impactWood_medium_003.ogg',
    archiveMember: '*impactWood_medium_003.ogg',
  },
  {
    name: 'ui-error-03',
    download: kenneyInterface,
    rawFile: 'error_003.ogg',
    archiveMember: '*error_003.ogg',
  },
] satisfies readonly Clip[];
