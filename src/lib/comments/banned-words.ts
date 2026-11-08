// Palabras que envían un comentario a cuarentena para que Luis lo revise.
// No se rechaza: la cuarentena solo lo esconde hasta que alguien decida.
// Se escriben sin tildes y en minúscula; la comparación las ignora.
export const BANNED_WORDS = [
  // Insultos frecuentes
  'idiota',
  'estupido',
  'estupida',
  'imbecil',
  'pendejo',
  'pendeja',
  'malparido',
  'malparida',
  'hijueputa',
  'gonorrea',
  'mierda',
  'puta',
  'marica',
  // Spam habitual
  'casino',
  'viagra',
] as const;
