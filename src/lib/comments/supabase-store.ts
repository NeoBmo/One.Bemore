import {
  COMMENT_STATUSES,
  CommentsUnavailableError,
  type CommentStore,
  type InsertError,
  type InsertResult,
  type NewComment,
  type StoredComment,
  type VoteOutcome,
  type VoteRequest,
} from './types.ts';

// Habla con la API REST de Supabase (PostgREST) usando fetch, sin cliente extra.
// Escribe solo por las funciones atómicas de la migración; nunca toca las tablas directo.
// Ningún texto de error de la base sale de aquí: solo el código HTTP, y solo a los registros.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 5000;
// Ids por consulta de puntuaciones: mantiene la URL corta aunque el hilo crezca.
const SCORE_BATCH = 100;
// Tope de filas por artículo: un hilo enorme no debe tumbar al servidor.
const MAX_COMMENTS = 1000;

const INSERT_ERRORS: readonly InsertError[] = ['rate-limited', 'invalid-parent', 'too-deep', 'invalid-input'];
const VOTE_OUTCOMES: readonly VoteOutcome[] = ['ok', 'rate-limited', 'not-found', 'own-comment', 'invalid-vote'];

interface CommentRow {
  id: string;
  post_slug: string;
  parent_id: string | null;
  alias: string;
  body: string;
  status: string;
  author_deleted: boolean;
  author_token_hash: string;
  created_at: string;
}

// Sin ip_hash: pintar el hilo no la necesita, así que ni siquiera sale de la base.
const COMMENT_COLUMNS = 'id,post_slug,parent_id,alias,body,status,author_deleted,author_token_hash,created_at';

const isStatus = (value: unknown): value is StoredComment['status'] =>
  (COMMENT_STATUSES as readonly unknown[]).includes(value);

const toStored = (row: CommentRow): StoredComment => {
  if (!isStatus(row.status)) throw new CommentsUnavailableError('estado desconocido en una fila');
  return {
    id: row.id,
    postSlug: row.post_slug,
    parentId: row.parent_id,
    alias: row.alias,
    body: row.body,
    status: row.status,
    authorDeleted: row.author_deleted,
    authorTokenHash: row.author_token_hash,
    // No se lee al listar (ver COMMENT_COLUMNS). Las reglas por IP viven en las funciones SQL.
    ipHash: '',
    createdAt: row.created_at,
  };
};

export class SupabaseCommentStore implements CommentStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetchFn: typeof fetch;

  // Sin propiedades en el constructor: Node ejecuta este archivo quitando solo los tipos.
  constructor(url: string, secretKey: string, fetchFn: typeof fetch = fetch) {
    this.baseUrl = `${url.replace(/\/+$/, '')}/rest/v1`;
    this.secretKey = secretKey;
    this.fetchFn = fetchFn;
  }

  private async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          // Las claves nuevas (sb_secret_…) no son JWT: van en apikey, nunca como Bearer.
          apikey: this.secretKey,
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new CommentsUnavailableError('sin respuesta de Supabase');
    }
    // El cuerpo de un error puede traer el mensaje de Postgres: se descarta sin leerlo.
    if (!response.ok) {
      await response.body?.cancel();
      throw new CommentsUnavailableError(`Supabase respondió ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new CommentsUnavailableError('respuesta de Supabase ilegible');
    }
  }

  private rpc(name: string, args: Record<string, unknown>) {
    return this.request(`/rpc/${name}`, { method: 'POST', body: args });
  }

  async listByPost(postSlug: string) {
    const query = new URLSearchParams({
      select: COMMENT_COLUMNS,
      post_slug: `eq.${postSlug}`,
      order: 'created_at.asc',
      limit: String(MAX_COMMENTS),
    });
    const rows = await this.request(`/comments?${query}`);
    if (!Array.isArray(rows)) throw new CommentsUnavailableError('lista de comentarios inesperada');
    const comments = (rows as CommentRow[]).map(toStored);
    // Pasado el tope, lo más nuevo no se mostraría: queda registrado para subirlo a tiempo.
    if (comments.length >= MAX_COMMENTS) console.warn(`[comments] ${postSlug} llegó al tope de ${MAX_COMMENTS} comentarios`);

    const scores: Record<string, number> = Object.create(null);
    for (let i = 0; i < comments.length; i += SCORE_BATCH) {
      const ids = comments.slice(i, i + SCORE_BATCH).map((comment) => comment.id);
      const scoreQuery = new URLSearchParams({ select: 'comment_id,score', comment_id: `in.(${ids.join(',')})` });
      const scoreRows = await this.request(`/comment_scores?${scoreQuery}`);
      if (!Array.isArray(scoreRows)) throw new CommentsUnavailableError('puntuaciones inesperadas');
      for (const row of scoreRows as { comment_id: string; score: number }[]) {
        if (typeof row.score === 'number') scores[row.comment_id] = row.score;
      }
    }
    return { comments, scores };
  }

  async postComment(comment: NewComment): Promise<InsertResult> {
    // Un id que no es uuid haría fallar a Postgres con un error de tipo: se responde antes.
    if (comment.parentId !== null && !UUID.test(comment.parentId)) return { ok: false, error: 'invalid-parent' };

    const result = await this.rpc('post_comment', {
      p_post_slug: comment.postSlug,
      p_parent_id: comment.parentId,
      p_alias: comment.alias,
      p_body: comment.body,
      p_status: comment.status,
      p_author_token_hash: comment.authorTokenHash,
      p_ip_hash: comment.ipHash,
    });

    const value = result as { ok?: unknown; id?: unknown; error?: unknown } | null;
    if (value?.ok === true && typeof value.id === 'string') return { ok: true, id: value.id };
    if (value?.ok === false && INSERT_ERRORS.includes(value.error as InsertError)) {
      return { ok: false, error: value.error as InsertError };
    }
    throw new CommentsUnavailableError('post_comment devolvió algo inesperado');
  }

  async toggleVote(vote: VoteRequest): Promise<VoteOutcome> {
    if (!UUID.test(vote.commentId)) return 'not-found';
    const result = await this.rpc('toggle_vote', {
      p_comment_id: vote.commentId,
      p_voter_hash: vote.voterHash,
      p_ip_hash: vote.ipHash,
      p_value: vote.value,
    });
    if (VOTE_OUTCOMES.includes(result as VoteOutcome)) return result as VoteOutcome;
    throw new CommentsUnavailableError('toggle_vote devolvió algo inesperado');
  }

  async markAuthorDeleted(id: string, authorTokenHash: string) {
    if (!UUID.test(id)) return false;
    const result = await this.rpc('mark_author_deleted', { p_id: id, p_author_token_hash: authorTokenHash });
    if (typeof result !== 'boolean') throw new CommentsUnavailableError('mark_author_deleted devolvió algo inesperado');
    return result;
  }
}
