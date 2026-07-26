import type { ContributionDay } from './transform.js';

const ENDPOINT = 'https://api.github.com/graphql';

// One query serves both purposes: it carries `createdAt`, so the first call
// doubles as the bootstrap that tells us how far back to page.
const CALENDAR_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    createdAt
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

export interface ContributionData {
  username: string;
  createdAt: string;
  days: ContributionDay[];
}

/**
 * `contributionsCollection` accepts at most a one-year window, so history is
 * fetched calendar year by calendar year, clipped to the account creation date
 * at the start and to today at the end.
 */
export function yearWindows(
  createdAt: string,
  today: string,
): Array<{ from: string; to: string }> {
  const createdDate = createdAt.slice(0, 10);
  const firstYear = Number(createdDate.slice(0, 4));
  const lastYear = Number(today.slice(0, 4));

  const windows: Array<{ from: string; to: string }> = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? createdDate : `${year}-01-01`;
    const to = year === lastYear ? today : `${year}-12-31`;
    if (from > to) continue;
    windows.push({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` });
  }
  return windows;
}

interface GraphQLUser {
  createdAt: string;
  contributionsCollection?: {
    contributionCalendar: {
      totalContributions: number;
      weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>;
    };
  };
}

interface GraphQLResponse {
  data?: { user: GraphQLUser | null };
  errors?: Array<{ message: string }>;
}

async function query(
  body: { query: string; variables: Record<string, string> },
  token: string,
  login: string,
  fetchImpl: typeof fetch,
): Promise<GraphQLUser> {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contribution-waveform',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as GraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(`GitHub API error: ${payload.errors.map((e) => e.message).join('; ')}`);
  }
  const user = payload.data?.user ?? null;
  if (!user) throw new Error(`GitHub user "${login}" not found, or the token cannot see them`);
  return user;
}

export async function fetchContributions(
  login: string,
  token: string,
  today: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ContributionData> {
  // The first calendar request also carries createdAt, so bootstrap with a
  // one-year window ending today and widen from whatever it reports.
  const firstWindow = { from: `${today.slice(0, 4)}-01-01T00:00:00Z`, to: `${today}T23:59:59Z` };
  const bootstrap = await query(
    { query: CALENDAR_QUERY, variables: { login, ...firstWindow } },
    token,
    login,
    fetchImpl,
  );

  const createdAt = bootstrap.createdAt;
  const byDate = new Map<string, number>();

  // A missing/malformed `contributionsCollection` means the response shape
  // didn't match what the query asked for. That should never happen against
  // GitHub's real schema, but silently treating it as "zero contributions"
  // would let a blank waveform get committed over real history, so it's
  // better to fail loudly and name the window that produced the bad response.
  const absorb = (user: GraphQLUser, window: { from: string; to: string }): void => {
    const calendar = user.contributionsCollection?.contributionCalendar;
    if (!calendar || !Array.isArray(calendar.weeks)) {
      throw new Error(
        `GitHub API response for window ${window.from} to ${window.to} is missing contributionsCollection data`,
      );
    }
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        byDate.set(day.date, day.contributionCount);
      }
    }
  };

  absorb(bootstrap, firstWindow);

  for (const window of yearWindows(createdAt, today)) {
    // `firstWindow` and `window` are ISO-8601 UTC timestamps ("YYYY-MM-DDTHH:mm:ssZ"),
    // which sort lexically the same as chronologically, so plain string
    // comparison correctly tests whether `window` is fully covered by the
    // bootstrap window (not just equal to it, which misses same-year accounts
    // whose single window starts mid-year rather than on January 1).
    if (window.from >= firstWindow.from && window.to <= firstWindow.to) continue;
    absorb(
      await query(
        { query: CALENDAR_QUERY, variables: { login, ...window } },
        token,
        login,
        fetchImpl,
      ),
      window,
    );
  }

  const days: ContributionDay[] = [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Deliberately no `fetchedAt` field: a timestamp would make the cache file
  // differ on every run and defeat the Action's "commit only when changed" check.
  return { username: login, createdAt, days };
}
