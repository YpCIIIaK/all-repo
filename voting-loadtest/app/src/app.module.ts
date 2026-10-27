import { Controller, Get, HttpException, HttpStatus, Inject, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import type { GraphQLFormattedError } from 'graphql';
import type Redis from 'ioredis';
import { InfraModule, PrismaService, REDIS } from './infra.module';
import { VotingResolver } from './voting.resolver';
import { VotingService } from './voting.service';

/** Ошибки клиента (400, 401, 429, 503) отдаём с кодом в extensions.code, внутренние — без деталей. */
function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = (error as { originalError?: unknown })?.originalError;
  if (original instanceof HttpException) {
    return { message: formatted.message, path: formatted.path, extensions: { code: original.getStatus() } };
  }
  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
    return { message: 'Внутренняя ошибка сервера', path: formatted.path, extensions: { code: 500 } };
  }
  return formatted;
}

@Controller('health')
class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    const db = await this.prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down');
    const redis = await this.redis.ping().then(() => 'up').catch(() => 'down');
    const body = { status: db === 'up' && redis === 'up' ? 'ok' : 'error', db, redis };
    if (body.status !== 'ok') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}

@Module({
  imports: [
    InfraModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      playground: false,
      introspection: true,
      formatError,
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
  ],
  controllers: [HealthController],
  providers: [VotingService, VotingResolver],
})
export class AppModule {}
