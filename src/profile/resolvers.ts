import { Args, Context, Int, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import { SkillCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import type { GqlContext } from '../graphql/loaders';
import { ProfileService } from './profile.service';
import {
  Achievement,
  Education,
  Experience,
  ExperienceSpan,
  Link,
  Profile,
  ProfileStats,
  Project,
  ProjectConnection,
  ProjectHighlight,
  SearchHit,
  Skill,
  SkillSuggestion,
} from './models';

/*
 * Резолверы только разбирают аргументы и делегируют: данные берут сервисы
 * (бизнес-логика) и DataLoader'ы (связи). SQL в резолверах нет.
 */

const DEFAULT_SLUG = 'vladimir';

@Resolver(() => Profile)
export class ProfileResolver {
  constructor(
    private readonly profiles: ProfileService,
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => Profile, { description: 'Профиль со всеми связанными данными' })
  profile(@Args('slug', { defaultValue: DEFAULT_SLUG }) slug: string) {
    return this.profiles.bySlug(slug);
  }

  @Query(() => ProjectConnection, { description: 'Проекты постранично, с фильтром по навыку' })
  async projects(
    @Args('first', { type: () => Int, defaultValue: 5 }) first: number,
    @Args('after', { type: () => String, nullable: true }) after: string | null,
    @Args('skill', { type: () => String, nullable: true, description: 'slug навыка, например "nestjs"' })
    skill: string | null,
    @Args('featured', { type: () => Boolean, nullable: true }) featured: boolean | null,
    @Args('profile', { defaultValue: DEFAULT_SLUG }) slug: string,
  ) {
    const { id } = await this.profiles.bySlug(slug);
    return this.profiles.projects(id, { first, after, skill, featured });
  }

  @Query(() => [SearchHit], { description: 'Полнотекстовый поиск по проектам и достижениям' })
  async search(
    @Args('query') query: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
    @Args('profile', { defaultValue: DEFAULT_SLUG }) slug: string,
  ) {
    const { id } = await this.profiles.bySlug(slug);
    return this.searchService.search(id, query, limit);
  }

  @Query(() => [SkillSuggestion], { description: 'Подсказки навыков с допуском опечаток' })
  async suggestSkills(
    @Args('prefix') prefix: string,
    @Args('limit', { type: () => Int, defaultValue: 5 }) limit: number,
    @Args('profile', { defaultValue: DEFAULT_SLUG }) slug: string,
  ) {
    const { id } = await this.profiles.bySlug(slug);
    return this.searchService.suggestSkills(id, prefix, limit);
  }

  @Query(() => Skill, { description: 'Навык и всё, где он применялся' })
  async skill(@Args('slug') skillSlug: string, @Args('profile', { defaultValue: DEFAULT_SLUG }) slug: string) {
    const { id } = await this.profiles.bySlug(slug);
    const found = await this.prisma.skill.findUnique({ where: { profileId_slug: { profileId: id, slug: skillSlug } } });
    if (!found) throw new NotFoundException(`Навык «${skillSlug}» не найден`);
    return found;
  }

  @ResolveField(() => [Link])
  links(@Parent() p: Profile, @Context() ctx: GqlContext) {
    return ctx.loaders.linksByProfile.load(p.id);
  }

  @ResolveField(() => [Skill])
  async skills(
    @Parent() p: Profile,
    @Context() ctx: GqlContext,
    @Args('category', { type: () => SkillCategory, nullable: true }) category: SkillCategory | null,
  ) {
    const all = await ctx.loaders.skillsByProfile.load(p.id);
    return category ? all.filter((s) => s.category === category) : all;
  }

  @ResolveField(() => [Experience])
  experience(@Parent() p: Profile, @Context() ctx: GqlContext) {
    return ctx.loaders.experiencesByProfile.load(p.id);
  }

  // Имя поля задано явно: метод `projects` в этом классе уже занят корневым Query.
  @ResolveField('projects', () => [Project])
  profileProjects(@Parent() p: Profile, @Context() ctx: GqlContext) {
    return ctx.loaders.projectsByProfile.load(p.id);
  }

  @ResolveField(() => [Education])
  education(@Parent() p: Profile, @Context() ctx: GqlContext) {
    return ctx.loaders.educationByProfile.load(p.id);
  }

  @ResolveField(() => ExperienceSpan, { description: 'Общий стаж без двойного счёта пересечений' })
  totalExperience(@Parent() p: Profile) {
    return this.profiles.experienceSpan(p.id);
  }

  @ResolveField(() => ProfileStats)
  stats(@Parent() p: Profile, @Args('top', { type: () => Int, defaultValue: 8 }) top: number) {
    return this.profiles.stats(p.id, Math.min(Math.max(top, 1), 30));
  }
}

@Resolver(() => Experience)
export class ExperienceResolver {
  @ResolveField(() => [Achievement])
  achievements(@Parent() e: Experience, @Context() ctx: GqlContext) {
    return ctx.loaders.achievementsByExperience.load(e.id);
  }

  @ResolveField(() => [Skill])
  skills(@Parent() e: Experience, @Context() ctx: GqlContext) {
    return ctx.loaders.skillsByExperience.load(e.id);
  }
}

@Resolver(() => Project)
export class ProjectResolver {
  @ResolveField(() => [ProjectHighlight])
  highlights(@Parent() p: Project, @Context() ctx: GqlContext) {
    return ctx.loaders.highlightsByProject.load(p.id);
  }

  @ResolveField(() => [Skill])
  skills(@Parent() p: Project, @Context() ctx: GqlContext) {
    return ctx.loaders.skillsByProject.load(p.id);
  }
}

@Resolver(() => Skill)
export class SkillResolver {
  @ResolveField(() => [Project], { description: 'Проекты, где применялся навык' })
  projects(@Parent() s: Skill, @Context() ctx: GqlContext) {
    return ctx.loaders.projectsBySkill.load(s.id);
  }

  @ResolveField(() => [Experience], { description: 'Места работы, где применялся навык' })
  experience(@Parent() s: Skill, @Context() ctx: GqlContext) {
    return ctx.loaders.experiencesBySkill.load(s.id);
  }
}
