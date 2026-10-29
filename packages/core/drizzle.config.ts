import type { Config } from 'drizzle-kit'

export default {
  schema: './src/adapters/sqlite/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: 'data/drizzle-kit.db' },
} satisfies Config
