import { LIMITS } from './types.ts';

export interface CommentDraft {
  postSlug: string;
  parentId: string | null;
  alias: string;
  body: string;
  honeypot: string;
  token?: string;
}

export type DraftError = 'body-too-short' | 'body-too-long' | 'alias-too-long';

// Caracteres de control invisibles, salvo el salto de línea.
const CONTROL_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F]/g;

const clean = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const validateDraft = (
  draft: CommentDraft,
): { ok: true; value: CommentDraft; error?: undefined } | { ok: false; error: DraftError } => {
  const body = clean(draft.body);
  const alias = clean(draft.alias).replace(/\s+/g, ' ');

  if (body.length < LIMITS.bodyMin) return { ok: false, error: 'body-too-short' };
  if (body.length > LIMITS.bodyMax) return { ok: false, error: 'body-too-long' };
  if (alias.length > LIMITS.aliasMax) return { ok: false, error: 'alias-too-long' };

  return { ok: true, value: { ...draft, body, alias } };
};
