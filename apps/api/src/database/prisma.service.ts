import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { loadProjectEnvironmentWhenMissing } from '../config/load-project-env.js';
import { PrismaClient } from '../generated/prisma/client.js';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getDatabaseUrl(): string {
  const user = getRequiredEnvironmentVariable('POSTGRES_USER');
  const password = getRequiredEnvironmentVariable('POSTGRES_PASSWORD');
  const database = getRequiredEnvironmentVariable('POSTGRES_DB');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

loadProjectEnvironmentWhenMissing('POSTGRES_USER');

const adapter = new PrismaPg({ connectionString: getDatabaseUrl() });

export const prisma = new PrismaClient({ adapter });

@Injectable()
export class PrismaService implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect();
  }
}
