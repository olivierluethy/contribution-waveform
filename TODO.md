# What's still left

Status as of the initial public push (`04727b7`, 25 commits, repo live at
<https://github.com/olivierluethy/contribution-waveform>).

The service is **built and running locally** — typecheck clean, `next build`
clean, 52 tests passing, endpoint verified responding with correct headers and
error cards. What follows is everything that is *not* done.

---

## 1. Deployment — blocked on you

Nothing here can be done from this machine; all of it needs your Vercel and
GitHub accounts.

- [ ] Import the repo at <https://vercel.com/new>. Next.js is auto-detected; no
      build configuration needed.
- [ ] Set `TOKEN` in **Project Settings → Environment Variables**: a GitHub
      classic Personal Access Token with **no scopes ticked**. Public
      contribution calendars require none — the token exists only because the
      GraphQL v4 API rejects anonymous requests.
- [ ] **Redeploy after adding the variable.** Vercel does not retroactively
      apply env vars to an existing build. Until this is done, every request
      renders the *"This instance is missing a valid GitHub token"* card. That
      is the error path working correctly, not a failure.
- [ ] Optionally set `WHITELIST=olivierluethy` once the URL is public, so
      strangers cannot burn your rate limit.
- [ ] If Vercel assigns a domain other than `contribution-waveform.vercel.app`
      (the name may be taken), update the hardcoded host in:
      - `README.md` — the live embed, all example URLs, the `<picture>` block
      - `app/page.tsx` — the `host` fallback constant only; the demo site reads
        the real origin at runtime, so the page itself will be correct either way

---

## 2. Verification I could not run

These are §10.5 and §10.6 of the spec. They are the tests that prove the
delivery chain actually works, and neither can be faked locally.

- [ ] **§10.5** — On the Vercel preview URL, open the endpoint for
      `range=year`, `range=month` and `range=all`. Confirm the wave is legible
      at 495 px and at 900 px, and that the response headers match §5:
      ```
      Content-Type: image/svg+xml; charset=utf-8
      Cache-Control: public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400
      ```
- [ ] **§10.6** — Paste the generated Markdown snippet into a scratch repo's
      README on GitHub and confirm it renders through camo. **This is the only
      test that exercises the whole chain end to end.** Everything upstream of
      it is verified; this step is not.

What *has* been visually verified: cards rendered headlessly and inspected
across all six themes, `mirror` on and off, `baseline=0`, `range=all`, gradient
backgrounds, and the error card. Two layout bugs were found and fixed that way
(month ticks colliding with the footer; `/wave` 404ing locally).

---

## 3. Test suite — deliberately skipped

You asked twice to skip testing and handle it yourself, so §10.1–§10.4 are
largely unwritten. Recording precisely what exists and what does not, so the
gap is visible rather than assumed covered.

**Exists — 52 tests, carried over from the previous implementation:**

| File | Tests | Covers |
|---|---|---|
| `test/curve.test.ts` | 12 | Catmull-Rom → Bézier against fixtures, endpoint duplication, non-finite input |
| `test/transform.test.ts` | 40 | rolling averages, percentile clamp, peak selection, downsampling, empty/all-zero edges |

**No coverage at all:**

- `lib/params.ts` — zod parsing, colour parsing, gradient parsing, the CSS
  name allowlist, malformed input (**§10.1 explicitly asks for this**)
- `lib/github.ts` — year chunking, token rotation, dedup, the five error kinds
- `lib/render/card.ts` — **including `escapeXml`. §10.1 explicitly asks for a
  hostile-username escaping test.** This matters more than it looks: the
  previous implementation shipped a bug where an unescaped quote in the font
  stack made *every* SVG malformed, and 348 passing tests did not catch it
  because none parsed the output as XML.
- `lib/render/wave.ts`, `lib/render/error.ts`, `lib/themes.ts`
- `app/api/wave/route.ts`

**Specific §10 items not implemented:**

- [ ] **§10.1** — zod parameter parsing tests, including malformed input
- [ ] **§10.1** — SVG escaping test with a hostile username
- [ ] **§10.2** — sanitizer test failing the build on forbidden constructs from
      §9.3 (`<script>`, `<foreignObject>`, external `href`/`xlink:href`,
      `@import`, `http://`). The old implementation had one across 24 variants;
      it was deleted in the pivot because it targeted the old renderer's API.
      **The output is believed clean — this is unenforced, not known-broken.**
- [ ] **§10.3** — snapshot tests per theme and per `range` from `test/fixtures/`
- [ ] **§10.4** — assert `type=json` output matches the series used to draw the SVG

`test/fixtures/contributions.sample.json` (730 deterministic days from a seeded
generator) and `contributions.empty.json` are both still present and usable.

---

## 4. Spec items not implemented

- [ ] **§9.1 — `textLength` / `lengthAdjust`.** The spec calls for these where
      exact text width matters, since text metrics differ per viewer OS. Not
      used anywhere. Current text uses generous padding instead, which works in
      the renders checked but is not the guarantee the spec asked for. Most
      likely to bite on the header (`@username`, 16 px) and the footer on a
      narrow `card_width`.
- [ ] **§7 — colour pickers.** The demo site exposes `background`, `line`,
      `fill_above`, `fill_below` and `text` as plain text inputs, not
      `<input type="color">`. Functional, but not what §7 specified.

---

## 5. Code paths never exercised

Not known-broken — just never run, because they need a token, a live
deployment, or conditions that cannot be reproduced locally.

- `type=json` — the branch is written but has never returned JSON. Every local
  attempt hit the missing-token error card first (correct behaviour, since
  errors are always cards). **Verify this first after deploying.**
- `range=all` against a real multi-year account. Tested only against the
  2-year fixture. Worth checking that an 8-year account is legible at the
  default `card_height=195` — it may need `&card_height=400`. There is no
  auto-grow; the height is exactly what you ask for.
- **Token rotation** with more than one token in `TOKEN`.
- **Timeout path** — `AbortSignal.timeout(7000)` in `lib/github.ts`. Should work
  on the edge runtime but has never fired.
- **Rate-limit and not-found error cards** — the mapping in `messageFor()` is
  written against GitHub's documented error `type` values but has not seen a
  real 403 or `NOT_FOUND` response.
- **Non-`en` locales** — `Intl` month labels and number formatting are wired up
  with an `en` fallback, but no non-English render has been looked at.

---

## 6. Known deviations from the spec

Both deliberate; flagging so they are not mistaken for oversights.

1. **The `/wave` alias lives in `next.config.mjs`, not `vercel.json`.** §2 asked
   for a `vercel.json` rewrite. Platform rewrites are applied by Vercel *before*
   Next.js and never run under `next dev`, so the alias would have worked in
   production while 404ing locally — making every local check misleading. Vercel
   honours `next.config` rewrites identically. `vercel.json` remains, holding
   only the framework declaration.

2. **`range=all` shares one y-scale across every year row** (this is what §3
   asks for). The consequence worth knowing: `downsample` rescales per row, so a
   genuinely quiet year renders as genuinely flat rather than self-normalising
   to look busy. That is correct behaviour but reads as a bug if unexpected.

---

## 7. Judgement calls worth revisiting once you see real data

- **Wave density at `range=year`.** 365 daily points across ~445 px is dense.
  All renders so far use synthetic high-variance fixture data, which is the
  worst case — real contribution history has streaks and quiet weekends and
  should read considerably cleaner. If it still looks like noise on your own
  data, the levers are `&mirror=false`, a higher `&smoothing=`, or a wider
  `&card_width=`.
- **`baseline=0`** removes the band *and* the deviation fill together, since the
  fill is defined relative to the baseline. That is the only coherent reading of
  the spec, but it means `baseline=0` is a bigger visual change than the
  parameter name suggests.
- **Peak label placement.** Labels sit in the margin above the plot, because a
  peak day pins to the percentile ceiling and a label near the dot lands in the
  densest part of the wave. On a short `card_height`, that margin is tight.
