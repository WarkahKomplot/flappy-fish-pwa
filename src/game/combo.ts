import { PHYSICS_CONSTANTS } from './constants';

export interface PearlCollectionResult {
  combo: number;
  shieldActivated: boolean;
}

export interface HitAbsorptionResult {
  shieldBroken: boolean;
  invulnerableDuration: number;
}

/**
 * Manages the consecutive pearl collection streak (1 -> 2 -> 3),
 * Bubble Shield deployment, neutral gap tolerance, missed pearl combo resets,
 * and single-hit damage absorption.
 */
export class ComboManager {
  public comboCount: number = 0;
  public hasShield: boolean = false;
  public shieldActiveTime: number = 0;

  public get combo(): number {
    return this.comboCount;
  }

  public set combo(value: number) {
    this.comboCount = value;
  }

  /**
   * Called when the fish successfully touches and collects an active pearl.
   * Increments combo streak; on 3 consecutive pearls, deploys the Bubble Shield
   * and resets combo count back to 0.
   */
  public onPearlCollected(): PearlCollectionResult {
    this.comboCount += 1;

    if (this.comboCount >= 3) {
      this.comboCount = 0;
      this.hasShield = true;
      this.shieldActiveTime = 0;
      return { combo: 0, shieldActivated: true };
    }

    return { combo: this.comboCount, shieldActivated: false };
  }

  /**
   * Called when an obstacle gap with an active, uncollected pearl scrolls past the fish.
   * Strictly resets consecutive combo streak to 0 (Review Focus 4).
   * Note: Does not reset the combo on neutral gaps (where no pearl spawned).
   */
  public onPearlMissed(): void {
    this.comboCount = 0;
  }

  /**
   * Called when the fish collides with an obstacle.
   * If Bubble Shield is active, absorbs the hit, breaks the shield, and grants
   * a 1.2-second invulnerability duration.
   */
  public onHitAbsorbed(): HitAbsorptionResult {
    if (this.hasShield) {
      this.hasShield = false;
      this.shieldActiveTime = 0;
      this.comboCount = 0;
      return {
        shieldBroken: true,
        invulnerableDuration: PHYSICS_CONSTANTS.INVULNERABILITY_DURATION,
      };
    }

    return {
      shieldBroken: false,
      invulnerableDuration: 0,
    };
  }

  /**
   * Updates state over delta time (e.g. tracks how long shield has been active).
   */
  public update(dt: number): void {
    if (this.hasShield) {
      this.shieldActiveTime += dt;
    }
  }

  /**
   * Explicitly resets combo streak to 0 (e.g. on unshielded collision).
   */
  public resetCombo(): void {
    this.comboCount = 0;
  }

  /**
   * Resets all combo and shield state (e.g. upon starting a fresh run).
   */
  public reset(): void {
    this.comboCount = 0;
    this.hasShield = false;
    this.shieldActiveTime = 0;
  }
}
