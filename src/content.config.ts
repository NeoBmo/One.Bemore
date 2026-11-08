import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { POST_TYPE_KEYS } from './consts.ts';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      type: z.enum(POST_TYPE_KEYS),
      note: z.string().min(1).optional(),
      series: z.string().min(1).optional(),
      order: z.number().int().positive().optional(),
      draft: z.boolean().default(false),
    })
    .refine((data) => !data.series || data.order, {
      message: 'Un artículo con series necesita order',
      path: ['order'],
    }),
});

export const collections = { blog };
