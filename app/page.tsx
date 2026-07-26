'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_NAMES } from '@/lib/themes';

type Range = 'year' | 'month' | 'all';

interface Options {
  user: string;
  range: Range;
  theme: string;
  mirror: boolean;
  smoothing: number;
  baseline: number;
  peaks: number;
  hide_border: boolean;
  border_radius: number;
  card_width: number;
  card_height: number;
  disable_animations: boolean;
  locale: string;
  background: string;
  line: string;
  fill_above: string;
  fill_below: string;
  text: string;
}

const DEFAULTS: Options = {
  user: 'olivierluethy',
  range: 'year',
  theme: 'dark',
  mirror: false,
  smoothing: 0.5,
  baseline: 30,
  peaks: 3,
  hide_border: false,
  border_radius: 6,
  card_width: 495,
  card_height: 195,
  disable_animations: false,
  locale: 'en',
  background: '',
  line: '',
  fill_above: '',
  fill_below: '',
  text: '',
};

/** Only non-default values reach the URL, so the snippet stays short. */
function buildQuery(o: Options): string {
  const params = new URLSearchParams();
  params.set('user', o.user || 'octocat');
  for (const [key, value] of Object.entries(o) as [keyof Options, unknown][]) {
    if (key === 'user') continue;
    if (value === '' || value === DEFAULTS[key]) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500';

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-0 text-neutral-200 backdrop:bg-black/70"
    >
      <div className="p-6">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <div className="mt-4 space-y-3 text-sm text-neutral-400">{children}</div>
        <button
          onClick={onClose}
          className="mt-6 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
        >
          Close
        </button>
      </div>
    </dialog>
  );
}

function Snippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
        <span className="text-sm text-neutral-400">{label}</span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-white"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-neutral-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Page() {
  const [o, setO] = useState<Options>(DEFAULTS);
  const [debounced, setDebounced] = useState<string>(buildQuery(DEFAULTS));
  const [modal, setModal] = useState<'self-host' | 'calculated' | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);

  const query = useMemo(() => buildQuery(o), [o]);

  // The preview is a real request to the endpoint, so keystrokes must not each
  // become an API call.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(id);
  }, [query]);

  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setO((prev) => ({ ...prev, [key]: value }));

  const host = origin || 'https://contribution-waveform.vercel.app';
  const url = `${host}/api/wave?${debounced}`;
  const darkUrl = `${host}/api/wave?${buildQuery({ ...o, theme: 'dark' })}`;
  const lightUrl = `${host}/api/wave?${buildQuery({ ...o, theme: 'light' })}`;
  const user = o.user || 'octocat';

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Contribution Waveform</h1>
        <p className="mt-3 max-w-2xl text-neutral-400">
          Your GitHub contribution history as a smooth waveform instead of a grid of squares.
          Generated on every request, so it is always current — drop one line of Markdown into
          your profile README.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => setModal('self-host')}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            Self-host this
          </button>
          <button
            onClick={() => setModal('calculated')}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            How it&apos;s calculated
          </button>
        </div>
      </header>

      <section className="mb-10">
        {/* A plain <img> — exactly what a README gets, so the preview cannot
            accidentally be more capable than the real embed. */}
        <img
          src={url}
          alt={`Contribution waveform for ${user}`}
          className="w-full max-w-full rounded-lg"
        />
      </section>

      <section className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="user">
          <input
            className={inputClass}
            value={o.user}
            onChange={(e) => set('user', e.target.value)}
            placeholder="octocat"
          />
        </Field>

        <Field label="range">
          <select
            className={inputClass}
            value={o.range}
            onChange={(e) => set('range', e.target.value as Range)}
          >
            <option value="year">year</option>
            <option value="month">month</option>
            <option value="all">all</option>
          </select>
        </Field>

        <Field label="theme">
          <select
            className={inputClass}
            value={o.theme}
            onChange={(e) => set('theme', e.target.value)}
          >
            {THEME_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`smoothing — ${o.smoothing}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={o.smoothing}
            onChange={(e) => set('smoothing', Number(e.target.value))}
          />
        </Field>

        <Field label={`baseline — ${o.baseline} days`}>
          <input
            type="range"
            min={0}
            max={90}
            value={o.baseline}
            onChange={(e) => set('baseline', Number(e.target.value))}
          />
        </Field>

        <Field label={`peaks — ${o.peaks}`}>
          <input
            type="range"
            min={0}
            max={10}
            value={o.peaks}
            onChange={(e) => set('peaks', Number(e.target.value))}
          />
        </Field>

        <Field label="card_width">
          <input
            type="number"
            min={300}
            className={inputClass}
            value={o.card_width}
            onChange={(e) => set('card_width', Number(e.target.value))}
          />
        </Field>

        <Field label="card_height">
          <input
            type="number"
            min={120}
            className={inputClass}
            value={o.card_height}
            onChange={(e) => set('card_height', Number(e.target.value))}
          />
        </Field>

        <Field label="border_radius">
          <input
            type="number"
            min={0}
            max={50}
            className={inputClass}
            value={o.border_radius}
            onChange={(e) => set('border_radius', Number(e.target.value))}
          />
        </Field>

        <Field label="locale">
          <input
            className={inputClass}
            value={o.locale}
            onChange={(e) => set('locale', e.target.value)}
            placeholder="en"
          />
        </Field>

        {(
          [
            ['background', 'background'],
            ['line', 'line'],
            ['fill_above', 'fill_above'],
            ['fill_below', 'fill_below'],
            ['text', 'text'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              className={inputClass}
              value={o[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder="theme default — hex without #"
            />
          </Field>
        ))}

        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
          {(
            [
              ['mirror', 'Mirror the wave around the centre axis'],
              ['hide_border', 'Hide the card border'],
              ['disable_animations', 'Disable the draw-in animation'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={o[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-white">Embed it</h2>
        <Snippet
          label="Markdown"
          code={`[![GitHub Contribution Waveform](${url})](https://github.com/${user})`}
        />
        <Snippet label="HTML" code={`<img src="${url}" alt="GitHub Contribution Waveform" />`} />
        <Snippet
          label="HTML — adapts to the reader's GitHub theme"
          code={`<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${darkUrl}">
  <source media="(prefers-color-scheme: light)" srcset="${lightUrl}">
  <img alt="GitHub Contribution Waveform" src="${darkUrl}">
</picture>`}
        />
      </section>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
        Cards are cached for 30 minutes at the edge, and GitHub&apos;s camo proxy caches them
        again on top of that — expect a README embed to update on the order of hours.
      </footer>

      <Modal open={modal === 'self-host'} onClose={() => setModal(null)} title="Self-host this">
        <p>
          Fork the repository and deploy it to Vercel. It is a single Next.js project — the SVG
          endpoint and this page ship together.
        </p>
        <p>
          Set <code className="text-neutral-300">TOKEN</code> to a GitHub classic Personal Access
          Token with <strong>no scopes</strong>; public contribution calendars need none. You can
          comma-separate several tokens to raise the effective rate limit.
        </p>
        <p>
          Optionally set <code className="text-neutral-300">WHITELIST</code> to a comma-separated
          list of usernames, so a public URL cannot burn your quota on strangers.
        </p>
      </Modal>

      <Modal
        open={modal === 'calculated'}
        onClose={() => setModal(null)}
        title="How it's calculated"
      >
        <p>
          The soft band is your rolling {o.baseline}-day average. The thin line is a 7-day
          average. The wave is your actual daily count, smoothed with a Catmull-Rom spline. The
          accent fill marks days above your rolling average, the muted fill days below it.
        </p>
        <p>
          The y-axis is scaled to the 98th percentile of the period rather than the maximum, so a
          single 200-commit day cannot flatten the rest of the year into a straight line.
        </p>
        <p>
          <strong className="text-neutral-300">Private contributions</strong> only appear if the
          viewed user has enabled &ldquo;Include private contributions on my profile&rdquo; in
          their GitHub settings. There is no way around that from outside.
        </p>
        <p>
          <strong className="text-neutral-300">Caching:</strong> GitHub proxies README images
          through camo, which caches independently of our headers. Your badge updates on the
          order of hours, not seconds.
        </p>
      </Modal>
    </main>
  );
}
