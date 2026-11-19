import { reviewAlias, reviewBody } from './moderation.ts';
import { aliasFromHash, hashToken, isHash, issueToken, verifyToken } from './token.ts';
import type { CommentStatus, CommentStore, InsertError, VoteOutcome } from './types.ts';
import { validateDraft, type CommentDraft, type DraftError } from './validate.ts';

// Secretos que solo conoce el servidor. Llegan desde las variables de entorno.
export interface Secrets {
  tokenSecret: string;
}

export interface PostContext extends Secrets {
  // La IP ya llega convertida en hash por la capa de servidor; nunca en claro.
  ipHash: string;
  knownPosts: ReadonlySet<string>;
  // Solo para la respuesta al campo trampa: el id real lo pone el almacén.
  newId: () => string;
}

export type PostError = DraftError | InsertError | 'invalid-post';

export type PostResult =
  | { ok: true; id: string; status: CommentStatus; token?: string; error?: undefined }
  | { ok: false; error: PostError };

const assertIpHash = (ipHash: string) => {
  // Un error de programación, no del lector: la IP en claro nunca debe llegar aquí.
  if (!isHash(ipHash)) throw new Error('ipHash debe ser un SHA-256 en hexadecimal');
};

// Reglas de publicación. Turnstile se verifica antes, en la capa de servidor; el límite
// por IP y la rama abierta los aplica el almacén en el mismo paso que guarda.
export const postComment = async (store: CommentStore, draft: CommentDraft, ctx: PostContext): Promise<PostResult> => {
  assertIpHash(ctx.ipHash);

  const checked = validateDraft(draft);
  if (!checked.ok) return { ok: false, error: checked.error };
  const { postSlug, parentId, body, alias } = checked.value;

  if (!ctx.knownPosts.has(postSlug)) return { ok: false, error: 'invalid-post' };

  // Sin token válido (firma incluida), este lector es nuevo: se le emite uno.
  const hasToken = await verifyToken(draft.token, ctx.tokenSecret);
  const newToken = hasToken ? undefined : await issueToken(ctx.tokenSecret);

  // El alias también se modera: es texto público y no admite enlaces ni palabras de la lista.
  const flagged = reviewBody(body).length > 0 || (alias !== '' && reviewAlias(alias).length > 0);
  const status = flagged ? 'quarantined' : 'visible';

  // Un bot rellenó el campo trampa. Se comprueba después de validar y moderar, para que
  // su respuesta (estado incluido) sea igual a la de un envío real; nunca llega a la base.
  if (checked.value.honeypot.trim()) return { ok: true, id: ctx.newId(), status, token: newToken };

  const tokenHash = await hashToken(newToken ?? (draft.token as string));

  const saved = await store.postComment({
    postSlug,
    parentId,
    alias: alias || (await aliasFromHash(tokenHash, ctx.tokenSecret)),
    body,
    status,
    authorTokenHash: tokenHash,
    ipHash: ctx.ipHash,
  });
  if (!saved.ok) return saved;

  return { ok: true, id: saved.id, status, token: newToken };
};

export type VoteError = 'no-token' | Exclude<VoteOutcome, 'ok'>;

// Votar exige un token firmado por el servidor: no se puede fabricar uno por voto.
// Un voto por lector y comentario; repetir el mismo valor lo retira.
export const voteComment = async (
  store: CommentStore,
  input: { commentId: unknown; value: unknown; token?: string; ipHash: string } & Secrets,
): Promise<{ ok: true; error?: undefined } | { ok: false; error: VoteError }> => {
  assertIpHash(input.ipHash);
  if (!(await verifyToken(input.token, input.tokenSecret))) return { ok: false, error: 'no-token' };
  if (input.value !== 1 && input.value !== -1) return { ok: false, error: 'invalid-vote' };
  if (typeof input.commentId !== 'string') return { ok: false, error: 'not-found' };

  const outcome = await store.toggleVote({
    commentId: input.commentId,
    voterHash: await hashToken(input.token as string),
    ipHash: input.ipHash,
    value: input.value,
  });
  return outcome === 'ok' ? { ok: true } : { ok: false, error: outcome };
};

// Solo quien tiene el token del autor puede borrar. No toca el estado que decidió Luis:
// pone una marca propia, así un comentario en revisión borrado nunca llega a publicarse.
export const deleteOwnComment = async (
  store: CommentStore,
  input: { commentId: unknown; token?: string } & Secrets,
): Promise<{ ok: true; error?: undefined } | { ok: false; error: 'not-found' | 'forbidden' }> => {
  if (typeof input.commentId !== 'string') return { ok: false, error: 'not-found' };
  if (!(await verifyToken(input.token, input.tokenSecret))) return { ok: false, error: 'forbidden' };
  // Un solo paso: si el comentario no existe, ya estaba borrado o es de otro, no marca nada.
  const marked = await store.markAuthorDeleted(input.commentId, await hashToken(input.token as string));
  return marked ? { ok: true } : { ok: false, error: 'forbidden' };
};

// Emite un token para quien quiere votar sin haber comentado. La capa de servidor
// lo protege con Turnstile para que no se puedan pedir tokens en masa.
export const issueReaderToken = (secrets: Secrets): Promise<string> => issueToken(secrets.tokenSecret);
