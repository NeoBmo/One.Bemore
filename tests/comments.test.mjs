import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThread } from '../src/lib/comments/thread.ts';
import { countLinks, reviewBody } from '../src/lib/comments/moderation.ts';
import { cleanText } from '../src/lib/comments/text.ts';
import { validateDraft } from '../src/lib/comments/validate.ts';
import { aliasFromHash, hashIp, hashToken, issueToken, normalizeIp, verifyToken } from '../src/lib/comments/token.ts';
import { InMemoryCommentStore } from '../src/lib/comments/memory-store.ts';
import { deleteOwnComment, issueReaderToken, postComment, voteComment } from '../src/lib/comments/service.ts';

const NOW = new Date('2026-11-08T12:00:00Z');
const SECRET = 'k'.repeat(32);
const IP_A = 'a'.repeat(64);
const IP_B = 'b'.repeat(64);
const IP_C = 'c'.repeat(64);
const SALT = 's'.repeat(32);
let counter = 0;
const ctx = (extra = {}) => ({
  now: NOW,
  ipHash: IP_A,
  tokenSecret: SECRET,
  knownPosts: new Set(['habitos']),
  newId: () => `c${++counter}`,
  ...extra,
});
const draft = (extra = {}) => ({ postSlug: 'habitos', parentId: null, alias: '', body: 'Buen artículo', honeypot: '', token: undefined, ...extra });
const reader = () => issueReaderToken({ tokenSecret: SECRET });
const vote = (store, input) => voteComment(store, { tokenSecret: SECRET, ipHash: IP_B, ...input });

// --- Texto que se guarda (RF-34) ---

test('valida longitudes y limpia espacios', () => {
  assert.equal(validateDraft(draft({ body: ' a ' })).error, 'body-too-short');
  assert.equal(validateDraft(draft({ body: 'x'.repeat(2001) })).error, 'body-too-long');
  assert.equal(validateDraft(draft({ alias: 'x'.repeat(41) })).error, 'alias-too-long');
  const ok = validateDraft(draft({ body: '  hola\n\n\n\n\nmundo  ', alias: '  Ana ' }));
  assert.equal(ok.value.body, 'hola\n\nmundo');
  assert.equal(ok.value.alias, 'Ana');
});

test('respeta lo que escribió el lector: ordinales, símbolos y tabuladores', () => {
  assert.equal(cleanText('El 1.º y la 2.ª edición'), 'El 1.º y la 2.ª edición');
  assert.equal(cleanText('m² ½ ™'), 'm² ½ ™');
  assert.equal(cleanText('a\tb'), 'a b');
});

test('conserva emojis compuestos y banderas de subdivisión', () => {
  const coder = '\u{1F469}\u200D\u{1F4BB}';
  const scotland = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  assert.equal(cleanText(`${coder} ok ${scotland}`), `${coder} ok ${scotland}`);
});

test('lo invisible no cuenta como contenido', () => {
  for (const body of ['\u200B\u200B\u202E', '\u200D\u200D', '\u3164\u3164', '\u2800\u2800', '\u034F\u034F', '\uFE0F\uFE0F', '\u115F\u1160']) {
    assert.equal(validateDraft(draft({ body })).error, 'body-too-short', JSON.stringify(body));
  }
  assert.equal(cleanText('ho\u0000la\u0085\u2028adiós'), 'hola\nadiós');
});

test('las líneas con solo espacios también se comprimen', () => {
  assert.equal(cleanText(`a${'\n \n \n \n'.repeat(3)}b`), 'a\n\nb');
});

test('el texto zalgo se recorta, aunque intercale uniones invisibles', () => {
  assert.equal([...cleanText(`ab${'\u0301'.repeat(1998)}`)].length, 5);
  assert.equal([...cleanText(`z${'\u0301\u0302\u0303\u200D'.repeat(10)}`)].length, 4);
});

test('un padre vacío se trata como comentario raíz', () => {
  assert.equal(validateDraft(draft({ parentId: '' })).value.parentId, null);
});

// --- Alias ---

test('no se puede suplantar al autor, al blog ni a otros lectores', () => {
  const impostors = [
    'Lector-1A2B3C', 'Iector-AB12CD', 'Lеctor-AB12', 'Luis', 'L\u200Buis', 'ＬＵＩＳ',
    'Luіs', 'Luis (autor)', 'Luis - autor del blog', 'LuisBMO', 'NeoBmo', 'one.bmore', 'One.Bemore', 'admin',
  ];
  for (const alias of impostors) assert.equal(validateDraft(draft({ alias })).error, 'alias-reserved', alias);
});

test('los nombres reales no se bloquean', () => {
  for (const alias of ['Luisa', 'Lectora', 'Lectora Ana', 'Lector de Borges', 'José', 'Мария']) {
    assert.equal(validateDraft(draft({ alias })).ok, true, alias);
  }
});

test('un alias invisible pasa a usar el automático', async () => {
  for (const alias of ['\u200B', '\u3164\u3164', '\u200D\u200D']) {
    const store = new InMemoryCommentStore();
    await postComment(store, draft({ alias }), ctx());
    assert.match(store.comments[0].alias, /^Lector-[0-9A-F]{6}$/, JSON.stringify(alias));
  }
});

test('un alias con enlace u ofensivo envía el comentario a cuarentena', async () => {
  for (const alias of ['IDIOTA', 'compra-barato.xyz', 'www.spam.com']) {
    const store = new InMemoryCommentStore();
    assert.equal((await postComment(store, draft({ alias }), ctx())).status, 'quarantined', alias);
  }
});

// --- Moderación (RF-27) ---

test('un comentario normal se publica', () => {
  for (const text of [
    'Me gustó mucho, gracias por compartirlo.',
    'Un solo enlace https://astro.build está bien',
    'Una línea -------- o espacios        no es spam',
    'Gracias.Me gustó.Es genial',
    'Leí el capítulo 3.es muy bueno y el 4.Me encantó',
    'Uso ASP.NET y Socket.io',
    'Escríbeme a ana@correo.com o a luis@blog.es',
    'Cuesta 100000000 pesos',
  ]) {
    assert.deepEqual(reviewBody(text), [], text);
  }
});

test('lo sospechoso va a cuarentena con su motivo', () => {
  assert.deepEqual(reviewBody('mira https://a.com y https://b.com'), ['links']);
  assert.deepEqual(reviewBody('eres un IDIOTA'), ['banned-word']);
  assert.deepEqual(reviewBody('ESTO ES TOTALMENTE FALSO Y LO SABES'), ['shouting']);
  assert.deepEqual(reviewBody('noooooooooo'), ['repeated']);
});

test('los enlaces disfrazados también cuentan', () => {
  assert.equal(countLinks('https://a.com/https://b.com'), 2);
  assert.equal(countLinks('visita casin0.com o bit.ly/x'), 2);
  assert.equal(countLinks('ｈｔｔｐ://a.com'), 1);
});

test('la lista ignora tildes, ancho completo e invisibles, y admite plurales', () => {
  for (const text of ['qué estúpido', 'ＩＤＩＯＴＡ', 'idi\u200Bota', 'son unos idiotas', 'pendejos']) {
    assert.deepEqual(reviewBody(text), ['banned-word'], text);
  }
  assert.deepEqual(reviewBody('una idea mierdosa'), []);
});

// --- Tokens firmados (RF-25) e IP (RF-39) ---

test('un token solo vale si lo firmó el servidor', async () => {
  const token = await issueToken(SECRET);
  assert.equal(await verifyToken(token, SECRET), true);
  assert.equal(await verifyToken(token, 'otro'.repeat(8)), false);
  const [random] = token.split('.');
  assert.equal(await verifyToken(`${random}.${'A'.repeat(43)}`, SECRET), false);
  assert.equal(await verifyToken('corto', SECRET), false);
  await assert.rejects(() => issueToken('corto'));
});

test('el alias automático no se puede elegir desde fuera', async () => {
  const hash = await hashToken(await issueToken(SECRET));
  assert.match(await aliasFromHash(hash, SECRET), /^Lector-[0-9A-F]{6}$/);
  assert.notEqual(await aliasFromHash(hash, SECRET), await aliasFromHash(hash, 'z'.repeat(32)));
});

test('la IP se valida, se agrupa por conexión y se guarda como hash con sal', async () => {
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('::ffff:0102:0304'), '1.2.3.4');
  assert.equal(normalizeIp('[2001:db8:1:2::1]'), '2001:db8:1:2::/64');
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(normalizeIp('2001:db8:aa:bb:1:2:3:4'), normalizeIp('2001:db8:aa:bb:ffff::9'));
  for (const bad of ['garbage', '1.2.3.4, 5.6.7.8', '999.1.1.1']) assert.throws(() => normalizeIp(bad), bad);
  assert.equal(await hashIp('1.2.3.4', SALT), await hashIp('::ffff:1.2.3.4', SALT));
  await assert.rejects(async () => hashIp('1.2.3.4', 'corta'));
});

test('el servicio rechaza una IP que no llegue como hash', async () => {
  await assert.rejects(() => postComment(new InMemoryCommentStore(), draft(), ctx({ ipHash: '1.2.3.4' })));
});

// --- Servicio: publicar ---

test('publica al instante y entrega un token firmado la primera vez', async () => {
  const store = new InMemoryCommentStore();
  const result = await postComment(store, draft(), ctx());
  assert.equal(result.status, 'visible');
  assert.equal(await verifyToken(result.token, SECRET), true);
  assert.notEqual(store.comments[0].authorTokenHash, result.token);
  assert.equal(store.comments[0].ipHash, IP_A);
});

test('con un token válido conserva el alias; con uno fabricado recibe otro', async () => {
  const store = new InMemoryCommentStore();
  const first = await postComment(store, draft(), ctx());
  const second = await postComment(store, draft({ token: first.token }), ctx());
  assert.equal(second.token, undefined);
  assert.equal(store.comments[0].alias, store.comments[1].alias);
  const [random] = first.token.split('.');
  const forged = await postComment(store, draft({ token: `${random}.${'B'.repeat(43)}` }), ctx({ ipHash: IP_B }));
  assert.notEqual(forged.token, undefined);
});

test('el campo trampa responde igual que un éxito real, sin guardar (RF-36)', async () => {
  const store = new InMemoryCommentStore();
  const real = await postComment(store, draft(), ctx());
  const fake = await postComment(store, draft({ honeypot: 'http://spam' }), ctx());
  assert.deepEqual(Object.keys(fake).sort(), Object.keys(real).sort());
  assert.equal(store.comments.length, 1);
  assert.equal((await postComment(store, draft({ honeypot: 'x', body: 'a' }), ctx())).error, 'body-too-short');
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
  assert.equal((await vote(store, { commentId: child.id, value: 1, token: await reader(), ipHash: IP_C })).error, 'not-found');
});

test('las ramas tienen un tope de profundidad', async () => {
  const store = new InMemoryCommentStore();
  let parentId = null;
  for (let i = 0; i <= 30; i += 1) {
    store.comments.push({ id: `p${i}`, postSlug: 'habitos', parentId, alias: 'x', body: 'x', status: 'visible', authorDeleted: false, authorTokenHash: 'h', ipHash: IP_B, createdAt: NOW.toISOString() });
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

test('votar exige un token firmado y un valor de +1 o -1', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const [random] = (await reader()).split('.');
  for (const token of [undefined, 'x', `${random}.${'C'.repeat(43)}`]) {
    assert.equal((await vote(store, { commentId: author.id, value: 1, token })).error, 'no-token');
  }
  for (const value of [1000, '1', 0, true, null]) {
    assert.equal((await vote(store, { commentId: author.id, value, token: await reader() })).error, 'invalid-vote');
  }
  assert.equal(store.votes.length, 0);
});

test('un voto por lector; repetirlo lo retira y cambiarlo lo reemplaza', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const token = await reader();
  await vote(store, { commentId: author.id, value: 1, token });
  await vote(store, { commentId: author.id, value: -1, token });
  assert.deepEqual(store.votes.map((v) => v.value), [-1]);
  await vote(store, { commentId: author.id, value: -1, token });
  assert.equal(store.votes.length, 0);
});

test('no se puede votar el propio comentario, ni con otro token desde la misma conexión', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  assert.equal((await vote(store, { commentId: author.id, value: 1, token: author.token })).error, 'own-comment');
  assert.equal((await vote(store, { commentId: author.id, value: 1, token: await reader(), ipHash: IP_A })).error, 'own-comment');
});

// --- Borrado por el autor (RF-37) ---

test('solo quien comentó puede borrar, y deja de mostrarse', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  const del = (token) => deleteOwnComment(store, { commentId: author.id, token, tokenSecret: SECRET });
  assert.equal((await del(await reader())).error, 'forbidden');
  assert.equal((await del(author.token)).ok, true);
  assert.equal((await store.getById(author.id)).authorDeleted, true);
  assert.deepEqual(buildThread(store.comments, {}), []);
});

test('lo que el autor borró en revisión nunca se publica, aunque Luis lo apruebe', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft({ body: 'IDIOTA' }), ctx());
  assert.equal((await deleteOwnComment(store, { commentId: author.id, token: author.token, tokenSecret: SECRET })).ok, true);
  assert.equal((await store.getById(author.id)).status, 'quarantined');
  await store.setStatus(author.id, 'visible');
  assert.deepEqual(buildThread(store.comments, {}), []);
});

test('no se puede responder ni votar un comentario borrado por su autor', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  await deleteOwnComment(store, { commentId: author.id, token: author.token, tokenSecret: SECRET });
  assert.equal((await postComment(store, draft({ parentId: author.id }), ctx({ ipHash: IP_B }))).error, 'invalid-parent');
  assert.equal((await vote(store, { commentId: author.id, value: 1, token: await reader() })).error, 'not-found');
});

// --- Hilo (RF-28, RF-30, RF-31) ---

const stored = (id, parentId, extra = {}) => ({
  id,
  postSlug: 'habitos',
  parentId,
  alias: `A-${id}`,
  body: `texto ${id}`,
  status: 'visible',
  authorDeleted: false,
  authorTokenHash: `h-${id}`,
  ipHash: IP_A,
  createdAt: '2026-11-08T10:00:00Z',
  ...extra,
});

test('arma ramas, ordena por votos y luego por antigüedad', () => {
  const comments = [stored('a', null), stored('b', null, { createdAt: '2026-11-08T09:00:00Z' }), stored('c', 'a')];
  const roots = buildThread(comments, { a: 1 });
  assert.deepEqual(roots.map((c) => c.id), ['a', 'b']);
  assert.equal(roots[0].score, 1);
  assert.equal(roots[0].replies[0].depth, 1);
});

test('los votos negativos ordenan pero nunca ocultan', () => {
  const roots = buildThread([stored('a', null)], { a: -3 });
  assert.equal(roots.length, 1);
  assert.equal(roots[0].score, -3);
});

test('un borrado con respuestas deja su lugar y su texto desaparece', () => {
  for (const extra of [{ status: 'deleted' }, { authorDeleted: true }]) {
    const roots = buildThread([stored('a', null, extra), stored('b', 'a')], {}, 'h-a');
    assert.equal(roots[0].removed, true);
    assert.equal(roots[0].body, null);
    assert.equal(roots[0].alias, null);
    assert.equal(roots[0].mine, false);
    assert.equal(roots[0].replies[0].id, 'b');
  }
});

test('un oculto sin respuestas visibles desaparece del todo', () => {
  assert.deepEqual(buildThread([stored('a', null, { status: 'hidden' })], {}), []);
});

test('la cuarentena oculta el comentario y toda su rama', () => {
  assert.deepEqual(buildThread([stored('a', null, { status: 'quarantined' }), stored('b', 'a')], {}), []);
});

test('nunca expone hashes ni IP, y marca los comentarios propios', () => {
  const [root] = buildThread([stored('a', null)], {}, 'h-a');
  assert.equal(root.mine, true);
  assert.equal('authorTokenHash' in root, false);
  assert.equal('ipHash' in root, false);
  assert.equal('authorDeleted' in root, false);
});

test('la sangría se detiene en el nivel 3', () => {
  const chain = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i, all) => stored(id, i === 0 ? null : all[i - 1]));
  let node = buildThread(chain, {})[0];
  while (node.replies.length) node = node.replies[0];
  assert.equal(node.depth, 5);
  assert.equal(node.indent, 3);
});

test('una cadena enorme editada a mano no rompe el armado', () => {
  const chain = Array.from({ length: 20000 }, (_, i) => stored(`n${i}`, i === 0 ? null : `n${i - 1}`));
  assert.doesNotThrow(() => buildThread(chain, {}));
});

// --- Cuarta revisión ---

test('un enlace con www cuenta una sola vez', () => {
  assert.equal(countLinks('Mira este video https://www.youtube.com/watch?v=abc'), 1);
  assert.deepEqual(reviewBody('Mira este video https://www.youtube.com/watch?v=abc'), []);
  assert.deepEqual(reviewBody('http://www.ejemplo.es'), []);
  assert.equal(countLinks('https://a.com/https://b.com'), 2);
});

test('verbos comunes no van a cuarentena', () => {
  assert.deepEqual(reviewBody('Si apuestas por la constancia, ganas'), []);
});

test('el alias puede ir en mayúsculas o parecerse a «lector» sin imitar al automático', () => {
  for (const alias of ['MARIA FERNANDA GONZALEZ', 'Lector Café', 'Lector 2025', 'Lector-1A2B']) {
    assert.equal(validateDraft(draft({ alias })).ok, true, alias);
  }
});

test('un alias en mayúsculas no envía el comentario a cuarentena', async () => {
  const store = new InMemoryCommentStore();
  assert.equal((await postComment(store, draft({ alias: 'MARIA FERNANDA GONZALEZ' }), ctx())).status, 'visible');
});

test('las letras parecidas no sirven para suplantar', () => {
  for (const alias of ['NeoBm0', 'Luıs', 'NeoBmᴏ', 'ꓡuis', 'Lսis']) {
    assert.equal(validateDraft(draft({ alias })).error, 'alias-reserved', alias);
  }
});

test('el campo trampa devuelve el mismo estado que tendría el envío real', async () => {
  const store = new InMemoryCommentStore();
  const fake = await postComment(store, draft({ honeypot: 'x', body: 'idiota https://a.com https://b.com' }), ctx());
  assert.equal(fake.status, 'quarantined');
  assert.equal(store.comments.length, 0);
});

test('las etiquetas invisibles sueltas se quitan; las banderas válidas se conservan', () => {
  const hidden = '\u{1F3F4}\u{E0049}\u{E0047}\u{E004E}\u{E004F}\u{E0052}\u{E0045}\u{E0020}\u{E0041}\u{E004C}\u{E004C}';
  assert.equal(cleanText(`hola ${hidden}`), 'hola \u{1F3F4}');
  const scotland = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
  assert.equal(cleanText(scotland), scotland);
});

test('lo que no es texto se rechaza en lugar de convertirse', () => {
  assert.equal(validateDraft(draft({ body: ['ho', 'la'] })).error, 'invalid-input');
  assert.equal(validateDraft(draft({ parentId: ['c1'] })).error, 'invalid-input');
  assert.equal(validateDraft(draft({ alias: { toString: () => 'Ana' } })).error, 'invalid-input');
});

test('una rama bajo un comentario retirado queda cerrada', () => {
  const roots = buildThread([stored('a', null, { status: 'deleted' }), stored('b', 'a'), stored('c', 'b'), stored('d', null)], {});
  const byId = Object.fromEntries(roots.map((root) => [root.id, root]));
  assert.equal(byId.a.locked, true);
  assert.equal(byId.a.replies[0].locked, true);
  assert.equal(byId.a.replies[0].replies[0].locked, true);
  assert.equal(byId.d.locked, false);
});

test('el almacén entrega puntuaciones, nunca los votos de cada lector', async () => {
  const store = new InMemoryCommentStore();
  const author = await postComment(store, draft(), ctx());
  await vote(store, { commentId: author.id, value: 1, token: await reader() });
  await vote(store, { commentId: author.id, value: 1, token: await reader(), ipHash: IP_C });
  const listed = await store.listByPost('habitos');
  assert.deepEqual({ ...listed.scores }, { [author.id]: 2 });
  assert.equal('votes' in listed, false);
});

test('la interfaz sabe dónde no se puede responder', () => {
  const chain = Array.from({ length: 32 }, (_, i) => stored(`d${i}`, i === 0 ? null : `d${i - 1}`));
  let node = buildThread(chain, {})[0];
  while (node.depth < 30) node = node.replies[0];
  assert.equal(node.locked, false);
  assert.equal(node.canReply, false);
  assert.equal(buildThread([stored('a', null)], {})[0].canReply, true);
});

test('un id raro no rompe las puntuaciones ni los votos', async () => {
  assert.equal(buildThread([stored('constructor', null)], {})[0].score, 0);
  const store = new InMemoryCommentStore();
  assert.equal((await vote(store, { commentId: ['c1'], value: 1, token: await reader() })).error, 'not-found');
  assert.equal((await deleteOwnComment(store, { commentId: { id: 'c1' }, token: await reader(), tokenSecret: SECRET })).error, 'not-found');
});
