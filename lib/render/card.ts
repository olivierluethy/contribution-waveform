import type { Background } from '../params';
import { FONT_STACK } from '../themes';

/**
 * A username is user-controlled input landing in an XML document. Everything
 * interpolated into the output goes through here — including the font stack,
 * which contains literal double quotes around "Segoe UI" and would otherwise
 * terminate the attribute it sits in and break the whole document.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * One-shot draw-in. The base rules are the FINISHED state, and the keyframes
 * only rewind from there, so a viewer that ignores CSS animation still shows a
 * complete image rather than a blank one.
 */
export const ANIMATION_CSS = `
.wf-curve { stroke-dasharray: 1000; stroke-dashoffset: 0; animation: wf-draw 1.4s ease-out 1 both; }
.wf-fade { opacity: 1; animation: wf-fade-in 0.6s ease-out 0.5s 1 both; }
@keyframes wf-draw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
@keyframes wf-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .wf-curve, .wf-fade { animation: none; } }
`.trim();

export function textEl(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: number,
  opts: { anchor?: string; weight?: number; cls?: string } = {},
): string {
  const { anchor = 'start', weight, cls } = opts;
  return (
    `<text x="${round(x)}" y="${round(y)}"` +
    (anchor === 'start' ? '' : ` text-anchor="${anchor}"`) +
    (cls ? ` class="${cls}"` : '') +
    ` font-family="${escapeXml(FONT_STACK)}" font-size="${size}"` +
    (weight ? ` font-weight="${weight}"` : '') +
    ` fill="${fill}">${content}</text>`
  );
}

/**
 * Resolves the card background to a paint value, plus any `<defs>` a gradient
 * needs. The gradient is expressed with `gradientTransform` so the caller's
 * angle is honoured without trigonometry on the coordinates.
 */
export function backgroundPaint(
  background: Background | undefined,
  fallback: string,
  id: string,
): { defs: string; fill: string } {
  if (!background) return { defs: '', fill: fallback };
  if (background.kind === 'solid') return { defs: '', fill: background.value };

  const { angle, stops } = background;
  const last = stops.length - 1;
  const stopEls = stops
    .map(
      (color, i) =>
        `<stop offset="${last === 0 ? 0 : round((i / last) * 100)}%" stop-color="${color}"/>`,
    )
    .join('');

  return {
    defs:
      `<linearGradient id="${id}" gradientTransform="rotate(${round(angle)} 0.5 0.5)">` +
      `${stopEls}</linearGradient>`,
    fill: `url(#${id})`,
  };
}

export interface CardOptions {
  width: number;
  height: number;
  title: string;
  bgFill: string;
  bgDefs: string;
  border: string;
  borderRadius: number;
  hideBorder: boolean;
  animate: boolean;
  body: string;
}

/** Assembles the finished SVG document: frame, optional border, then the body. */
export function svgCard(o: CardOptions): string {
  const style = o.animate ? `<style>${ANIMATION_CSS}</style>` : '';
  const r = round(Math.max(0, o.borderRadius));

  const frame =
    `<rect x="0.5" y="0.5" width="${o.width - 1}" height="${o.height - 1}" rx="${r}" ` +
    `fill="${o.bgFill}"` +
    (o.hideBorder ? '' : ` stroke="${o.border}" stroke-width="1"`) +
    '/>';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" ` +
    `viewBox="0 0 ${o.width} ${o.height}" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${escapeXml(o.title)}">` +
    `<title>${escapeXml(o.title)}</title>` +
    style +
    (o.bgDefs ? `<defs>${o.bgDefs}</defs>` : '') +
    frame +
    o.body +
    '</svg>'
  );
}
