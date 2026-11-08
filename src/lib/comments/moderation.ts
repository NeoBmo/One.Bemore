import { BANNED_WORDS } from './banned-words.ts';
import { comparable } from './text.ts';
import { LIMITS } from './types.ts';

export type ReviewReason = 'links' | 'banned-word' | 'shouting' | 'repeated';

// Cada «http://» o «www.» cuenta, aunque vengan pegados uno tras otro.
const SCHEME = /https?:\/\/|www\./gi;
const SCHEMED_URL = /(?:https?:\/\/|www\.)[^\s,]*/gi;
// Dominios escritos sin http ni www, como «casino.com» o «bit.ly/x».
const BARE_DOMAIN = /\b[\p{L}\p{N}-]+\.(?:com|net|org|info|biz|io|co|me|ly|xyz|top|site|online|link|app|dev|ru|cn|es|mx)\b/giu;
// Repetir 8 veces una letra o número; espacios y signos no cuentan.
const REPEATED = /([^\s\p{P}\p{S}])\1{7,}/u;

const countLinks = (text: string) =>
  (text.match(SCHEME) ?? []).length + (text.replace(SCHEMED_URL, ' ').match(BARE_DOMAIN) ?? []).length;

// Palabras completas, admitiendo plurales: «idiotas» cuenta, «mierdosa» no.
const hasBannedWord = (text: string) => {
  const banned = new Set<string>(BANNED_WORDS);
  return comparable(text)
    .split(/[^\p{L}\p{N}]+/u)
    .some((word) => banned.has(word) || banned.has(word.replace(/e?s$/, '')));
};

const isShouting = (text: string) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length <= 20) return false;
  const upper = letters.filter((letter) => letter !== letter.toLowerCase()).length;
  return upper / letters.length > 0.7;
};

// Devuelve los motivos para enviar a cuarentena; una lista vacía significa publicar.
export const reviewBody = (text: string): ReviewReason[] => {
  const reasons: ReviewReason[] = [];
  if (countLinks(text) > LIMITS.maxLinks) reasons.push('links');
  if (hasBannedWord(text)) reasons.push('banned-word');
  if (isShouting(text)) reasons.push('shouting');
  if (REPEATED.test(text)) reasons.push('repeated');
  return reasons;
};
