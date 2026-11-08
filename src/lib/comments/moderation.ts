import { BANNED_WORDS } from './banned-words.ts';
import { comparable } from './text.ts';
import { LIMITS } from './types.ts';

export type ReviewReason = 'links' | 'banned-word' | 'shouting' | 'repeated';

// Cada enlace cuenta una vez: «https://www.» es uno solo, pero dos enlaces pegados
// uno tras otro («https://a.com/https://b.com») cuentan dos.
const SCHEME = /https?:\/\/(?:www\.)?|www\./gi;
const SCHEMED_URL = /(?:https?:\/\/|www\.)[^\s,]*/gi;
// Dominios sin http ni www («casino.com», «bit.ly/x»). El dominio final va en minúsculas
// a propósito: así «Gracias.Me gustó» o «ASP.NET» no cuentan. La etiqueta necesita una
// letra («capítulo 3.es» no cuenta) y no puede venir tras «@» (correos).
const BARE_DOMAIN =
  /(?<![@\p{L}\p{N}.-])[\p{L}\p{N}-]*\p{L}[\p{L}\p{N}-]*\.(?:com|net|org|info|biz|io|co|me|ly|xyz|top|site|online|link|app|dev|ru|cn|es|mx)(?![\p{L}\p{N}])/gu;
// Repetir 8 veces una letra; espacios, signos y cifras («100000000 pesos») no cuentan.
const REPEATED = /([^\s\p{P}\p{S}\p{N}])\1{7,}/u;

export const countLinks = (text: string): number => {
  // Se compara sobre la copia reducida: «ｈｔｔｐ» de ancho completo cuenta igual.
  const plain = text.normalize('NFKC');
  return (plain.match(SCHEME) ?? []).length + (plain.replace(SCHEMED_URL, ' ').match(BARE_DOMAIN) ?? []).length;
};

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
  if (REPEATED.test(text.normalize('NFKC'))) reasons.push('repeated');
  return reasons;
};

// El alias es un nombre: no admite enlaces ni palabras de la lista, pero sí mayúsculas
// («MARIA FERNANDA GONZALEZ») y letras repetidas en apodos.
export const reviewAlias = (alias: string): ReviewReason[] => {
  const reasons: ReviewReason[] = [];
  if (countLinks(alias) > 0) reasons.push('links');
  if (hasBannedWord(alias)) reasons.push('banned-word');
  return reasons;
};
