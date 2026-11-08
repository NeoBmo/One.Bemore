import assert from 'node:assert/strict';
import test from 'node:test';
import { DOT_PERIOD, TRAIL_SPACING, dotOffset, follow, shouldMark } from '../src/lib/dot-field.ts';

test('el rastro deja la primera marca y luego una cada cierta distancia', () => {
  assert.equal(shouldMark(undefined, { x: 0, y: 0 }), true);
  assert.equal(shouldMark({ x: 0, y: 0 }, { x: TRAIL_SPACING - 1, y: 0 }), false);
  assert.equal(shouldMark({ x: 0, y: 0 }, { x: 30, y: 30 }), true);
});

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
