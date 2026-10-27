/**
 * Общий стаж со слиянием пересекающихся периодов — та же идея, что в утилите
 * totalExperience из HR-tech: параллельные работы не должны считаться дважды.
 */

export interface Period {
  startedOn: Date | null;
  endedOn: Date | null;
}

export interface ExperienceSpan {
  /** Полных месяцев без двойного счёта пересечений. */
  totalMonths: number;
  years: number;
  months: number;
  /** Сколько периодов не вошли в расчёт из-за неизвестных дат. */
  periodsWithoutDates: number;
  ongoing: boolean;
}

const monthIndex = (d: Date): number => d.getUTCFullYear() * 12 + d.getUTCMonth();

/**
 * Периоды переводятся в полуоткрытые интервалы месяцев [start, end), сортируются
 * и сливаются: пересекающиеся и смежные интервалы объединяются в один.
 */
export function experienceSpan(periods: Period[], now: Date = new Date()): ExperienceSpan {
  const intervals: [number, number][] = [];
  let periodsWithoutDates = 0;
  let ongoing = false;

  for (const p of periods) {
    if (!p.startedOn) {
      periodsWithoutDates++;
      continue;
    }
    if (!p.endedOn) ongoing = true;
    const start = monthIndex(p.startedOn);
    const end = monthIndex(p.endedOn ?? now) + 1; // месяц окончания засчитывается
    if (end > start) intervals.push([start, end]);
  }

  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  let totalMonths = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of intervals) {
    if (current && start <= current[1]) {
      current[1] = Math.max(current[1], end);
    } else {
      if (current) totalMonths += current[1] - current[0];
      current = [start, end];
    }
  }
  if (current) totalMonths += current[1] - current[0];

  return {
    totalMonths,
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    periodsWithoutDates,
    ongoing,
  };
}
