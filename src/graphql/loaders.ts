import DataLoader from 'dataloader';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * DataLoader'ы создаются заново на каждый GraphQL-запрос (кэш не протекает между
 * пользователями). Все обращения к одной связи за один тик event loop склеиваются
 * в один запрос `WHERE <fk> IN (...)` — это и убирает N+1 на вложенных полях.
 */

function groupBy<T, K>(rows: T[], key: (r: T) => K, keys: readonly K[]): T[][] {
  const map = new Map<K, T[]>(keys.map((k) => [k, []]));
  for (const r of rows) map.get(key(r))?.push(r);
  return keys.map((k) => map.get(k) ?? []);
}

export function createLoaders(prisma: PrismaService) {
  return {
    linksByProfile: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.link.findMany({ where: { profileId: { in: [...ids] } }, orderBy: { position: 'asc' } }),
        (r) => r.profileId,
        ids,
      ),
    ),

    skillsByProfile: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.skill.findMany({
          where: { profileId: { in: [...ids] } },
          orderBy: [{ category: 'asc' }, { position: 'asc' }],
        }),
        (r) => r.profileId,
        ids,
      ),
    ),

    experiencesByProfile: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.experience.findMany({ where: { profileId: { in: [...ids] } }, orderBy: { position: 'asc' } }),
        (r) => r.profileId,
        ids,
      ),
    ),

    projectsByProfile: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.project.findMany({
          where: { profileId: { in: [...ids] } },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }),
        (r) => r.profileId,
        ids,
      ),
    ),

    educationByProfile: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.education.findMany({ where: { profileId: { in: [...ids] } }, orderBy: { position: 'asc' } }),
        (r) => r.profileId,
        ids,
      ),
    ),

    achievementsByExperience: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.achievement.findMany({
          where: { experienceId: { in: [...ids] } },
          orderBy: { position: 'asc' },
          select: { id: true, text: true, experienceId: true },
        }),
        (r) => r.experienceId,
        ids,
      ),
    ),

    highlightsByProject: new DataLoader(async (ids: readonly number[]) =>
      groupBy(
        await prisma.projectHighlight.findMany({
          where: { projectId: { in: [...ids] } },
          orderBy: { position: 'asc' },
        }),
        (r) => r.projectId,
        ids,
      ),
    ),

    skillsByProject: new DataLoader(async (ids: readonly number[]) => {
      const rows = await prisma.projectSkill.findMany({
        where: { projectId: { in: [...ids] } },
        include: { skill: true },
        orderBy: { skill: { position: 'asc' } },
      });
      return groupBy(rows, (r) => r.projectId, ids).map((g) => g.map((r) => r.skill));
    }),

    skillsByExperience: new DataLoader(async (ids: readonly number[]) => {
      const rows = await prisma.experienceSkill.findMany({
        where: { experienceId: { in: [...ids] } },
        include: { skill: true },
        orderBy: { skill: { position: 'asc' } },
      });
      return groupBy(rows, (r) => r.experienceId, ids).map((g) => g.map((r) => r.skill));
    }),

    projectsBySkill: new DataLoader(async (ids: readonly number[]) => {
      const rows = await prisma.projectSkill.findMany({
        where: { skillId: { in: [...ids] } },
        include: { project: true },
        orderBy: { project: { position: 'asc' } },
      });
      return groupBy(rows, (r) => r.skillId, ids).map((g) => g.map((r) => r.project));
    }),

    experiencesBySkill: new DataLoader(async (ids: readonly number[]) => {
      const rows = await prisma.experienceSkill.findMany({
        where: { skillId: { in: [...ids] } },
        include: { experience: true },
        orderBy: { experience: { position: 'asc' } },
      });
      return groupBy(rows, (r) => r.skillId, ids).map((g) => g.map((r) => r.experience));
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;

export interface GqlContext {
  loaders: Loaders;
  req: { ip?: string; headers: Record<string, string | string[] | undefined> };
}
