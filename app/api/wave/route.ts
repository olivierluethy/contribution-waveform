import {
  GitHubError,
  fetchContributions,
  fetchCreatedAt,
  readTokens,
} from '@/lib/github';
import { parseParams, type WaveParams } from '@/lib/params';
import { renderErrorCard } from '@/lib/render/error';
import { renderWaveCard, type YearRow } from '@/lib/render/wave';
import { addDays, buildSeries, downsample, scaleMaxFor } from '@/lib/transform';
import type { ThemeName } from '@/lib/themes';

// The handler is pure `fetch` + string building — no Node APIs — so it runs on
// the edge, where cold starts stay low. That matters: GitHub's camo proxy gives
// up on a slow response and the README then shows a broken image.
export const runtime = 'edge';

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  // Three caches sit downstream: Vercel's CDN (s-maxage), the browser
  // (max-age), and camo, which has its own floor. Half an hour of freshness
  // keeps the API well inside its quota while the README still updates daily.
  'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400',
};

const ERROR_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  // A transient failure must not get pinned in a cache for half an hour.
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

function errorCard(message: string, theme: ThemeName): Response {
  // Always HTTP 200: a 4xx/5xx renders as a broken-image icon in a README,
  // which tells the reader nothing. A card that explains itself is better.
  return new Response(renderErrorCard({ message, theme }), {
    status: 200,
    headers: ERROR_HEADERS,
  });
}

/** Today in UTC. Contribution days arrive pre-bucketed in the viewed user's own timezone; we never re-bucket them. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function messageFor(error: GitHubError, user: string): string {
  switch (error.kind) {
    case 'not-found':
      return `User \`${user}\` not found`;
    case 'rate-limited':
      return 'GitHub API rate limit reached — try again later';
    case 'timeout':
      return 'GitHub is not responding';
    case 'unauthorized':
      return 'This instance is missing a valid GitHub token';
    default:
      return 'Could not reach the GitHub API';
  }
}

async function buildPayload(p: WaveParams, tokens: string[]) {
  const to = today();

  if (p.range === 'all') {
    const createdAt = await fetchCreatedAt(p.user, tokens);
    const from = createdAt.slice(0, 10);
    const data = await fetchContributions(p.user, from, to, tokens);

    const years = [...new Set(data.days.map((d) => Number(d.date.slice(0, 4))))].sort(
      (a, b) => a - b,
    );

    // One y-scale across every row, so the years are comparable to each other
    // rather than each self-normalising to its own busiest week.
    const shared = scaleMaxFor(data.days.map((d) => d.count));

    const rows: YearRow[] = years.map((year) => ({
      year,
      series: downsample(
        buildSeries(data.days, `${year}-01-01`, `${year}-12-31`, 0, {
          baselineWindow: p.baseline || 30,
          scaleMax: shared,
        }),
        7,
      ),
    }));

    const total = data.days.reduce((sum, d) => sum + d.count, 0);
    return {
      rows,
      total,
      from: data.days[0]?.date ?? from,
      to: data.days[data.days.length - 1]?.date ?? to,
    };
  }

  const span = p.range === 'month' ? 30 : 364;
  const windowStart = addDays(to, -span);
  // Fetch the baseline window ahead of the visible range too, so the rolling
  // average is seeded and the left edge does not ramp up from zero.
  const fetchStart = addDays(windowStart, -(p.baseline || 30));

  const data = await fetchContributions(p.user, fetchStart, to, tokens);
  const series = buildSeries(data.days, windowStart, to, p.peaks, {
    baselineWindow: p.baseline || 30,
  });

  return { series, total: series.total, from: series.from, to: series.to };
}

export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  const parsed = parseParams(search);

  if (!parsed.ok) return errorCard(parsed.message, parsed.theme);
  const p = parsed.params;

  const whitelist = readTokens(process.env.WHITELIST);
  if (whitelist.length > 0 && !whitelist.some((u) => u.toLowerCase() === p.user.toLowerCase())) {
    return errorCard('This instance is restricted', p.theme);
  }

  const tokens = readTokens(process.env.TOKEN);

  try {
    const payload = await buildPayload(p, tokens);

    if (p.type === 'json') {
      return new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': SVG_HEADERS['Cache-Control'],
        },
      });
    }

    return new Response(renderWaveCard({ params: p, ...payload }), {
      status: 200,
      headers: SVG_HEADERS,
    });
  } catch (error) {
    // The real error goes to the function log; the reader gets the short version.
    console.error('[wave]', error);
    if (error instanceof GitHubError) return errorCard(messageFor(error, p.user), p.theme);
    return errorCard('Something went wrong rendering this card', p.theme);
  }
}
