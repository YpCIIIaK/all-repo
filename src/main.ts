import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { CacheService } from './cache/cache.service';
import { rateLimit } from './common/rate-limit';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // реальный IP клиента за прокси Render/Railway
  app.enableShutdownHooks();
  app.use('/graphql', rateLimit(app.get(CacheService), Number(process.env.RATE_LIMIT_PER_MIN ?? 120)));
  app.useStaticAssets(join(process.cwd(), 'public'), { index: 'index.html' });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Визитка: http://localhost:${port} · GraphQL: http://localhost:${port}/graphql`, 'Bootstrap');
}

void bootstrap();
