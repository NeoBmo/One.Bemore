export const SITE = {
  name: 'One.Bemore',
  author: 'Luis',
  description: 'Lo que aprendo y lo que no dejo de pensar, escrito con calma para leer sin prisa.',
} as const;

// Fuente única de los tipos: la usan el esquema, las tarjetas y el buscador.
export const POST_TYPE_KEYS = ['reflexion', 'historia', 'curiosidad', 'ensenanza'] as const;

export type PostType = (typeof POST_TYPE_KEYS)[number];

export const POST_TYPES: Record<PostType, { label: string; plural: string }> = {
  reflexion: { label: 'Reflexión', plural: 'Reflexiones' },
  historia: { label: 'Historia', plural: 'Historias' },
  curiosidad: { label: 'Curiosidad', plural: 'Curiosidades' },
  ensenanza: { label: 'Enseñanza', plural: 'Enseñanzas' },
};
