export type SkinId = 'neon-tetra' | 'clownfish' | 'golden-manta';

export interface SkinDefinition {
  id: SkinId;
  name: string;
  requiredPearls: number;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
}

export type GameStatus = 'idle' | 'playing' | 'gameover';

export interface FishEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  skin: SkinId;
  isDead: boolean;
  invulnerableTime: number;
  swimTimer?: number;
}

export interface PearlEntity {
  id: string | number;
  x: number;
  y: number;
  radius: number;
  collected: boolean;
  missed?: boolean;
}

export interface ObstacleEntity {
  id: string | number;
  x: number;
  topHeight: number;
  bottomY: number;
  gapSize: number;
  width: number;
  passed: boolean;
  pearl?: PearlEntity | null;
}

export interface GameState {
  status: GameStatus;
  score: number;
  highScore: number;
  lifetimePearls: number;
  combo: number;
  hasShield: boolean;
  shieldActiveTime: number;
  activeSkin: SkinId;
  isMuted: boolean;
}

export interface GameConfig {
  logicalWidth: number;
  logicalHeight: number;
  gravity: number;
  swimImpulse: number;
  maxUpwardVelocity: number;
  terminalVelocity: number;
  waterDrag: number;
  obstacleWidth: number;
  obstacleGap: number;
  obstacleSpacing: number;
  obstacleSpeed: number;
  pearlSpawnChance: number;
  pearlRadius: number;
  fishRadius: number;
  hitboxScale: number;
  invulnerabilityDuration: number;
}
