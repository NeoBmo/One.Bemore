import assert from 'node:assert/strict';
import test from 'node:test';
import { DOT_PERIOD, dotOffset, follow } from '../src/lib/dot-field.ts';

test('los puntos avanzan a 0.12 de la velocidad del scroll', () => {
  assert.equal(dotOffset(100), -12);
});

test('el desplazamiento nunca supera un periodo de la cuadrícula', () => {
  for (const scrollY of [0, 233, 234, 5000, 123456]) {
    const offset = dotOffset(scrollY);
    assert.ok(offset <= 0 && offset > -DOT_PERIOD, `scrollY ${scrollY}: ${offset}`);
  }
});

test('un scroll negativo por rebote en móvil no rompe el módulo', () => {
  assert.equal(dotOffset(-40), 0);
});

test('la luz se acerca al cursor sin saltar y se detiene al llegar', () => {
  assert.equal(follow(0, 100), 12);
  assert.equal(follow(99.9, 100), 100);
});
