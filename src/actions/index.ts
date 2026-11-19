import { ActionError, defineAction } from 'astro:actions';
import { getSecret } from 'astro:env/server';
import { z } from 'astro/zod';
import { getPosts } from '../lib/blog.ts';
import { InMemoryCommentStore } from '../lib/comments/memory-store.ts';
import {
  castVote,
  listComments,
  removeComment,
  requestReaderToken,
  submitComment,
  type CommentsDeps,
} from '../lib/comments/server.ts';
import { SupabaseCommentStore } from '../lib/comments/supabase-store.ts';
import { createTurnstileVerifier } from '../lib/comments/turnstile.ts';

// Única superficie de servidor del sitio. Las acciones son públicas: cualquiera puede
// llamarlas, así que todo se valida aquí y en el dominio, nunca solo en el navegador.

// Topes generosos: solo cortan basura enorme. Los límites reales (y sus mensajes)
// los aplica el dominio, que cuenta caracteres como los cuenta la base de datos.
const id = z.string().max(100);
const token = z.string().max(200).optional();
const challenge = z.string().max(4096);

let knownPosts: Promise<ReadonlySet<string>> | undefined;
let devStore: InMemoryCommentStore | undefined;

// Cada falla de infraestructura sale igual hacia el navegador. El detalle va solo al registro.
const unavailable = (error: unknown): never => {
  console.error('[comments]', error instanceof Error ? error.message : 'error desconocido');
  throw new ActionError({ code: 'SERVICE_UNAVAILABLE', message: 'Los comentarios no están disponibles' });
};

const loadDeps = async (): Promise<CommentsDeps> => {
  const supabaseUrl = getSecret('SUPABASE_URL');
  const supabaseKey = getSecret('SUPABASE_SECRET_KEY');
  const turnstileSecret = getSecret('TURNSTILE_SECRET_KEY');
  const tokenSecret = getSecret('COMMENT_TOKEN_SECRET');
  const ipSalt = getSecret('IP_HASH_SALT');
  if (!turnstileSecret || !tokenSecret || !ipSalt) throw new Error('faltan variables de comentarios');

  // Sin Supabase configurado, solo en desarrollo: un almacén en memoria que se borra al reiniciar.
  let store;
  if (supabaseUrl && supabaseKey) store = new SupabaseCommentStore(supabaseUrl, supabaseKey);
  else if (import.meta.env.DEV) store = devStore ??= new InMemoryCommentStore();
  else throw new Error('faltan SUPABASE_URL o SUPABASE_SECRET_KEY');

  // Se lee una vez por instancia; si falla, el siguiente intento vuelve a leer.
  knownPosts ??= getPosts()
    .then((posts) => new Set(posts.map((post) => post.id)))
    .catch((error) => {
      knownPosts = undefined;
      throw error;
    });
  return { store, tokenSecret, ipSalt, knownPosts: await knownPosts, verifyChallenge: createTurnstileVerifier(turnstileSecret) };
};

const run = async <T>(task: (deps: CommentsDeps) => Promise<T>): Promise<T> => {
  try {
    return await task(await loadDeps());
  } catch (error) {
    return unavailable(error);
  }
};

export const server = {
  comments: {
    list: defineAction({
      input: z.object({ postSlug: id, token }),
      handler: (input) => run((deps) => listComments(deps, input)),
    }),
    post: defineAction({
      input: z.object({
        postSlug: id,
        parentId: id.nullable(),
        alias: z.string().max(400),
        body: z.string().max(10_000),
        website: z.string().max(500).optional(),
        token,
        challenge,
      }),
      handler: (input, context) => run((deps) => submitComment(deps, input, context.clientAddress)),
    }),
    vote: defineAction({
      input: z.object({ commentId: id, value: z.number(), token }),
      handler: (input, context) => run((deps) => castVote(deps, input, context.clientAddress)),
    }),
    remove: defineAction({
      input: z.object({ commentId: id, token }),
      handler: (input) => run((deps) => removeComment(deps, input)),
    }),
    readerToken: defineAction({
      input: z.object({ challenge }),
      handler: (input, context) => run((deps) => requestReaderToken(deps, input, context.clientAddress)),
    }),
  },
};
