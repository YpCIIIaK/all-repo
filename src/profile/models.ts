import { Field, Float, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { EmploymentKind, LinkKind, SkillCategory } from '@prisma/client';

registerEnumType(LinkKind, { name: 'LinkKind' });
registerEnumType(SkillCategory, { name: 'SkillCategory', description: 'Группа навыков' });
registerEnumType(EmploymentKind, { name: 'EmploymentKind' });

/*
 * GraphQL-типы описывают только скалярные поля. Связи (skills, achievements, projects…)
 * отдают отдельные @ResolveField-резолверы через DataLoader: так любой уровень вложенности
 * стоит один SQL-запрос на тип связи, а не на каждую запись.
 */

@ObjectType()
export class Link {
  @Field(() => ID) id!: number;
  @Field(() => LinkKind) kind!: LinkKind;
  @Field() label!: string;
  @Field() url!: string;
}

@ObjectType()
export class Skill {
  @Field(() => ID) id!: number;
  @Field() slug!: string;
  @Field() name!: string;
  @Field(() => SkillCategory) category!: SkillCategory;
}

@ObjectType()
export class Achievement {
  @Field(() => ID) id!: number;
  @Field() text!: string;
}

@ObjectType()
export class Experience {
  @Field(() => ID) id!: number;
  @Field() slug!: string;
  @Field() company!: string;
  @Field({ description: 'Должность' }) role!: string;
  @Field(() => EmploymentKind) kind!: EmploymentKind;
  @Field({ description: 'Период как в резюме, например «2026 — н.в.»' }) periodLabel!: string;
  @Field(() => Date, { nullable: true }) startedOn!: Date | null;
  @Field(() => Date, { nullable: true }) endedOn!: Date | null;
}

@ObjectType()
export class ProjectHighlight {
  @Field(() => ID) id!: number;
  @Field() text!: string;
}

@ObjectType()
export class Project {
  @Field(() => ID) id!: number;
  @Field() slug!: string;
  @Field() name!: string;
  @Field() summary!: string;
  @Field() repoUrl!: string;
  @Field(() => String, { nullable: true }) demoUrl!: string | null;
  @Field() featured!: boolean;
}

@ObjectType()
export class Education {
  @Field(() => ID) id!: number;
  @Field() institution!: string;
  @Field() status!: string;
}

@ObjectType({ description: 'Стаж без двойного счёта пересекающихся периодов' })
export class ExperienceSpan {
  @Field(() => Int) totalMonths!: number;
  @Field(() => Int) years!: number;
  @Field(() => Int) months!: number;
  @Field(() => Int, { description: 'Периоды без точных дат, не вошедшие в расчёт' })
  periodsWithoutDates!: number;
  @Field() ongoing!: boolean;
}

@ObjectType()
export class SkillUsage {
  @Field(() => Skill) skill!: Skill;
  @Field(() => Int, { description: 'В скольких проектах и местах работы применялся' })
  usageCount!: number;
}

@ObjectType()
export class CategoryCount {
  @Field(() => SkillCategory) category!: SkillCategory;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class ProfileStats {
  @Field(() => Int) projects!: number;
  @Field(() => Int) skills!: number;
  @Field(() => Int) achievements!: number;
  @Field(() => [CategoryCount]) skillsByCategory!: CategoryCount[];
  @Field(() => [SkillUsage], { description: 'Самые используемые навыки' }) topSkills!: SkillUsage[];
}

@ObjectType()
export class Profile {
  @Field(() => ID) id!: number;
  @Field() slug!: string;
  @Field() name!: string;
  @Field() headline!: string;
  @Field() summary!: string;
  @Field() location!: string;
  @Field() timezone!: string;
  @Field() availability!: string;
  @Field() languages!: string;
  @Field() updatedAt!: Date;
}

@ObjectType()
export class PageInfo {
  @Field() hasNextPage!: boolean;
  @Field(() => String, { nullable: true }) endCursor!: string | null;
}

@ObjectType()
export class ProjectEdge {
  @Field() cursor!: string;
  @Field(() => Project) node!: Project;
}

@ObjectType({ description: 'Страница проектов (keyset-пагинация в стиле Relay)' })
export class ProjectConnection {
  @Field(() => [ProjectEdge]) edges!: ProjectEdge[];
  @Field(() => PageInfo) pageInfo!: PageInfo;
  @Field(() => Int) totalCount!: number;
}

@ObjectType()
export class SearchHit {
  @Field({ description: 'PROJECT или ACHIEVEMENT' }) kind!: string;
  @Field(() => ID) id!: number;
  @Field() title!: string;
  @Field({ description: 'Фрагмент с подсветкой совпадений <b>…</b>' }) snippet!: string;
  @Field(() => Float) rank!: number;
}

@ObjectType()
export class SkillSuggestion {
  @Field(() => Skill) skill!: Skill;
  @Field(() => Float, { description: 'Похожесть по триграммам, 0..1' }) score!: number;
}
