process.loadEnvFile('.env');

import { defineConfig } from 'prisma/config';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getDatabaseUrl(): string {
  const user = getRequiredEnvironmentVariable('POSTGRES_USER');
  const password = getRequiredEnvironmentVariable('POSTGRES_PASSWORD');
  const database = getRequiredEnvironmentVariable('POSTGRES_DB');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
