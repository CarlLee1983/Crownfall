import type { Clip } from './build-audio';

const weapons = 'https://opengameart.org/sites/default/files/medieval_sfx_textures_1_of_2.7z';
const impacts =
  'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip';

export const combatClips = [
  {
    name: 'longbow-soft',
    download: weapons,
    rawFile: 'English Longbow Shoot.wav',
    archiveMember: 'English Longbow Shoot.wav',
    edit: 'atrim=start=0.771:end=0.906,asetpts=PTS-STARTPTS,lowpass=f=2200,afade=t=in:d=0.008',
    gainDb: -3,
  },
  {
    name: 'crossbow-1',
    download: weapons,
    rawFile: 'Crossbow Shoot.wav',
    archiveMember: 'Crossbow Shoot.wav',
    edit: 'atrim=start=0.322:end=0.575,asetpts=PTS-STARTPTS',
  },
  {
    name: 'archer-hit-soft',
    download: impacts,
    rawFile: 'impactSoft_medium_002.ogg',
    archiveMember: '*impactSoft_medium_002.ogg',
  },
  {
    name: 'ballista-hit-plate',
    download: impacts,
    rawFile: 'impactPlate_heavy_001.ogg',
    archiveMember: '*impactPlate_heavy_001.ogg',
  },
  {
    name: 'spell-fire-2',
    download: 'https://opengameart.org/sites/default/files/150gameeffectsounds.zip',
    rawFile: 'Fire Spell Impact 2_s06.wav',
    archiveMember: '04_magic_spells/Fire Spell Impact 2_s06.wav',
  },
  {
    name: 'bone-break-3',
    download: 'https://opengameart.org/sites/default/files/deep_breaks.zip',
    rawFile: 'Deep Break 3.wav',
    archiveMember: 'Deep Break 3.wav',
    edit: 'atrim=end=0.65,afade=t=out:st=0.59:d=0.06',
  },
  {
    name: 'lich-shade-1',
    download: 'https://opengameart.org/sites/default/files/rpg_sound_pack.zip',
    rawFile: 'shade1.wav',
    archiveMember: 'RPG Sound Pack/NPC/shade/shade1.wav',
  },
] satisfies readonly Clip[];
