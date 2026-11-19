/**
 * QA URL flags. These are additive, opt-in switches for the start screen /
 * freeze tooling; an ordinary production load parses to all-off and never
 * enters any of the QA paths.
 */
export interface QaFlags {
  debug: boolean;
  benchmark: boolean;
  freeze: boolean;
  seed?: number;
  time?: number;
}

export const DEFAULT_QA_FLAGS: Readonly<QaFlags> = {
  debug: false,
  benchmark: false,
  freeze: false,
};

function isEnabled(params: URLSearchParams, key: string): boolean {
  if (!params.has(key)) {
    return false;
  }

  const value = params.get(key);
  return value === '' || value === '1' || value === 'true';
}

function readNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') {
    return undefined;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parses `?debug`, `?benchmark`, `?freeze`, `?seed` and the freeze timestamp.
 * The documented freeze timestamp is `?t=` (spec §9); `?time=` is accepted as
 * an alias so a hand-written QA URL is forgiving. Values are returned only
 * when finite, so `parseQaFlags('')` has no seed/time keys at all.
 */
export function parseQaFlags(search: string): QaFlags {
  const params = new URLSearchParams(search);
  const seed = readNumber(params.get('seed'));
  const time = readNumber(params.get('t') ?? params.get('time'));

  return {
    debug: isEnabled(params, 'debug'),
    benchmark: isEnabled(params, 'benchmark'),
    freeze: isEnabled(params, 'freeze'),
    ...(seed !== undefined ? { seed } : {}),
    ...(time !== undefined ? { time } : {}),
  };
}
