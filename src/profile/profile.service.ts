import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SkillCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { experienceSpan } from '../common/experience-span';
import type { ExperienceSpan, ProfileStats, ProjectConnection } from './models';

const PROFILE_TTL = 300;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Профиль по slug. Корневая запись кэшируется в Redis (cache-aside). */
  async bySlug(slug: string) {
    const profile = await this.cache.wrap(`profile:${slug}`, PROFILE_TTL, () =>
      this.prisma.profile.findUnique({ where: { slug } }),
    );
    if (!profile) throw new NotFoundException(`Профиль «${slug}» не найден`);
    return { ...profile, updatedAt: new Date(profile.updatedAt) };
  }

  async experienceSpan(profileId: number): Promise<ExperienceSpan> {
    const periods = await this.prisma.experience.findMany({
      where: { profileId },
      select: { startedOn: true, endedOn: true },
    });
    return experienceSpan(periods);
  }

  /**
   * Сводка одним проходом по базе: счётчики и «частотность» навыков считаются
   * в PostgreSQL (GROUP BY), а не перебором в Node — как частотные индексы
   * навыков и должностей в HR-tech.
   */
  async stats(profileId: number, top = 8): Promise<ProfileStats> {
    return this.cache.wrap(`stats:${profileId}:${top}`, PROFILE_TTL, async () => {
      const [counts, byCategory, topSkills] = await Promise.all([
        this.prisma.$queryRaw<{ projects: number; skills: number; achievements: number }[]>`
          SELECT
            (SELECT count(*)::int FROM "Project" WHERE "profileId" = ${profileId}) AS projects,
            (SELECT count(*)::int FROM "Skill" WHERE "profileId" = ${profileId}) AS skills,
            (SELECT count(*)::int FROM "Achievement" a
               JOIN "Experience" e ON e.id = a."experienceId"
              WHERE e."profileId" = ${profileId}) AS achievements`,
        this.prisma.skill.groupBy({
          by: ['category'],
          where: { profileId },
          _count: { _all: true },
          orderBy: { category: 'asc' },
        }),
        this.prisma.$queryRaw<
          { id: number; slug: string; name: string; category: SkillCategory; usage: number }[]
        >`
          SELECT s.id, s.slug, s.name, s.category,
                 (COALESCE(ps.n, 0) + COALESCE(es.n, 0))::int AS usage
            FROM "Skill" s
            LEFT JOIN (SELECT "skillId", count(*) AS n FROM "ProjectSkill" GROUP BY "skillId") ps
                   ON ps."skillId" = s.id
            LEFT JOIN (SELECT "skillId", count(*) AS n FROM "ExperienceSkill" GROUP BY "skillId") es
                   ON es."skillId" = s.id
           WHERE s."profileId" = ${profileId}
           ORDER BY usage DESC, s.position ASC
           LIMIT ${top}`,
      ]);
      return {
        ...counts[0],
        skillsByCategory: byCategory.map((c) => ({ category: c.category, count: c._count._all })),
        topSkills: topSkills.map(({ usage, ...skill }) => ({ skill, usageCount: usage })),
      };
    });
  }

  /**
   * Keyset-пагинация по (position, id): следующая страница начинается строго после
   * последней записи предыдущей. В отличие от OFFSET, цена не растёт с номером страницы,
   * и записи не задваиваются, если между запросами что-то добавили.
   */
  async projects(
    profileId: number,
    args: { first: number; after?: string | null; skill?: string | null; featured?: boolean | null },
  ): Promise<ProjectConnection> {
    const first = Math.min(Math.max(args.first, 1), 50);
    const filter: Prisma.ProjectWhereInput = {
      profileId,
      ...(args.featured != null && { featured: args.featured }),
      ...(args.skill && { skills: { some: { skill: { slug: args.skill } } } }),
    };
    let after: ReturnType<typeof decodeCursor> | null = null;
    try {
      after = args.after ? decodeCursor(args.after) : null;
    } catch {
      throw new BadRequestException('Некорректный курсор: передайте endCursor из предыдущей страницы');
    }
    const where: Prisma.ProjectWhereInput = after
      ? {
          AND: [
            filter,
            { OR: [{ position: { gt: after.position } }, { position: after.position, id: { gt: after.id } }] },
          ],
        }
      : filter;

    const [rows, totalCount] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        take: first + 1, // +1 — узнать, есть ли следующая страница, без COUNT
      }),
      this.prisma.project.count({ where: filter }),
    ]);

    const page = rows.slice(0, first);
    const edges = page.map((node) => ({ node, cursor: encodeCursor({ position: node.position, id: node.id }) }));
    return {
      edges,
      totalCount,
      pageInfo: { hasNextPage: rows.length > first, endCursor: edges.at(-1)?.cursor ?? null },
    };
  }
}
