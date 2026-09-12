# Contribution Waveform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Your GitHub contribution history as a **smooth waveform** instead of a grid of
squares. A self-hosted badge service: the SVG is generated on every request, so
it is always current, and it works for any username.

[![GitHub Contribution Waveform](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy)](https://github.com/olivierluethy)

```markdown
[![GitHub Contribution Waveform](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy)](https://github.com/olivierluethy)
```

Try it and build a URL on the [demo site](https://contribution-waveform.vercel.app).

## What the graph shows

Four layers, back to front. The deviation fill sits behind the strokes so the
wave outline stays crisp:

1. **Baseline band** — your rolling `baseline`-day average. The "this is my
   normal level" reference.
2. **Deviation fill** — the area between the daily curve and that baseline,
   `fill_above` where the day beat your average and `fill_below` where it fell
   short. This is what makes an unusually busy week readable at a glance.
3. **7-day rolling average** — a thin smoothed line.
4. **Daily series** — your actual per-day count, smoothed with a Catmull-Rom
   spline. This is the wave.

Peak markers sit on top: a dot on each of the busiest days, counted in the
margin above the plot.

The y-axis is scaled to the **98th percentile** of the period rather than the
maximum, and clipped above it. Without that, one 200-commit day flattens the
whole rest of the year into a straight line.

## Endpoint

```
GET /api/wave?user=<username>
```

`/wave?user=…` works too.

### Options

| Param | Default | Values |
|---|---|---|
| `user` | — | **required.** GitHub username, `^[A-Za-z0-9-]{1,39}$` |
| `range` | `year` | `year` (trailing 365 d), `month` (trailing 31 d), `all` (one stacked wave per year since account creation) |
| `theme` | `dark` | `dark`, `light`, `github-dark`, `github-light`, `radical`, `nord` |
| `mirror` | `false` | `true` mirrors the wave around the centre axis for an audio-waveform look |
| `smoothing` | `0.5` | `0`–`1`, Catmull-Rom tension |
| `baseline` | `30` | rolling-average window in days; `0` removes the band and the deviation fill |
| `peaks` | `3` | labelled peak markers, `0` disables |
| `hide_border` | `false` | `true` / `false` |
| `border_radius` | `6` | number |
| `background` | theme | hex without `#`, a CSS colour name, or a gradient `angle,c1,…,cN` |
| `line` | theme | wave stroke — hex without `#` or CSS colour name |
| `fill_above` | theme | above-average deviation fill |
| `fill_below` | theme | below-average deviation fill |
| `text` | theme | header, footer and label colour |
| `card_width` | `495` | px, min `300` |
| `card_height` | `195` | px, min `120` |
| `disable_animations` | `false` | `true` removes the draw-in animation entirely |
| `locale` | `en` | ISO 639-1, used for month labels and number formatting |
| `type` | `svg` | `svg`, or `json` to get the computed series and stats back |

Explicit colour parameters override the theme. Unknown parameters are ignored
rather than rejected, so a URL that picks up a stray param still renders.

### Examples

```markdown
![](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&mirror=true)
![](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&theme=nord&range=month)
![](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&range=all&card_height=260)
![](https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&background=45,141321,7c3aed&hide_border=true)
```

### Theme-aware embed

`<picture>` renders in a README and adapts to the reader's GitHub theme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&theme=github-dark">
  <source media="(prefers-color-scheme: light)"
          srcset="https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&theme=github-light">
  <img alt="GitHub Contribution Waveform"
       src="https://contribution-waveform.vercel.app/api/wave?user=olivierluethy&theme=github-dark">
</picture>
```

## Self-hosting

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Folivierluethy%2Fcontribution-waveform&env=TOKEN&envDescription=A%20GitHub%20classic%20PAT%20with%20no%20scopes)

1. Fork this repository and deploy it to Vercel. It is one Next.js project —
   the SVG endpoint and the demo site ship together.
2. Set `TOKEN` to a GitHub **classic Personal Access Token with no scopes**.
   Public contribution calendars need no scopes at all; the token exists only
   because the GraphQL v4 API rejects unauthenticated requests.
   Comma-separate several tokens to raise the effective rate limit — each
   carries its own 5,000 requests/hour and the client round-robins between them.
3. Optionally set `WHITELIST` to a comma-separated list of usernames, so a
   public URL cannot burn your quota rendering cards for strangers.

## Caveats

**Private contributions** only appear if the *viewed user* has enabled "Include
private contributions on my profile" in their GitHub settings. There is no way
around that from outside, and this service does not try.

**Caching.** Three caches sit between the function and your README: Vercel's
CDN, the browser, and GitHub's camo image proxy. Cards are served with
`max-age=1800, s-maxage=1800, stale-while-revalidate=86400`, but camo caches on
top of that with its own floor. Expect your badge to update on the order of
hours, not seconds. Cache-busting query strings do not defeat camo — they just
burn API quota.

**Errors render as cards, not status codes.** A 4xx or 5xx makes GitHub show a
broken-image icon, which tells a reader nothing. A failure returns HTTP 200 with
a card that says what went wrong, and `no-store` so it is not pinned in a cache.

## Why an image, and why no interactivity

A GitHub README sanitizes all HTML — no `<script>`, `<iframe>`, `<canvas>`,
`<style>` blocks or event handlers survive. The only element that renders is an
image. So the output is an SVG document served with `image/svg+xml`, and hover
tooltips are impossible in a README no matter how they are implemented. The demo
site is a normal web page, so it has no such limit.

## How it is built

Next.js App Router on Vercel. The SVG endpoint runs on the **edge runtime** — it
is pure `fetch` plus string building, needing no Node APIs — because camo gives
up on a slow response and shows a broken image. No charting library; the SVG is
emitted as strings and the curve maths is hand-rolled.

```
app/page.tsx          demo site
app/api/wave/route.ts edge handler
lib/params.ts         zod schema, defaults, colour and gradient parsing
lib/github.ts         GraphQL client, parallel year windows, token rotation
lib/transform.ts      rolling averages, percentile clamp, downsampling
lib/curve.ts          Catmull-Rom → cubic Bézier
lib/render/card.ts    frame, header, footer, border, gradients
lib/render/wave.ts    the layers above
lib/render/error.ts   error card
lib/themes.ts         the six palettes
```

Everything interpolated into the SVG is XML-escaped — a username is
user-controlled input landing in a document. The generated output contains no
`<script>`, no `<foreignObject>`, no external `href`, no `@import` and no
`http://` reference beyond the mandatory XML namespace identifier.

## Development

```bash
npm install
cp .env.example .env    # add a TOKEN
npm run dev             # http://localhost:3000
npm run typecheck
npm test
```

## License

Released under the [MIT License](LICENSE) © 2026 Olivier Lüthy. You're free to use, modify and distribute this
software, including commercially, as long as the copyright notice and license are included.

## Author

Built by **Olivier Lüthy** — [GitHub](https://github.com/olivierluethy).
