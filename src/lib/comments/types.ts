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
  authorTokenHash: string;
  ipHash: string;
  createdAt: string;
}

export interface Vote {
  commentId: string;
  voterHash: string;
  value: 1 | -1;
}

// Lo único que recibe el navegador: sin hashes, sin IP y sin texto de lo retirado.
export interface PublicComment {
  id: string;
  alias: string | null;
  body: string | null;
  removed: boolean;
  score: number;
  createdAt: string;
  mine: boolean;
  depth: number;
  indent: number;
  replies: PublicComment[];
}

export interface CommentStore {
  listByPost(postSlug: string): Promise<{ comments: StoredComment[]; votes: Vote[] }>;
  getById(id: string): Promise<StoredComment | undefined>;
  insert(comment: StoredComment): Promise<void>;
  setStatus(id: string, status: CommentStatus): Promise<void>;
  countRecentByIp(ipHash: string, sinceIso: string): Promise<number>;
  getVote(commentId: string, voterHash: string): Promise<Vote | undefined>;
  saveVote(vote: Vote): Promise<void>;
  deleteVote(commentId: string, voterHash: string): Promise<void>;
}
