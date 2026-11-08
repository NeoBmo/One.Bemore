import { reviewBody } from './moderation.ts';
import { aliasFromHash, generateToken, hashToken, isToken } from './token.ts';
import { LIMITS, type CommentStatus, type CommentStore } from './types.ts';
import { validateDraft, type CommentDraft, type DraftError } from './validate.ts';

export interface PostContext {
  now: Date;
  // La IP ya llega convertida en hash por la capa de servidor.
  ipHash: string;
  knownPosts: ReadonlySet<string>;
  newId: () => string;
}

export type PostError = DraftError | 'invalid-post' | 'invalid-parent' | 'rate-limited';

export type PostResult =
  | { ok: true; id?: string; status?: CommentStatus; token?: string; error?: undefined }
  | { ok: false; error: PostError };

// Reglas de publicación. Turnstile se verifica antes, en la capa de servidor.
export const postComment = async (store: CommentStore, draft: CommentDraft, ctx: PostContext): Promise<PostResult> => {
  // Un bot rellenó el campo trampa: fingimos éxito para no enseñarle qué lo delató.
  if (draft.honeypot.trim()) return { ok: true };

  const checked = validateDraft(draft);
  if (!checked.ok) return { ok: false, error: checked.error };
  const { postSlug, parentId, body } = checked.value;

  if (!ctx.knownPosts.has(postSlug)) return { ok: false, error: 'invalid-post' };

  if (parentId) {
    const parent = await store.getById(parentId);
    if (!parent || parent.postSlug !== postSlug || parent.status !== 'visible') {
      return { ok: false, error: 'invalid-parent' };
    }
  }

  const since = new Date(ctx.now.getTime() - LIMITS.rateWindowMs).toISOString();
  if ((await store.countRecentByIp(ctx.ipHash, since)) >= LIMITS.rateMax) {
    return { ok: false, error: 'rate-limited' };
  }

  // Sin token válido, este lector es nuevo: se le entrega uno y solo se guarda su hash.
  const newToken = isToken(draft.token) ? undefined : generateToken();
  const tokenHash = await hashToken(newToken ?? (draft.token as string));
  const status: CommentStatus = reviewBody(body).length > 0 ? 'quarantined' : 'visible';
  const id = ctx.newId();

  await store.insert({
    id,
    postSlug,
    parentId,
    alias: checked.value.alias || aliasFromHash(tokenHash),
    body,
    status,
    authorTokenHash: tokenHash,
    ipHash: ctx.ipHash,
    createdAt: ctx.now.toISOString(),
  });

  return { ok: true, id, status, token: newToken };
};

export type VoteResult = { ok: true; token?: string; error?: undefined } | { ok: false; error: 'not-found' | 'own-comment' };

// Un voto por lector y comentario: repetir el mismo valor lo retira.
export const voteComment = async (
  store: CommentStore,
  input: { commentId: string; value: 1 | -1; token?: string },
): Promise<VoteResult> => {
  const comment = await store.getById(input.commentId);
  if (!comment || comment.status !== 'visible') return { ok: false, error: 'not-found' };

  const newToken = isToken(input.token) ? undefined : generateToken();
  const voterHash = await hashToken(newToken ?? (input.token as string));
  if (voterHash === comment.authorTokenHash) return { ok: false, error: 'own-comment' };

  const current = await store.getVote(comment.id, voterHash);
  if (current?.value === input.value) await store.deleteVote(comment.id, voterHash);
  else await store.saveVote({ commentId: comment.id, voterHash, value: input.value });

  return { ok: true, token: newToken };
};

// Solo quien tiene el token del autor puede borrar; el comentario queda como «deleted».
export const deleteOwnComment = async (
  store: CommentStore,
  input: { commentId: string; token?: string },
): Promise<{ ok: true; error?: undefined } | { ok: false; error: 'not-found' | 'forbidden' }> => {
  const comment = await store.getById(input.commentId);
  if (!comment || comment.status === 'deleted') return { ok: false, error: 'not-found' };
  if (!isToken(input.token) || (await hashToken(input.token)) !== comment.authorTokenHash) {
    return { ok: false, error: 'forbidden' };
  }
  await store.setStatus(comment.id, 'deleted');
  return { ok: true };
};
