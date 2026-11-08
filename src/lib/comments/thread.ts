import { LIMITS, isShown, type PublicComment, type StoredComment, type Vote } from './types.ts';

const byScoreThenAge = (a: PublicComment, b: PublicComment) =>
  b.score - a.score || a.createdAt.localeCompare(b.createdAt);

// Convierte las filas planas en ramas listas para mostrar.
// Reglas: la cuarentena oculta toda su rama; lo oculto o borrado solo deja su lugar
// si tiene respuestas visibles; los votos ordenan y nunca ocultan.
export const buildThread = (
  comments: readonly StoredComment[],
  votes: readonly Vote[],
  viewerTokenHash?: string,
): PublicComment[] => {
  const scores = new Map<string, number>();
  for (const vote of votes) scores.set(vote.commentId, (scores.get(vote.commentId) ?? 0) + vote.value);

  const children = new Map<string | null, StoredComment[]>();
  for (const comment of comments) {
    const siblings = children.get(comment.parentId) ?? [];
    siblings.push(comment);
    children.set(comment.parentId, siblings);
  }

  // El tope de profundidad protege contra datos editados a mano: nunca hay recursión sin fin.
  const build = (parentId: string | null, depth: number): PublicComment[] => {
    if (depth > LIMITS.maxDepth) return [];
    return (children.get(parentId) ?? [])
      .filter((comment) => comment.status !== 'quarantined')
      .map((comment) => {
        const replies = build(comment.id, depth + 1);
        const removed = !isShown(comment);
        if (removed && replies.length === 0) return undefined;
        return {
          id: comment.id,
          alias: removed ? null : comment.alias,
          body: removed ? null : comment.body,
          removed,
          score: scores.get(comment.id) ?? 0,
          createdAt: comment.createdAt,
          mine: !removed && Boolean(viewerTokenHash) && comment.authorTokenHash === viewerTokenHash,
          depth,
          indent: Math.min(depth, LIMITS.maxIndent),
          replies,
        };
      })
      .filter((comment): comment is PublicComment => comment !== undefined)
      .sort(byScoreThenAge);
  };

  return build(null, 0);
};
