import { BANNED_WORDS } from './banned-words.ts';
import { LIMITS } from './types.ts';

export type ReviewReason = 'links' | 'banned-word' | 'shouting' | 'repeated';

const LINK = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const REPEATED = /(.)\1{7,}/u;

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Palabras completas: «mierdosa» no coincide con «mierda».
const words = (text: string) => new Set(normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));

const isShouting = (text: string) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length <= 20) return false;
  const upper = letters.filter((letter) => letter !== letter.toLowerCase()).length;
  return upper / letters.length > 0.7;
};

// Devuelve los motivos para enviar a cuarentena; una lista vacía significa publicar.
export const reviewBody = (body: string): ReviewReason[] => {
  const reasons: ReviewReason[] = [];
  if ((body.match(LINK) ?? []).length > LIMITS.maxLinks) reasons.push('links');

  const found = words(body);
  if (BANNED_WORDS.some((word) => found.has(word))) reasons.push('banned-word');

  if (isShouting(body)) reasons.push('shouting');
  if (REPEATED.test(body)) reasons.push('repeated');
  return reasons;
};
