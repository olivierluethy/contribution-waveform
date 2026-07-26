import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAll, parseArgs } from '../src/cli.js';
import type { ContributionData } from '../src/fetch.js';

describe('parseArgs', () => {
  it('defaults to a build with no overrides', () => {
    const args = parseArgs(['build']);
    expect(args.command).toBe('build');
    expect(args.offline).toBe(false);
    expect(args.mirror).toBeUndefined();
    expect(args.out).toBe('dist');
  });

  it('reads the fetch command', () => {
    expect(parseArgs(['fetch']).command).toBe('fetch');
  });

  it('reads --offline', () => {
    expect(parseArgs(['build', '--offline']).offline).toBe(true);
  });

  it('reads --mirror and --no-mirror as an override', () => {
    expect(parseArgs(['build', '--mirror']).mirror).toBe(true);
    expect(parseArgs(['build', '--no-mirror']).mirror).toBe(false);
  });

  it('reads --out and --today', () => {
    const args = parseArgs(['build', '--out', 'tmp', '--today', '2024-12-30']);
    expect(args.out).toBe('tmp');
    expect(args.today).toBe('2024-12-30');
  });

  it('rejects an unknown command', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/frobnicate/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['build', '--wat'])).toThrow(/--wat/);
  });
});

describe('buildAll', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
  ) as ContributionData;

  const config = {
    username: 'octofixture',
    timezone: 'Europe/Zurich',
    peakMarkers: 3,
    mirror: true,
    accent: '#7c3aed',
  };

  it('writes exactly the six specced files', async () => {
    const out = 'test/.tmp-dist';
    rmSync(out, { recursive: true, force: true });

    const written = await buildAll(fixture, config, '2024-12-30', out);

    expect(readdirSync(out).sort()).toEqual([
      'wave-all-dark.svg',
      'wave-all-light.svg',
      'wave-month-dark.svg',
      'wave-month-light.svg',
      'wave-year-dark.svg',
      'wave-year-light.svg',
    ]);
    expect(written).toHaveLength(6);

    const year = readFileSync(`${out}/wave-year-dark.svg`, 'utf8');
    expect(year).toContain('viewBox="0 0 880 220"');
    expect(year).toContain('@octofixture');
    expect(year).not.toMatch(/NaN|Infinity|undefined/);

    const month = readFileSync(`${out}/wave-month-dark.svg`, 'utf8');
    expect(month).toContain('viewBox="0 0 880 160"');

    // The fixture spans 2023 and 2024, so the all-years file gets two rows.
    const all = readFileSync(`${out}/wave-all-dark.svg`, 'utf8');
    expect(all).toContain('>2023<');
    expect(all).toContain('>2024<');

    rmSync(out, { recursive: true, force: true });
  });

  it('produces different bytes for dark and light', async () => {
    const out = 'test/.tmp-dist2';
    rmSync(out, { recursive: true, force: true });
    await buildAll(fixture, config, '2024-12-30', out);
    expect(readFileSync(`${out}/wave-year-dark.svg`, 'utf8')).not.toBe(
      readFileSync(`${out}/wave-year-light.svg`, 'utf8'),
    );
    rmSync(out, { recursive: true, force: true });
  });

  it('builds a zero-contribution user without throwing', async () => {
    const out = 'test/.tmp-dist3';
    rmSync(out, { recursive: true, force: true });
    const empty: ContributionData = {
      username: 'emptyuser',
      createdAt: '2024-01-01T00:00:00Z',
      days: [],
    };
    await buildAll(empty, { ...config, username: 'emptyuser' }, '2024-12-30', out);
    const year = readFileSync(`${out}/wave-year-dark.svg`, 'utf8');
    expect(year).toContain('0 contributions');
    expect(year).not.toMatch(/NaN|Infinity|undefined/);
    rmSync(out, { recursive: true, force: true });
  });
});
