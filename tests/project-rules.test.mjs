import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('el proyecto no depende de Tailwind', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((name) => name.includes('tailwind')), []);
});
