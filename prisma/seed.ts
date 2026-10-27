import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import * as data from './data/profile';

/**
 * Сид приводит базу к состоянию из prisma/data/profile.ts и запускается при каждом старте.
 *
 * Принципы те же, что у backfill в HR-tech:
 *  - идемпотентность: записи ищутся по стабильным ключам (slug, позиция) и обновляются
 *    через upsert, поэтому повторный запуск не создаёт дублей;
 *  - удаление лишнего: то, чего больше нет в данных, удаляется;
 *  - версия: хэш данных хранится в SeedState — если он не изменился, сид пропускается
 *    (как watermark, по которому синхронизация понимает, что уже обработано);
 *  - атомарность: всё в одной транзакции — база не остаётся наполовину обновлённой.
 */

const prisma = new PrismaClient();

function validate(): void {
  const skillSlugs = new Set(data.skills.map((s) => s.slug));
  const unknown = [...data.experiences, ...data.projects].flatMap((item) =>
    item.skills.filter((slug) => !skillSlugs.has(slug)).map((slug) => `${item.slug} → ${slug}`),
  );
  if (unknown.length) throw new Error(`Неизвестные навыки: ${unknown.join(', ')}`);
  for (const [name, list] of [
    ['skills', data.skills],
    ['experiences', data.experiences],
    ['projects', data.projects],
  ] as const) {
    const slugs = list.map((x) => x.slug);
    const dup = slugs.find((s, i) => slugs.indexOf(s) !== i);
    if (dup) throw new Error(`Повторяющийся slug в ${name}: ${dup}`);
  }
}

const dateOrNull = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

async function apply(tx: Prisma.TransactionClient): Promise<void> {
  const profile = await tx.profile.upsert({
    where: { slug: data.profile.slug },
    create: data.profile,
    update: data.profile,
  });
  const profileId = profile.id;

  // Ссылки: полная замена — у них нет собственной идентичности.
  await tx.link.deleteMany({ where: { profileId } });
  await tx.link.createMany({ data: data.links.map((l, position) => ({ ...l, position, profileId })) });

  // Навыки: upsert по (profileId, slug), лишние — удалить.
  const skillIds = new Map<string, number>();
  for (const [position, s] of data.skills.entries()) {
    const row = await tx.skill.upsert({
      where: { profileId_slug: { profileId, slug: s.slug } },
      create: { ...s, position, profileId },
      update: { name: s.name, category: s.category, position },
    });
    skillIds.set(s.slug, row.id);
  }
  await tx.skill.deleteMany({ where: { profileId, slug: { notIn: data.skills.map((s) => s.slug) } } });

  for (const [position, e] of data.experiences.entries()) {
    const fields = {
      company: e.company,
      role: e.role,
      kind: e.kind,
      periodLabel: e.periodLabel,
      startedOn: dateOrNull(e.startedOn),
      endedOn: dateOrNull(e.endedOn),
      position,
    };
    const row = await tx.experience.upsert({
      where: { profileId_slug: { profileId, slug: e.slug } },
      create: { ...fields, slug: e.slug, profileId },
      update: fields,
    });
    await tx.achievement.deleteMany({ where: { experienceId: row.id } });
    await tx.achievement.createMany({
      data: e.achievements.map((text, i) => ({ text, position: i, experienceId: row.id })),
    });
    await tx.experienceSkill.deleteMany({ where: { experienceId: row.id } });
    await tx.experienceSkill.createMany({
      data: e.skills.map((slug) => ({ experienceId: row.id, skillId: skillIds.get(slug)! })),
    });
  }
  await tx.experience.deleteMany({ where: { profileId, slug: { notIn: data.experiences.map((e) => e.slug) } } });

  for (const [position, p] of data.projects.entries()) {
    const fields = {
      name: p.name,
      summary: p.summary,
      repoUrl: p.repoUrl,
      demoUrl: p.demoUrl ?? null,
      featured: p.featured ?? false,
      position,
    };
    const row = await tx.project.upsert({
      where: { profileId_slug: { profileId, slug: p.slug } },
      create: { ...fields, slug: p.slug, profileId },
      update: fields,
    });
    await tx.projectHighlight.deleteMany({ where: { projectId: row.id } });
    await tx.projectHighlight.createMany({
      data: p.highlights.map((text, i) => ({ text, position: i, projectId: row.id })),
    });
    await tx.projectSkill.deleteMany({ where: { projectId: row.id } });
    await tx.projectSkill.createMany({
      data: p.skills.map((slug) => ({ projectId: row.id, skillId: skillIds.get(slug)! })),
    });
  }
  await tx.project.deleteMany({ where: { profileId, slug: { notIn: data.projects.map((p) => p.slug) } } });

  for (const [position, ed] of data.education.entries()) {
    await tx.education.upsert({
      where: { profileId_institution: { profileId, institution: ed.institution } },
      create: { ...ed, position, profileId },
      update: { status: ed.status, position },
    });
  }
  await tx.education.deleteMany({
    where: { profileId, institution: { notIn: data.education.map((e) => e.institution) } },
  });
}

export async function seed(force = false): Promise<'applied' | 'skipped'> {
  validate();
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
  const state = await prisma.seedState.findUnique({ where: { id: 1 } });
  if (!force && state?.hash === hash) {
    console.log(`[seed] данные не менялись (версия ${hash}) — пропуск`);
    return 'skipped';
  }

  await prisma.$transaction(
    async (tx) => {
      await apply(tx);
      await tx.seedState.upsert({ where: { id: 1 }, create: { hash }, update: { hash, appliedAt: new Date() } });
    },
    { timeout: 30_000 },
  );

  // Новая версия данных делает старые ключи кэша недействительными.
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    await redis.set('cv:data-version', hash).catch((e) => console.warn(`[seed] Redis: ${e.message}`));
    redis.disconnect();
  }
  console.log(`[seed] применена версия ${hash}`);
  return 'applied';
}

if (require.main === module) {
  seed(process.argv.includes('--force'))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
