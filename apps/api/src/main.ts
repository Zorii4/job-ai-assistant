import 'reflect-metadata';

import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';

export async function createApiApp() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  });
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
