// Профиль потока голосующих: всплеск в начале (открыли голосование, разослали ссылку),
// ровная середина и всплеск перед закрытием. Общий для k6 (vote.js) и расчёта (scripts/plan.mjs).
//
//  скорость
//   peak ┤  ┌──┐                                   ┌──┐
//        │ ╱    ╲                                 ╱    │
//   base ┤╱      ╲_______________________________╱     │
//        └───────────────────────────────────────────────▶ время
//          ramp spike ramp        середина        ramp spike
//
// peak = PEAK_X × средняя скорость; base подбирается так, чтобы площадь под графиком
// (число голосов) была ровно TOTAL_VOTES.

export const REAL_DURATION_SEC = 3 * 3600;

export function buildProfile({ totalVotes, durationSec, peakX, spikeFrac, rampFrac }) {
  const avg = totalVotes / durationSec;
  const peak = peakX * avg;
  const ramp = rampFrac * durationSec;
  const spike = spikeFrac * durationSec;
  const middle = durationSec - 2 * spike - 3 * ramp;
  if (middle <= 0) throw new Error('SPIKE_FRAC и RAMP_FRAC слишком велики: на середину не осталось времени');

  // Площадь = peak·(2·spike + 1.5·ramp) + base·(middle + ramp)
  const base = (totalVotes - peak * (2 * spike + 1.5 * ramp)) / (middle + ramp);
  if (base < 0.1 * avg) {
    throw new Error(
      `Пик ×${peakX} при всплесках по ${(spikeFrac * 100).toFixed(1)} % времени забирает почти все голоса: ` +
        'уменьшите PEAK_X или SPIKE_FRAC',
    );
  }
  const segments = [
    { from: 0, to: peak, sec: ramp },
    { from: peak, to: peak, sec: spike },
    { from: peak, to: base, sec: ramp },
    { from: base, to: base, sec: middle },
    { from: base, to: peak, sec: ramp },
    { from: peak, to: peak, sec: spike },
  ];
  return { avg, peak, base, durationSec, segments };
}

/** Скорость (голосов в секунду) в момент t секунд от начала. */
export function rateAt(profile, t) {
  let start = 0;
  for (const s of profile.segments) {
    if (t < start + s.sec) return s.from + ((s.to - s.from) * (t - start)) / s.sec;
    start += s.sec;
  }
  return profile.segments[profile.segments.length - 1].to;
}

/**
 * Этапы для executor ramping-arrival-rate: скорость в голосах в минуту (целое число —
 * так точнее, чем в секунду), длительности в целых секундах.
 */
export function k6Stages(profile) {
  const stages = profile.segments.map((s) => ({
    target: Math.round(s.to * 60),
    duration: `${Math.max(1, Math.round(s.sec))}s`,
  }));
  let expected = 0;
  let prev = 0;
  for (const st of stages) {
    const sec = parseInt(st.duration, 10);
    expected += ((prev + st.target) / 2 / 60) * sec;
    prev = st.target;
  }
  return { stages, expected: Math.round(expected) };
}
