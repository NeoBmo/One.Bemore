import { isHash } from './token.ts';
import {
  LIMITS,
  isShown,
  type CommentStatus,
  type CommentStore,
  type InsertResult,
  type NewComment,
  type StoredComment,
  type Vote,
  type VoteOutcome,
  type VoteRequest,
} from './types.ts';

// Deben coincidir con las constantes de toggle_vote en la migración de Supabase.
const VOTE_RATE_MAX = 60;
const VOTE_RATE_WINDOW_MS = 10 * 60_000;
// El mismo tope que comment_open_depth: nunca recorre sin fin.
const DEPTH_GUARD = 50;

// Almacén en memoria con el mismo contrato que Supabase: sirve para tests y desarrollo local.
// Cada método termina sin esperar a nada intermedio, así que en un solo hilo es atómico,
// igual que una función de Postgres dentro de su transacción.
export class InMemoryCommentStore implements CommentStore {
  comments: StoredComment[] = [];
  votes: Vote[] = [];
  voteEvents: { ipHash: string; at: number }[] = [];
  now: () => Date = () => new Date();
  private sequence = 0;

  async listByPost(postSlug: string) {
    const comments = this.comments.filter((comment) => comment.postSlug === postSlug);
    const ids = new Set(comments.map((comment) => comment.id));
    // Sin prototipo: un id como «constructor» no puede leer una función heredada.
    const scores: Record<string, number> = Object.create(null);
    for (const vote of this.votes) {
      if (ids.has(vote.commentId)) scores[vote.commentId] = (scores[vote.commentId] ?? 0) + vote.value;
    }
    return { comments: [...comments], scores };
  }

  async postComment(comment: NewComment): Promise<InsertResult> {
    if (!isHash(comment.ipHash) || !isHash(comment.authorTokenHash)) return { ok: false, error: 'invalid-input' };

    const now = this.now();
    const since = new Date(now.getTime() - LIMITS.rateWindowMs).toISOString();
    const recent = this.comments.filter((item) => item.ipHash === comment.ipHash && item.createdAt > since).length;
    if (recent >= LIMITS.rateMax) return { ok: false, error: 'rate-limited' };

    if (comment.parentId !== null) {
      const parent = this.find(comment.parentId);
      if (!parent || parent.postSlug !== comment.postSlug) return { ok: false, error: 'invalid-parent' };
      const depth = this.openDepth(parent.id);
      if (depth === undefined) return { ok: false, error: 'invalid-parent' };
      if (depth + 1 > LIMITS.maxDepth) return { ok: false, error: 'too-deep' };
    }

    const id = `m${++this.sequence}`;
    this.comments.push({ ...comment, id, authorDeleted: false, createdAt: now.toISOString() });
    return { ok: true, id };
  }

  async toggleVote({ commentId, voterHash, ipHash, value }: VoteRequest): Promise<VoteOutcome> {
    if ((value !== 1 && value !== -1) || !isHash(ipHash) || !isHash(voterHash)) return 'invalid-vote';

    // Cada intento cuenta, salga como salga: el límite va antes de leer el comentario.
    const now = this.now().getTime();
    this.voteEvents = this.voteEvents.filter((event) => event.at > now - VOTE_RATE_WINDOW_MS);
    if (this.voteEvents.filter((event) => event.ipHash === ipHash).length >= VOTE_RATE_MAX) return 'rate-limited';
    this.voteEvents.push({ ipHash, at: now });

    const comment = this.find(commentId);
    if (!comment || this.openDepth(commentId) === undefined) return 'not-found';
    if (comment.authorTokenHash === voterHash || comment.ipHash === ipHash) return 'own-comment';

    const current = this.votes.find((vote) => vote.commentId === commentId && vote.voterHash === voterHash);
    this.votes = this.votes.filter((vote) => vote !== current);
    if (current?.value !== value) this.votes.push({ commentId, voterHash, value });
    return 'ok';
  }

  async markAuthorDeleted(id: string, authorTokenHash: string) {
    const comment = this.comments.find(
      (item) => item.id === id && item.authorTokenHash === authorTokenHash && !item.authorDeleted,
    );
    if (!comment) return false;
    comment.authorDeleted = true;
    return true;
  }

  // Lo que Luis hace desde el Table Editor de Supabase. No es parte del contrato.
  setStatus(id: string, status: CommentStatus) {
    const comment = this.find(id);
    if (comment) comment.status = status;
  }

  find(id: string) {
    return this.comments.find((comment) => comment.id === id);
  }

  // Profundidad si toda la rama se muestra; undefined si algún ancestro está cerrado.
  private openDepth(id: string): number | undefined {
    let current = this.find(id);
    for (let depth = 0; current && depth <= DEPTH_GUARD; depth += 1) {
      if (!isShown(current)) return undefined;
      if (current.parentId === null) return depth;
      current = this.find(current.parentId);
    }
    return undefined;
  }
}
