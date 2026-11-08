import { charLength, cleanText, comparable } from './text.ts';
import { LIMITS } from './types.ts';

export interface CommentDraft {
  postSlug: string;
  parentId: string | null;
  alias: string;
  body: string;
  honeypot: string;
  token?: string;
}

export type DraftError = 'body-too-short' | 'body-too-long' | 'alias-too-long' | 'alias-reserved';

// Nombres que nadie puede usar: los alias automáticos y los del autor del blog.
const RESERVED_ALIASES = ['luis', 'onebemore', 'admin', 'administrador', 'moderador', 'autor'];

const isReserved = (alias: string) => {
  const key = comparable(alias).replace(/[^\p{L}\p{N}]/gu, '');
  return key.startsWith('lector') || RESERVED_ALIASES.includes(key);
};

export const validateDraft = (
  draft: CommentDraft,
): { ok: true; value: CommentDraft; error?: undefined } | { ok: false; error: DraftError } => {
  const body = cleanText(String(draft.body ?? ''));
  // El alias es una sola línea; vacío tras limpiar significa «usar el automático».
  const alias = cleanText(String(draft.alias ?? '')).replace(/\s+/g, ' ');

  if (charLength(body) < LIMITS.bodyMin) return { ok: false, error: 'body-too-short' };
  if (charLength(body) > LIMITS.bodyMax) return { ok: false, error: 'body-too-long' };
  if (charLength(alias) > LIMITS.aliasMax) return { ok: false, error: 'alias-too-long' };
  if (alias && isReserved(alias)) return { ok: false, error: 'alias-reserved' };

  return { ok: true, value: { ...draft, body, alias, parentId: draft.parentId || null } };
};
