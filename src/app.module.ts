import { join } from 'node:path';
import { HttpException, Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import depthLimit from 'graphql-depth-limit';
import type { GraphQLFormattedError } from 'graphql';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { CacheModule } from './cache/cache.module';
import { createLoaders } from './graphql/loaders';
import { ProfileService } from './profile/profile.service';
import { ExperienceResolver, ProfileResolver, ProjectResolver, SkillResolver } from './profile/resolvers';
import { SearchService } from './search/search.service';
import { HealthController } from './health/health.controller';

/** Ошибки клиента (404, 400) отдаём как есть, внутренние — без деталей реализации. */
function formatError(formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = (error as { originalError?: unknown })?.originalError;
  if (original instanceof HttpException) {
    return { message: formatted.message, path: formatted.path, extensions: { code: original.getStatus() } };
  }
  if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR' && process.env.NODE_ENV === 'production') {
    return { message: 'Внутренняя ошибка сервера', path: formatted.path, extensions: { code: 500 } };
  }
  return formatted;
}

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        // В разработке схема пишется в schema.gql (лежит в репозитории для ревью), в проде — в памяти.
        autoSchemaFile: process.env.NODE_ENV === 'production' ? true : join(process.cwd(), 'schema.gql'),
        sortSchema: true,
        playground: false,
        introspection: true,
        plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true, includeCookies: false })],
        validationRules: [depthLimit(8)],
        formatError,
        context: ({ req }: { req: unknown }) => ({ req, loaders: createLoaders(prisma) }),
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [ProfileService, SearchService, ProfileResolver, ExperienceResolver, ProjectResolver, SkillResolver],
})
export class AppModule {}
