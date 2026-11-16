import { isAudioMuted } from './storage';

export const PEARL_CHIME_FREQUENCIES = [523.25, 659.25, 783.99] as const;

let audioContextInstance: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return null;

  if (!audioContextInstance) {
    try {
      audioContextInstance = new AudioContextClass();
    } catch {
      return null;
    }
  }

  return audioContextInstance;
}

export function resetAudioContextForTesting(): void {
  audioContextInstance = null;
}

export async function resumeContext(): Promise<void> {
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Gracefully ignore autoplay rejection until next user interaction gesture
    }
  }
}

function ensureRunningContext(ctx: AudioContext): void {
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * 80ms low-pass filtered noise burst simulating an underwater fin swoosh.
 */
export function playSwimFlap(): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const duration = 0.08;
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const now = ctx.currentTime;
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + duration);
  } catch {
    // Fail silently without disrupting game loop
  }
}

/**
 * Ascending pure sine wave melodic triad (C5=523.25Hz, E5=659.25Hz, G5=783.99Hz)
 * on consecutive pearl collections.
 */
export function playPearlChime(comboIndex: number): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const now = ctx.currentTime;
    const duration = 0.35;

    const safeIndex = Math.max(0, Math.floor(comboIndex));
    const baseFreq = safeIndex < PEARL_CHIME_FREQUENCIES.length
      ? PEARL_CHIME_FREQUENCIES[safeIndex]
      : PEARL_CHIME_FREQUENCIES[safeIndex % PEARL_CHIME_FREQUENCIES.length] *
        Math.pow(2, Math.floor(safeIndex / PEARL_CHIME_FREQUENCIES.length));

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Fail silently
  }
}

/**
 * Arpeggiated power-up major chord chime upon activating bubble shield.
 */
export function playShieldActivate(): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const now = ctx.currentTime;
    // C5, E5, G5, C6 arpeggio
    const chordNotes = [523.25, 659.25, 783.99, 1046.5];
    const stepDuration = 0.06;
    const noteRing = 0.25;

    chordNotes.forEach((freq, idx) => {
      const startTime = now + idx * stepDuration;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteRing);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteRing);
    });
  } catch {
    // Fail silently
  }
}

/**
 * Bubble pop burst sound using frequency modulation (carrier + modulator).
 */
export function playShieldPop(): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const now = ctx.currentTime;
    const duration = 0.1;

    // Carrier sweeping up for buoyant underwater pop physics
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(420, now);
    carrier.frequency.exponentialRampToValueAtTime(1450, now + duration);

    // Modulator for FM bubble burst texture
    const modulator = ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(280, now);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(120, now);
    modGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.35, now);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    carrier.connect(mainGain);
    mainGain.connect(ctx.destination);

    modulator.start(now);
    carrier.start(now);
    modulator.stop(now + duration);
    carrier.stop(now + duration);
  } catch {
    // Fail silently
  }
}

/**
 * Low-frequency resonant thud on obstacle impact / game over.
 */
export function playHit(): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const now = ctx.currentTime;
    const duration = 0.24;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch {
    // Fail silently
  }
}

/**
 * Triumphant brass-like synth burst when crossing the personal best ribbon.
 */
export function playPersonalBest(): void {
  if (isAudioMuted()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  try {
    ensureRunningContext(ctx);
    const now = ctx.currentTime;
    // Fanfare: C5, E5, G5, C6 held
    const notes = [
      { freq: 523.25, time: now, dur: 0.12 },
      { freq: 659.25, time: now + 0.1, dur: 0.12 },
      { freq: 783.99, time: now + 0.2, dur: 0.14 },
      { freq: 1046.5, time: now + 0.34, dur: 0.45 },
    ];

    notes.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.3, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + dur);
    });
  } catch {
    // Fail silently
  }
}

export interface SoundEffects {
  playSwimFlap(): void;
  playPearlChime(comboIndex: number): void;
  playShieldActivate(): void;
  playShieldPop(): void;
  playHit(): void;
  playPersonalBest(): void;
  resumeContext(): Promise<void>;
}

export const soundEffects: SoundEffects = {
  playSwimFlap,
  playPearlChime,
  playShieldActivate,
  playShieldPop,
  playHit,
  playPersonalBest,
  resumeContext,
};

export default soundEffects;
