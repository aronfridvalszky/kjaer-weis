import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const products = defineCollection({
  loader: glob({ pattern: "*.json", base: "./src/content/products" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      size: z.string(),
      price: z.string(),
      categories: z.array(z.enum(["face", "body", "lips", "refills", "sets"])),
      tag: z
        .object({
          label: z.string(),
          tone: z.enum(["neutral", "accent", "accent-filled"]),
        })
        .optional(),
      soldOut: z.boolean().default(false),
      image: image(),
      order: z.number(),
    }),
});

export const collections = { products };
