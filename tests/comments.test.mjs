import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThread } from '../src/lib/comments/thread.ts';
import { reviewBody } from '../src/lib/comments/moderation.ts';
import { validateDraft } from '../src/lib/comments/validate.ts';
import { aliasFromHash, generateToken, hashIp, hashToken, isToken, normalizeIp } from '../src/lib/comments/token.ts';
import { InMemoryCommentStore } from '../src/lib/comments/memory-store.ts';
import { deleteOwnComment, postComment, voteComment } from '../src/lib/comments/service.ts';

const NOW = new Date('2026-11-08T12:00:00Z');
const IP_A = 'a'.repeat(64);
const IP_B = 'b'.repeat(64);
const IP_C = 'c'.repeat(64);
const SALT = 's'.repeat(32);
let counter = 0;
const ctx = (extra = {}) => ({
  now: NOW,
  ipHash: IP_A,
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
  assert.equal(ok.value.body, 'hola\n\nmundo');
  assert.equal(ok.value.alias, 'Ana');
});

test('los emojis cuentan como un carácter', () => {
  assert.equal(validateDraft(draft({ body: '🌸'.repeat(1001) })).ok, true);
});

test('lo invisible no cuenta como contenido', () => {
  assert.equal(validateDraft(draft({ body: '\u200B\u200B\u202E' })).error, 'body-too-short');
  assert.equal(validateDraft(draft({ body: 'ho\u0000la\u0085\u2028adiós' })).value.body, 'hola\nadiós');
  assert.equal(validateDraft(draft({ body: '👩\u200D💻 ok' })).value.body, '👩\u200D💻 ok');
});

test('las líneas con solo espacios también se comprimen', () => {
  const body = validateDraft(draft({ body: `a${'\n \n \n \n'.repeat(3)}b` })).value.body;
  assert.equal(body, 'a\n\nb');
});

test('el texto zalgo se recorta a tres marcas seguidas', () => {
  const body = validateDraft(draft({ body: `ab${'́'.repeat(1998)}` })).value.body;
  assert.equal([...body].length, 5);
});

test('un padre vacío se trata como comentario raíz', () => {
  assert.equal(validateDraft(draft({ parentId: '' })).value.parentId, null);
});

test('no se puede suplantar al autor ni a otros lectores', () => {
  for (const alias of ['Lector-1A2B', 'lector 9', 'Luis', 'L\u200Buis', 'ＬＵＩＳ', 'One.Bemore', 'admin']) {
    assert.equal(validateDraft(draft({ alias })).error, 'alias-reserved', alias);
  }
  assert.equal(validateDraft(draft({ alias: 'Luisa' })).ok, true);
});

test('un alias invisible pasa a usar el automático', async () => {
  const store = new InMemoryCommentStore();
  await postComment(store, draft({ alias: '\u200B' }), ctx());
  assert.match(store.comments[0].alias, /^Lector-/);
});

// --- Moderación (RF-27) ---

test('un comentario normal se publica', () => {
  assert.deepEqual(reviewBody('Me gustó mucho, gracias por compartirlo.'), []);
  assert.deepEqual(reviewBody('Un solo enlace https://astro.build está bien'), []);
  assert.deepEqual(reviewBody('Una línea -------- o espacios        no es spam'), []);
});

test('lo sospechoso va a cuarentena con su motivo', () => {
  assert.deepEqual(reviewBody('mira https://a.com y https://b.com'), ['links']);
  assert.deepEqual(reviewBody('eres un IDIOTA'), ['banned-word']);
  assert.deepEqual(reviewBody('ESTO ES TOTALMENTE FALSO Y LO SABES'), ['shouting']);
  assert.deepEqual(reviewBody('noooooooooo'), ['repeated']);
});

test('los enlaces disfrazados también cuentan', () => {
  assert.deepEqual(reviewBody('https://a.com/https://b.com'), ['links']);
  assert.deepEqual(reviewBody('visita casin0.com o bit.ly/x'), ['links']);
});

test('la lista ignora tildes, ancho completo e invisibles, y admite plurales', () => {
  for (const text of ['qué estúpido', 'ＩＤＩＯＴＡ', 'idi\u200Bota', 'son unos idiotas', 'pendejos']) {
    assert.deepEqual(reviewBody(text), ['banned-word'], text);
  }
  assert.deepEqual(reviewBody('una idea mierdosa'), []);
});

test('un alias ofensivo envía el comentario a cuarentena', async () => {
  const store = new InMemoryCommentStore();
  const result = await postComment(store, draft({ alias: 'IDIOTA www.casino.com' }), ctx());
  assert.equal(result.status, 'quarantined');
});

// --- Token e IP (RF-25, RF-39) ---

test('el token es aleatorio y solo se guarda su hash', async () => {
  const a = generateToken();
  assert.notEqual(a, generateToken());
  assert.equal(isToken(a), true);
  assert.equal(isToken('corto'), false);
  const hash = await hashToken(a);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.match(aliasFromHash(hash), /^Lector-[0-9A-F]{4}$/);
});

test('la IP se agrupa por conexión y se guarda como hash con sal', async () => {
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('2001:db8:aa:bb:1:2:3:4'), normalizeIp('2001:db8:aa:bb:ffff::9'));
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(await hashIp('1.2.3.4', SALT), await hashIp('::ffff:1.2.3.4', SALT));
  assert.match(await hashIp('1.2.3.4', SALT), /^[0-9a-f]{64}$/);
  await assert.rejects(async () => hashIp('1.2.3.4', 'corta'));
});

test('el servicio rechaza una IP que no llegue como hash', async () => {
  await assert.rejects(() => postComment(new InMemoryCommentStore(), draft(), ctx({ ipHash: '1.2.3.4' })));
});

// --- Servicio: publicar ---

test('publica al instante y entrega un token nuevo la primera vez', async () => {
  const store = new InMemoryCommentStore();
  const result = await postComment(store, draft(), ctx());
  assert.equal(result.status, 'visible');
  assert.equal(isToken(result.token), true);
  const [saved] = store.comments;
  assert.notEqual(saved.authorTokenHash, result.token);
  assert.equal(saved.ipHash, IP_A);
});

test('con un token existente conserva el mismo alias y no entrega otro', async () => {
  const store = new InMemoryCommentStore();
  const first = await postComment(store, draft(), ctx());
  const second = await postComment(store, draft({ token: first.token }), ctx());
  assert.equal(second.token, undefined);
  assert.equal(store.comments[0].alias, store.comments[1].alias);
});

test('el campo trampa responde igual que un éxito real, sin guardar (RF-36)', async () => {
  const store = new InMemoryCommentStore();
  const real = await postComment(store, draft(), ctx());
  const fake = await postComment(store, draft({ honeypot: 'http://spam' }), ctx());
  assert.deepEqual(Object.keys(fake).sort(), Object.keys(real).sort());
  assert.equal(store.comments.length, 1);
  assert.equal((await postComment(store, draft({ honeypot: undefined }), ctx())).ok, true);
});

test('rechaza artículos y padres inválidos', async () => {
  const store = new InMemoryCommentStore();
  assert.equal((await postComment(store, draft({ postSlug: 'no-existe' }), ctx())).error, 'invalid-post');
  assert.equal((await postComment(store, draft({ parentId: 'nadie' }), ctx())).error, 'invalid-parent');
});

test('una rama en cuarentena queda cerrada: ni respuestas ni votos', async () => {
  const store = new InMemoryCommentStore();
  const root = await postComment(store, draft(), ctx());
  const child = await postComment(store, draft({ parentId: root.id }), ctx({ ipHash: IP_B }));
  await store.setStatus(root.id, 'quarantined');
  assert.equal((await postComment(store, draft({ parentId: child.id }), ctx({ ipHash: IP_C }))).error, 'invalid-parent');
  assert.equal((await voteComment(store, { commentId: child.id, value: 1, token: generateToken(), ipHash: IP_C })).error, 'not-found');
});

test('las ramas tienen un tope de profundidad', async () => {
  const store = new InMemoryCommentStore();
  let parentId = null;
  for (let i = 0; i <= 30; i += 1) {
    const ip = (i % 10).toString(16).repeat(64);
    store.comments.push({ id: `p${i}`, postSlug: 'habitos', parentId, alias: 'x', body: 'x', status: 'visible', authorTokenHash: 'h', ipHash: ip, createdAt: NOW.toISOString() });
    parentId = `p${i}`;
  }
  assert.equal((await postComment(store, draft({ parentId }), ctx())).error, 'too-deep');
});

test('limita a 5 comentarios por IP cada 10 minutos (RF-35)', async () => {
  const store = new InMemoryCommentStore();
  for (let i = 0; i < 5; i += 1) assert.equal((await postComment(store, draft(), ctx())).ok, true);
  assert.equal((await postComment(store, draft(), ctx())).error, 'rate-limited');
  assert.equal((await postComment(store, draft(), ctx({ ipHash: IP_B }))).ok, true);
  const later = new Date(NOW.getTime() + 11 * 60_000);
  assert.equal((await postComment(store, draft(), ctx({ now: later }))).ok, true);
});

// --- Votos (RF-29, RF-30, RF-38) ---

test('votar exige un token ya emitido y un valor de +1 o -1', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const vote = (extra) => voteComment(store, { commentId: author.id, value: 1, token: generateToken(), ipHash: IP_B, ...extra });
  assert.equal((await vote({ token: undefined })).error, 'no-token');
  assert.equal((await vote({ token: 'x' })).error, 'no-token');
  assert.equal((await vote({ value: 1000 })).error, 'invalid-vote');
  assert.equal((await vote({ value: '1' })).error, 'invalid-vote');
  assert.equal(store.votes.length, 0);
});

test('un voto por lector; repetirlo lo retira y cambiarlo lo reemplaza', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const reader = generateToken();
  const vote = (value) => voteComment(store, { commentId: author.id, value, token: reader, ipHash: IP_B });
  await vote(1);
  await vote(-1);
  assert.deepEqual(store.votes.map((v) => v.value), [-1]);
  await vote(-1);
  assert.equal(store.votes.length, 0);
});

test('no se puede votar el propio comentario, ni con otro token desde la misma conexión', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  assert.equal((await voteComment(store, { commentId: author.id, value: 1, token: author.token, ipHash: IP_B })).error, 'own-comment');
  assert.equal((await voteComment(store, { commentId: author.id, value: 1, token: generateToken(), ipHash: IP_A })).error, 'own-comment');
});

// --- Borrado propio (RF-37) ---

test('solo quien comentó puede borrar, y queda como deleted', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  assert.equal((await deleteOwnComment(store, { commentId: author.id, token: generateToken() })).error, 'forbidden');
  assert.equal((await deleteOwnComment(store, { commentId: author.id, token: author.token })).ok, true);
  assert.equal((await store.getById(author.id)).status, 'deleted');
});

test('borrar no deshace una cuarentena ni un ocultamiento de Luis', async () => {
  const store = new InMemoryCommentStore();
  for (const status of ['quarantined', 'hidden']) {
    const author = await postComment(store, draft(), ctx({ ipHash: status === 'hidden' ? IP_B : IP_A }));
    await store.setStatus(author.id, status);
    assert.equal((await deleteOwnComment(store, { commentId: author.id, token: author.token })).ok, true);
    assert.equal((await store.getById(author.id)).status, status);
  }
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
  ipHash: IP_A,
  createdAt: '2026-11-08T10:00:00Z',
  ...extra,
});

test('arma ramas, ordena por votos y luego por antigüedad', () => {
  const comments = [stored('a', null), stored('b', null, { createdAt: '2026-11-08T09:00:00Z' }), stored('c', 'a')];
  const roots = buildThread(comments, [{ commentId: 'a', voterHash: 'x', value: 1 }]);
  assert.deepEqual(roots.map((c) => c.id), ['a', 'b']);
  assert.equal(roots[0].score, 1);
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
  assert.deepEqual(buildThread([stored('a', null, { status: 'quarantined' }), stored('b', 'a')], []), []);
});

test('nunca expone hashes ni IP, y marca los comentarios propios', () => {
  const [root] = buildThread([stored('a', null)], [], 'h-a');
  assert.equal(root.mine, true);
  assert.equal('authorTokenHash' in root, false);
  assert.equal('ipHash' in root, false);
});

test('la sangría se detiene en el nivel 3', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i, all) => stored(id, i === 0 ? null : all[i - 1]));
  let node = buildThread(chain, [])[0];
  while (node.replies.length) node = node.replies[0];
  assert.equal(node.depth, 5);
  assert.equal(node.indent, 3);
});

test('una cadena enorme editada a mano no rompe el armado', () => {
  const chain = Array.from({ length: 20000 }, (_, i) => stored(`n${i}`, i === 0 ? null : `n${i - 1}`));
  assert.doesNotThrow(() => buildThread(chain, []));
});
