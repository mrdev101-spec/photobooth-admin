import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile('.env.local');
} catch {
  // no local env file (CI / Vercel provide DATABASE_URL)
}

export default defineConfig({
  dialect: 'mysql', // MariaDB speaks the MySQL protocol; see server/db/json-text.ts for the JSON difference
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true
});
