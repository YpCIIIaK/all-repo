import { experienceSpan } from '../../src/common/experience-span';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('experienceSpan — стаж со слиянием пересечений', () => {
  it('считает непересекающиеся периоды по отдельности', () => {
    const r = experienceSpan([
      { startedOn: d('2023-01-01'), endedOn: d('2023-06-30') }, // 6 мес.
      { startedOn: d('2024-01-01'), endedOn: d('2024-03-31') }, // 3 мес.
    ]);
    expect(r.totalMonths).toBe(9);
  });

  it('не считает пересечение дважды', () => {
    const r = experienceSpan([
      { startedOn: d('2023-01-01'), endedOn: d('2023-12-31') }, // 12 мес.
      { startedOn: d('2023-06-01'), endedOn: d('2024-05-31') }, // пересекается на 7 мес.
    ]);
    expect(r.totalMonths).toBe(17);
    expect(r).toMatchObject({ years: 1, months: 5 });
  });

  it('поглощает вложенный период', () => {
    const r = experienceSpan([
      { startedOn: d('2022-01-01'), endedOn: d('2022-12-31') },
      { startedOn: d('2022-03-01'), endedOn: d('2022-04-30') },
    ]);
    expect(r.totalMonths).toBe(12);
  });

  it('сливает смежные периоды без разрыва', () => {
    const r = experienceSpan([
      { startedOn: d('2022-01-01'), endedOn: d('2022-03-31') },
      { startedOn: d('2022-04-01'), endedOn: d('2022-06-30') },
    ]);
    expect(r.totalMonths).toBe(6);
  });

  it('текущая работа считается до сегодняшнего месяца', () => {
    const r = experienceSpan([{ startedOn: d('2026-01-01'), endedOn: null }], d('2026-10-15'));
    expect(r).toMatchObject({ totalMonths: 10, ongoing: true });
  });

  it('периоды без дат не ломают расчёт, а учитываются отдельно', () => {
    const r = experienceSpan([
      { startedOn: null, endedOn: null },
      { startedOn: d('2025-01-01'), endedOn: d('2025-02-28') },
    ]);
    expect(r).toMatchObject({ totalMonths: 2, periodsWithoutDates: 1 });
  });

  it('порядок периодов на входе не важен', () => {
    const a = { startedOn: d('2021-05-01'), endedOn: d('2021-09-30') };
    const b = { startedOn: d('2021-01-01'), endedOn: d('2021-06-30') };
    expect(experienceSpan([a, b]).totalMonths).toBe(experienceSpan([b, a]).totalMonths);
  });
});
