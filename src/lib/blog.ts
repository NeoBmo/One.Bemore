import { getCollection, type CollectionEntry } from 'astro:content';
import { publishedPosts, sortByNewest } from './posts.ts';

export type Post = CollectionEntry<'blog'>;

// Única puerta de entrada a los artículos: aplica borradores y orden en todo el sitio.
export const getPosts = async (): Promise<Post[]> =>
  sortByNewest(publishedPosts(await getCollection('blog'), import.meta.env.DEV));

export const postUrl = (post: Post): string => `/blog/${post.id}/`;

// Nombre estable para que el título viaje entre la lista y el artículo.
export const titleTransition = (post: Post): string => `post-${post.id.replace(/[^a-z0-9-]/gi, '-')}`;
