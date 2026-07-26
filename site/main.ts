const BASE = import.meta.env.BASE_URL;
const ORIGIN = 'https://olivierluethy.github.io/contribution-waveform/';
const USERNAME = 'olivierluethy';

interface Variant {
  key: 'year' | 'month' | 'all';
  title: string;
  blurb: string;
  alt: string;
}

const VARIANTS: Variant[] = [
  {
    key: 'year',
    title: 'Trailing year',
    blurb: 'The last 365 days. The default embed.',
    alt: 'My GitHub contributions as a waveform',
  },
  {
    key: 'month',
    title: 'Trailing month',
    blurb: 'The last 31 days, in a shorter frame.',
    alt: 'My GitHub contributions this month as a waveform',
  },
  {
    key: 'all',
    title: 'All years',
    blurb: 'Every year on record, one wave per row.',
    alt: 'My GitHub contributions by year as a waveform',
  },
];

let previewTheme: 'dark' | 'light' = 'dark';

function fileFor(key: Variant['key'], theme: 'dark' | 'light'): string {
  return `wave-${key}-${theme}.svg`;
}

function pictureSnippet(v: Variant): string {
  return `<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="${ORIGIN}${fileFor(v.key, 'dark')}">
  <source media="(prefers-color-scheme: light)"
          srcset="${ORIGIN}${fileFor(v.key, 'light')}">
  <img alt="${v.alt}"
       src="${ORIGIN}${fileFor(v.key, 'dark')}">
</picture>`;
}

function markdownSnippet(v: Variant): string {
  return `![${v.alt}](${ORIGIN}${fileFor(v.key, 'dark')})`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPreviews(): void {
  const host = document.querySelector<HTMLElement>('#previews');
  if (!host) return;

  host.innerHTML = VARIANTS.map(
    (v) => `
      <figure>
        <figcaption class="mb-3">
          <span class="text-lg font-medium text-white">${v.title}</span>
          <span class="ml-2 text-sm text-neutral-500">${v.blurb}</span>
        </figcaption>
        <div class="overflow-hidden rounded-lg border border-neutral-800">
          <img class="block w-full" src="${BASE}${fileFor(v.key, previewTheme)}" alt="${v.alt}" />
        </div>
      </figure>`,
  ).join('');
}

function renderSnippets(): void {
  const host = document.querySelector<HTMLElement>('#snippets');
  if (!host) return;

  const blocks = VARIANTS.flatMap((v) => [
    { label: `${v.title} — picture (theme-aware)`, code: pictureSnippet(v) },
    { label: `${v.title} — Markdown (dark only)`, code: markdownSnippet(v) },
  ]);

  host.innerHTML = blocks
    .map(
      (block, i) => `
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60">
        <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <span class="text-sm text-neutral-400">${block.label}</span>
          <button
            data-copy="${i}"
            class="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >Copy</button>
        </div>
        <pre class="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-neutral-300"><code id="snippet-${i}">${escapeHtml(
          block.code,
        )}</code></pre>
      </div>`,
    )
    .join('');

  host.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = button.dataset.copy;
      const code = document.querySelector(`#snippet-${index}`)?.textContent ?? '';
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    });
  });
}

function wireControls(): void {
  const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
  const label = document.querySelector<HTMLElement>('#theme-label');
  toggle?.addEventListener('click', () => {
    previewTheme = previewTheme === 'dark' ? 'light' : 'dark';
    if (label) label.textContent = previewTheme;
    renderPreviews();
  });

  const dialog = document.querySelector<HTMLDialogElement>('#explainer');
  document.querySelector('#how-it-works')?.addEventListener('click', () => dialog?.showModal());
  document.querySelector('#explainer-close')?.addEventListener('click', () => dialog?.close());
}

document.title = `Contribution Waveform — @${USERNAME}`;
renderPreviews();
renderSnippets();
wireControls();
