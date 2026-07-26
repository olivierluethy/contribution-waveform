# Contribution Waveform

GitHub contribution history rendered as a continuous waveform instead of a grid
of squares. Regenerated daily by a scheduled Action, served as a self-contained
SVG, and embeddable in a profile README.

<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
  <source media="(prefers-color-scheme: light)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-light.svg">
  <img alt="My GitHub contributions as a waveform"
       src="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
</picture>

## What you are looking at

Four layers. The deviation fill sits behind the two lines so the wave outline
stays crisp:

1. **Baseline band** — the rolling 30-day average. "Normally I do about this much."
2. **Deviation fill** — the area between the daily curve and the 30-day
   baseline. Accent where the day beat its average, muted where it fell short.
3. **7-day average** — a thin smoothed line.
4. **Daily series** — the actual per-day count, smoothed with a Catmull-Rom
   spline converted to cubic Béziers.

Peak markers sit on top: a dot on each of the top N days, with the count
labelled in the margin above the plot.

The wave is mirrored around a centre axis for an audio-waveform look. The
baseline envelope is mirrored too, so the deviation fill keeps its meaning.

The Y axis is scaled to the **98th percentile** of the period rather than the
maximum, so a single 200-commit day cannot flatten the rest of the year.
Anything above is clipped. There are no gridlines and no Y numbers — just a
`max` label in the corner.

## Generated files

| File | Content |
|---|---|
| `wave-year-dark.svg` / `-light` | Trailing 365 days |
| `wave-month-dark.svg` / `-light` | Trailing 31 days |
| `wave-all-dark.svg` / `-light` | Every year, one wave per row |

All six live at `https://olivierluethy.github.io/contribution-waveform/`.

The all-years rows are downsampled to weekly points — at 44px per row, daily
resolution is neither legible nor worth the bytes. The year and month views keep
full daily detail.

## Embedding

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
  <source media="(prefers-color-scheme: light)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-light.svg">
  <img alt="My GitHub contributions as a waveform"
       src="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
</picture>
```

Or the simpler Markdown form, which locks to one theme:

```markdown
![My GitHub contributions as a waveform](https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg)
```

## Use it for your own account

1. Fork this repository.
2. Set `username` in `waveform.config.json` to your GitHub handle.
3. Add a repository secret `GH_PAT` — a classic PAT with the `read:user` scope.
4. Enable Pages with **GitHub Actions** as the source.
5. Run the **Build waveform** workflow once by hand.

Swap `olivierluethy/contribution-waveform` for your own user and repo in every
URL above.

## Caveats

**Private contributions.** They appear only if the `GH_PAT` secret has the
`read:user` scope *and* "Include private contributions on my profile" is enabled
in your GitHub settings. Without both, the wave shows public activity only.

**Camo caching.** GitHub proxies README images through camo and caches them for
a few hours. Your embed updates roughly once a day. This is expected; the tool
does not try to defeat the cache.

**Why this cannot work for arbitrary usernames.** GitHub Pages is static
hosting — there is no server-side code and no request-time SVG generation. A URL
like `.../wave.svg?user=someone` cannot exist, because nothing runs to answer it.
Every embeddable file must be generated ahead of time and committed. So the repo
is configured for exactly one username, and anyone else forks it and sets their
own. A serverless variant (a small function that renders on demand and caches)
would lift that limit, but it is deliberately **not implemented here** — it needs
hosting outside GitHub Pages.

## Configuration

```json
{
  "username": "olivierluethy",
  "timezone": "Europe/Zurich",
  "peakMarkers": 3,
  "mirror": true,
  "accent": "#7c3aed"
}
```

## Development

```bash
npm install
npm test                          # unit, sanitizer and snapshot tests
npm run fetch                     # needs GITHUB_TOKEN
npm run build -- --offline        # rebuild SVGs from data/contributions.json
npm run build -- --no-mirror      # unmirrored variant
npm run build:site                # Vite + Tailwind site into site-dist/
```

`--offline` builds entirely from the committed `data/contributions.json`, so
rendering changes can be tested and diffed without API access.

## How it is built

TypeScript, Node 20+, ESM. No charting library — SVG is emitted as strings and
the curve maths is hand-rolled. The only runtime dependency is `zod`, for config
validation.

```
src/config.ts     zod-validated config
src/fetch.ts      GraphQL v4 client, year-by-year pagination
src/transform.ts  rolling averages, percentile clamp, normalisation
src/curve.ts      Catmull-Rom to cubic Bézier
src/render.ts     SVG string composition
src/themes.ts     dark and light colour tokens
src/cli.ts        fetch / build / --offline / --mirror
```

Generated SVGs contain no `<script>`, no `<foreignObject>`, no external fonts
and no external references of any kind — a sanitizer test enforces this on every
build, because GitHub strips almost everything else from a README.
