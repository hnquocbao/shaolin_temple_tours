/** The three playable heroes. Design: docs/game-design.md. */
export type HeroId = 'qiao-feng' | 'duan-yu' | 'xuzhu';

export interface HeroDef {
  id: HeroId;
  name: { zh: string; vi: string; en: string };
  /** One word for how the hero plays. */
  style: 'power' | 'movement' | 'growth';
}

export const heroes: readonly HeroDef[] = [
  { id: 'qiao-feng', name: { zh: '萧峰', vi: 'Kiều Phong', en: 'Qiao Feng' }, style: 'power' },
  { id: 'duan-yu', name: { zh: '段誉', vi: 'Đoàn Dự', en: 'Duan Yu' }, style: 'movement' },
  { id: 'xuzhu', name: { zh: '虚竹', vi: 'Hư Trúc', en: 'Xuzhu' }, style: 'growth' },
];
