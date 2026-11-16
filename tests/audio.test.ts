import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  playSwimFlap,
  playPearlChime,
  playShieldActivate,
  playShieldPop,
  playHit,
  playPersonalBest,
  resumeContext,
  soundEffects,
  PEARL_CHIME_FREQUENCIES,
  resetAudioContextForTesting,
} from '../src/game/audio';
import { setAudioMuted } from '../src/game/storage';

interface MockGainNode {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

interface MockOscillatorNode {
  type: OscillatorType;
  frequency: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockBiquadFilterNode {
  type: BiquadFilterType;
  frequency: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

interface MockAudioBufferSourceNode {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 10.0;
  sampleRate = 44100;
  destination = {};

  createdOscillators: MockOscillatorNode[] = [];
  createdGainNodes: MockGainNode[] = [];
  createdFilters: MockBiquadFilterNode[] = [];
  createdBufferSources: MockAudioBufferSourceNode[] = [];

  resume = vi.fn().mockImplementation(async () => {
    this.state = 'running';
  });

  createGain = vi.fn().mockImplementation((): MockGainNode => {
    const node: MockGainNode = {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    this.createdGainNodes.push(node);
    return node;
  });

  createOscillator = vi.fn().mockImplementation((): MockOscillatorNode => {
    const node: MockOscillatorNode = {
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.createdOscillators.push(node);
    return node;
  });

  createBiquadFilter = vi.fn().mockImplementation((): MockBiquadFilterNode => {
    const node: MockBiquadFilterNode = {
      type: 'lowpass',
      frequency: {
        value: 350,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
    this.createdFilters.push(node);
    return node;
  });

  createBuffer = vi.fn().mockImplementation((channels: number, length: number, sampleRate: number) => {
    const channelData = new Float32Array(length);
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: vi.fn().mockReturnValue(channelData),
    };
  });

  createBufferSource = vi.fn().mockImplementation((): MockAudioBufferSourceNode => {
    const node: MockAudioBufferSourceNode = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.createdBufferSources.push(node);
    return node;
  });
}

describe('Procedural Web Audio API Synthesizer', () => {
  let mockCtx: MockAudioContext;
  let originalAudioContext: unknown;
  let originalWebkitAudioContext: unknown;

  beforeEach(() => {
    localStorage.clear();
    setAudioMuted(false);
    resetAudioContextForTesting();

    originalAudioContext = (window as unknown as { AudioContext?: unknown }).AudioContext;
    originalWebkitAudioContext = (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;

    mockCtx = new MockAudioContext();
    (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn().mockImplementation(() => mockCtx);
  });

  afterEach(() => {
    resetAudioContextForTesting();
    (window as unknown as { AudioContext?: unknown }).AudioContext = originalAudioContext;
    (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext = originalWebkitAudioContext;
    vi.restoreAllMocks();
  });

  describe('AudioContext Autoplay Policy & lazy resumption (Review Focus 2)', () => {
    it('initializes context lazily and resumes suspended context on resumeContext()', async () => {
      expect(mockCtx.state).toBe('suspended');
      await resumeContext();
      expect(mockCtx.resume).toHaveBeenCalled();
      expect(mockCtx.state).toBe('running');
    });

    it('handles multiple resumeContext() calls cleanly without re-calling resume if already running', async () => {
      await resumeContext();
      expect(mockCtx.resume).toHaveBeenCalledTimes(1);

      await resumeContext();
      expect(mockCtx.resume).toHaveBeenCalledTimes(1);
    });

    it('gracefully handles resume rejection without throwing unhandled exceptions', async () => {
      mockCtx.resume.mockRejectedValueOnce(new Error('User gesture required'));
      await expect(resumeContext()).resolves.toBeUndefined();
    });

    it('gracefully handles environments without Web Audio API support', async () => {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext;
      delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
      resetAudioContextForTesting();

      await expect(resumeContext()).resolves.toBeUndefined();
      expect(() => playSwimFlap()).not.toThrow();
      expect(() => playPearlChime(0)).not.toThrow();
      expect(() => playShieldActivate()).not.toThrow();
      expect(() => playShieldPop()).not.toThrow();
      expect(() => playHit()).not.toThrow();
      expect(() => playPersonalBest()).not.toThrow();
    });
  });

  describe('Mute state observance', () => {
    it('does not schedule audio when isAudioMuted() is true', () => {
      setAudioMuted(true);

      playSwimFlap();
      playPearlChime(0);
      playShieldActivate();
      playShieldPop();
      playHit();
      playPersonalBest();

      expect(mockCtx.createOscillator).not.toHaveBeenCalled();
      expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
      expect(mockCtx.createGain).not.toHaveBeenCalled();
    });

    it('resumes scheduling audio when unmuted', () => {
      setAudioMuted(true);
      playSwimFlap();
      expect(mockCtx.createBufferSource).not.toHaveBeenCalled();

      setAudioMuted(false);
      playSwimFlap();
      expect(mockCtx.createBufferSource).toHaveBeenCalled();
    });
  });

  describe('playSwimFlap', () => {
    it('synthesizes an ~80ms low-pass filtered noise swoosh', () => {
      playSwimFlap();

      expect(mockCtx.createBuffer).toHaveBeenCalled();
      expect(mockCtx.createBufferSource).toHaveBeenCalledTimes(1);
      expect(mockCtx.createBiquadFilter).toHaveBeenCalledTimes(1);
      expect(mockCtx.createGain).toHaveBeenCalledTimes(1);

      const filter = mockCtx.createdFilters[0];
      expect(filter.type).toBe('lowpass');

      const source = mockCtx.createdBufferSources[0];
      expect(source.start).toHaveBeenCalledWith(mockCtx.currentTime);
      // Stopped around ~80ms later (currentTime + 0.08)
      expect(source.stop).toHaveBeenCalledWith(expect.closeTo(mockCtx.currentTime + 0.08, 2));
    });
  });

  describe('playPearlChime', () => {
    it('defines ascending melodic triad frequencies (C5, E5, G5)', () => {
      expect(PEARL_CHIME_FREQUENCIES[0]).toBeCloseTo(523.25, 1);
      expect(PEARL_CHIME_FREQUENCIES[1]).toBeCloseTo(659.25, 1);
      expect(PEARL_CHIME_FREQUENCIES[2]).toBeCloseTo(783.99, 1);
    });

    it('plays C5 (523Hz) for comboIndex 0', () => {
      playPearlChime(0);

      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      const osc = mockCtx.createdOscillators[0];
      expect(osc.type).toBe('sine');
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(523.25, 1),
        mockCtx.currentTime
      );
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });

    it('plays E5 (659Hz) for comboIndex 1', () => {
      playPearlChime(1);

      const osc = mockCtx.createdOscillators[0];
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(659.25, 1),
        mockCtx.currentTime
      );
    });

    it('plays G5 (784Hz) for comboIndex 2', () => {
      playPearlChime(2);

      const osc = mockCtx.createdOscillators[0];
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
        expect.closeTo(783.99, 1),
        mockCtx.currentTime
      );
    });

    it('handles combo index >= 3 gracefully without throwing', () => {
      expect(() => playPearlChime(3)).not.toThrow();
      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
    });
  });

  describe('playShieldActivate', () => {
    it('synthesizes an arpeggiated power-up chord', () => {
      playShieldActivate();

      // Arpeggiated chime creates multiple staggered tones
      expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(3);
      for (const osc of mockCtx.createdOscillators) {
        expect(osc.start).toHaveBeenCalled();
        expect(osc.stop).toHaveBeenCalled();
      }
    });
  });

  describe('playShieldPop', () => {
    it('synthesizes a bubble burst sound using frequency modulation', () => {
      playShieldPop();

      // FM bubble burst uses carrier + modulator oscillators (or rapid frequency sweeping)
      expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(1);
      const osc = mockCtx.createdOscillators[0];
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    });
  });

  describe('playHit', () => {
    it('synthesizes a low-frequency descending thud', () => {
      playHit();

      expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
      const osc = mockCtx.createdOscillators[0];
      expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
      const [targetFreq, targetTime] = osc.frequency.exponentialRampToValueAtTime.mock.calls[0];
      // Frequency ramps down towards low bass/sub-bass (< 50Hz)
      expect(targetFreq).toBeLessThanOrEqual(50);
      expect(targetTime).toBeGreaterThan(mockCtx.currentTime);
    });
  });

  describe('playPersonalBest', () => {
    it('synthesizes a triumphant synth flourish', () => {
      playPersonalBest();

      expect(mockCtx.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(3);
      for (const osc of mockCtx.createdOscillators) {
        expect(osc.start).toHaveBeenCalled();
      }
    });
  });

  describe('soundEffects object export', () => {
    it('bundles all sound functions and resumeContext into soundEffects object', () => {
      expect(soundEffects.playSwimFlap).toBe(playSwimFlap);
      expect(soundEffects.playPearlChime).toBe(playPearlChime);
      expect(soundEffects.playShieldActivate).toBe(playShieldActivate);
      expect(soundEffects.playShieldPop).toBe(playShieldPop);
      expect(soundEffects.playHit).toBe(playHit);
      expect(soundEffects.playPersonalBest).toBe(playPersonalBest);
      expect(soundEffects.resumeContext).toBe(resumeContext);
    });
  });
});
