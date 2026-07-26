import type { ContributionDay } from './transform';

const ENDPOINT = 'https://api.github.com/graphql';
const REQUEST_TIMEOUT_MS = 7000;

export type GitHubErrorKind =
  | 'not-found'
  | 'rate-limited'
  | 'timeout'
  | 'unauthorized'
  | 'upstream';

export class GitHubError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

/**
 * `TOKEN` may hold several comma-separated classic PATs. Each carries its own
 * 5,000 req/h GraphQL budget, so rotating between them raises the ceiling
 * without any code change — add a token, redeploy.
 */
let cursor = 0;

export function readTokens(env: string | undefined): string[] {
  return (env ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function nextToken(tokens: string[]): string {
  if (tokens.length === 0) {
    throw new GitHubError('unauthorized', 'TOKEN is not configured on this instance');
  }
  const token = tokens[cursor % tokens.length]!;
  cursor = (cursor + 1) % tokens.length;
  return token;
}

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

const CREATED_AT_QUERY = `query($login: String!) { user(login: $login) { createdAt } }`;

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
  errors?: Array<{ type?: string; message: string }>;
}

async function query(
  body: { query: string; variables: Record<string, string> },
  login: string,
  tokens: string[],
  fetchImpl: typeof fetch,
): Promise<GraphQLUser> {
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${nextToken(tokens)}`,
        'Content-Type': 'application/json',
        'User-Agent': 'contribution-waveform',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    if (cause instanceof GitHubError) throw cause;
    throw new GitHubError('timeout', `GitHub request failed: ${String(cause)}`);
  }

  if (response.status === 401 || response.status === 403) {
    // 403 is what the GraphQL API returns for a secondary rate limit too.
    const kind = response.status === 401 ? 'unauthorized' : 'rate-limited';
    throw new GitHubError(kind, `GitHub returned ${response.status}`);
  }
  if (!response.ok) {
    throw new GitHubError('upstream', `GitHub returned ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResponse;

  if (payload.errors?.length) {
    const messages = payload.errors.map((e) => e.message).join('; ');
    if (payload.errors.some((e) => e.type === 'NOT_FOUND')) {
      throw new GitHubError('not-found', messages);
    }
    if (payload.errors.some((e) => e.type === 'RATE_LIMITED')) {
      throw new GitHubError('rate-limited', messages);
    }
    throw new GitHubError('upstream', messages);
  }

  const user = payload.data?.user ?? null;
  if (!user) throw new GitHubError('not-found', `User "${login}" not found`);
  return user;
}

/**
 * `contributionsCollection` accepts at most a one-year window, so any wider
 * span is split. Chunks are fetched in parallel — an eight-year account is one
 * round trip, not eight sequential ones, which matters because camo gives up
 * on a slow response and the README then shows a broken image.
 */
export function chunkRange(from: string, to: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let start = from;

  while (start <= to) {
    const startDate = new Date(`${start}T00:00:00Z`);
    const limit = new Date(startDate);
    limit.setUTCFullYear(limit.getUTCFullYear() + 1);
    limit.setUTCDate(limit.getUTCDate() - 1);

    const end = limit.toISOString().slice(0, 10);
    const chunkEnd = end < to ? end : to;
    chunks.push({ from: `${start}T00:00:00Z`, to: `${chunkEnd}T23:59:59Z` });

    const next = new Date(`${chunkEnd}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    start = next.toISOString().slice(0, 10);
  }

  return chunks;
}

export interface ContributionData {
  username: string;
  createdAt: string;
  days: ContributionDay[];
}

export async function fetchCreatedAt(
  login: string,
  tokens: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const user = await query({ query: CREATED_AT_QUERY, variables: { login } }, login, tokens, fetchImpl);
  return user.createdAt;
}

export async function fetchContributions(
  login: string,
  from: string,
  to: string,
  tokens: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<ContributionData> {
  const chunks = chunkRange(from, to);

  const users = await Promise.all(
    chunks.map((chunk) =>
      query({ query: CALENDAR_QUERY, variables: { login, ...chunk } }, login, tokens, fetchImpl),
    ),
  );

  const byDate = new Map<string, number>();
  for (const [i, user] of users.entries()) {
    const calendar = user.contributionsCollection?.contributionCalendar;
    if (!calendar || !Array.isArray(calendar.weeks)) {
      // A missing collection would otherwise read as "zero contributions" and
      // silently render a blank wave. Fail loudly instead.
      throw new GitHubError(
        'upstream',
        `Malformed contributionsCollection for window ${chunks[i]!.from}..${chunks[i]!.to}`,
      );
    }
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        byDate.set(day.date, day.contributionCount);
      }
    }
  }

  const days: ContributionDay[] = [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { username: login, createdAt: users[0]?.createdAt ?? `${from}T00:00:00Z`, days };
}
