import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';

import { AppModule } from './app.module.js';
import { auth } from './auth/auth.config.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

export async function createApiApp() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.all('/api/auth/{*any}', toNodeHandler(auth));
  app.use(express.json());
  app.useGlobalFilters(new ApiExceptionFilter());

  return app;
}

export async function bootstrap(): Promise<void> {
  const app = await createApiApp();
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void bootstrap();
}
