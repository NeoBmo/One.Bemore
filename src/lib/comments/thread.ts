import { LIMITS, isShown, type PublicComment, type StoredComment } from './types.ts';

const byScoreThenAge = (a: PublicComment, b: PublicComment) =>
  b.score - a.score || a.createdAt.localeCompare(b.createdAt);

// Convierte las filas planas en ramas listas para mostrar.
// Reglas: la cuarentena oculta toda su rama; lo oculto o borrado solo deja su lugar
// si tiene respuestas visibles, y cierra la rama; los votos ordenan y nunca ocultan.
export const buildThread = (
  comments: readonly StoredComment[],
  scores: Readonly<Record<string, number>>,
  viewerTokenHash?: string,
): PublicComment[] => {
  const children = new Map<string | null, StoredComment[]>();
  for (const comment of comments) {
    const siblings = children.get(comment.parentId) ?? [];
    siblings.push(comment);
    children.set(comment.parentId, siblings);
  }

  // El tope de profundidad protege contra datos editados a mano: nunca hay recursión sin fin.
  const build = (parentId: string | null, depth: number, parentLocked: boolean): PublicComment[] => {
    if (depth > LIMITS.maxDepth) return [];
    return (children.get(parentId) ?? [])
      .filter((comment) => comment.status !== 'quarantined')
      .map((comment) => {
        const removed = !isShown(comment);
        const locked = parentLocked || removed;
        const replies = build(comment.id, depth + 1, locked);
        if (removed && replies.length === 0) return undefined;
        return {
          id: comment.id,
          alias: removed ? null : comment.alias,
          body: removed ? null : comment.body,
          removed,
          locked,
          canReply: !locked && depth < LIMITS.maxDepth,
          score: Object.hasOwn(scores, comment.id) ? scores[comment.id] : 0,
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

  return build(null, 0, false);
};
