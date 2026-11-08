import type { CommentStatus, CommentStore, StoredComment, Vote } from './types.ts';

// Almacén en memoria con el mismo contrato que Supabase: sirve para tests y desarrollo local.
export class InMemoryCommentStore implements CommentStore {
  comments: StoredComment[] = [];
  votes: Vote[] = [];

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

  async getById(id: string) {
    return this.comments.find((comment) => comment.id === id);
  }

  async insert(comment: StoredComment) {
    this.comments.push(comment);
  }

  async setStatus(id: string, status: CommentStatus) {
    const comment = this.comments.find((item) => item.id === id);
    if (comment) comment.status = status;
  }

  async markAuthorDeleted(id: string, authorTokenHash: string) {
    const comment = this.comments.find((item) => item.id === id && item.authorTokenHash === authorTokenHash);
    if (!comment) return false;
    comment.authorDeleted = true;
    return true;
  }

  async countRecentByIp(ipHash: string, sinceIso: string) {
    return this.comments.filter((comment) => comment.ipHash === ipHash && comment.createdAt >= sinceIso).length;
  }

  async getVote(commentId: string, voterHash: string) {
    return this.votes.find((vote) => vote.commentId === commentId && vote.voterHash === voterHash);
  }

  async saveVote(vote: Vote) {
    await this.deleteVote(vote.commentId, vote.voterHash);
    this.votes.push(vote);
  }

  async deleteVote(commentId: string, voterHash: string) {
    this.votes = this.votes.filter((vote) => !(vote.commentId === commentId && vote.voterHash === voterHash));
  }
}
