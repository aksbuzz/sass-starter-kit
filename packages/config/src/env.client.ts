import { z } from 'zod';

// import.meta.env is injected by Vite in browser builds.
// In Node.js (tsx/API context), import.meta.env is undefined — Zod defaults apply.
const raw = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const schema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:3001'),
  VITE_WEB_URL: z.string().url().default('http://localhost:3000'),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const parsed = schema.safeParse({
  VITE_API_URL: raw['VITE_API_URL'],
  VITE_WEB_URL: raw['VITE_WEB_URL'],
  VITE_STRIPE_PUBLISHABLE_KEY: raw['VITE_STRIPE_PUBLISHABLE_KEY'],
});

if (!parsed.success && typeof window !== 'undefined') {
  console.error('[config] Invalid client env:', parsed.error.flatten().fieldErrors);
}

export const clientEnv = parsed.success
  ? {
      API_URL: parsed.data.VITE_API_URL,
      WEB_URL: parsed.data.VITE_WEB_URL,
      STRIPE_PUBLISHABLE_KEY: parsed.data.VITE_STRIPE_PUBLISHABLE_KEY,
    }
  : {
      API_URL: 'http://localhost:3001',
      WEB_URL: 'http://localhost:3000',
      STRIPE_PUBLISHABLE_KEY: undefined as string | undefined,
    };
