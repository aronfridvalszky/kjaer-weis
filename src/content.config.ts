import { defineCollection, reference } from "astro:content";
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
      /** Show in the landing product grid. */
      listed: z.boolean().default(true),

      // Product page. Every block below is optional; the page omits what is missing.
      description: z.string().optional(),
      badges: z.array(z.string()).default([]),
      rating: z.object({ score: z.number(), count: z.number() }).optional(),
      /** Size options. Defaults to the single `size` and `price`. */
      sizes: z
        .array(z.object({ label: z.string(), price: z.string(), refillPrice: z.string().optional() }))
        .optional(),
      /** Size selected on load. */
      defaultSize: z.number().default(0),
      /** Extra gallery photos after the packshot. */
      gallery: z.array(z.object({ src: image(), alt: z.string().default("") })).default([]),
      details: z.array(z.object({ title: z.string(), body: z.string() })).default([]),
      statement: z
        .object({
          title: z.string(),
          accent: z.string(),
          image: image(),
          imageAlt: z.string().default(""),
          text: z.string(),
          benefits: z.array(z.object({ title: z.string(), text: z.string() })),
        })
        .optional(),
      ingredients: z
        .object({
          tag: z.string().optional(),
          title: z.string(),
          image: image(),
          imageAlt: z.string().default(""),
          items: z.array(z.object({ name: z.string(), note: z.string(), text: z.string() })),
          fullList: z.string().optional(),
        })
        .optional(),
      routine: z
        .object({
          title: z.string(),
          accent: z.string(),
          steps: z.array(z.object({ product: reference("products"), text: z.string() })),
          tip: z.string().optional(),
        })
        .optional(),
      packaging: z
        .object({
          title: z.string(),
          accent: z.string(),
          text: z.string(),
          editions: z.array(z.object({ name: z.string(), price: z.string(), text: z.string() })),
          image: image(),
          imageAlt: z.string().default(""),
        })
        .optional(),
      reviews: z
        .object({
          items: z.array(z.object({ quote: z.string(), author: z.string() })),
          source: z.string().optional(),
        })
        .optional(),
      related: z.array(reference("products")).default([]),
    }),
});

export const collections = { products };
