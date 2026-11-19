// Estados que ve Luis en Supabase. Solo «visible» se muestra completo al público.
export const COMMENT_STATUSES = ['visible', 'quarantined', 'hidden', 'deleted'] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const LIMITS = {
  bodyMin: 2,
  bodyMax: 2000,
  aliasMax: 40,
  // Más de este número de enlaces envía el comentario a cuarentena.
  maxLinks: 1,
  rateMax: 5,
  rateWindowMs: 10 * 60_000,
  // Niveles de sangría: 0, 1, 2 y 3. Más hondo se muestra al nivel 3.
  maxIndent: 3,
  // Tope real de respuestas encadenadas: evita ramas infinitas y recursión sin fin.
  maxDepth: 30,
} as const;

// Fila tal como vive en la base de datos. Nunca sale al navegador.
export interface StoredComment {
  id: string;
  postSlug: string;
  parentId: string | null;
  alias: string;
  body: string;
  status: CommentStatus;
  // Marca aparte del estado: si el autor lo borra, nunca se publicará,
  // aunque Luis lo apruebe después. El estado sigue siendo decisión de Luis.
  authorDeleted: boolean;
  authorTokenHash: string;
  ipHash: string;
  createdAt: string;
}

// Se ve completo solo lo visible que su autor no borró.
export const isShown = (comment: StoredComment): boolean => comment.status === 'visible' && !comment.authorDeleted;

export interface Vote {
  commentId: string;
  voterHash: string;
  value: 1 | -1;
}

// Lo que el servicio entrega para publicar. El id y la fecha los pone el almacén.
export interface NewComment {
  postSlug: string;
  parentId: string | null;
  alias: string;
  body: string;
  status: 'visible' | 'quarantined';
  authorTokenHash: string;
  ipHash: string;
}

export type InsertError = 'rate-limited' | 'invalid-parent' | 'too-deep' | 'invalid-input';

export type InsertResult = { ok: true; id: string } | { ok: false; error: InsertError };

export type VoteOutcome = 'ok' | 'rate-limited' | 'not-found' | 'own-comment' | 'invalid-vote';

export interface VoteRequest {
  commentId: string;
  voterHash: string;
  ipHash: string;
  value: 1 | -1;
}

// Los datos no responden: la base de datos cayó, tardó demasiado o devolvió algo
// inesperado. Su mensaje es para los registros del servidor, nunca para el navegador.
export class CommentsUnavailableError extends Error {
  constructor(reason: string) {
    super(`Comentarios no disponibles: ${reason}`);
    this.name = 'CommentsUnavailableError';
  }
}

// Lo único que recibe el navegador: sin hashes, sin IP y sin texto de lo retirado.
export interface PublicComment {
  id: string;
  alias: string | null;
  body: string | null;
  removed: boolean;
  // Rama cerrada: el comentario o un ancestro fue retirado. Se puede leer, pero
  // la interfaz no ofrece votar ni responder, porque el servidor lo rechazaría.
  locked: boolean;
  // Falso en ramas cerradas y en el tope de profundidad, donde el servidor rechazaría la respuesta.
  canReply: boolean;
  score: number;
  createdAt: string;
  mine: boolean;
  depth: number;
  indent: number;
  replies: PublicComment[];
}

// Cada escritura es una sola operación atómica. Leer y luego escribir desde JavaScript
// pierde contra peticiones simultáneas, así que las reglas que deben resistirlas
// (límites, rama abierta, autovoto) las aplica el almacén, como las funciones de Postgres.
export interface CommentStore {
  // Devuelve la suma de votos por comentario, no los votos: el servidor nunca ve
  // quién votó qué al pintar el hilo.
  listByPost(postSlug: string): Promise<{ comments: StoredComment[]; scores: Record<string, number> }>;
  // Límite por IP, padre del mismo artículo, rama abierta y profundidad, en un paso.
  postComment(comment: NewComment): Promise<InsertResult>;
  // Límite de votos por IP, rama abierta, sin autovoto; repetir el mismo valor lo retira.
  toggleVote(vote: VoteRequest): Promise<VoteOutcome>;
  // Solo marca si el hash del autor coincide.
  markAuthorDeleted(id: string, authorTokenHash: string): Promise<boolean>;
}
