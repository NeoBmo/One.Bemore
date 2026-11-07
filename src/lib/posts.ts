import { POST_TYPE_KEYS, type PostType } from '../consts.ts';

interface PostLike {
  id: string;
  data: {
    pubDate: Date;
    draft: boolean;
    series?: string;
    order?: number;
  };
}

export const sortByNewest = <T extends PostLike>(posts: readonly T[]): T[] =>
  posts.toSorted((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

export const publishedPosts = <T extends PostLike>(posts: readonly T[], includeDrafts: boolean): T[] =>
  includeDrafts ? [...posts] : posts.filter((post) => !post.data.draft);

export const groupByYear = <T extends PostLike>(posts: readonly T[]) => {
  const groups = new Map<number, T[]>();
  for (const post of sortByNewest(posts)) {
    const year = post.data.pubDate.getUTCFullYear();
    groups.set(year, [...(groups.get(year) ?? []), post]);
  }
  return [...groups].map(([year, items]) => ({ year, posts: items }));
};

export const seriesNeighbors = <T extends PostLike>(post: T, posts: readonly T[]) => {
  const { series } = post.data;
  if (!series) return { previous: undefined, next: undefined };

  const lessons = posts
    .filter((item) => item.data.series === series)
    .toSorted((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));
  const index = lessons.findIndex((item) => item.id === post.id);

  return { previous: lessons[index - 1], next: lessons[index + 1] };
};

// Fuera de una serie, «anterior» es el artículo más viejo y «siguiente» el más nuevo.
export const chronologicalNeighbors = <T extends PostLike>(post: T, posts: readonly T[]) => {
  const ordered = sortByNewest(posts);
  const index = ordered.findIndex((item) => item.id === post.id);
  if (index === -1) return { previous: undefined, next: undefined };
  return { previous: ordered[index + 1], next: ordered[index - 1] };
};

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

// Solo cuenta como edición lo ocurrido en un día posterior a la publicación.
export const editedDate = (
  pubDate: Date,
  updatedDate: Date | undefined,
  gitDate: string | undefined,
): Date | undefined => {
  if (updatedDate) return updatedDate;
  if (!gitDate) return undefined;

  const parsed = new Date(gitDate);
  if (Number.isNaN(parsed.valueOf())) return undefined;
  return dayOf(parsed) > dayOf(pubDate) ? parsed : undefined;
};

const dateFormatter = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' });

export const formatDate = (date: Date): string => dateFormatter.format(date);

export const normalizeText = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const matchesSearch = (title: string, query: string): boolean =>
  normalizeText(title).includes(normalizeText(query.trim()));

export const parseTypeFilter = (value: string | null): PostType | undefined =>
  POST_TYPE_KEYS.find((key) => key === value);
