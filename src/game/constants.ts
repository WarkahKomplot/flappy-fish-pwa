import type { SkinId, SkinDefinition } from './types';

export const STORAGE_KEYS = {
  HIGH_SCORE: 'flappy_fish_highscore',
  LIFETIME_PEARLS: 'flappy_fish_lifetime_pearls',
  ACTIVE_SKIN: 'flappy_fish_active_skin',
  MUTED: 'flappy_fish_muted',
} as const;

export const SKIN_DEFINITIONS: Record<SkinId, SkinDefinition> = {
  'neon-tetra': {
    id: 'neon-tetra',
    name: 'Neon Tetra',
    requiredPearls: 0,
    description: 'Bioluminescent cyan swimmer, standard reef native.',
    primaryColor: '#00f0ff',
    secondaryColor: '#0066ff',
    accentColor: '#38bdf8',
  },
  'clownfish': {
    id: 'clownfish',
    name: 'Clownfish',
    requiredPearls: 50,
    description: 'Vibrant orange anemone dweller with bold white stripes.',
    primaryColor: '#ff7700',
    secondaryColor: '#ffffff',
    accentColor: '#f97316',
  },
  'golden-manta': {
    id: 'golden-manta',
    name: 'Golden Manta',
    requiredPearls: 150,
    description: 'Majestic mythical ray radiating pure solar gold.',
    primaryColor: '#ffd700',
    secondaryColor: '#fff2a0',
    accentColor: '#eab308',
  },
};

export const MEDAL_THRESHOLDS = {
  bronze: 10,
  silver: 25,
  gold: 50,
} as const;

export const PHYSICS_CONSTANTS = {
  GRAVITY: 0.38,
  SWIM_IMPULSE: -6.5,
  MAX_UPWARD_VELOCITY: -8.5,
  TERMINAL_VELOCITY: 8.0,
  WATER_DRAG: 0.98,
  CANVAS_WIDTH: 360,
  CANVAS_HEIGHT: 640,
  OBSTACLE_WIDTH: 60,
  OBSTACLE_GAP: 140,
  // Difficulty curve: scroll speed ramps with score up to a cap and the gap
  // tapers down to a floor, so late-run play stays tense but fair.
  MIN_OBSTACLE_GAP: 120,
  GAP_NARROW_PER_POINT: 0.2,
  MAX_HORIZONTAL_SPEED: 4.2,
  SPEED_RAMP_PER_POINT: 0.012,
  // Shared by the kelp renderer and the kelp hitbox so the art and collision
  // can never drift apart again (the column is drawn this many px in from
  // each side of the obstacle's nominal width).
  KELP_SIDE_INSET: 8,
  // Shared by the jellyfish renderer and hitbox: the painted bell is a dome
  // whose unpulsed height is this many px below bottomY. The hitbox mirrors
  // the dome (top at bottomY + height/4 at centre, sides at bottomY + height)
  // instead of a full-width AABB starting at bottomY, which was solid in the
  // unpainted corners above the bell.
  JELLY_BELL_HEIGHT: 36,
  OBSTACLE_SPACING: 200,
  HORIZONTAL_SPEED: 2.8,
  PEARL_SPAWN_CHANCE: 0.6,
  PEARL_RADIUS: 12,
  FISH_RADIUS: 16,
  HITBOX_SCALE: 0.85, // 15% reduction for generous near-miss satisfaction
  INVULNERABILITY_DURATION: 1.2, // seconds after shield absorbs impact
  UPWARD_PITCH_ANGLE: -0.35, // ~ -20 degrees
  DOWNWARD_PITCH_ANGLE: 0.78, // ~ 45 degrees
} as const;
