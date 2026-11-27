/** 一種敵人的定義，以格與秒撰寫。 */
export interface EnemyDefinition {
  /** 格／秒 */
  readonly speed: number;
}

/** 一組出兵：同種敵人依間隔出現，延遲相對開波計算（秒）。 */
export interface SpawnGroup<K extends string = string> {
  readonly enemy: K;
  readonly count: number;
  readonly interval: number;
  readonly delay: number;
}

export interface Wave<K extends string = string> {
  readonly groups: readonly SpawnGroup<K>[];
}

export interface Content<K extends string = string> {
  readonly enemies: Readonly<Record<K, EnemyDefinition>>;
  readonly waves: readonly Wave<NoInfer<K>>[];
}
