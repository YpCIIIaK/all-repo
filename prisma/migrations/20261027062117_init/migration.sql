-- Триграммы для нечётких подсказок навыков (аналог edge-ngram подсказок в OpenSearch).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "LinkKind" AS ENUM ('GITHUB', 'TELEGRAM', 'EMAIL', 'WEBSITE', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "SkillCategory" AS ENUM ('LANGUAGE', 'FRONTEND', 'BACKEND', 'DATABASE', 'CMS', 'AI', 'INFRA', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "EmploymentKind" AS ENUM ('FULL_TIME', 'INTERNSHIP', 'STARTUP', 'CONTRACT');

-- CreateTable
CREATE TABLE "Profile" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "availability" TEXT NOT NULL,
    "languages" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" "EmploymentKind" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "startedOn" DATE,
    "endedOn" DATE,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" SERIAL NOT NULL,
    "experienceId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        to_tsvector('russian', "text") || to_tsvector('english', "text")
    ) STORED,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "demoUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "searchVector" tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('russian', "name") || to_tsvector('english', "name"), 'A') ||
        setweight(to_tsvector('russian', "summary") || to_tsvector('english', "summary"), 'B')
    ) STORED,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectHighlight" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProjectHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSkill" (
    "projectId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,

    CONSTRAINT "ProjectSkill_pkey" PRIMARY KEY ("projectId","skillId")
);

-- CreateTable
CREATE TABLE "ExperienceSkill" (
    "experienceId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,

    CONSTRAINT "ExperienceSkill_pkey" PRIMARY KEY ("experienceId","skillId")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "institution" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_slug_key" ON "Profile"("slug");

-- CreateIndex
CREATE INDEX "Link_profileId_position_idx" ON "Link"("profileId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Link_profileId_kind_url_key" ON "Link"("profileId", "kind", "url");

-- CreateIndex
CREATE INDEX "Skill_profileId_category_position_idx" ON "Skill"("profileId", "category", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_profileId_slug_key" ON "Skill"("profileId", "slug");

-- CreateIndex
CREATE INDEX "Experience_profileId_position_idx" ON "Experience"("profileId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Experience_profileId_slug_key" ON "Experience"("profileId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_experienceId_position_key" ON "Achievement"("experienceId", "position");

-- CreateIndex
CREATE INDEX "Project_profileId_position_id_idx" ON "Project"("profileId", "position", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_profileId_slug_key" ON "Project"("profileId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectHighlight_projectId_position_key" ON "ProjectHighlight"("projectId", "position");

-- CreateIndex
CREATE INDEX "ProjectSkill_skillId_idx" ON "ProjectSkill"("skillId");

-- CreateIndex
CREATE INDEX "ExperienceSkill_skillId_idx" ON "ExperienceSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Education_profileId_institution_key" ON "Education"("profileId", "institution");

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHighlight" ADD CONSTRAINT "ProjectHighlight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSkill" ADD CONSTRAINT "ProjectSkill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSkill" ADD CONSTRAINT "ProjectSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceSkill" ADD CONSTRAINT "ExperienceSkill_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceSkill" ADD CONSTRAINT "ExperienceSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Полнотекстовый поиск: сгенерированные tsvector-колонки (русская и английская морфология) + GIN.
CREATE INDEX "Achievement_searchVector_idx" ON "Achievement" USING GIN ("searchVector");
CREATE INDEX "Project_searchVector_idx" ON "Project" USING GIN ("searchVector");

-- Нечёткий поиск навыков по названию.
CREATE INDEX "Skill_name_trgm_idx" ON "Skill" USING GIN ("name" gin_trgm_ops);
