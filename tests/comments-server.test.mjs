import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryCommentStore } from '../src/lib/comments/memory-store.ts';
import { castVote, listComments, removeComment, requestReaderToken, submitComment } from '../src/lib/comments/server.ts';
import { SupabaseCommentStore } from '../src/lib/comments/supabase-store.ts';
import { createTurnstileVerifier, isTurnstileTestSecret } from '../src/lib/comments/turnstile.ts';
import { CommentsUnavailableError } from '../src/lib/comments/types.ts';

const SECRET = 'k'.repeat(32);
const SALT = 's'.repeat(32);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const UUID = '0b0c6a54-6d5e-4b8f-9d5c-1f2e3a4b5c6d';

// Un fetch falso que registra cada petición y responde lo que diga el test.
const fakeFetch = (respond) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status = 200, json } = await respond(String(url), init);
    return new Response(json === undefined ? null : JSON.stringify(json), { status });
  };
  fn.calls = calls;
  return fn;
};

const supabase = (respond) => {
  const fetch = fakeFetch(respond);
  return { store: new SupabaseCommentStore('https://demo.supabase.co/', 'sb_secret_x', fetch), fetch };
};

const newComment = (extra = {}) => ({
  postSlug: 'habitos',
  parentId: null,
  alias: 'Ana',
  body: 'Hola',
  status: 'visible',
  authorTokenHash: HASH_A,
  ipHash: HASH_B,
  ...extra,
});

// --- Adaptador de Supabase ---

test('publica solo por la función atómica, con la clave en apikey y sin Bearer', async () => {
  const { store, fetch } = supabase(() => ({ json: { ok: true, id: UUID } }));
  assert.deepEqual(await store.postComment(newComment()), { ok: true, id: UUID });
  const [call] = fetch.calls;
  assert.equal(call.url, 'https://demo.supabase.co/rest/v1/rpc/post_comment');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.apikey, 'sb_secret_x');
  assert.equal('authorization' in call.init.headers, false);
  assert.deepEqual(Object.keys(call.body).sort(), [
    'p_alias', 'p_author_token_hash', 'p_body', 'p_ip_hash', 'p_parent_id', 'p_post_slug', 'p_status',
  ]);
});

test('traduce los códigos de la base y rechaza respuestas desconocidas', async () => {
  for (const error of ['rate-limited', 'invalid-parent', 'too-deep', 'invalid-input']) {
    const { store } = supabase(() => ({ json: { ok: false, error } }));
    assert.deepEqual(await store.postComment(newComment()), { ok: false, error });
  }
  const { store } = supabase(() => ({ json: { ok: false, error: 'algo raro' } }));
  await assert.rejects(() => store.postComment(newComment()), CommentsUnavailableError);
});

test('un error de la base nunca deja pasar su mensaje', async () => {
  const leak = 'duplicate key value violates unique constraint, ip_hash=aaaa';
  const { store } = supabase(() => ({ status: 400, json: { message: leak, details: leak } }));
  await assert.rejects(
    () => store.postComment(newComment()),
    (error) => error instanceof CommentsUnavailableError && !error.message.includes('ip_hash') && error.message.includes('400'),
  );
});

test('una red caída o una respuesta ilegible quedan como no disponible', async () => {
  const down = new SupabaseCommentStore('https://demo.supabase.co', 'k', async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(() => down.listByPost('habitos'), CommentsUnavailableError);
  const garbage = new SupabaseCommentStore('https://demo.supabase.co', 'k', async () => new Response('<html>'));
  await assert.rejects(() => garbage.toggleVote({ commentId: UUID, voterHash: HASH_A, ipHash: HASH_B, value: 1 }), CommentsUnavailableError);
});

test('llama a fetch sin el almacén como this, como exige Cloudflare Workers', async () => {
  // Imita a workerd: fetch rechaza cualquier `this` que no sea el global.
  const strictFetch = function () {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return Promise.resolve(Response.json([]));
  };
  const store = new SupabaseCommentStore('https://demo.supabase.co', 'k', strictFetch);
  const { comments, scores } = await store.listByPost('habitos');
  assert.deepEqual(comments, []);
  assert.deepEqual(Object.keys(scores), []);
});

test('un id que no es uuid se responde sin llamar a la base', async () => {
  const { store, fetch } = supabase(() => ({ json: 'ok' }));
  assert.deepEqual(await store.postComment(newComment({ parentId: 'c1' })), { ok: false, error: 'invalid-parent' });
  assert.equal(await store.toggleVote({ commentId: "1' or 1=1", voterHash: HASH_A, ipHash: HASH_B, value: 1 }), 'not-found');
  assert.equal(await store.markAuthorDeleted('nadie', HASH_A), false);
  assert.equal(fetch.calls.length, 0);
});

test('vota y borra por sus funciones, y valida lo que devuelven', async () => {
  const { store, fetch } = supabase((url) => ({ json: url.endsWith('toggle_vote') ? 'own-comment' : true }));
  assert.equal(await store.toggleVote({ commentId: UUID, voterHash: HASH_A, ipHash: HASH_B, value: -1 }), 'own-comment');
  assert.equal(await store.markAuthorDeleted(UUID, HASH_A), true);
  assert.deepEqual(fetch.calls.map((call) => call.url.split('/').pop()), ['toggle_vote', 'mark_author_deleted']);
  assert.equal(fetch.calls[0].body.p_value, -1);
});

test('lista con filtros de PostgREST y suma puntuaciones por tandas', async () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
    post_slug: 'habitos',
    parent_id: null,
    alias: 'Ana',
    body: 'Hola',
    status: 'visible',
    author_deleted: false,
    author_token_hash: HASH_A,
    ip_hash: HASH_B,
    created_at: '2026-11-18T12:00:00Z',
  }));
  const { store, fetch } = supabase((url) => {
    if (url.includes('/comments?')) return { json: rows };
    const ids = decodeURIComponent(new URL(url).searchParams.get('comment_id')).slice(4, -1).split(',');
    return { json: ids.map((id) => ({ comment_id: id, score: 2 })) };
  });
  const { comments, scores } = await store.listByPost('habitos');
  assert.equal(comments.length, 150);
  assert.equal(comments[0].postSlug, 'habitos');
  assert.equal(scores[rows[149].id], 2);
  const list = new URL(fetch.calls[0].url);
  assert.equal(list.searchParams.get('post_slug'), 'eq.habitos');
  assert.equal(fetch.calls.length, 3);
});

test('un estado desconocido en la base no llega al hilo', async () => {
  const { store } = supabase((url) => ({ json: url.includes('/comments?') ? [{ id: UUID, status: 'pendiente' }] : [] }));
  await assert.rejects(() => store.listByPost('habitos'), CommentsUnavailableError);
});

// --- Turnstile ---

test('Turnstile solo aprueba con un sí explícito de Cloudflare', async () => {
  let sent;
  const verify = createTurnstileVerifier('secreto', async (url, init) => {
    sent = { url, form: Object.fromEntries(init.body) };
    return new Response(JSON.stringify({ success: true }));
  });
  assert.equal(await verify('codigo', '1.2.3.4'), true);
  assert.equal(sent.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.deepEqual(sent.form, { secret: 'secreto', response: 'codigo', remoteip: '1.2.3.4' });

  const no = createTurnstileVerifier('s', async () => new Response(JSON.stringify({ success: 'true' })));
  assert.equal(await no('codigo', '1.2.3.4'), false);
});

test('Turnstile no llama a Cloudflare sin código y separa su caída de un rechazo', async () => {
  let calls = 0;
  const verify = createTurnstileVerifier('s', async () => {
    calls += 1;
    return new Response('caído', { status: 503 });
  });
  for (const bad of [undefined, '', 'x'.repeat(2049), ['a']]) assert.equal(await verify(bad, '1.2.3.4'), false);
  assert.equal(calls, 0);
  await assert.rejects(() => verify('codigo', '1.2.3.4'), CommentsUnavailableError);
});

test('reconoce las claves de prueba de Turnstile para no usarlas en producción', () => {
  for (const key of ['1x0000000000000000000000000000000AA', '2x0000000000000000000000000000000AA', ' 3x0000000000000000000000000000000AA ']) {
    assert.equal(isTurnstileTestSecret(key), true, key);
  }
  assert.equal(isTurnstileTestSecret('0x4AAAAAAABkMYinukE8nzYS'), false);
});

test('al listar no se pide la IP del autor', async () => {
  const { store, fetch } = supabase(() => ({ json: [] }));
  await store.listByPost('habitos');
  assert.equal(new URL(fetch.calls[0].url).searchParams.get('select').includes('ip_hash'), false);
});

// --- Capa de servidor ---

const deps = (extra = {}) => {
  const store = new InMemoryCommentStore();
  return {
    store,
    tokenSecret: SECRET,
    ipSalt: SALT,
    knownPosts: new Set(['habitos']),
    verifyChallenge: async (challenge) => challenge === 'humano',
    ...extra,
  };
};

const submit = (d, extra = {}, ip = '1.2.3.4') =>
  submitComment(d, { postSlug: 'habitos', parentId: null, alias: '', body: 'Buen artículo', challenge: 'humano', ...extra }, ip);

test('publicar exige el desafío, pero no lo gasta en un texto inválido', async () => {
  let asked = 0;
  const d = deps({ verifyChallenge: async (challenge) => (asked += 1, challenge === 'humano') });
  assert.equal((await submit(d, { body: 'a' })).error, 'body-too-short');
  assert.equal((await submit(d, { postSlug: 'no-existe' })).error, 'invalid-post');
  assert.equal(asked, 0);
  assert.equal((await submit(d, { challenge: 'bot' })).error, 'challenge-failed');
  assert.equal(d.store.comments.length, 0);
  assert.equal((await submit(d)).ok, true);
});

test('guarda la IP solo como hash con sal y agrupa IPv6 por /64', async () => {
  const d = deps();
  await submit(d, {}, '2001:db8:1:2::1');
  const [saved] = d.store.comments;
  assert.match(saved.ipHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(saved).includes('2001'), false);
  // Otra dirección de la misma /64 cuenta como la misma conexión para el autovoto.
  const reader = await requestReaderToken(d, { challenge: 'humano' }, '1.1.1.1');
  const vote = await castVote(d, { commentId: saved.id, value: 1, token: reader.token }, '2001:db8:1:2:ffff::9');
  assert.equal(vote.error, 'own-comment');
});

test('el campo trampa responde éxito sin guardar', async () => {
  const d = deps();
  const result = await submit(d, { website: 'http://spam' });
  assert.equal(result.ok, true);
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(d.store.comments.length, 0);
});

test('el hilo marca «mío» solo con un token firmado y nunca expone hashes', async () => {
  const d = deps();
  const posted = await submit(d);
  const mine = await listComments(d, { postSlug: 'habitos', token: posted.token });
  assert.equal(mine.comments[0].mine, true);
  const [random] = posted.token.split('.');
  const forged = await listComments(d, { postSlug: 'habitos', token: `${random}.${'A'.repeat(43)}` });
  assert.equal(forged.comments[0].mine, false);
  assert.equal(/[0-9a-f]{64}/.test(JSON.stringify(mine)), false);
  assert.equal((await listComments(d, { postSlug: 'otro' })).error, 'invalid-post');
});

test('un token de lector exige el desafío y sirve para votar y nada más', async () => {
  const d = deps();
  const posted = await submit(d);
  assert.equal((await requestReaderToken(d, { challenge: 'bot' }, '5.5.5.5')).error, 'challenge-failed');
  const reader = await requestReaderToken(d, { challenge: 'humano' }, '5.5.5.5');
  assert.equal((await castVote(d, { commentId: posted.id, value: 1, token: reader.token }, '5.5.5.5')).ok, true);
  assert.equal((await removeComment(d, { commentId: posted.id, token: reader.token })).error, 'forbidden');
  assert.equal((await removeComment(d, { commentId: posted.id, token: posted.token })).ok, true);
});

test('el límite de votos por IP llega hasta el lector como rate-limited', async () => {
  const d = deps();
  const posted = await submit(d);
  const reader = await requestReaderToken(d, { challenge: 'humano' }, '5.5.5.5');
  for (let i = 0; i < 60; i += 1) await castVote(d, { commentId: posted.id, value: 1, token: reader.token }, '5.5.5.5');
  assert.equal((await castVote(d, { commentId: posted.id, value: 1, token: reader.token }, '5.5.5.5')).error, 'rate-limited');
});
