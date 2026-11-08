import { execFileSync } from 'node:child_process';

// Los commits con esta marca no cuentan como edición, por ejemplo una migración masiva.
export const IGNORE_EDIT_MARKER = '[sin-edicion]';

// Antes de esta fecha hubo cambios masivos de formato que no fueron ediciones de contenido.
export const EDITS_TRACKED_SINCE = '2026-11-08';

// Se ejecuta solo durante el build. Sin git o sin commits devuelve undefined.
export const lastEditDate = (filePath: string | undefined): string | undefined => {
  if (!filePath) return undefined;
  try {
    const output = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', `--since=${EDITS_TRACKED_SINCE}`, '--fixed-strings', `--grep=${IGNORE_EDIT_MARKER}`, '--invert-grep', '--', filePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return output || undefined;
  } catch {
    return undefined;
  }
};
