import { describe, expect, it, vi } from 'vitest';
import { fetchContributions, yearWindows } from '../src/fetch.js';

describe('yearWindows', () => {
  it('covers one window per calendar year', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows).toHaveLength(3);
  });

  it('starts at the account creation date, not January', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows[0]!.from).toBe('2022-06-15T00:00:00Z');
    expect(windows[0]!.to).toBe('2022-12-31T23:59:59Z');
  });

  it('ends at today, not December', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows[2]!.to).toBe('2024-03-01T23:59:59Z');
  });

  it('never spans more than a year, which the API rejects', () => {
    for (const w of yearWindows('2015-01-01T00:00:00Z', '2024-12-31')) {
      const span = Date.parse(w.to) - Date.parse(w.from);
      expect(span).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
    }
  });

  it('handles an account created today', () => {
    const windows = yearWindows('2024-03-01T09:00:00Z', '2024-03-01');
    expect(windows).toHaveLength(1);
    expect(windows[0]!.from).toBe('2024-03-01T00:00:00Z');
  });
});

function calendarResponse(days: Array<{ date: string; contributionCount: number }>) {
  return {
    data: {
      user: {
        createdAt: '2023-11-01T00:00:00Z',
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: days.reduce((s, d) => s + d.contributionCount, 0),
            weeks: [{ contributionDays: days }],
          },
        },
      },
    },
  };
}

describe('fetchContributions', () => {
  it('merges every year window, de-duplicates and sorts by date', async () => {
    const responses = [
      calendarResponse([{ date: '2023-12-31', contributionCount: 3 }]),
      calendarResponse([
        { date: '2024-01-02', contributionCount: 5 },
        { date: '2023-12-31', contributionCount: 3 },
        { date: '2024-01-01', contributionCount: 1 },
      ]),
    ];
    let call = 0;
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses[call++]!,
    })) as unknown as typeof fetch;

    const result = await fetchContributions('octocat', 'tok', '2024-01-02', fake);

    expect(result.username).toBe('octocat');
    expect(result.days.map((d) => d.date)).toEqual(['2023-12-31', '2024-01-01', '2024-01-02']);
    expect(result.days.map((d) => d.count)).toEqual([3, 1, 5]);
  });

  it('sends the token as a bearer credential', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => calendarResponse([{ date: '2023-12-31', contributionCount: 1 }]),
    })) as unknown as typeof fetch;

    await fetchContributions('octocat', 'secret-token', '2023-12-31', fake);

    const init = (fake as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('throws with the GraphQL message when the API returns errors', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'Bad credentials' }] }),
    })) as unknown as typeof fetch;

    await expect(fetchContributions('octocat', 'tok', '2024-01-01', fake)).rejects.toThrow(
      /Bad credentials/,
    );
  });

  it('throws on a non-2xx response', async () => {
    const fake = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })) as unknown as typeof fetch;

    await expect(fetchContributions('octocat', 'tok', '2024-01-01', fake)).rejects.toThrow(/401/);
  });

  it('throws a clear error when the user does not exist', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { user: null } }),
    })) as unknown as typeof fetch;

    await expect(fetchContributions('nobody', 'tok', '2024-01-01', fake)).rejects.toThrow(
      /nobody/,
    );
  });
});
