import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeries } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from '../src/themes.js';
import { renderAllYears, renderWave } from '../src/render.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

const t = theme('dark', '#7c3aed');

describe('rendering snapshots', () => {
  it('matches the year waveform snapshot', async () => {
    const svg = renderWave({
      series: buildSeries(fixture.days, '2024-01-01', '2024-12-30', 3),
      theme: t,
      username: fixture.username,
      mirror: true,
      geometry: YEAR_GEOMETRY,
      label: 'Trailing year',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-year-dark.svg');
  });

  it('matches the month waveform snapshot', async () => {
    const svg = renderWave({
      series: buildSeries(fixture.days, '2024-11-30', '2024-12-30', 3),
      theme: t,
      username: fixture.username,
      mirror: true,
      geometry: MONTH_GEOMETRY,
      label: 'Trailing month',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-month-dark.svg');
  });

  it('matches the all-years waveform snapshot', async () => {
    const svg = renderAllYears({
      rows: [
        { year: 2023, series: buildSeries(fixture.days, '2023-01-01', '2023-12-31', 0) },
        { year: 2024, series: buildSeries(fixture.days, '2024-01-01', '2024-12-31', 0) },
      ],
      theme: t,
      username: fixture.username,
      mirror: true,
      total: fixture.days.reduce((sum, d) => sum + d.count, 0),
      from: '2023-01-01',
      to: '2024-12-31',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-all-dark.svg');
  });
});
