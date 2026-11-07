export const SITE = {
  name: 'one.bmore',
  author: 'Luis',
  description:
    'Un cuaderno abierto: reflexiones, historias, curiosidades con contexto y enseñanzas que vale la pena conservar.',
} as const;

export const POST_TYPES = {
  reflexion: 'Reflexión',
  historia: 'Historia',
  curiosidad: 'Curiosidad',
  ensenanza: 'Enseñanza',
} as const;

export type PostType = keyof typeof POST_TYPES;
