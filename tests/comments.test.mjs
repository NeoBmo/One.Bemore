import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThread } from '../src/lib/comments/thread.ts';
import { reviewBody } from '../src/lib/comments/moderation.ts';
import { validateDraft } from '../src/lib/comments/validate.ts';
import { aliasFromHash, generateToken, hashToken, isToken } from '../src/lib/comments/token.ts';
import { InMemoryCommentStore } from '../src/lib/comments/memory-store.ts';
import { deleteOwnComment, postComment, voteComment } from '../src/lib/comments/service.ts';

const NOW = new Date('2026-11-08T12:00:00Z');
let counter = 0;
const ctx = (extra = {}) => ({
  now: NOW,
  ipHash: 'ip-1',
  knownPosts: new Set(['habitos']),
  newId: () => `c${++counter}`,
  ...extra,
});
const draft = (extra = {}) => ({ postSlug: 'habitos', parentId: null, alias: '', body: 'Buen artículo', honeypot: '', token: undefined, ...extra });

// --- Validación (RF-34) ---

test('valida longitudes y limpia espacios', () => {
  assert.equal(validateDraft(draft({ body: ' a ' })).error, 'body-too-short');
  assert.equal(validateDraft(draft({ body: 'x'.repeat(2001) })).error, 'body-too-long');
  assert.equal(validateDraft(draft({ alias: 'x'.repeat(41) })).error, 'alias-too-long');
  const ok = validateDraft(draft({ body: '  hola\n\n\n\n\nmundo  ', alias: '  Ana ' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.body, 'hola\n\nmundo');
  assert.equal(ok.value.alias, 'Ana');
});

test('quita caracteres de control pero conserva saltos de línea', () => {
  const ok = validateDraft(draft({ body: 'ho\u0000la\u0007\nadiós' }));
  assert.equal(ok.value.body, 'hola\nadiós');
});

// --- Moderación (RF-27) ---

test('un comentario normal se publica', () => {
  assert.deepEqual(reviewBody('Me gustó mucho, gracias por compartirlo.'), []);
});

test('lo sospechoso va a cuarentena con su motivo', () => {
  assert.deepEqual(reviewBody('mira https://a.com y https://b.com'), ['links']);
  assert.deepEqual(reviewBody('eres un IDIOTA'), ['banned-word']);
  assert.deepEqual(reviewBody('ESTO ES TOTALMENTE FALSO Y LO SABES'), ['shouting']);
  assert.deepEqual(reviewBody('noooooooooo'), ['repeated']);
});

test('la lista de palabras ignora tildes pero respeta palabras completas', () => {
  assert.deepEqual(reviewBody('qué estúpido'), ['banned-word']);
  assert.deepEqual(reviewBody('una idea mierdosa'), []);
  assert.deepEqual(reviewBody('Un solo enlace https://astro.build está bien'), []);
});

// --- Token (RF-25) ---

test('el token es aleatorio y solo se guarda su hash', async () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a, b);
  assert.equal(isToken(a), true);
  assert.equal(isToken('corto'), false);
  const hash = await hashToken(a);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, await hashToken(a));
  assert.match(aliasFromHash(hash), /^Lector-[0-9A-F]{4}$/);
});

// --- Servicio: publicar ---

test('publica al instante y entrega un token nuevo la primera vez', async () => {
  const store = new InMemoryCommentStore();
  const result = await postComment(store, draft(), ctx());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'visible');
  assert.equal(isToken(result.token), true);
  const [saved] = (await store.listByPost('habitos')).comments;
  assert.notEqual(saved.authorTokenHash, result.token);
  assert.equal(saved.ipHash, 'ip-1');
  assert.match(saved.alias, /^Lector-/);
});

test('con un token existente conserva el mismo alias y no entrega otro', async () => {
  const store = new InMemoryCommentStore();
  const first = await postComment(store, draft(), ctx());
  const second = await postComment(store, draft({ token: first.token }), ctx());
  assert.equal(second.token, undefined);
  const { comments } = await store.listByPost('habitos');
  assert.equal(comments[0].alias, comments[1].alias);
});

test('el campo trampa simula éxito sin guardar nada (RF-36)', async () => {
  const store = new InMemoryCommentStore();
  const result = await postComment(store, draft({ honeypot: 'http://spam' }), ctx());
  assert.equal(result.ok, true);
  assert.equal((await store.listByPost('habitos')).comments.length, 0);
});

test('rechaza artículos y padres inválidos', async () => {
  const store = new InMemoryCommentStore();
  assert.equal((await postComment(store, draft({ postSlug: 'no-existe' }), ctx())).error, 'invalid-post');
  assert.equal((await postComment(store, draft({ parentId: 'nadie' }), ctx())).error, 'invalid-parent');
});

test('no se puede responder a un comentario en cuarentena', async () => {
  const store = new InMemoryCommentStore();
  const spam = await postComment(store, draft({ body: 'IDIOTA' }), ctx());
  assert.equal(spam.status, 'quarantined');
  const reply = await postComment(store, draft({ parentId: spam.id }), ctx());
  assert.equal(reply.error, 'invalid-parent');
});

test('limita a 5 comentarios por IP cada 10 minutos (RF-35)', async () => {
  const store = new InMemoryCommentStore();
  for (let i = 0; i < 5; i += 1) assert.equal((await postComment(store, draft(), ctx())).ok, true);
  assert.equal((await postComment(store, draft(), ctx())).error, 'rate-limited');
  assert.equal((await postComment(store, draft(), ctx({ ipHash: 'ip-2' }))).ok, true);
  const later = new Date(NOW.getTime() + 11 * 60_000);
  assert.equal((await postComment(store, draft(), ctx({ now: later }))).ok, true);
});

// --- Votos (RF-29, RF-30, RF-38) ---

test('un voto por lector; repetirlo lo retira y cambiarlo lo reemplaza', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const reader = generateToken();
  await voteComment(store, { commentId: author.id, value: 1, token: reader });
  await voteComment(store, { commentId: author.id, value: -1, token: reader });
  assert.deepEqual((await store.listByPost('habitos')).votes.map((v) => v.value), [-1]);
  await voteComment(store, { commentId: author.id, value: -1, token: reader });
  assert.equal((await store.listByPost('habitos')).votes.length, 0);
});

test('no se puede votar el propio comentario ni uno oculto', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  assert.equal((await voteComment(store, { commentId: author.id, value: 1, token: author.token })).error, 'own-comment');
  const spam = await postComment(store, draft({ body: 'IDIOTA' }), ctx());
  assert.equal((await voteComment(store, { commentId: spam.id, value: 1, token: generateToken() })).error, 'not-found');
});

// --- Borrado propio (RF-37) ---

test('solo quien comentó puede borrar, y queda como deleted', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  assert.equal((await deleteOwnComment(store, { commentId: author.id, token: generateToken() })).error, 'forbidden');
  assert.equal((await deleteOwnComment(store, { commentId: author.id, token: author.token })).ok, true);
  assert.equal((await store.getById(author.id)).status, 'deleted');
});

// --- Hilo (RF-28, RF-30, RF-31) ---

const stored = (id, parentId, extra = {}) => ({
  id,
  postSlug: 'habitos',
  parentId,
  alias: `A-${id}`,
  body: `texto ${id}`,
  status: 'visible',
  authorTokenHash: `h-${id}`,
  ipHash: 'ip',
  createdAt: `2026-11-08T10:0${id.length}:00Z`,
  ...extra,
});

test('arma ramas, ordena por votos y luego por antigüedad', () => {
  const comments = [stored('a', null), stored('b', null, { createdAt: '2026-11-08T09:00:00Z' }), stored('c', 'a')];
  const votes = [{ commentId: 'a', voterHash: 'x', value: 1 }];
  const roots = buildThread(comments, votes);
  assert.deepEqual(roots.map((c) => c.id), ['a', 'b']);
  assert.equal(roots[0].score, 1);
  assert.equal(roots[0].replies[0].id, 'c');
  assert.equal(roots[0].replies[0].depth, 1);
});

test('los votos negativos ordenan pero nunca ocultan', () => {
  const votes = [1, 2, 3].map((n) => ({ commentId: 'a', voterHash: `v${n}`, value: -1 }));
  const roots = buildThread([stored('a', null)], votes);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].score, -3);
});

test('un borrado con respuestas deja su lugar y su texto desaparece', () => {
  const roots = buildThread([stored('a', null, { status: 'deleted' }), stored('b', 'a')], []);
  assert.equal(roots[0].removed, true);
  assert.equal(roots[0].body, null);
  assert.equal(roots[0].alias, null);
  assert.equal(roots[0].replies[0].id, 'b');
});

test('un oculto sin respuestas visibles desaparece del todo', () => {
  assert.deepEqual(buildThread([stored('a', null, { status: 'hidden' })], []), []);
});

test('la cuarentena oculta el comentario y toda su rama', () => {
  const roots = buildThread([stored('a', null, { status: 'quarantined' }), stored('b', 'a')], []);
  assert.deepEqual(roots, []);
});

test('nunca expone hashes ni IP, y marca los comentarios propios', () => {
  const [root] = buildThread([stored('a', null)], [], 'h-a');
  assert.equal(root.mine, true);
  assert.equal('authorTokenHash' in root, false);
  assert.equal('ipHash' in root, false);
});

test('la profundidad visual se detiene en 4 niveles', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i, all) => stored(id, i === 0 ? null : all[i - 1]));
  let node = buildThread(chain, [])[0];
  while (node.replies.length) node = node.replies[0];
  assert.equal(node.id, 'f');
  assert.equal(node.depth, 5);
  assert.equal(node.indent, 3);
});
