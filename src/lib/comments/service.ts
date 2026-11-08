import { reviewAlias, reviewBody } from './moderation.ts';
import { aliasFromHash, hashToken, isHash, issueToken, verifyToken } from './token.ts';
import { LIMITS, isShown, type CommentStatus, type CommentStore, type StoredComment } from './types.ts';
import { validateDraft, type CommentDraft, type DraftError } from './validate.ts';

// Secretos que solo conoce el servidor. Llegan desde las variables de entorno.
export interface Secrets {
  tokenSecret: string;
}

export interface PostContext extends Secrets {
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

// Sube por los padres. La rama está abierta solo si todos sus ancestros se muestran;
// así una cuarentena, un ocultamiento o un borrado cierra todo lo que cuelga de él.
const openBranchDepth = async (store: CommentStore, comment: StoredComment): Promise<number | undefined> => {
  let current: StoredComment | undefined = comment;
  let depth = 0;
  while (current) {
    if (!isShown(current)) return undefined;
    if (!current.parentId) return depth;
    if (++depth > LIMITS.maxDepth) return undefined;
    current = await store.getById(current.parentId);
  }
  return undefined;
};

// Reglas de publicación. Turnstile se verifica antes, en la capa de servidor.
export const postComment = async (store: CommentStore, draft: CommentDraft, ctx: PostContext): Promise<PostResult> => {
  assertIpHash(ctx.ipHash);

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

  // Sin token válido (firma incluida), este lector es nuevo: se le emite uno.
  const hasToken = await verifyToken(draft.token, ctx.tokenSecret);
  const newToken = hasToken ? undefined : await issueToken(ctx.tokenSecret);

  // El alias también se modera: es texto público y no admite enlaces ni palabras de la lista.
  const flagged = reviewBody(body).length > 0 || (alias !== '' && reviewAlias(alias).length > 0);
  const status: CommentStatus = flagged ? 'quarantined' : 'visible';
  const id = ctx.newId();

  // Un bot rellenó el campo trampa. Se comprueba al final, después de validar, del límite
  // y de moderar, para que su respuesta (estado incluido) sea igual a la de un envío real.
  if (checked.value.honeypot.trim()) return { ok: true, id, status, token: newToken };

  const tokenHash = await hashToken(newToken ?? (draft.token as string));

  await store.insert({
    id,
    postSlug,
    parentId,
    alias: alias || (await aliasFromHash(tokenHash, ctx.tokenSecret)),
    body,
    status,
    authorDeleted: false,
    authorTokenHash: tokenHash,
    ipHash: ctx.ipHash,
    createdAt: ctx.now.toISOString(),
  });

  return { ok: true, id, status, token: newToken };
};

export type VoteError = 'no-token' | 'invalid-vote' | 'not-found' | 'own-comment';

// Votar exige un token firmado por el servidor: no se puede fabricar uno por voto.
// Un voto por lector y comentario; repetir el mismo valor lo retira.
export const voteComment = async (
  store: CommentStore,
  input: { commentId: string; value: unknown; token?: string; ipHash: string } & Secrets,
): Promise<{ ok: true; error?: undefined } | { ok: false; error: VoteError }> => {
  assertIpHash(input.ipHash);
  if (!(await verifyToken(input.token, input.tokenSecret))) return { ok: false, error: 'no-token' };
  if (input.value !== 1 && input.value !== -1) return { ok: false, error: 'invalid-vote' };

  if (typeof input.commentId !== 'string') return { ok: false, error: 'not-found' };
  const comment = await store.getById(input.commentId);
  if (!comment || (await openBranchDepth(store, comment)) === undefined) return { ok: false, error: 'not-found' };

  const voterHash = await hashToken(input.token as string);
  // Con otro token pero desde la misma conexión del autor también cuenta como propio.
  if (voterHash === comment.authorTokenHash || input.ipHash === comment.ipHash) {
    return { ok: false, error: 'own-comment' };
  }

  const current = await store.getVote(comment.id, voterHash);
  if (current?.value === input.value) await store.deleteVote(comment.id, voterHash);
  else await store.saveVote({ commentId: comment.id, voterHash, value: input.value });

  return { ok: true };
};

// Solo quien tiene el token del autor puede borrar. No toca el estado que decidió Luis:
// pone una marca propia, así un comentario en revisión borrado nunca llega a publicarse.
export const deleteOwnComment = async (
  store: CommentStore,
  input: { commentId: string; token?: string } & Secrets,
): Promise<{ ok: true; error?: undefined } | { ok: false; error: 'not-found' | 'forbidden' }> => {
  if (typeof input.commentId !== 'string') return { ok: false, error: 'not-found' };
  const comment = await store.getById(input.commentId);
  if (!comment || comment.authorDeleted) return { ok: false, error: 'not-found' };
  if (!(await verifyToken(input.token, input.tokenSecret))) return { ok: false, error: 'forbidden' };
  const marked = await store.markAuthorDeleted(comment.id, await hashToken(input.token as string));
  return marked ? { ok: true } : { ok: false, error: 'forbidden' };
};

// Emite un token para quien quiere votar sin haber comentado. La capa de servidor
// lo protege con Turnstile para que no se puedan pedir tokens en masa.
export const issueReaderToken = (secrets: Secrets): Promise<string> => issueToken(secrets.tokenSecret);
