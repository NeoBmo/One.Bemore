// Limpieza de texto escrito por desconocidos. Se aplica antes de medir y de moderar,
// para que lo invisible no cuente como contenido ni sirva para burlar los filtros.

// Caracteres de formato invisibles (bidi, anchura cero, BOM) salvo U+200D,
// que une emojis compuestos como 👩\u200D💻.
const INVISIBLE_FORMAT = /(?!\u200D)\p{Cf}/gu;
// Controles C0 salvo el salto de línea, DEL y controles C1.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// Más de tres marcas combinantes seguidas es texto «zalgo».
const MARK_RUN = /(\p{M}{3})\p{M}+/gu;

export const cleanText = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(INVISIBLE_FORMAT, '')
    .replace(CONTROL, '')
    .replace(MARK_RUN, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Longitud en caracteres reales: un emoji cuenta como uno, no como dos.
export const charLength = (text: string): number => [...text].length;

// Forma comparable: sin tildes, sin mayúsculas y con letras de ancho completo reducidas.
export const comparable = (text: string): string =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\p{Cf}/gu, '').toLowerCase();
