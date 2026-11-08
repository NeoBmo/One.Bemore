import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editedDate,
  readingMinutes,
  formatDate,
  matchesSearch,
  normalizeText,
  parseTypeFilter,
  publishedPosts,
  seriesNeighbors,
  sortByNewest,
} from '../src/lib/posts.ts';

const post = (id, pubDate, extra = {}) => ({
  id,
  data: { title: id, pubDate: new Date(pubDate), draft: false, ...extra },
});

test('ordena del más reciente al más antiguo sin mutar la lista', () => {
  const posts = [post('a', '2023-01-01'), post('b', '2024-01-01')];
  assert.deepEqual(sortByNewest(posts).map((item) => item.id), ['b', 'a']);
  assert.equal(posts[0].id, 'a');
});

test('los borradores solo se ven en desarrollo', () => {
  const posts = [post('a', '2023-01-01'), post('b', '2023-01-02', { draft: true })];
  assert.deepEqual(publishedPosts(posts, false).map((item) => item.id), ['a']);
  assert.equal(publishedPosts(posts, true).length, 2);
});

test('encuentra la lección anterior y la siguiente según order', () => {
  const lessons = [
    post('dos', '2024-01-02', { series: 'Markdown', order: 2 }),
    post('uno', '2024-01-01', { series: 'Markdown', order: 1 }),
    post('tres', '2024-01-03', { series: 'Markdown', order: 3 }),
    post('otro', '2024-01-04', { series: 'Git', order: 1 }),
  ];
  const { previous, next } = seriesNeighbors(lessons[0], lessons);
  assert.equal(previous.id, 'uno');
  assert.equal(next.id, 'tres');
});

test('un artículo sin serie no tiene vecinos', () => {
  assert.deepEqual(seriesNeighbors(post('a', '2024-01-01'), []), { previous: undefined, next: undefined });
});

test('el tiempo de lectura redondea a minutos y nunca baja de uno', () => {
  assert.equal(readingMinutes(''), 1);
  assert.equal(readingMinutes('una palabra'), 1);
  assert.equal(readingMinutes(Array(820).fill('palabra').join(' ')), 4);
});

test('la fecha de edición solo aparece si es de un día posterior', () => {
  const pubDate = new Date('2024-03-10T00:00:00Z');
  assert.equal(editedDate(pubDate, undefined, undefined), undefined);
  assert.equal(editedDate(pubDate, undefined, '2024-03-10T20:00:00Z'), undefined);
  assert.deepEqual(editedDate(pubDate, undefined, '2024-03-12T20:00:00Z'), new Date('2024-03-12T20:00:00Z'));
});

test('updatedDate manual gana a la fecha de git', () => {
  const manual = new Date('2024-05-01T00:00:00Z');
  assert.deepEqual(editedDate(new Date('2024-03-10T00:00:00Z'), manual, '2024-06-01T00:00:00Z'), manual);
});

test('una fecha de git inválida no rompe el build', () => {
  assert.equal(editedDate(new Date('2024-03-10T00:00:00Z'), undefined, 'no-es-fecha'), undefined);
});

test('formatea la fecha en español sin depender de la zona local', () => {
  assert.equal(formatDate(new Date('2024-03-10T00:00:00Z')), '10 de marzo de 2024');
});

test('la búsqueda ignora tildes y mayúsculas', () => {
  assert.equal(normalizeText('Hábitos ÁTÓMICOS'), 'habitos atomicos');
  assert.equal(matchesSearch('El poder de los Hábitos', 'habitos'), true);
  assert.equal(matchesSearch('Metodología', 'git'), false);
  assert.equal(matchesSearch('Metodología', '   '), true);
});

test('un tipo inválido en la URL se ignora', () => {
  assert.equal(parseTypeFilter('historia'), 'historia');
  assert.equal(parseTypeFilter('<script>'), undefined);
  assert.equal(parseTypeFilter(null), undefined);
});
