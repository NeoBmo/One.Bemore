export const SITE = {
  name: 'One.Bemore',
  author: 'Luis',
  description:
    'Un cuaderno abierto: reflexiones, historias, curiosidades con contexto y enseñanzas que vale la pena conservar.',
} as const;

// Fuente única de los tipos: la usan el esquema, los listados y el filtro.
export const POST_TYPE_KEYS = ['reflexion', 'historia', 'curiosidad', 'ensenanza'] as const;

export type PostType = (typeof POST_TYPE_KEYS)[number];

export const POST_TYPES: Record<PostType, { label: string; plural: string; summary: string }> = {
  reflexion: {
    label: 'Reflexión',
    plural: 'Reflexiones',
    summary: 'Ideas que no me dejan en paz hasta que las escribo.',
  },
  historia: {
    label: 'Historia',
    plural: 'Historias',
    summary: 'Cosas que pasaron y lo que dejaron.',
  },
  curiosidad: {
    label: 'Curiosidad',
    plural: 'Curiosidades',
    summary: 'Un tema pequeño contado con contexto, conexiones y citas.',
  },
  ensenanza: {
    label: 'Enseñanza',
    plural: 'Enseñanzas',
    summary: 'Lo que aprendí, explicado para que te sirva. A veces en mini cursos.',
  },
};
