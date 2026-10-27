import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { TIME_SCALE, config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(
    `GraphQL: http://localhost:${config.port}/graphql · ускорение ×${TIME_SCALE} · код живёт ${config.otpTtlSec} с`,
    'Bootstrap',
  );
}

void bootstrap();
