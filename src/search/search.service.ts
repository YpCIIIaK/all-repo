import { BadRequestException, Injectable } from '@nestjs/common';
import { SkillCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SearchHit, SkillSuggestion } from '../profile/models';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function cleanQuery(raw: string): string {
  const q = raw.trim();
  if (!q) throw new BadRequestException('Пустой запрос');
  if (q.length > 100) throw new BadRequestException('Запрос длиннее 100 символов');
  return q;
}

/**
 * Поиск внутри PostgreSQL, без отдельного поискового движка. Это перенос подходов
 * из HR-tech (там поиск шёл через OpenSearch) на штатные средства Postgres:
 *  - полнотекстовый поиск: tsvector-колонки с русской и английской морфологией,
 *    GIN-индекс, ранжирование ts_rank и подсветка ts_headline;
 *  - подсказки: триграммы pg_trgm вместо edge-ngram анализатора.
 * Все параметры передаются через плейсхолдеры $queryRaw — SQL-инъекции исключены.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Сначала строгий режим (все слова запроса), и только если он ничего не нашёл —
   * мягкий (любое из слов). Так точные совпадения не тонут среди частичных.
   */
  async search(profileId: number, raw: string, limit = 10): Promise<SearchHit[]> {
    const q = cleanQuery(raw);
    const take = clamp(limit, 1, 25);
    const strict = await this.runSearch(profileId, q, take, false);
    return strict.length ? strict : this.runSearch(profileId, q, take, true);
  }

  private runSearch(profileId: number, q: string, take: number, anyWord: boolean): Promise<SearchHit[]> {
    return this.prisma.$queryRaw<SearchHit[]>`
      WITH parsed AS (
        SELECT websearch_to_tsquery('russian', ${q}) AS ru, websearch_to_tsquery('english', ${q}) AS en
      ), query AS (
        SELECT CASE WHEN ${anyWord}
                    THEN replace(ru::text, '&', '|')::tsquery || replace(en::text, '&', '|')::tsquery
                    ELSE ru || en
               END AS tsq
          FROM parsed
      )
      SELECT * FROM (
        SELECT 'PROJECT' AS kind, p.id, p.name AS title,
               ts_headline('russian', p.summary, query.tsq,
                 'StartSel=<b>, StopSel=</b>, MaxWords=24, MinWords=8, MaxFragments=1') AS snippet,
               ts_rank(p."searchVector", query.tsq)::float AS rank
          FROM "Project" p, query
         WHERE p."profileId" = ${profileId} AND p."searchVector" @@ query.tsq
        UNION ALL
        SELECT 'ACHIEVEMENT', a.id, e.company || ' · ' || e.role,
               ts_headline('russian', a.text, query.tsq,
                 'StartSel=<b>, StopSel=</b>, MaxWords=24, MinWords=8, MaxFragments=1'),
               ts_rank(a."searchVector", query.tsq)::float
          FROM "Achievement" a
          JOIN "Experience" e ON e.id = a."experienceId", query
         WHERE e."profileId" = ${profileId} AND a."searchVector" @@ query.tsq
      ) hits
      ORDER BY rank DESC, kind, id
      LIMIT ${take}`;
  }

  /**
   * Подсказки навыков: сначала совпадения по началу названия, затем похожие по триграммам —
   * находит «PostgreSQL» по «post» и «OpenSearch» по опечатке «opensaerch».
   */
  async suggestSkills(profileId: number, raw: string, limit = 5): Promise<SkillSuggestion[]> {
    const q = cleanQuery(raw);
    const take = clamp(limit, 1, 20);
    const prefix = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.prisma.$queryRaw<
      { id: number; slug: string; name: string; category: SkillCategory; score: number }[]
    >`
      SELECT id, slug, name, category,
             greatest(similarity(name, ${q}), word_similarity(${q}, name))::float AS score
        FROM "Skill"
       WHERE "profileId" = ${profileId}
         AND (name ILIKE ${prefix} OR similarity(name, ${q}) > 0.15 OR word_similarity(${q}, name) > 0.3)
       ORDER BY (name ILIKE ${prefix}) DESC, score DESC, position
       LIMIT ${take}`;
    return rows.map(({ score, ...skill }) => ({ skill, score: Math.round(score * 1000) / 1000 }));
  }
}
