// Deterministic fixture: a seeded LCG, so the file is reproducible and its
// snapshot is stable. Run once with `node test/fixtures/generate-fixture.mjs`
// and commit the output.
import { writeFileSync } from 'node:fs';

let seed = 20240726;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const days = [];
const start = new Date('2023-01-01T00:00:00Z');
for (let i = 0; i < 730; i++) {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  const weekday = d.getUTCDay();
  const weekendPenalty = weekday === 0 || weekday === 6 ? 0.35 : 1;
  const seasonal = 1 + 0.6 * Math.sin((i / 730) * Math.PI * 4);
  const r = rnd();
  let count = r < 0.18 ? 0 : Math.round(rnd() * 9 * seasonal * weekendPenalty);
  if (i === 400) count = 187; // a single outlier day, to exercise the p98 clamp
  days.push({ date, count });
}

writeFileSync(
  new URL('./contributions.sample.json', import.meta.url),
  `${JSON.stringify({ username: 'octofixture', createdAt: '2023-01-01T00:00:00Z', days }, null, 2)}\n`,
);
console.log(`wrote ${days.length} days`);
