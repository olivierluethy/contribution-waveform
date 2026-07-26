import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { fetchContributions } from './fetch.js';
import type { ContributionData } from './fetch.js';
import { renderAllYears, renderWave } from './render.js';
import type { YearRow } from './render.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from './themes.js';
import { addDays, buildSeries, downsample, todayIn } from './transform.js';

const CACHE_PATH = 'data/contributions.json';

export interface CliArgs {
  command: 'fetch' | 'build';
  offline: boolean;
  /** Undefined means "use the config value". */
  mirror: boolean | undefined;
  out: string;
  /** Overrides "today", for reproducible builds in tests. */
  today: string | undefined;
}

export function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== 'fetch' && command !== 'build') {
    throw new Error(`unknown command "${command ?? ''}" — expected "fetch" or "build"`);
  }

  const args: CliArgs = {
    command,
    offline: false,
    mirror: undefined,
    out: 'dist',
    today: undefined,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    switch (flag) {
      case '--offline':
        args.offline = true;
        break;
      case '--mirror':
        args.mirror = true;
        break;
      case '--no-mirror':
        args.mirror = false;
        break;
      case '--out':
        args.out = rest[++i] ?? 'dist';
        break;
      case '--today':
        args.today = rest[++i];
        break;
      default:
        throw new Error(`unknown flag "${flag}"`);
    }
  }
  return args;
}

/** Distinct calendar years present in the data, ascending. */
function yearsIn(data: ContributionData): number[] {
  const years = new Set<number>();
  for (const day of data.days) years.add(Number(day.date.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

export async function buildAll(
  data: ContributionData,
  config: Config,
  today: string,
  outDir: string,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const { username, mirror, accent, peakMarkers } = config;
  const yearSeries = buildSeries(data.days, addDays(today, -364), today, peakMarkers);
  const monthSeries = buildSeries(data.days, addDays(today, -30), today, peakMarkers);

  // The all-years view is one 44px-tall, ~828px-wide row per year — roughly
  // 2.3px per daily point, which is visual mush as well as unnecessary file
  // weight. Downsample to weekly points; the year and month views above keep
  // full daily resolution since the year view is the primary embed.
  const rows: YearRow[] = yearsIn(data).map((year) => ({
    year,
    series: downsample(buildSeries(data.days, `${year}-01-01`, `${year}-12-31`, 0), 7),
  }));
  const allTotal = data.days.reduce((sum, d) => sum + d.count, 0);
  const allFrom = data.days[0]?.date ?? today;
  const allTo = data.days[data.days.length - 1]?.date ?? today;

  const written: string[] = [];

  for (const themeName of ['dark', 'light'] as const) {
    const t = theme(themeName, accent);

    const files: Array<[string, string]> = [
      [
        `wave-year-${themeName}.svg`,
        renderWave({
          series: yearSeries, theme: t, username, mirror,
          geometry: YEAR_GEOMETRY, label: 'Trailing year',
        }),
      ],
      [
        `wave-month-${themeName}.svg`,
        renderWave({
          series: monthSeries, theme: t, username, mirror,
          geometry: MONTH_GEOMETRY, label: 'Trailing month',
        }),
      ],
      [
        `wave-all-${themeName}.svg`,
        renderAllYears({
          rows, theme: t, username, mirror,
          total: allTotal, from: allFrom, to: allTo,
        }),
      ],
    ];

    for (const [name, svg] of files) {
      const path = `${outDir}/${name}`;
      await writeFile(path, `${svg}\n`, 'utf8');
      written.push(path);
    }
  }

  return written;
}

async function readCache(): Promise<ContributionData | null> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8')) as ContributionData;
  } catch {
    return null;
  }
}

async function writeCache(data: ContributionData): Promise<void> {
  await mkdir('data', { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const today = args.today ?? todayIn(config.timezone, new Date());
  const effective: Config = { ...config, mirror: args.mirror ?? config.mirror };

  if (args.command === 'fetch') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set — cannot fetch');
    const data = await fetchContributions(config.username, token, today);
    await writeCache(data);
    console.log(`fetched ${data.days.length} days for @${data.username} through ${today}`);
    return;
  }

  let data = await readCache();
  if (!data) {
    if (args.offline) {
      throw new Error(`--offline was set but ${CACHE_PATH} is missing — run "npm run fetch" first`);
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error(`${CACHE_PATH} is missing and GITHUB_TOKEN is not set`);
    data = await fetchContributions(config.username, token, today);
    await writeCache(data);
  }

  const written = await buildAll(data, effective, today, args.out);
  console.log(`wrote ${written.length} files to ${args.out}/`);
  for (const path of written) console.log(`  ${path}`);
}

// Only run when executed directly, so tests can import buildAll and parseArgs.
if (process.argv[1]?.endsWith('cli.js')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
