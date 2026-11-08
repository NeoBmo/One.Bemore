import { charLength, cleanText, comparable, visibleLength } from './text.ts';
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

// Alias que imitan a los automáticos («Lector-AB12», también con I o 1 en vez de l).
const AUTOMATIC_ALIAS = /^[il1]ector[0-9a-f]{4,}$/;
// Nombres del autor y del blog que nadie más puede usar, aunque vayan dentro de otro texto.
const RESERVED_INSIDE = ['neobmo', 'onebmore', 'onebemore'];
const RESERVED_EXACT = new Set(['luis', 'luisbmo']);
// Palabras que fingen autoridad: «Luis (autor)», «admin del blog».
const AUTHORITY_WORDS = new Set(['autor', 'admin', 'administrador', 'moderador', 'moderadora']);

// Mezclar alfabetos (una «і» cirílica dentro de «Luіs») es la forma típica de suplantar.
const mixesScripts = (alias: string) => {
  const scripts = ['Latin', 'Cyrillic', 'Greek'].filter((script) =>
    new RegExp(`\\p{Script=${script}}`, 'u').test(alias),
  );
  return scripts.length > 1;
};

const isReserved = (alias: string) => {
  const base = comparable(alias);
  const key = base.replace(/[^\p{L}\p{N}]/gu, '');
  const words = base.split(/[^\p{L}\p{N}]+/u);
  return (
    AUTOMATIC_ALIAS.test(key) ||
    RESERVED_EXACT.has(key) ||
    RESERVED_INSIDE.some((name) => key.includes(name)) ||
    words.some((word) => AUTHORITY_WORDS.has(word)) ||
    mixesScripts(alias)
  );
};

export const validateDraft = (
  draft: CommentDraft,
): { ok: true; value: CommentDraft; error?: undefined } | { ok: false; error: DraftError } => {
  const body = cleanText(String(draft.body ?? ''));
  const rawAlias = cleanText(String(draft.alias ?? '')).replace(/\s+/g, ' ');
  // Un alias que no se ve (solo marcas o rellenos) equivale a no escribirlo.
  const alias = visibleLength(rawAlias) === 0 ? '' : rawAlias;

  if (visibleLength(body) < LIMITS.bodyMin) return { ok: false, error: 'body-too-short' };
  if (charLength(body) > LIMITS.bodyMax) return { ok: false, error: 'body-too-long' };
  if (charLength(alias) > LIMITS.aliasMax) return { ok: false, error: 'alias-too-long' };
  if (alias && isReserved(alias)) return { ok: false, error: 'alias-reserved' };

  return { ok: true, value: { ...draft, body, alias, parentId: draft.parentId || null } };
};
