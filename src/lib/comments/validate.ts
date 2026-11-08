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

export type DraftError = 'invalid-input' | 'body-too-short' | 'body-too-long' | 'alias-too-long' | 'alias-reserved';

// Alias que imitan exactamente a los automáticos («Lector-1A2B3C», también con I o 1 en vez de l).
// «Lector Café» o «Lector 2025» siguen permitidos.
const AUTOMATIC_ALIAS = /^[il1]ector[0-9a-f]{6}$/;
// Nombres del autor y del blog que nadie más puede usar, aunque vayan dentro de otro texto.
const RESERVED_INSIDE = ['neobmo', 'onebmore', 'onebemore'];
const RESERVED_EXACT = new Set(['luis', 'luisbmo']);
// Palabras que fingen autoridad: «Luis (autor)», «admin del blog».
const AUTHORITY_WORDS = new Set(['autor', 'admin', 'administrador', 'moderador', 'moderadora']);
// Letras que se confunden a simple vista y que la normalización no unifica.
const LOOKALIKES: Record<string, string> = { ı: 'i', ᴏ: 'o', '0': 'o', '1': 'l', '|': 'l' };

// Mezclar el alfabeto latino con letras de otro («Luіs» con і cirílica, «Lսis» con armenio)
// es la forma típica de suplantar. Un nombre entero en otro alfabeto («Мария») sí vale.
const mixesScripts = (alias: string) => {
  const letters = alias.match(/\p{L}/gu) ?? [];
  const latin = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  return latin > 0 && latin < letters.length;
};

const isReserved = (alias: string) => {
  const base = comparable(alias);
  const key = base.replace(/[^\p{L}\p{N}|]/gu, '');
  const lookalike = [...key].map((char) => LOOKALIKES[char] ?? char).join('');
  const words = base.split(/[^\p{L}\p{N}]+/u);
  return (
    AUTOMATIC_ALIAS.test(key) ||
    RESERVED_EXACT.has(lookalike) ||
    RESERVED_INSIDE.some((name) => lookalike.includes(name)) ||
    words.some((word) => AUTHORITY_WORDS.has(word)) ||
    mixesScripts(alias)
  );
};

const isOptionalText = (value: unknown) => value === undefined || value === null || typeof value === 'string';

export const validateDraft = (
  draft: CommentDraft,
): { ok: true; value: CommentDraft; error?: undefined } | { ok: false; error: DraftError } => {
  // Lo que no sea texto se rechaza: un array como padre o como cuerpo no se convierte en silencio.
  const fields = [draft.body, draft.alias, draft.honeypot, draft.parentId, draft.token, draft.postSlug];
  if (typeof draft.body !== 'string' || typeof draft.postSlug !== 'string' || !fields.every(isOptionalText)) {
    return { ok: false, error: 'invalid-input' };
  }

  const body = cleanText(draft.body);
  const rawAlias = cleanText(draft.alias ?? '').replace(/\s+/g, ' ');
  // Un alias que no se ve (solo marcas o rellenos) equivale a no escribirlo.
  const alias = visibleLength(rawAlias) === 0 ? '' : rawAlias;

  if (visibleLength(body) < LIMITS.bodyMin) return { ok: false, error: 'body-too-short' };
  if (charLength(body) > LIMITS.bodyMax) return { ok: false, error: 'body-too-long' };
  if (charLength(alias) > LIMITS.aliasMax) return { ok: false, error: 'alias-too-long' };
  if (alias && isReserved(alias)) return { ok: false, error: 'alias-reserved' };

  return { ok: true, value: { ...draft, body, alias, honeypot: draft.honeypot ?? '', parentId: draft.parentId || null } };
};
