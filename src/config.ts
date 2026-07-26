import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/** GitHub's own username rule: alphanumeric or single hyphens, cannot start or end with a hyphen, max 39 chars. */
const USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ConfigSchema = z.object({
  username: z.string().regex(USERNAME_RE, 'invalid GitHub username'),
  timezone: z.string().refine(isValidTimeZone, 'unknown IANA timezone'),
  peakMarkers: z.number().int().min(0).max(10),
  mirror: z.boolean(),
  accent: z.string().regex(HEX_RE, 'accent must be #rrggbb'),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path = 'waveform.config.json'): Promise<Config> {
  const raw = await readFile(path, 'utf8');
  return ConfigSchema.parse(JSON.parse(raw));
}
