export type ParticleType = 'ambient' | 'bubble' | 'spark' | 'confetti';

export interface Particle {
  active: boolean;
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  buoyancy?: number;
  drag?: number;
  wobbleSpeed?: number;
  wobbleAmp?: number;
  seed?: number;
}

const CONFETTI_COLORS = [
  '#facc15', // Gold
  '#38bdf8', // Cyan
  '#f43f5e', // Coral
  '#34d399', // Emerald
  '#ffffff', // Pearl white
  '#c084fc', // Violet
];

/**
 * Pre-allocated zero-allocation particle system for 60fps Canvas rendering.
 */
export class ParticleSystem {
  public particles: Particle[];
  private poolCapacity: number;

  constructor(capacity: number = 300) {
    this.poolCapacity = capacity;
    this.particles = new Array(capacity);

    for (let i = 0; i < capacity; i++) {
      this.particles[i] = {
        active: false,
        type: 'bubble',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#ffffff',
        alpha: 1,
        life: 0,
        maxLife: 1,
        seed: Math.random() * 100,
      };
    }
  }

  public get activeCount(): number {
    let count = 0;
    for (let i = 0; i < this.poolCapacity; i++) {
      if (this.particles[i].active) count++;
    }
    return count;
  }

  /**
   * Spawns or recycles a particle slot from the pre-allocated pool.
   */
  private spawnParticle(config: Partial<Particle> & { type: ParticleType }): Particle {
    // 1. Look for inactive slot
    for (let i = 0; i < this.poolCapacity; i++) {
      const p = this.particles[i];
      if (!p.active) {
        Object.assign(p, {
          active: true,
          alpha: 1,
          life: config.maxLife ?? 1,
          maxLife: config.maxLife ?? 1,
          buoyancy: 0,
          drag: 1,
          wobbleSpeed: 0,
          wobbleAmp: 0,
          seed: Math.random() * 100,
          ...config,
        });
        return p;
      }
    }

    // 2. If pool is full, replace non-ambient particle with lowest remaining life
    let bestIdx = -1;
    let lowestLife = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.poolCapacity; i++) {
      const p = this.particles[i];
      if (p.type !== 'ambient' && p.life < lowestLife) {
        lowestLife = p.life;
        bestIdx = i;
      }
    }

    const targetIdx = bestIdx !== -1 ? bestIdx : 0;
    const p = this.particles[targetIdx];
    Object.assign(p, {
      active: true,
      alpha: 1,
      life: config.maxLife ?? 1,
      maxLife: config.maxLife ?? 1,
      buoyancy: 0,
      drag: 1,
      wobbleSpeed: 0,
      wobbleAmp: 0,
      seed: Math.random() * 100,
      ...config,
    });
    return p;
  }

  /**
   * Initializes persistent ambient floating deep-sea motes / marine snow.
   */
  public initAmbient(width: number, height: number, count: number = 30): void {
    // Clear any existing ambient particles first
    for (let i = 0; i < this.poolCapacity; i++) {
      if (this.particles[i].type === 'ambient') {
        this.particles[i].active = false;
      }
    }

    for (let i = 0; i < count; i++) {
      this.spawnParticle({
        type: 'ambient',
        x: Math.random() * width,
        y: Math.random() * height,
        vx: -0.3 - Math.random() * 0.5,
        vy: (Math.random() - 0.5) * 0.2,
        size: 1.0 + Math.random() * 1.8,
        color: Math.random() > 0.5 ? 'rgba(255, 255, 255, 0.45)' : 'rgba(56, 189, 248, 0.4)',
        alpha: 0.2 + Math.random() * 0.35,
        maxLife: 99999,
        life: 99999,
      });
    }
  }

  /**
   * Emits trailing bubbles on swim flap stroke from fish tail.
   */
  public emitSwimBubbles(x: number, y: number, count: number = 5): void {
    for (let i = 0; i < count; i++) {
      const maxLife = 0.4 + Math.random() * 0.35;
      this.spawnParticle({
        type: 'bubble',
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: -1.4 - Math.random() * 1.8,
        vy: -0.2 + (Math.random() - 0.5) * 0.8,
        size: 1.5 + Math.random() * 2.2,
        color: 'rgba(224, 250, 255, 0.8)',
        maxLife,
        life: maxLife,
        buoyancy: -0.06,
        drag: 0.94,
      });
    }
  }

  /**
   * Radial sparkling gold/pearl burst upon collecting a pearl.
   */
  public emitPearlCollect(x: number, y: number, count: number = 14): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const speed = 2.0 + Math.random() * 3.5;
      const maxLife = 0.35 + Math.random() * 0.25;

      this.spawnParticle({
        type: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.8 + Math.random() * 2.0,
        color: Math.random() > 0.35 ? '#fef08a' : '#ffffff',
        maxLife,
        life: maxLife,
        drag: 0.91,
      });
    }
  }

  /**
   * Radial buoyant cyan bubble burst upon shield impact absorption.
   */
  public emitShieldPop(x: number, y: number, count: number = 22): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.2;
      const maxLife = 0.5 + Math.random() * 0.35;

      this.spawnParticle({
        type: 'bubble',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.0 + Math.random() * 3.2,
        color: Math.random() > 0.5 ? '#38bdf8' : '#00f0ff',
        maxLife,
        life: maxLife,
        buoyancy: -0.07,
        drag: 0.93,
      });
    }
  }

  /**
   * Celebratory confetti burst when swimming past the Personal Best distance ribbon.
   */
  public emitConfetti(x: number, y: number, count: number = 40): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const speed = 3.0 + Math.random() * 5.2;
      const maxLife = 1.0 + Math.random() * 0.8;
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];

      this.spawnParticle({
        type: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2.2 + Math.random() * 2.8,
        color,
        maxLife,
        life: maxLife,
        buoyancy: -0.03,
        drag: 0.95,
        wobbleSpeed: 4 + Math.random() * 5,
        wobbleAmp: 1.2 + Math.random() * 1.5,
      });
    }
  }

  /**
   * Updates all active particles over delta time (dt in frame units, 1 = 16.6ms).
   */
  public update(dt: number, worldWidth: number = 360, worldHeight: number = 640): void {
    const dtSeconds = dt / 60;

    for (let i = 0; i < this.poolCapacity; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      if (p.type === 'ambient') {
        p.x += p.vx * dt;
        p.y += (p.vy + Math.sin((p.seed ?? 0) + p.x * 0.05) * 0.25) * dt;

        // Loop ambient motes horizontally and vertically
        if (p.x < -10) {
          p.x = worldWidth + 5;
          p.y = Math.random() * worldHeight;
        }
        if (p.y < 0) p.y = worldHeight;
        if (p.y > worldHeight) p.y = 0;
        continue;
      }

      // Timed particles
      p.life -= dtSeconds;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Physics damping & buoyancy
      if (p.drag && p.drag < 1) {
        p.vx *= Math.pow(p.drag, dt);
        p.vy *= Math.pow(p.drag, dt);
      }
      if (p.buoyancy) {
        p.vy += p.buoyancy * dt;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Confetti horizontal flutter
      if (p.type === 'confetti' && p.wobbleSpeed && p.wobbleAmp) {
        p.x += Math.sin((p.seed ?? 0) + p.life * p.wobbleSpeed) * p.wobbleAmp * dt;
      }

      // Fade alpha with remaining life
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  /**
   * Renders all active particles to Canvas 2D.
   */
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    for (let i = 0; i < this.poolCapacity; i++) {
      const p = this.particles[i];
      if (!p.active || p.alpha <= 0.01) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'confetti') {
        // Draw small fluttering rectangular confetti
        ctx.translate(p.x, p.y);
        ctx.rotate((p.seed ?? 0) + p.life * 6);
        ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      } else {
        // Draw circular bubble / spark / ambient mote
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Extra specular glint for larger bubbles
        if (p.type === 'bubble' && p.size > 2.5) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Clears all active particles (except ambient motes can be preserved or reset).
   */
  public reset(keepAmbient: boolean = false): void {
    for (let i = 0; i < this.poolCapacity; i++) {
      if (!keepAmbient || this.particles[i].type !== 'ambient') {
        this.particles[i].active = false;
      }
    }
  }
}
