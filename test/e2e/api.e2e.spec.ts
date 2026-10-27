import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seed } from '../../prisma/seed';
import * as data from '../../prisma/data/profile';

/*
 * E2E на настоящем PostgreSQL (DATABASE_URL указывает на тестовую базу с применёнными
 * миграциями). Redis в тестах не нужен: кэш выключен, запросы идут прямо в базу.
 */

let app: INestApplication;
let prisma: PrismaService;

async function gql<T = any>(query: string, variables?: Record<string, unknown>) {
  const res = await request(app.getHttpServer()).post('/graphql').send({ query, variables });
  return res.body as { data: T; errors?: { message: string; extensions?: { code?: unknown } }[] };
}

beforeAll(async () => {
  delete process.env.REDIS_URL;
  await seed(true);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app?.close();
});

describe('сид', () => {
  it('повторный запуск без изменений пропускается и не создаёт дублей', async () => {
    const before = await prisma.project.count();
    expect(await seed()).toBe('skipped');
    expect(await seed(true)).toBe('applied');
    expect(await prisma.project.count()).toBe(before);
    expect(await prisma.project.count()).toBe(data.projects.length);
    expect(await prisma.achievement.count()).toBe(data.experiences.reduce((n, e) => n + e.achievements.length, 0));
  });
});

describe('profile', () => {
  const FULL = /* GraphQL */ `
    {
      profile {
        name
        links { kind url }
        skills { name }
        experience { company achievements { text } skills { name projects { name } } }
        projects { name highlights { text } skills { name experience { company } } }
        education { institution }
      }
    }`;

  it('отдаёт профиль со всеми вложенными данными', async () => {
    const { data: d, errors } = await gql(FULL);
    expect(errors).toBeUndefined();
    expect(d.profile.name).toBe(data.profile.name);
    expect(d.profile.projects).toHaveLength(data.projects.length);
    expect(d.profile.experience[0].achievements.length).toBeGreaterThan(0);
  });

  it('число SQL-запросов не растёт вместе с количеством записей (нет N+1)', async () => {
    prisma.queryCount = 0;
    await gql(FULL);
    const before = prisma.queryCount;

    // Добавляем 20 проектов с навыками — при N+1 запросов стало бы на десятки больше.
    const profile = await prisma.profile.findFirstOrThrow();
    const skill = await prisma.skill.findFirstOrThrow();
    const extra = await prisma.$transaction(
      Array.from({ length: 20 }, (_, i) =>
        prisma.project.create({
          data: {
            profileId: profile.id, slug: `tmp-${i}`, name: `Tmp ${i}`, summary: '-', repoUrl: '-', position: 1000 + i,
            highlights: { create: { text: '-', position: 0 } },
            skills: { create: { skillId: skill.id } },
          },
        }),
      ),
    );
    try {
      prisma.queryCount = 0;
      const { data: d } = await gql(FULL);
      expect(d.profile.projects).toHaveLength(data.projects.length + 20);
      expect(prisma.queryCount).toBe(before);
    } finally {
      await prisma.project.deleteMany({ where: { id: { in: extra.map((p) => p.id) } } });
    }
  });

  it('фильтрует навыки по категории', async () => {
    const { data: d } = await gql('{ profile { skills(category: DATABASE) { category } } }');
    expect(d.profile.skills.length).toBeGreaterThan(0);
    expect(d.profile.skills.every((s: { category: string }) => s.category === 'DATABASE')).toBe(true);
  });

  it('считает статистику навыков в базе', async () => {
    const { data: d } = await gql('{ profile { stats(top: 3) { projects skills topSkills { skill { slug } usageCount } } } }');
    expect(d.profile.stats.projects).toBe(data.projects.length);
    expect(d.profile.stats.topSkills).toHaveLength(3);
    const counts = d.profile.stats.topSkills.map((t: { usageCount: number }) => t.usageCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it('404 для неизвестного профиля', async () => {
    const { errors } = await gql('{ profile(slug: "nobody") { name } }');
    expect(errors?.[0].extensions?.code).toBe(404);
  });
});

describe('projects — keyset-пагинация', () => {
  it('обходит все страницы без пропусков и повторов', async () => {
    const seen: string[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const { data: d }: any = await gql(
        'query($after: String) { projects(first: 5, after: $after) { totalCount pageInfo { hasNextPage endCursor } edges { node { slug } } } }',
        { after },
      );
      seen.push(...d.projects.edges.map((e: { node: { slug: string } }) => e.node.slug));
      if (!d.projects.pageInfo.hasNextPage) break;
      after = d.projects.pageInfo.endCursor;
    }
    expect(seen).toEqual(data.projects.map((p) => p.slug));
  });

  it('фильтрует по навыку', async () => {
    const { data: d } = await gql('{ projects(first: 50, skill: "redis") { totalCount edges { node { slug } } } }');
    const expected = data.projects.filter((p) => p.skills.includes('redis')).map((p) => p.slug);
    expect(d.projects.edges.map((e: { node: { slug: string } }) => e.node.slug)).toEqual(expected);
    expect(d.projects.totalCount).toBe(expected.length);
  });

  it('400 на подделанный курсор', async () => {
    const { errors } = await gql('{ projects(after: "zzz") { totalCount } }');
    expect(errors?.[0].extensions?.code).toBe(400);
  });
});

describe('поиск', () => {
  it('находит достижение по словоформе и подсвечивает совпадение', async () => {
    const { data: d } = await gql('{ search(query: "синхронизация") { kind title snippet } }');
    expect(d.search.length).toBeGreaterThan(0);
    expect(d.search[0].snippet).toMatch(/<b>синхронизац/i);
  });

  it('мягкий режим: находит, даже если слова в разных записях', async () => {
    const { data: d } = await gql('{ search(query: "синхронизация документов") { kind } }');
    expect(d.search.length).toBeGreaterThan(1);
  });

  it('подсказки навыков прощают опечатку', async () => {
    const { data: d } = await gql('{ suggestSkills(prefix: "opensaerch") { skill { slug } } }');
    expect(d.suggestSkills[0].skill.slug).toBe('opensearch');
  });

  it('не принимает пустой запрос', async () => {
    const { errors } = await gql('{ search(query: "   ") { kind } }');
    expect(errors?.[0].extensions?.code).toBe(400);
  });
});

describe('защита API', () => {
  it('отклоняет слишком глубокие запросы', async () => {
    const deep =
      '{ profile { projects { skills { projects { skills { projects { skills { projects { skills { projects { name } } } } } } } } } } }';
    const { errors } = await gql(deep);
    expect(errors?.[0].message).toMatch(/depth/i);
  });
});
