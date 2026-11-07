import assert from 'node:assert/strict';
import test from 'node:test';
import { lastEditDate } from '../src/lib/git-dates.ts';

test('sin ruta o sin historial no hay fecha y el build no falla', () => {
  assert.equal(lastEditDate(undefined), undefined);
  assert.equal(lastEditDate('src/content/blog/no-existe.md'), undefined);
});

test('los cambios masivos anteriores al corte no cuentan como edición', () => {
  assert.equal(lastEditDate('src/content/blog/atomic-habits.md'), undefined);
});
