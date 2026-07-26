import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeries } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from '../src/themes.js';
import { renderAllYears, renderWave } from '../src/render.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

const empty = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.empty.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

/** Every SVG this project can produce, across both themes and both data shapes. */
function allSvgs(): Array<{ name: string; svg: string }> {
  const out: Array<{ name: string; svg: string }> = [];

  for (const themeName of ['dark', 'light'] as const) {
    const t = theme(themeName, '#7c3aed');
    for (const source of [
      { tag: 'sample', data: fixture },
      { tag: 'empty', data: empty },
    ]) {
      const year = buildSeries(source.data.days, '2024-01-01', '2024-12-30', 3);
      const month = buildSeries(source.data.days, '2024-11-30', '2024-12-30', 3);
      const y2023 = buildSeries(source.data.days, '2023-01-01', '2023-12-31', 0);
      const y2024 = buildSeries(source.data.days, '2024-01-01', '2024-12-31', 0);

      for (const mirror of [true, false]) {
        const suffix = `${themeName}-${source.tag}-${mirror ? 'mirror' : 'flat'}`;
        out.push({
          name: `year-${suffix}`,
          svg: renderWave({
            series: year, theme: t, username: source.data.username, mirror,
            geometry: YEAR_GEOMETRY, label: 'Trailing year',
          }),
        });
        out.push({
          name: `month-${suffix}`,
          svg: renderWave({
            series: month, theme: t, username: source.data.username, mirror,
            geometry: MONTH_GEOMETRY, label: 'Trailing month',
          }),
        });
        out.push({
          name: `all-${suffix}`,
          svg: renderAllYears({
            rows: [{ year: 2023, series: y2023 }, { year: 2024, series: y2024 }],
            theme: t, username: source.data.username, mirror,
            total: year.total, from: '2023-01-01', to: '2024-12-31',
          }),
        });
      }
    }
  }
  return out;
}

/**
 * Structural well-formedness check, without a real XML parser (none is in the
 * dependency budget). For every `<...>` tag found in the document, strip the
 * tag name and then repeatedly strip well-formed `name="value"` attribute
 * pairs off the front of what remains. If the tag was well-formed, nothing is
 * left but the closing `>` (optionally preceded by `/` for a self-closing
 * tag). If an attribute value contained an unescaped `"`, the strip regex
 * stops at that inner quote and a non-whitespace fragment of the "value"
 * survives to the end — which this function reports as malformed.
 *
 * This only works because no attribute value in this renderer ever contains
 * a literal `<` or `>` (audited: colors are hex, coordinates are numbers,
 * ids/anchors are internal enums, and free text goes through `escapeXml`) —
 * so `<[^>]+>` reliably finds true tag boundaries even when a tag's own
 * attributes are broken.
 */
function findMalformedTags(svg: string): string[] {
  const tags = svg.match(/<[^>]+>/g) ?? [];
  const malformed: string[] = [];

  for (const tag of tags) {
    // A closing tag (`</text>`) never carries attributes.
    if (/^<\/[a-zA-Z][\w-]*>$/.test(tag)) continue;

    const nameMatch = tag.match(/^<([a-zA-Z][\w:-]*)/);
    if (!nameMatch) {
      malformed.push(tag);
      continue;
    }

    let rest = tag.slice(nameMatch[0].length);
    let previous: string;
    do {
      previous = rest;
      rest = rest.replace(/^\s+[a-zA-Z_:][-\w:.]*="[^"]*"/, '');
    } while (rest !== previous);

    if (!/^\s*\/?>$/.test(rest)) {
      malformed.push(`${tag} -> leftover after stripping attributes: ${JSON.stringify(rest)}`);
    }
  }

  return malformed;
}

describe('generated SVGs are well-formed XML', () => {
  const svgs = allSvgs();

  it.each(svgs)('$name has no tag left malformed by an unescaped attribute quote', ({ svg }) => {
    expect(findMalformedTags(svg)).toEqual([]);
  });
});

describe('generated SVGs are self-contained and safe for a README', () => {
  const svgs = allSvgs();

  it('produces the expected number of variants', () => {
    expect(svgs).toHaveLength(24);
  });

  it.each(svgs)('$name contains no <script>', ({ svg }) => {
    expect(svg).not.toMatch(/<script/i);
  });

  it.each(svgs)('$name contains no <foreignObject>', ({ svg }) => {
    expect(svg).not.toMatch(/<foreignObject/i);
  });

  it.each(svgs)('$name contains no @import', ({ svg }) => {
    expect(svg).not.toMatch(/@import/i);
  });

  it.each(svgs)('$name references no origin but the SVG namespace', ({ svg }) => {
    // `http://www.w3.org/2000/svg` is the XML namespace *identifier*, which is
    // mandatory on the root element and is never fetched. It is the one and
    // only permitted URL-shaped string; anything else is an external reference.
    const matches = [...svg.matchAll(/https?:\/\/[^"'\s)]+/gi)].map((m) => m[0]);
    expect(matches).toEqual(['http://www.w3.org/2000/svg']);
  });

  it.each(svgs)('$name uses no xlink:href', ({ svg }) => {
    expect(svg).not.toMatch(/xlink:href/i);
  });

  it.each(svgs)('$name has no on* event handler attribute', ({ svg }) => {
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it.each(svgs)('$name has no NaN, Infinity or undefined anywhere', ({ svg }) => {
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it.each(svgs)('$name has no non-finite value in any path d attribute', ({ svg }) => {
    for (const match of svg.matchAll(/ d="([^"]*)"/g)) {
      expect(match[1]).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it.each(svgs)('$name sets no width or height on the root element', ({ svg }) => {
    const root = svg.slice(0, svg.indexOf('>'));
    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);
  });

  it.each(svgs)('$name has balanced svg tags', ({ svg }) => {
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
    expect((svg.match(/<\/svg>/g) ?? []).length).toBe(1);
  });
});
