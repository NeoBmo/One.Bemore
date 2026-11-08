import { reviewBody } from './moderation.ts';
import { aliasFromHash, generateToken, hashToken, isHash, isToken } from './token.ts';
import { LIMITS, type CommentStatus, type CommentStore, type StoredComment } from './types.ts';
import { validateDraft, type CommentDraft, type DraftError } from './validate.ts';

export interface PostContext {
  now: Date;
  // La IP ya llega convertida en hash por la capa de servidor; nunca en claro.
  ipHash: string;
  knownPosts: ReadonlySet<string>;
  newId: () => string;
}

export type PostError = DraftError | 'invalid-post' | 'invalid-parent' | 'too-deep' | 'rate-limited';

export type PostResult =
  | { ok: true; id: string; status: CommentStatus; token?: string; error?: undefined }
  | { ok: false; error: PostError };

const assertIpHash = (ipHash: string) => {
  // Un error de programación, no del lector: la IP en claro nunca debe llegar aquí.
  if (!isHash(ipHash)) throw new Error('ipHash debe ser un SHA-256 en hexadecimal');
};

// Sube por los padres. La rama está abierta solo si todos sus ancestros son visibles;
// así una cuarentena o un ocultamiento cierra también todo lo que cuelga de él.
const openBranchDepth = async (store: CommentStore, comment: StoredComment): Promise<number | undefined> => {
  let current: StoredComment | undefined = comment;
  let depth = 0;
  while (current) {
    if (current.status !== 'visible') return undefined;
    if (!current.parentId) return depth;
    if (++depth > LIMITS.maxDepth) return undefined;
    current = await store.getById(current.parentId);
    if (!current) return undefined;
  }
  return undefined;
};

// Reglas de publicación. Turnstile se verifica antes, en la capa de servidor.
export const postComment = async (store: CommentStore, draft: CommentDraft, ctx: PostContext): Promise<PostResult> => {
  assertIpHash(ctx.ipHash);

  // Un bot rellenó el campo trampa: respondemos igual que a un éxito real,
  // con la misma forma, para no enseñarle qué lo delató.
  if (String(draft.honeypot ?? '').trim()) {
    return { ok: true, id: ctx.newId(), status: 'visible', token: isToken(draft.token) ? undefined : generateToken() };
  }

  const checked = validateDraft(draft);
  if (!checked.ok) return { ok: false, error: checked.error };
  const { postSlug, parentId, body, alias } = checked.value;

  if (!ctx.knownPosts.has(postSlug)) return { ok: false, error: 'invalid-post' };

  if (parentId) {
    const parent = await store.getById(parentId);
    if (!parent || parent.postSlug !== postSlug) return { ok: false, error: 'invalid-parent' };
    const depth = await openBranchDepth(store, parent);
    if (depth === undefined) return { ok: false, error: 'invalid-parent' };
    if (depth + 1 > LIMITS.maxDepth) return { ok: false, error: 'too-deep' };
  }

  const since = new Date(ctx.now.getTime() - LIMITS.rateWindowMs).toISOString();
  if ((await store.countRecentByIp(ctx.ipHash, since)) >= LIMITS.rateMax) {
    return { ok: false, error: 'rate-limited' };
  }

  // Sin token válido, este lector es nuevo: se le entrega uno y solo se guarda su hash.
  const newToken = isToken(draft.token) ? undefined : generateToken();
  const tokenHash = await hashToken(newToken ?? (draft.token as string));
  // El alias también se modera: es texto público igual que el comentario.
  const flagged = reviewBody(body).length > 0 || (alias !== '' && reviewBody(alias).length > 0);
  const status: CommentStatus = flagged ? 'quarantined' : 'visible';
  const id = ctx.newId();

  await store.insert({
    id,
    postSlug,
    parentId,
    alias: alias || aliasFromHash(tokenHash),
    body,
    status,
    authorTokenHash: tokenHash,
    ipHash: ctx.ipHash,
    createdAt: ctx.now.toISOString(),
  });

  return { ok: true, id, status, token: newToken };
};

export type VoteError = 'no-token' | 'invalid-vote' | 'not-found' | 'own-comment';

// Votar exige un token ya emitido: crear uno por voto permitiría votar sin límite.
// Un voto por lector y comentario; repetir el mismo valor lo retira.
export const voteComment = async (
  store: CommentStore,
  input: { commentId: string; value: unknown; token?: string; ipHash: string },
): Promise<{ ok: true; error?: undefined } | { ok: false; error: VoteError }> => {
  assertIpHash(input.ipHash);
  if (!isToken(input.token)) return { ok: false, error: 'no-token' };
  if (input.value !== 1 && input.value !== -1) return { ok: false, error: 'invalid-vote' };

  const comment = await store.getById(input.commentId);
  if (!comment || (await openBranchDepth(store, comment)) === undefined) return { ok: false, error: 'not-found' };

  const voterHash = await hashToken(input.token);
  // Con otro token pero desde la misma conexión del autor también cuenta como propio.
  if (voterHash === comment.authorTokenHash || input.ipHash === comment.ipHash) {
    return { ok: false, error: 'own-comment' };
  }

  const current = await store.getVote(comment.id, voterHash);
  if (current?.value === input.value) await store.deleteVote(comment.id, voterHash);
  else await store.saveVote({ commentId: comment.id, voterHash, value: input.value });

  return { ok: true };
};

// Solo quien tiene el token del autor puede borrar, y solo lo que está visible:
// borrar no puede deshacer una cuarentena ni un ocultamiento decididos por Luis.
export const deleteOwnComment = async (
  store: CommentStore,
  input: { commentId: string; token?: string },
): Promise<{ ok: true; error?: undefined } | { ok: false; error: 'not-found' | 'forbidden' }> => {
  const comment = await store.getById(input.commentId);
  if (!comment || comment.status === 'deleted') return { ok: false, error: 'not-found' };
  if (!isToken(input.token) || (await hashToken(input.token)) !== comment.authorTokenHash) {
    return { ok: false, error: 'forbidden' };
  }
  if (comment.status === 'visible') await store.setStatus(comment.id, 'deleted');
  return { ok: true };
};
