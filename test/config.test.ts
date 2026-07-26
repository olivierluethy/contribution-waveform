import { describe, expect, it } from 'vitest';
import { ConfigSchema, isValidTimeZone, loadConfig } from '../src/config.js';

const valid = {
  username: 'olivierluethy',
  timezone: 'Europe/Zurich',
  peakMarkers: 3,
  mirror: true,
  accent: '#7c3aed',
};

describe('ConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(ConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a username with invalid characters', () => {
    expect(() => ConfigSchema.parse({ ...valid, username: 'bad user!' })).toThrow();
  });

  it('rejects a username starting with a hyphen', () => {
    expect(() => ConfigSchema.parse({ ...valid, username: '-nope' })).toThrow();
  });

  it('rejects an unknown timezone', () => {
    expect(() => ConfigSchema.parse({ ...valid, timezone: 'Mars/Olympus' })).toThrow();
  });

  it('rejects a non-integer peakMarkers', () => {
    expect(() => ConfigSchema.parse({ ...valid, peakMarkers: 2.5 })).toThrow();
  });

  it('rejects peakMarkers above 10', () => {
    expect(() => ConfigSchema.parse({ ...valid, peakMarkers: 11 })).toThrow();
  });

  it('rejects a non-hex accent', () => {
    expect(() => ConfigSchema.parse({ ...valid, accent: 'violet' })).toThrow();
  });

  it('rejects a 3-digit hex accent', () => {
    expect(() => ConfigSchema.parse({ ...valid, accent: '#abc' })).toThrow();
  });
});

describe('isValidTimeZone', () => {
  it('accepts a real IANA zone', () => {
    expect(isValidTimeZone('Europe/Zurich')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('loadConfig', () => {
  it('loads the repo config', async () => {
    const config = await loadConfig('waveform.config.json');
    expect(config.username).toBe('olivierluethy');
    expect(config.mirror).toBe(true);
    expect(config.accent).toBe('#7c3aed');
  });
});
