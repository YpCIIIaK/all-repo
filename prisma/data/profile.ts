import type { EmploymentKind, LinkKind, SkillCategory } from '@prisma/client';

/**
 * Данные визитки. Источник правды для сида: правки делаются здесь, а сид при старте
 * приводит базу к этому состоянию (добавляет, обновляет и удаляет лишнее).
 * Навыки у опыта и проектов указываются по slug — сид проверяет, что такие навыки есть.
 */

export interface SeedSkill {
  slug: string;
  name: string;
  category: SkillCategory;
}

export interface SeedExperience {
  slug: string;
  company: string;
  role: string;
  kind: EmploymentKind;
  periodLabel: string;
  /** ISO-дата 'YYYY-MM-DD' или null, если точная дата не указана. */
  startedOn: string | null;
  endedOn: string | null;
  achievements: string[];
  skills: string[];
}

export interface SeedProject {
  slug: string;
  name: string;
  summary: string;
  repoUrl: string;
  demoUrl?: string;
  featured?: boolean;
  highlights: string[];
  skills: string[];
}

export const profile = {
  slug: 'vladimir',
  name: 'Владимир',
  headline: 'Fullstack-разработчик · TypeScript, React, Node.js / NestJS',
  summary:
    'Fullstack-разработчик с опытом 2+ года: клиентские проекты веб-агентства, HR-tech, криптостартап и собственные продукты. ' +
    'Делаю интерфейсы на React / Next.js и TypeScript, бэкенд на Node.js / NestJS и PostgreSQL, ботов и инструменты с ИИ.',
  location: 'Казахстан',
  timezone: 'UTC+5',
  availability: 'Удалённая работа: full-time, part-time, контракт или проект.',
  languages: 'Русский — родной, английский — B2+',
};

export const links: { kind: LinkKind; label: string; url: string }[] = [
  { kind: 'GITHUB', label: 'GitHub', url: 'https://github.com/YpCIIIaK' },
  { kind: 'WEBSITE', label: 'Портфолио', url: 'https://ypciiiak.online' },
  { kind: 'TELEGRAM', label: 'Telegram · @bigboyvova', url: 'https://t.me/bigboyvova' },
  { kind: 'EMAIL', label: 'Email', url: 'mailto:bigboyvova01@gmail.com' },
];

export const skills: SeedSkill[] = [
  { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGE' },
  { slug: 'javascript', name: 'JavaScript', category: 'LANGUAGE' },
  { slug: 'python', name: 'Python', category: 'LANGUAGE' },
  { slug: 'php', name: 'PHP 8', category: 'LANGUAGE' },
  { slug: 'sql', name: 'SQL', category: 'LANGUAGE' },
  { slug: 'go', name: 'Go', category: 'LANGUAGE' },

  { slug: 'react', name: 'React', category: 'FRONTEND' },
  { slug: 'nextjs', name: 'Next.js', category: 'FRONTEND' },
  { slug: 'vue', name: 'Vue 3', category: 'FRONTEND' },
  { slug: 'angular', name: 'Angular', category: 'FRONTEND' },
  { slug: 'redux-toolkit', name: 'Redux Toolkit', category: 'FRONTEND' },
  { slug: 'zustand', name: 'Zustand', category: 'FRONTEND' },
  { slug: 'tailwind', name: 'Tailwind CSS', category: 'FRONTEND' },
  { slug: 'scss', name: 'SCSS', category: 'FRONTEND' },
  { slug: 'jquery', name: 'jQuery', category: 'FRONTEND' },
  { slug: 'threejs', name: 'Three.js', category: 'FRONTEND' },
  { slug: 'framer-motion', name: 'Framer Motion', category: 'FRONTEND' },

  { slug: 'nodejs', name: 'Node.js', category: 'BACKEND' },
  { slug: 'nestjs', name: 'NestJS', category: 'BACKEND' },
  { slug: 'express', name: 'Express', category: 'BACKEND' },
  { slug: 'symfony', name: 'Symfony', category: 'BACKEND' },
  { slug: 'rest', name: 'REST API', category: 'BACKEND' },
  { slug: 'graphql', name: 'GraphQL', category: 'BACKEND' },
  { slug: 'websocket', name: 'WebSocket', category: 'BACKEND' },
  { slug: 'zod', name: 'zod', category: 'BACKEND' },

  { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
  { slug: 'prisma', name: 'Prisma', category: 'DATABASE' },
  { slug: 'mysql', name: 'MySQL', category: 'DATABASE' },
  { slug: 'redis', name: 'Redis', category: 'DATABASE' },
  { slug: 'opensearch', name: 'OpenSearch', category: 'DATABASE' },
  { slug: 'supabase', name: 'Supabase', category: 'DATABASE' },
  { slug: 'convex', name: 'Convex', category: 'DATABASE' },

  { slug: 'wordpress', name: 'WordPress', category: 'CMS' },
  { slug: 'acf', name: 'ACF PRO', category: 'CMS' },
  { slug: 'woocommerce', name: 'WooCommerce', category: 'CMS' },

  { slug: 'openrouter', name: 'OpenRouter', category: 'AI' },
  { slug: 'llm-agents', name: 'AI-агенты и tool use', category: 'AI' },
  { slug: 'claude-code', name: 'Claude Code', category: 'AI' },
  { slug: 'ollama', name: 'Ollama', category: 'AI' },

  { slug: 'docker', name: 'Docker', category: 'INFRA' },
  { slug: 'github-actions', name: 'GitHub Actions', category: 'INFRA' },
  { slug: 'argocd', name: 'ArgoCD', category: 'INFRA' },
  { slug: 'vitest', name: 'Vitest', category: 'INFRA' },
  { slug: 'jest', name: 'Jest', category: 'INFRA' },
  { slug: 'playwright', name: 'Playwright', category: 'INFRA' },
  { slug: 'vercel', name: 'Vercel', category: 'INFRA' },

  { slug: 'telegram-bots', name: 'Telegram-боты и Mini Apps', category: 'INTEGRATION' },
  { slug: 'discord', name: 'Discord-боты', category: 'INTEGRATION' },
  { slug: 'bitrix24', name: 'Битрикс24', category: 'INTEGRATION' },
  { slug: 'figma-api', name: 'Figma API', category: 'INTEGRATION' },
];

export const experiences: SeedExperience[] = [
  {
    slug: 'factum',
    company: 'Веб-агентство Factum',
    role: 'Frontend / WordPress-разработчик',
    kind: 'FULL_TIME',
    periodLabel: 'Июнь 2026 — н.в.',
    startedOn: '2026-06-01',
    endedOn: null,
    achievements: [
      'Сайт агентства factum.agency: 51 блок для 9 отраслевых страниц (Figma → PHP-шаблоны) и редизайн раздела проектов.',
      'Плагин Factum Sync для мультисайта: кейсы и направления на 14 региональных сайтах обновляются из одного места.',
      'Фронтенд-поддержка 7+ клиентских сайтов: исправление багов, доработка и обновление функционала и визуала.',
      'Интеграции: формы CF7 и WooCommerce в Битрикс24 через приложение и вебхуки, заявки в Telegram, GTM + Яндекс Метрика с отслеживанием форм.',
      'Корпоративный сайт производственной компании: 11 новых секций и переработка 4 блоков в действующей кодовой базе.',
      'Внутренний AI-бот студии, Telegram-бот с каталогом техники и Telegram Mini App.',
    ],
    skills: ['php', 'wordpress', 'acf', 'woocommerce', 'javascript', 'jquery', 'scss', 'bitrix24', 'telegram-bots', 'docker', 'playwright', 'python'],
  },
  {
    slug: 'hr-tech',
    company: 'HR-tech платформа поиска кандидатов',
    role: 'Fullstack-разработчик (стажировка)',
    kind: 'INTERNSHIP',
    periodLabel: 'Март — май 2026 · стажировка',
    startedOn: '2026-03-01',
    endedOn: '2026-05-31',
    achievements: [
      'Бэкенд поиска на NestJS, PostgreSQL и OpenSearch по базе из 15+ млн профилей; оптимизация SQL-запросов через индексы.',
      'Сервис синхронизации PostgreSQL → OpenSearch: ежечасная инкрементальная выгрузка по watermark в Redis, keyset-пагинация по (syncAt, id) пачками по 10 000.',
      'Идемпотентный backfill 30+ млн документов без дублей: повторный запуск безопасен с любого места.',
      'Нормализация JSONB-данных профилей (навыки, страны, языки), маппинг индекса и подсказки на edge-ngram, частотные индексы навыков и должностей.',
      'Фильтры выдачи на React 18 + Redux Toolkit с состоянием в URL и валидацией zod; расчёт стажа со слиянием пересекающихся периодов.',
    ],
    skills: ['nestjs', 'typescript', 'postgresql', 'opensearch', 'redis', 'react', 'redux-toolkit', 'zod', 'docker', 'github-actions', 'argocd', 'jest'],
  },
  {
    slug: 'yourtar',
    company: 'YourTar',
    role: 'Разработчик Telegram-ботов',
    kind: 'CONTRACT',
    periodLabel: 'Сентябрь 2025 — февраль 2026',
    startedOn: '2025-09-01',
    endedOn: '2026-02-28',
    achievements: [
      'Боты отчётности розничного магазина, онлайн-школы и учёта абонементов: административные команды, уведомления, интеграции и автоматические отчёты.',
    ],
    skills: ['python', 'php', 'telegram-bots'],
  },
  {
    slug: 'vortan',
    company: 'Криптостартап Vortan',
    role: 'Frontend / частично Fullstack',
    kind: 'STARTUP',
    periodLabel: 'Апрель — июль 2025 · core-команда',
    startedOn: '2025-04-01',
    endedOn: '2025-07-31',
    achievements: [
      'Интерфейсы крипто-инструментов: стратегии, бэктестинг, аналитика, управление торговыми ботами и данные в реальном времени.',
      'Команда прошла во второй этап Google Accelerator.',
    ],
    skills: ['react', 'typescript', 'websocket'],
  },
  {
    slug: 'paraweb',
    company: 'Paraweb',
    role: 'Стажёр веб-разработчик',
    kind: 'INTERNSHIP',
    periodLabel: 'Январь 2025 · стажировка',
    startedOn: '2025-01-01',
    endedOn: '2025-01-31',
    achievements: ['Фичи и исправления во фронтенде production-проекта; Git-flow и code review.'],
    skills: ['javascript'],
  },
  {
    slug: 'trading-bots',
    company: 'Стажировка: разработка торговых ботов',
    role: 'Python-разработчик (стажировка)',
    kind: 'INTERNSHIP',
    periodLabel: 'Июнь — октябрь 2024 · стажировка',
    startedOn: '2024-06-01',
    endedOn: '2024-10-31',
    achievements: ['Торговые боты на Python: расчёты, прогнозирование и логика стратегий.'],
    skills: ['python'],
  },
];

export const projects: SeedProject[] = [
  {
    slug: 'cv-graphql',
    name: 'CV GraphQL API',
    summary:
      'Эта визитка: GraphQL API на NestJS, Prisma и PostgreSQL с полнотекстовым поиском, подсказками по триграммам, keyset-пагинацией, DataLoader и кэшем в Redis.',
    repoUrl: 'https://github.com/YpCIIIaK/all-repo/tree/cv-graphql',
    featured: true,
    highlights: [
      'Вложенные данные без N+1: DataLoader склеивает обращения к связям в один запрос.',
      'Идемпотентный сид с версией данных: повторный старт ничего не ломает и не дублирует.',
    ],
    skills: ['nestjs', 'graphql', 'prisma', 'postgresql', 'redis', 'docker', 'typescript', 'jest', 'github-actions'],
  },
  {
    slug: 'repo-janitor',
    name: 'Repo Janitor',
    summary:
      'Сервис здоровья репозитория: 27 проверок в шести группах (безопасность, зависимости, CI, документация, «гниение», лишний код), оценка A–F и план исправлений.',
    repoUrl: 'https://github.com/YpCIIIaK/repo-janitor',
    demoUrl: 'https://repo-janitor.app',
    featured: true,
    highlights: [
      'GitHub Action валит сборку ниже заданной оценки, выгружает SARIF во вкладку Security и пишет разбор в PR.',
      'pnpm-монорепозиторий и 1600+ unit-тестов на Vitest; каждое ложное срабатывание закрывается регрессионным тестом.',
    ],
    skills: ['typescript', 'nextjs', 'tailwind', 'vitest', 'openrouter', 'github-actions'],
  },
  {
    slug: 'portfolio-ide',
    name: 'Portfolio IDE',
    summary:
      'Портфолио в стиле VS Code с приватным кабинетом: GitHub OAuth, Supabase, интеграции с почтой, Telegram, Notion и Google Drive, AI-ассистент и собственная запись визитов.',
    repoUrl: 'https://github.com/YpCIIIaK/portfolioV5',
    demoUrl: 'https://ypciiiak.online',
    featured: true,
    highlights: [
      'Запись сессий: поток событий пачками через sendBeacon, валидация на сервере, плеер воспроизводит визит.',
      'Второй дизайн 6.0 — схема метро, по которой при скролле едет поезд.',
    ],
    skills: ['nextjs', 'react', 'typescript', 'zustand', 'tailwind', 'supabase', 'framer-motion', 'openrouter'],
  },
  {
    slug: 'job-search-tool',
    name: 'JobSearchTool',
    summary:
      'Локальный агрегатор удалённых вакансий: 21 площадка, склейка дублей, скоринг по резюме, AI-оценка вакансий, письма и резюме под вакансию.',
    repoUrl: 'https://github.com/YpCIIIaK/JobSearchTool',
    highlights: [
      'Сбой одного источника не ломает скан; паузы между запросами.',
      'AI отсеивает вакансии по правилам с цитатой-доказательством, ответы кэшируются.',
    ],
    skills: ['nextjs', 'react', 'typescript', 'tailwind', 'openrouter', 'llm-agents'],
  },
  {
    slug: 'hephaestus',
    name: 'Hephaestus',
    summary:
      'Мультиагентная LLM-среда: чат с несколькими моделями и визуальный конструктор цепочек агентов (классификатор, аналитик, исследователь, синтезатор).',
    repoUrl: 'https://github.com/YpCIIIaK/Hephaestus',
    highlights: [
      'Локальные модели через Ollama и переход на запасную модель при таймауте или ошибке.',
      'RAG на BM25, учёт токенов и стоимости с графиками.',
    ],
    skills: ['nextjs', 'react', 'typescript', 'zustand', 'openrouter', 'ollama', 'llm-agents'],
  },
  {
    slug: 'argus',
    name: 'ARGUS',
    summary:
      'Discord-бот с пятью AI-агентами и встроенным Bounty Monitor: маршрутизация сообщений, передача подзадач между агентами, история в PostgreSQL.',
    repoUrl: 'https://github.com/YpCIIIaK/ARGUS',
    highlights: [
      'Ежедневный скан 6 баг-баунти платформ, дифф с прошлым снимком в Redis и AI-дайджест.',
      'Дедупликация событий Discord, сохраняемые лимиты и health-check.',
    ],
    skills: ['typescript', 'express', 'zod', 'discord', 'postgresql', 'redis', 'openrouter', 'llm-agents'],
  },
  {
    slug: 'property-inbox',
    name: 'Property Inbox',
    summary:
      'Inbox для управляющих недвижимостью на React и Convex: обращения, поиск арендаторов и обновления в реальном времени; AI-агент создаёт заявки через инструменты.',
    repoUrl: 'https://github.com/YpCIIIaK/convex-inbox',
    highlights: ['Пакетный импорт CSV с живым прогрессом, оптимистичные обновления, 13 backend-тестов и CI.'],
    skills: ['react', 'typescript', 'convex', 'llm-agents'],
  },
  {
    slug: 'yasen',
    name: 'Ясень · 3D-магазин мебели',
    summary:
      'Демо-магазин мебели: товары в 3D, конфигуратор материалов, планировщик комнаты и конструктор шкафа с чертежами и DXF для ЧПУ. Модели построены кодом.',
    repoUrl: 'https://github.com/YpCIIIaK/all-repo/tree/furniture-store',
    demoUrl: 'https://ypciiiak.github.io/all-repo/mebel/',
    highlights: ['Пересборка шкафа из 58 деталей — 3,4 мс благодаря кэшу геометрии; кадр рисуется только при изменениях.'],
    skills: ['javascript', 'threejs'],
  },
  {
    slug: 'physlab',
    name: 'Физлаб 3D',
    summary:
      'Песочница физики в браузере: тела, пружины, шарниры, моторы и 16 сценариев. Физика на Rapier (Rust → WebAssembly), отрисовка на Three.js.',
    repoUrl: 'https://github.com/YpCIIIaK/all-repo',
    demoUrl: 'https://ypciiiak.github.io/all-repo/',
    highlights: ['Тела одной формы рисуются одним вызовом (InstancedMesh), фиксированный шаг 60 Гц с интерполяцией.'],
    skills: ['javascript', 'threejs'],
  },
  {
    slug: 'readme-studio',
    name: 'Readme Studio',
    summary: 'Визуальный конструктор GitHub README и редактор анимированных SVG-карточек, работает в браузере без сервера.',
    repoUrl: 'https://github.com/YpCIIIaK/custom-readme',
    demoUrl: 'https://ypciiiak.github.io/custom-readme/',
    highlights: ['Экспорт SVG, PNG и Markdown, история изменений и предпросмотр GitHub в двух темах.'],
    skills: ['typescript', 'react'],
  },
  {
    slug: 'cyberpath',
    name: 'CyberPath',
    summary:
      'Интерактивная платформа изучения кибербезопасности: 14 курсов, эмулятор терминала Windows с виртуальной ФС, квесты и флаги. Без бэкенда.',
    repoUrl: 'https://github.com/YpCIIIaK/cyber-sec',
    demoUrl: 'https://ypciiiak.github.io/cyber-sec/#/',
    highlights: ['Контент сверен с OWASP Top 10, MITRE ATT&CK и NIST; PWA с офлайн-режимом.'],
    skills: ['javascript'],
  },
  {
    slug: 'figma-copy',
    name: 'Figma Copy',
    summary:
      'Перенос Figma-дизайнов в код с живым предпросмотром: React + Tailwind, HTML, Vue SFC. Companion-плагин обходит ограничения REST API.',
    repoUrl: 'https://github.com/YpCIIIaK/figma-to-code',
    highlights: ['Auto-layout → flexbox, дизайн-токены из variables, тесты конвертера на Vitest.'],
    skills: ['react', 'typescript', 'figma-api', 'tailwind', 'vitest', 'vue'],
  },
];

export const education = [{ institution: 'ТУСУР', status: 'Неоконченное высшее' }];
