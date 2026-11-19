import { deleteOwnComment, issueReaderToken, postComment, voteComment } from './service.ts';
import { buildThread } from './thread.ts';
import { hashIp, hashToken, verifyToken } from './token.ts';
import type { ChallengeVerifier } from './turnstile.ts';
import type { CommentStore } from './types.ts';
import { validateDraft } from './validate.ts';

// Capa de servidor: une el dominio con lo que llega de cada petición (IP, Turnstile).
// No depende de Astro, así se prueba con Node igual que el dominio.

export interface CommentsDeps {
  store: CommentStore;
  tokenSecret: string;
  ipSalt: string;
  knownPosts: ReadonlySet<string>;
  verifyChallenge: ChallengeVerifier;
}

export interface SubmitInput {
  postSlug: string;
  parentId: string | null;
  alias: string;
  body: string;
  // Campo trampa: invisible para personas, los bots lo rellenan.
  website?: string;
  token?: string;
  challenge: string;
}

export const listComments = async (deps: CommentsDeps, input: { postSlug: string; token?: string }) => {
  if (!deps.knownPosts.has(input.postSlug)) return { ok: false as const, error: 'invalid-post' as const };
  const { comments, scores } = await deps.store.listByPost(input.postSlug);
  // «Mío» solo con un token firmado: uno inventado no puede marcar comentarios ajenos.
  const viewer = (await verifyToken(input.token, deps.tokenSecret)) ? await hashToken(input.token as string) : undefined;
  return { ok: true as const, comments: buildThread(comments, scores, viewer) };
};

export const submitComment = async (deps: CommentsDeps, input: SubmitInput, clientAddress: string) => {
  const draft = {
    postSlug: input.postSlug,
    parentId: input.parentId,
    alias: input.alias,
    body: input.body,
    honeypot: input.website ?? '',
    token: input.token,
  };
  // Lo que se puede rechazar sin gastar el desafío se rechaza antes.
  const checked = validateDraft(draft);
  if (!checked.ok) return { ok: false as const, error: checked.error };
  if (!deps.knownPosts.has(checked.value.postSlug)) return { ok: false as const, error: 'invalid-post' as const };

  if (!(await deps.verifyChallenge(input.challenge, clientAddress))) {
    return { ok: false as const, error: 'challenge-failed' as const };
  }

  return postComment(deps.store, draft, {
    ipHash: await hashIp(clientAddress, deps.ipSalt),
    knownPosts: deps.knownPosts,
    tokenSecret: deps.tokenSecret,
    newId: () => crypto.randomUUID(),
  });
};

export const castVote = async (
  deps: CommentsDeps,
  input: { commentId: string; value: number; token?: string },
  clientAddress: string,
) =>
  voteComment(deps.store, {
    commentId: input.commentId,
    value: input.value,
    token: input.token,
    ipHash: await hashIp(clientAddress, deps.ipSalt),
    tokenSecret: deps.tokenSecret,
  });

export const removeComment = (deps: CommentsDeps, input: { commentId: string; token?: string }) =>
  deleteOwnComment(deps.store, { commentId: input.commentId, token: input.token, tokenSecret: deps.tokenSecret });

// Para votar sin haber comentado. El desafío impide pedir tokens en masa.
export const requestReaderToken = async (deps: CommentsDeps, input: { challenge: string }, clientAddress: string) => {
  if (!(await deps.verifyChallenge(input.challenge, clientAddress))) {
    return { ok: false as const, error: 'challenge-failed' as const };
  }
  return { ok: true as const, token: await issueReaderToken({ tokenSecret: deps.tokenSecret }) };
};
