import { getTheme, type ThemeName } from '../themes';
import { backgroundPaint, escapeXml, svgCard, textEl } from './card';

export interface ErrorCardOptions {
  message: string;
  theme: ThemeName;
  width?: number;
  height?: number;
}

/**
 * Errors render as a card, never as JSON and never as a 4xx/5xx. A non-200
 * makes GitHub show a broken-image icon in the README, which tells the reader
 * nothing; a card that says what went wrong is strictly more useful.
 */
export function renderErrorCard(o: ErrorCardOptions): string {
  const t = getTheme(o.theme);
  const width = o.width ?? 495;
  const height = o.height ?? 120;
  const { defs, fill } = backgroundPaint(undefined, t.bg, 'wf-bg');

  // Wrap on whole words so a long message does not overflow the card.
  const words = o.message.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 46 && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const body =
    textEl(25, 42, 'Contribution Waveform', t.text, 15, { weight: 600 }) +
    lines
      .map((text, i) => textEl(25, 70 + i * 17, escapeXml(text), t.textDim, 12))
      .join('');

  return svgCard({
    width,
    height: Math.max(height, 70 + lines.length * 17 + 20),
    title: `Contribution Waveform error: ${o.message}`,
    bgFill: fill,
    bgDefs: defs,
    border: t.border,
    borderRadius: 6,
    hideBorder: false,
    animate: false,
    body,
  });
}
