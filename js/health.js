/* 健康评估：基于近 28 天饮食与训练记录的趋势分析（非医疗诊断） */

import { clamp, diffDays, fmt, lastNDates, sum } from './util.js';
import { nutritionOn, workoutsOn, workoutVolume, workoutSetCount } from './selectors.js';
import { FOODS } from './data.js';

const WINDOW_DAYS = 28;
const CAT_BY_FOOD = new Map(FOODS.map((f) => [f.id, f.cat]));

const DISCLAIMER =
  '基于你记录的数据做趋势分析，仅供健康管理参考，不构成医疗诊断或治疗建议。如有持续不适、基础疾病或饮食障碍史，请咨询医生或注册营养师。';

function mean(list) {
  return list.length ? sum(list) / list.length : 0;
}

function stdev(list) {
  if (list.length < 2) return 0;
  const m = mean(list);
  return Math.sqrt(sum(list, (v) => (v - m) ** 2) / (list.length - 1));
}

function pct(value) {
  return Math.round(value * 100);
}

function statusOf(key, label, tone) {
  return { status: key, label, tone };
}

function trendText(value) {
  if (value == null) return '样本不足';
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return `${arrow} ${fmt(Math.abs(value) * 100)}%`;
}

/**
 * @returns 评估报告：覆盖度、四项指标、近 4 周趋势、风险与建议
 */
export function buildHealthReport(state, today) {
  const goal = state.settings.goals;
  const dates = lastNDates(WINDOW_DAYS, today);
  const days = dates.map((date) => {
    const { meals, totals } = nutritionOn(state, date);
    const workouts = workoutsOn(state, date);
    return {
      date,
      meals,
      totals,
      workouts,
      volume: sum(workouts, workoutVolume),
      sets: sum(workouts, workoutSetCount),
    };
  });

  const nutritionDays = days.filter((d) => d.meals.length > 0);
  const workoutDays = days.filter((d) => d.workouts.length > 0);
  const nutritionDays7 = days.slice(-7).filter((d) => d.meals.length > 0).length;
  const sessions = workoutDays.length;
  const hasTraining = sessions > 0;

  const kcalValues = nutritionDays.map((d) => d.totals.kcal);
  const avgKcal = nutritionDays.length ? Math.round(mean(kcalValues)) : 0;
  const kcalCv = nutritionDays.length >= 2 ? stdev(kcalValues) / Math.max(mean(kcalValues), 1) : 0;
  const kcalHitDays = nutritionDays.filter(
    (d) => d.totals.kcal >= goal.kcal * 0.9 && d.totals.kcal <= goal.kcal * 1.1
  ).length;
  const proteinHitDays = nutritionDays.filter((d) => d.totals.protein >= goal.protein * 0.9).length;
  const breakfastDays = nutritionDays.filter((d) => d.meals.some((m) => m.meal === 'breakfast')).length;
  const vegDays = nutritionDays.filter((d) => d.meals.some((m) => CAT_BY_FOOD.get(m.foodId) === '蔬菜')).length;
  const fruitDays = nutritionDays.filter((d) => d.meals.some((m) => CAT_BY_FOOD.get(m.foodId) === '水果')).length;

  const macro = nutritionDays.reduce(
    (acc, d) => {
      acc.protein += d.totals.protein * 4;
      acc.carbs += d.totals.carbs * 4;
      acc.fat += d.totals.fat * 9;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0 }
  );
  const macroTotal = macro.protein + macro.carbs + macro.fat;
  const shares = macroTotal
    ? { protein: macro.protein / macroTotal, carbs: macro.carbs / macroTotal, fat: macro.fat / macroTotal }
    : null;

  const rawTarget =
    state.settings.recommendation?.profile?.sessions ?? state.settings.profile?.sessions ?? null;
  const targetSessions =
    Number.isFinite(Number(rawTarget)) && Number(rawTarget) > 0 ? clamp(Number(rawTarget), 1, 7) : 3;
  const targetIsDefault = !(Number(rawTarget) > 0);
  const freq = sessions / (WINDOW_DAYS / 7);

  const weeks = [0, 1, 2, 3].map((i) => {
    const slice = days.slice(i * 7, i * 7 + 7);
    const logged = slice.filter((d) => d.meals.length > 0);
    const trained = slice.filter((d) => d.workouts.length > 0);
    return {
      index: i,
      label: i === 3 ? '最近 7 天' : `第 ${i + 1} 周`,
      range: `${slice[0].date.slice(5).replace('-', '/')}–${slice[6].date.slice(5).replace('-', '/')}`,
      loggedDays: logged.length,
      avgKcal: logged.length ? Math.round(mean(logged.map((d) => d.totals.kcal))) : null,
      sessions: trained.length,
      volume: Math.round(sum(trained, (d) => d.volume)),
      sets: sum(trained, (d) => d.sets),
    };
  });

  const activeWeeks = weeks.filter((w) => w.sessions > 0).length;
  const early = weeks.slice(0, 2);
  const late = weeks.slice(2);
  const earlyVolume = sum(early, (w) => w.volume);
  const lateVolume = sum(late, (w) => w.volume);
  const earlySets = sum(early, (w) => w.sets);
  const lateSets = sum(late, (w) => w.sets);
  const volumeTrend =
    earlyVolume > 0 && lateVolume > 0 ? (lateVolume - earlyVolume) / earlyVolume : null;
  const setsTrend = earlySets > 0 && lateSets > 0 ? (lateSets - earlySets) / earlySets : null;
  const lastWorkout = workoutDays.length ? workoutDays[workoutDays.length - 1].date : null;
  const daysSinceLast = lastWorkout ? diffDays(lastWorkout, today) : null;
  const totalVolume = sum(weeks, (w) => w.volume);
  const totalSets = sum(weeks, (w) => w.sets);

  /* ---------- 数据完整度 ---------- */
  const nutritionLevel = nutritionDays.length >= 10 ? 'full' : nutritionDays.length >= 7 ? 'partial' : 'low';
  const workoutLevel = sessions >= 8 ? 'full' : sessions >= 4 ? 'partial' : 'low';
  const missing = [];
  if (nutritionDays.length < 7) {
    missing.push(`饮食记录还差 ${7 - nutritionDays.length} 天（建议至少 7 天，最好 10 天）`);
  } else if (nutritionDays.length < 10) {
    missing.push('饮食记录 7–9 天，稳定性结论仅供参考');
  }
  if (!hasTraining) {
    missing.push('近 4 周没有训练记录；如需评估训练趋势，至少记录 4 天');
  } else if (sessions < 4) {
    missing.push(`训练记录 ${sessions} 天，趋势判断建议至少 4 天`);
  }
  if (nutritionDays7 === 0 && nutritionDays.length > 0) {
    missing.push('最近 7 天没有饮食记录，趋势可能已过时');
  }
  if (daysSinceLast != null && daysSinceLast > 10) {
    missing.push(`最近一次训练在 ${daysSinceLast} 天前`);
  }

  /* ---------- 四项指标 ---------- */
  let dietStatus;
  if (!shares || nutritionDays.length < 7) {
    dietStatus = statusOf('unknown', '数据不足', 'muted');
  } else if (shares.protein < 0.13 || shares.fat > 0.4) {
    dietStatus = statusOf('attention', '需关注', 'over');
  } else if (shares.protein < 0.15 || shares.fat > 0.35 || shares.carbs > 0.65) {
    dietStatus = statusOf('watch', '一般', 'warn');
  } else {
    dietStatus = statusOf('good', '良好', 'ok');
  }

  let stabilityStatus;
  const adherence = nutritionDays.length ? kcalHitDays / nutritionDays.length : 0;
  if (nutritionDays.length < 7) {
    stabilityStatus = statusOf('unknown', '数据不足', 'muted');
  } else if (kcalCv > 0.35 || adherence < 0.35) {
    stabilityStatus = statusOf('attention', '需关注', 'over');
  } else if (kcalCv > 0.22 || adherence < 0.6) {
    stabilityStatus = statusOf('watch', '一般', 'warn');
  } else {
    stabilityStatus = statusOf('good', '良好', 'ok');
  }

  let freqStatus;
  if (!hasTraining) {
    freqStatus = statusOf('attention', '未训练', 'over');
  } else if (freq < targetSessions * 0.5) {
    freqStatus = statusOf('attention', '需关注', 'over');
  } else if (freq < targetSessions * 0.8) {
    freqStatus = statusOf('watch', '一般', 'warn');
  } else {
    freqStatus = statusOf('good', '良好', 'ok');
  }

  let persistenceStatus;
  const trendForPersistence = volumeTrend ?? setsTrend;
  if (!hasTraining) {
    persistenceStatus = statusOf('unknown', '无训练', 'muted');
  } else if (sessions < 4) {
    persistenceStatus = statusOf('unknown', '数据不足', 'muted');
  } else if (activeWeeks <= 2 || (trendForPersistence != null && trendForPersistence <= -0.35) || (daysSinceLast ?? 0) > 14) {
    persistenceStatus = statusOf('attention', '需关注', 'over');
  } else if (activeWeeks === 3 || (trendForPersistence != null && trendForPersistence <= -0.2)) {
    persistenceStatus = statusOf('watch', '一般', 'warn');
  } else {
    persistenceStatus = statusOf('good', '良好', 'ok');
  }

  const metrics = [
    {
      key: 'diet',
      title: '饮食结构',
      ...dietStatus,
      value: shares ? `${pct(shares.protein)}%` : '—',
      unit: '蛋白供能',
      detail: shares
        ? nutritionDays.length < 7
          ? `仅 ${nutritionDays.length} 天记录：蛋白 ${pct(shares.protein)}% · 碳水 ${pct(shares.carbs)}% · 脂肪 ${pct(shares.fat)}%`
          : `蛋白 ${pct(shares.protein)}% · 碳水 ${pct(shares.carbs)}% · 脂肪 ${pct(shares.fat)}%`
        : '还没有足够的饮食记录',
      note:
        nutritionDays.length && shares
          ? `蔬菜 ${vegDays}/${nutritionDays.length} 天 · 水果 ${fruitDays}/${nutritionDays.length} 天`
          : '',
    },
    {
      key: 'stability',
      title: '摄入稳定性',
      ...stabilityStatus,
      value: nutritionDays.length ? `${pct(adherence)}%` : '—',
      unit: '热量达标',
      detail:
        nutritionDays.length >= 2
          ? `热量波动 ${pct(kcalCv)}% · 蛋白达标 ${proteinHitDays}/${nutritionDays.length} 天`
          : '至少需要 2 天饮食记录',
      note: nutritionDays.length ? `日均 ${fmt(avgKcal)} kcal · 早餐 ${breakfastDays}/${nutritionDays.length} 天` : '',
    },
    {
      key: 'frequency',
      title: '训练频率',
      ...freqStatus,
      value: freq.toFixed(1),
      unit: '天/周',
      detail: `近 4 周 ${sessions} 天训练 · 目标 ${targetSessions} 天/周${targetIsDefault ? '（默认）' : ''}`,
      note: sessions ? `最活跃一周 ${Math.max(...weeks.map((w) => w.sessions))} 天` : '最近一次训练：无记录',
    },
    {
      key: 'intensity',
      title: '训练强度',
      ...persistenceStatus,
      value: sessions >= 4 && trendForPersistence != null ? trendText(trendForPersistence) : hasTraining ? `${activeWeeks}/4` : '暂无',
      unit: sessions >= 4 && trendForPersistence != null ? (volumeTrend != null ? '容量变化' : '组数变化') : hasTraining ? '周有训练' : '强度数据',
      detail: !hasTraining
        ? '近 4 周没有训练，容量与组数变化无法计算'
        : `${activeWeeks}/4 周有训练${daysSinceLast != null ? ` · 最近一次在 ${daysSinceLast === 0 ? '今天' : `${daysSinceLast} 天前`}` : ''}`,
      note: totalVolume
        ? `近 4 周总容量 ${fmt(totalVolume)} kg`
        : totalSets
          ? `近 4 周共 ${fmt(totalSets)} 组`
          : '',
    },
  ];

  /* ---------- 风险 ---------- */
  const risks = [];
  const addRisk = (key, severity, title, detail) => risks.push({ key, severity, title, detail });

  if (nutritionDays.length >= 7 && proteinHitDays / nutritionDays.length < 0.5) {
    addRisk(
      'protein',
      'high',
      '蛋白质达标率偏低',
      `近 4 周只有 ${proteinHitDays}/${nutritionDays.length} 天达到蛋白质目标的 90%，${
        hasTraining ? '可能影响训练恢复与肌肉维持。' : '在没有训练的情况下，也会影响肌肉维持、免疫与饱腹感。'
      }`
    );
  }
  if (nutritionDays.length >= 7 && avgKcal < goal.kcal * 0.85) {
    addRisk(
      'kcal-low',
      'high',
      '平均热量偏低',
      `已记录日平均 ${fmt(avgKcal)} kcal，比目标低 ${pct(1 - avgKcal / goal.kcal)}%，${
        hasTraining ? '长期可能影响精力与训练表现。' : '长期可能影响精力、基础代谢与肌肉维持。'
      }`
    );
  }
  if (nutritionDays.length >= 7 && avgKcal > goal.kcal * 1.1) {
    addRisk(
      'kcal-high',
      'medium',
      '平均热量偏高',
      `已记录日平均 ${fmt(avgKcal)} kcal，比目标高 ${pct(avgKcal / goal.kcal - 1)}%，体重可能缓慢上升。`
    );
  }
  if (nutritionDays.length >= 7 && kcalCv > 0.3) {
    addRisk(
      'unstable',
      'medium',
      '热量波动较大',
      `日均热量波动约 ${pct(kcalCv)}%，周末与工作日的差距容易被平均掉。`
    );
  }
  if (nutritionDays.length >= 7 && breakfastDays / nutritionDays.length < 0.5) {
    addRisk(
      'breakfast',
      'low',
      '早餐记录偏少',
      `只有 ${breakfastDays}/${nutritionDays.length} 天记录了早餐，蛋白质和热量容易堆到晚上。`
    );
  }
  if (nutritionDays.length >= 7 && shares && shares.fat > 0.38) {
    addRisk('fat-high', 'medium', '脂肪供能偏高', `脂肪占总能量 ${pct(shares.fat)}%，高于常见的 20%–35% 区间。`);
  }
  if (nutritionDays.length >= 7 && shares && shares.carbs > 0.65) {
    addRisk('carb-high', 'low', '碳水供能偏高', `碳水占总能量 ${pct(shares.carbs)}%，蛋白质空间被压缩。`);
  }
  if (!hasTraining && nutritionDays.length >= 7) {
    addRisk(
      'no-training',
      'medium',
      '近 4 周没有训练记录',
      '这 28 天的训练记录为 0；如果是有意休息（恢复期、出差、伤病）可以忽略，否则建议先回到每周 2 次。'
    );
  }
  if (hasTraining && sessions < 4 && freq < targetSessions * 0.6) {
    addRisk(
      'few-sessions',
      'medium',
      '训练次数很少',
      `近 4 周只记录了 ${sessions} 天训练，平均每周 ${freq.toFixed(1)} 天；如果刚开始恢复可以忽略，否则频率还没稳定。`
    );
  }
  if (sessions >= 4 && freq < targetSessions * 0.6) {
    addRisk(
      'freq-low',
      'medium',
      '训练频率低于目标',
      `近 4 周平均每周 ${freq.toFixed(1)} 天，目标是 ${targetSessions} 天。`
    );
  }
  if (sessions >= 6 && freq >= targetSessions * 0.8 && volumeTrend != null && volumeTrend <= -0.3) {
    addRisk(
      'volume-down',
      'medium',
      '训练容量在下降',
      `最近两周总容量比前两周下降 ${pct(Math.abs(volumeTrend))}%，可能和疲劳、时间或训练安排有关。`
    );
  }
  if (sessions >= 4 && activeWeeks <= 2) {
    addRisk('gaps', 'medium', '训练断档较多', `4 周里只有 ${activeWeeks} 周有训练，频率还不稳定。`);
  }
  if (daysSinceLast != null && daysSinceLast > 10) {
    addRisk('recent-gap', 'medium', '最近训练间隔偏长', `已经 ${daysSinceLast} 天没有训练。`);
  }
  if (nutritionDays.length >= 7 && proteinHitDays / nutritionDays.length < 0.6 && sessions >= targetSessions * 3) {
    addRisk(
      'recovery',
      'high',
      '恢复可能跟不上',
      `训练频率不低，但蛋白质达标只有 ${proteinHitDays}/${nutritionDays.length} 天，恢复原料可能不足。`
    );
  }
  if (nutritionDays.length >= 7 && vegDays / nutritionDays.length < 0.4) {
    addRisk(
      'veg-low',
      'low',
      '蔬菜记录偏少',
      `只有 ${vegDays}/${nutritionDays.length} 天记录了蔬菜，膳食纤维与微量营养素可能不足。`
    );
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const topRisks = risks.slice(0, 4);

  /* ---------- 建议 ---------- */
  const tips = [];
  const addTip = (title, detail) => tips.push({ title, detail });

  if (nutritionDays.length < 7) {
    addTip('先补饮食记录', '连续记录 7 天，早/午/晚至少各一餐；有 10 天数据后，摄入稳定性的判断会更可靠。');
  }
  if (!hasTraining) {
    addTip(
      '先把训练频率定下来',
      '每周 2 次、每次 30–40 分钟，先做 3 个复合动作（深蹲/推/拉）；连续 3 周后再加次数或重量。'
    );
  } else if (sessions < 4) {
    addTip(
      '把训练固定到每周 2 天',
      `近 4 周只记录了 ${sessions} 天：如果确实在练，补记后趋势才准；如果没练，先固定周二、周六两次，每次 30 分钟。`
    );
  }

  if (risks.some((r) => r.key === 'protein' || r.key === 'recovery')) {
    addTip(
      '把蛋白质分到三餐',
      '早餐 25–30g（2 个鸡蛋 + 250ml 牛奶），午晚餐各 30–40g（鸡胸肉/鱼/豆腐 100–150g），比晚上一次补更容易达标。'
    );
  }
  if (risks.some((r) => r.key === 'kcal-low')) {
    addTip(
      '每天加一份主食 + 蛋白',
      hasTraining
        ? '米饭 150g + 鸡胸肉 100g，约 340 kcal、34g 蛋白；优先加在训练日。'
        : '米饭 150g + 鸡胸肉 100g，约 340 kcal、34g 蛋白；分到三餐，或放在活动量最大的那一餐。'
    );
  }
  if (risks.some((r) => r.key === 'unstable')) {
    addTip('先固定早餐和午餐', '晚餐按当天剩余额度调整；周末预留约 10% 的弹性，不用完全放开。');
  }
  if (risks.some((r) => r.key === 'breakfast')) {
    addTip('早餐先吃到 20g 蛋白', '鸡蛋、牛奶、希腊酸奶任选两样；早餐稳定后，全天蛋白质会明显好补。');
  }
  if (risks.some((r) => r.key === 'freq-low' || r.key === 'gaps' || r.key === 'recent-gap')) {
    addTip('先把频率固定下来', '每周固定 2 天（例如周二、周六），先保证不断档；稳定 3–4 周后再增加次数或容量。');
  }
  if (risks.some((r) => r.key === 'volume-down')) {
    addTip('先判断容量下降的原因', '如果是疲劳，减一组但保住频率；如果是时间不够，把训练压缩到 40 分钟，优先保留复合动作。');
  }
  if (risks.some((r) => r.key === 'fat-high' || r.key === 'carb-high')) {
    addTip('调整烹饪与主食比例', '少油、优先蒸煮；主食选米饭/杂粮，给蛋白质留出热量空间。');
  }
  if (risks.some((r) => r.key === 'veg-low')) {
    addTip('每天加一份深色蔬菜', '午餐或晚餐加 150–200g 蔬菜，优先深色叶菜；不需要一次改变所有餐。');
  }
  if (!tips.length) {
    addTip('保持当前节奏', '饮食和训练都没有明显短板；每 2–4 周回来看一次趋势即可，不必每天盯数字。');
  }

  /* ---------- 总体结论 ---------- */
  const attentionCount = metrics.filter((m) => m.status === 'attention').length;
  const watchCount = metrics.filter((m) => m.status === 'watch').length;
  const highCount = topRisks.filter((r) => r.severity === 'high').length;
  const mediumCount = topRisks.filter((r) => r.severity === 'medium').length;

  const nutritionLow = nutritionDays.length < 7;
  const workoutLow = sessions < 4;
  let total;
  if (nutritionLow && workoutLow) {
    total = statusOf('insufficient', '数据不足', 'muted');
  } else if (highCount > 0 || attentionCount >= 2) {
    total = statusOf('attention', '建议调整', 'over');
  } else if (mediumCount > 0 || attentionCount === 1 || watchCount >= 2) {
    total = statusOf('watch', '需要关注', 'warn');
  } else if (nutritionLow || workoutLow) {
    total = statusOf('partial', '数据待补', 'muted');
  } else {
    total = statusOf('good', '整体平稳', 'ok');
  }

  let headline;
  if (total.status === 'insufficient') {
    headline = '先补齐记录，再判断趋势';
  } else if (total.status === 'partial') {
    headline = nutritionLow ? '训练趋势可看，饮食数据还不够' : '饮食趋势可看，训练数据还不够';
  } else if (topRisks.length) {
    headline = topRisks[0].title;
  } else {
    headline = '饮食与训练都没有明显短板';
  }

  const nutritionSentence =
    nutritionDays.length < 7
      ? '饮食记录还不足以判断摄入稳定性'
      : proteinHitDays / nutritionDays.length < 0.5
        ? `蛋白质达标 ${proteinHitDays}/${nutritionDays.length} 天，是当前最明显的短板`
        : kcalCv > 0.3
          ? `热量波动约 ${pct(kcalCv)}%，摄入不够稳定`
          : `热量达标 ${kcalHitDays}/${nutritionDays.length} 天，蛋白质达标 ${proteinHitDays}/${nutritionDays.length} 天`;

  const trainingSentence =
    !hasTraining
      ? '这 4 周没有训练，训练频率与强度无法评估'
      : freq < targetSessions * 0.6
        ? `训练平均每周 ${freq.toFixed(1)} 天，低于 ${targetSessions} 天的目标`
        : trendForPersistence != null && trendForPersistence <= -0.3
          ? `训练频率尚可，但最近两周${volumeTrend != null ? '容量' : '组数'}下降 ${pct(Math.abs(trendForPersistence))}%`
          : `训练平均每周 ${freq.toFixed(1)} 天，${activeWeeks}/4 周有训练`;

  const summary =
    nutritionDays.length === 0 && sessions === 0
      ? '还没有饮食或训练记录。先记下最近一周的饮食和至少一次训练，就能看到第一份趋势评估。'
      : `近 4 周记录了 ${nutritionDays.length} 天饮食、${sessions} 天训练。${nutritionSentence}；${trainingSentence}。`;

  return {
    window: { days: WINDOW_DAYS, start: dates[0], end: dates[dates.length - 1] },
    coverage: {
      nutritionDays: nutritionDays.length,
      nutritionDays7,
      sessions,
      activeWeeks,
      nutritionLevel,
      workoutLevel,
      targetSessions,
      targetIsDefault,
      breakfastDays,
      vegDays,
      fruitDays,
    },
    status: total,
    headline,
    summary,
    metrics,
    weeks,
    risks: topRisks,
    tips: tips.slice(0, 3),
    missing,
    disclaimer: DISCLAIMER,
    stats: {
      avgKcal,
      kcalCv,
      kcalHitDays,
      proteinHitDays,
      adherence,
      freq,
      volumeTrend,
      setsTrend,
      daysSinceLast,
      shares,
    },
  };
}
