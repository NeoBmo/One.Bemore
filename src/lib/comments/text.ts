// Limpieza de texto escrito por desconocidos.
// Dos copias distintas: la que se guarda respeta lo que escribió el lector («1.º» sigue
// siendo «1.º»); la que se compara se reduce al máximo para que nada burle los filtros.

const PICTO = '\\p{Extended_Pictographic}';
// La unión de emojis (U+200D) solo tiene sentido entre dos pictogramas, como en 👩\u200D💻.
const STRAY_JOINER = new RegExp(`(?<!${PICTO}[\\uFE0F\\u{1F3FB}-\\u{1F3FF}]?)\\u200D|\\u200D(?!${PICTO})`, 'gu');
// Las etiquetas Unicode solo se conservan dentro de una bandera de subdivisión válida
// (🏴 + 2 a 6 letras o cifras + cierre), como la de Escocia. Sueltas servirían para esconder texto.
const TAG_OR_FLAG = /(\u{1F3F4}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{2,6}\u{E007F})|[\u{E0020}-\u{E007F}]/gu;
// Formato invisible (bidi, anchura cero, BOM), salvo la unión y las etiquetas, que se tratan aparte.
const INVISIBLE_FORMAT = /(?![\u200D\u{E0020}-\u{E007F}])\p{Cf}/gu;
// Controles C0 salvo el salto de línea, DEL y controles C1.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// Más de tres marcas combinantes seguidas es texto «zalgo».
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;
// Caracteres que se ven en blanco: rellenos hangul y el braille vacío.
const BLANK_FILLERS = /[\u115F\u1160\u3164\uFFA0\u2800]/g;

// Copia que se guarda y se muestra.
export const cleanText = (text: string): string =>
  text
    .normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(STRAY_JOINER, '')
    .replace(TAG_OR_FLAG, (_match, flag?: string) => flag ?? '')
    .replace(INVISIBLE_FORMAT, '')
    .replace(CONTROL, '')
    .replace(BLANK_FILLERS, '')
    .replace(MARK_RUN, '$1')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Longitud en puntos de código, igual que char_length en Postgres.
// Un emoji simple cuenta 1; uno compuesto como 👩\u200D💻 cuenta 3.
export const charLength = (text: string): number => [...text].length;

// Lo que de verdad se ve: sin marcas, invisibles ni espacios. Sirve para el mínimo.
export const visibleLength = (text: string): number =>
  charLength(text.replace(/[\p{M}\p{Cf}\s]/gu, '').replace(BLANK_FILLERS, ''));

// Copia para comparar: ancho completo reducido, sin tildes, sin invisibles y en minúsculas.
export const comparable = (text: string): string =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\p{Cf}/gu, '').toLowerCase();
