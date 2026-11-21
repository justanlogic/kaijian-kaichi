/* 训练分析：近 28 天训练趋势、完成情况、表现变化与建议 */

import { clamp, diffDays, fmt, lastNDates, sum } from './util.js';
import { prIds, workoutSetCount, workoutVolume } from './selectors.js';
import { EXERCISES } from './data.js';

const WINDOW_DAYS = 28;
const GROUP_BY_NAME = new Map(EXERCISES.map((e) => [e.name, e.group]));
const STRENGTH_GROUPS = ['胸', '背', '腿', '肩', '手臂', '核心', '全身'];
const KEY_GROUPS = ['胸', '背', '腿'];
const GROUP_EXAMPLE = {
  胸: '卧推 / 俯卧撑',
  背: '划船 / 高位下拉',
  腿: '深蹲 / 腿举',
  肩: '推举 / 侧平举',
  手臂: '弯举 / 臂屈伸',
  核心: '卷腹 / 平板支撑',
  全身: '硬拉 / 壶铃摆动',
};

function pct(n) {
  return Math.round(n * 100);
}

function arrow(n) {
  return n > 0 ? '↑' : n < 0 ? '↓' : '→';
}

function setsWeight(list) {
  return sum(list, (w) => sum(w.sets || [], (s) => Number(s.weight) || 0));
}

function avgWeightPerSet(list) {
  const sets = sum(list, workoutSetCount);
  return sets ? setsWeight(list) / sets : 0;
}

export function buildTrainingReport(state, today) {
  const dates = lastNDates(WINDOW_DAYS, today);
  const inWindow = new Set(dates);
  const workouts = state.workouts.filter((w) => inWindow.has(w.date));
  const dayMap = new Map();
  workouts.forEach((w) => {
    if (!dayMap.has(w.date)) dayMap.set(w.date, []);
    dayMap.get(w.date).push(w);
  });
  const trainingDays = [...dayMap.keys()].sort();
  const sessions = trainingDays.length;

  const weeks = [0, 1, 2, 3].map((i) => {
    const slice = dates.slice(i * 7, i * 7 + 7);
    const set = new Set(slice);
    const list = workouts.filter((w) => set.has(w.date));
    const days = new Set(list.map((w) => w.date));
    return {
      index: i,
      label: i === 3 ? '最近 7 天' : `第 ${i + 1} 周`,
      range: `${slice[0].slice(5).replace('-', '/')}–${slice[6].slice(5).replace('-', '/')}`,
      sessions: days.size,
      volume: sum(list, workoutVolume),
      sets: sum(list, workoutSetCount),
    };
  });
  const activeWeeks = weeks.filter((w) => w.sessions > 0).length;
  const partial = sessions >= 4 && sessions < 8;
  const insufficient = sessions < 4 || activeWeeks < 2;

  const totalVolume = sum(workouts, workoutVolume);
  const totalSets = sum(workouts, workoutSetCount);
  const hasWeight = totalVolume > 0;
  const avgVolume = sessions ? totalVolume / sessions : 0;
  const avgSets = sessions ? totalSets / sessions : 0;
  const avgWeight = avgWeightPerSet(workouts);

  const early = weeks.slice(0, 2);
  const late = weeks.slice(2);
  const earlyVolume = sum(early, (w) => w.volume);
  const lateVolume = sum(late, (w) => w.volume);
  const volumeTrend = earlyVolume > 0 && lateVolume > 0 ? (lateVolume - earlyVolume) / earlyVolume : null;
  const earlySets = sum(early, (w) => w.sets);
  const lateSets = sum(late, (w) => w.sets);
  const setsTrend = earlySets > 0 && lateSets > 0 ? (lateSets - earlySets) / earlySets : null;
  const midpoint = dates[14];
  const earlyWeight = avgWeightPerSet(workouts.filter((w) => w.date < midpoint));
  const lateWeight = avgWeightPerSet(workouts.filter((w) => w.date >= midpoint));
  const weightTrend = hasWeight && earlyWeight > 0 && lateWeight > 0 ? (lateWeight - earlyWeight) / earlyWeight : null;
  const mainTrend = volumeTrend ?? setsTrend;
  const trendLabel = volumeTrend != null ? '容量' : '组数';

  const prs = prIds(state);
  const prCount = workouts.filter((w) => prs.has(w.id)).length;
  const lastDate = trainingDays.length ? trainingDays[trainingDays.length - 1] : null;
  const daysSinceLast = lastDate ? diffDays(lastDate, today) : null;

  const rawTarget = state.settings.recommendation?.profile?.sessions ?? state.settings.profile?.sessions;
  const target = Number(rawTarget) > 0 ? clamp(Number(rawTarget), 1, 7) : 3;
  const targetIsDefault = !(Number(rawTarget) > 0);
  const targetTotal = target * 4;
  const completion = targetTotal ? sessions / targetTotal : 0;

  /* ---------- 动作层面 ---------- */
  const exerciseMap = new Map();
  workouts.forEach((w) => {
    const item = exerciseMap.get(w.name) || {
      name: w.name,
      group: GROUP_BY_NAME.get(w.name) || '其他',
      sessions: 0,
      volume: 0,
      sets: 0,
      maxWeight: 0,
      earlySessions: 0,
      lateSessions: 0,
      earlyVolume: 0,
      lateVolume: 0,
      earlySets: 0,
      lateSets: 0,
      earlyMax: 0,
      lateMax: 0,
    };
    const late = w.date >= midpoint;
    const volume = workoutVolume(w);
    const sets = workoutSetCount(w);
    const maxWeight = Math.max(0, ...(w.sets || []).map((s) => Number(s.weight) || 0));
    item.sessions += 1;
    item.volume += volume;
    item.sets += sets;
    item.maxWeight = Math.max(item.maxWeight, maxWeight);
    if (late) {
      item.lateSessions += 1;
      item.lateVolume += volume;
      item.lateSets += sets;
      item.lateMax = Math.max(item.lateMax, maxWeight);
    } else {
      item.earlySessions += 1;
      item.earlyVolume += volume;
      item.earlySets += sets;
      item.earlyMax = Math.max(item.earlyMax, maxWeight);
    }
    exerciseMap.set(w.name, item);
  });

  const exercises = [...exerciseMap.values()].map((item) => {
    const useVolume = item.volume > 0;
    const earlyMetric = useVolume ? item.earlyVolume : item.earlySets;
    const lateMetric = useVolume ? item.lateVolume : item.lateSets;
    const earlyAvg = item.earlySessions > 0 ? earlyMetric / item.earlySessions : 0;
    const lateAvg = item.lateSessions > 0 ? lateMetric / item.lateSessions : 0;
    const trend = earlyAvg > 0 && lateAvg > 0 ? (lateAvg - earlyAvg) / earlyAvg : null;
    return {
      ...item,
      trend,
      weightGain: item.earlyMax > 0 && item.lateMax > item.earlyMax ? item.lateMax - item.earlyMax : 0,
      metric: useVolume ? item.volume : item.sets,
    };
  });
  exercises.sort((a, b) => b.metric - a.metric);

  const improving = exercises
    .filter((e) => e.trend != null && e.trend >= 0.1 && e.sessions >= 2)
    .sort((a, b) => b.trend - a.trend);
  const declining = exercises
    .filter((e) => e.trend != null && e.trend <= -0.1 && e.sessions >= 2)
    .sort((a, b) => a.trend - b.trend);

  /* ---------- 部位分布 ---------- */
  const groupMap = new Map();
  workouts.forEach((w) => {
    const group = GROUP_BY_NAME.get(w.name) || '其他';
    const item = groupMap.get(group) || { group, volume: 0, sets: 0, days: new Set() };
    item.volume += workoutVolume(w);
    item.sets += workoutSetCount(w);
    item.days.add(w.date);
    groupMap.set(group, item);
  });
  const groupMetric = (g) => (totalVolume > 0 ? g.volume : g.sets);
  const groupTotal = sum([...groupMap.values()], groupMetric);
  const topGroup = [...groupMap.values()].sort((a, b) => groupMetric(b) - groupMetric(a))[0];
  const topGroupShare = topGroup && groupTotal ? groupMetric(topGroup) / groupTotal : 0;
  const trainedGroups = STRENGTH_GROUPS.filter((g) => (groupMap.get(g)?.sets || 0) > 0);
  const missingKey = trainedGroups.length >= 2 ? KEY_GROUPS.find((g) => !trainedGroups.includes(g)) : null;

  const topExercise = exercises[0];
  const topExerciseShare = topExercise && groupTotal ? topExercise.metric / groupTotal : 0;

  /* ---------- 结论 ---------- */
  let status;
  if (insufficient) {
    status = { status: 'insufficient', label: '数据不足', tone: 'muted' };
  } else if ((completion < 0.5 && !targetIsDefault) || (mainTrend != null && mainTrend <= -0.3) || (daysSinceLast ?? 0) > 14) {
    status = { status: 'attention', label: '建议调整', tone: 'over' };
  } else if (
    completion < 0.8 ||
    (mainTrend != null && mainTrend <= -0.1) ||
    (hasWeight && sessions >= 8 && prCount === 0) ||
    trainedGroups.length <= 2
  ) {
    status = { status: 'watch', label: '需要关注', tone: 'warn' };
  } else {
    status = { status: 'good', label: '稳步推进', tone: 'ok' };
  }

  const volumeSentence =
    mainTrend == null
      ? `${trendLabel}趋势还不够判断`
      : Math.abs(mainTrend) < 0.05
        ? `总${trendLabel}基本持平`
        : `总${trendLabel}比前两周${mainTrend > 0 ? '上升' : '下降'} ${pct(Math.abs(mainTrend))}%`;
  const prSentence = prCount > 0 ? `，刷新 ${prCount} 次力量纪录` : '';
  const summary = insufficient
    ? `近 4 周只有 ${sessions} 天训练，至少需要 4 天、跨 2 周才能判断趋势。`
    : `近 4 周训练 ${sessions} 天，完成目标的 ${pct(completion)}%；${volumeSentence}${prSentence}。`;

  let headline;
  if (insufficient) {
    const missingSessions = Math.max(0, 4 - sessions);
    headline = missingSessions > 0 ? `再记录 ${missingSessions} 次训练就能生成分析` : '再跨 1 个训练周就能生成分析';
  } else if (status.status === 'attention') {
    headline =
      daysSinceLast != null && daysSinceLast > 14
        ? '最近训练间隔偏长'
        : mainTrend != null && mainTrend <= -0.15
          ? `训练${trendLabel}在下降`
          : '训练频率不足';
  } else if (status.status === 'watch') {
    headline =
      trainedGroups.length <= 2 && trainedGroups.length > 0
        ? '训练部位偏集中'
        : completion < 0.8
          ? '完成率还有提升空间'
          : mainTrend != null && mainTrend <= -0.1
            ? `训练${trendLabel}进入平台`
            : hasWeight && sessions >= 8 && prCount === 0
              ? '力量表现停滞'
              : '单次训练量偏小';
  } else {
    headline = mainTrend != null && mainTrend >= 0.1 ? `频率稳定，${trendLabel}在推进` : '训练节奏稳定';
  }

  /* ---------- 优势 / 不足 / 建议 ---------- */
  const strengths = [];
  const weaknesses = [];

  if (completion >= 0.8) strengths.push(`4 周完成 ${pct(completion)}% 的训练目标`);
  if (mainTrend != null && mainTrend >= 0.1) strengths.push(`总${trendLabel}比前两周上升 ${pct(mainTrend)}%`);
  if (hasWeight && prCount > 0) strengths.push(`刷新 ${prCount} 次力量纪录`);
  if (weightTrend != null && weightTrend >= 0.03) strengths.push(`平均每组重量上升 ${pct(weightTrend)}%`);
  if (improving.length) {
    const e = improving[0];
    strengths.push(`${e.name} 容量上升 ${pct(e.trend)}%`);
  }
  if (trainedGroups.length >= 4) strengths.push(`训练覆盖 ${trainedGroups.length} 个部位`);
  if (!strengths.length) strengths.push('训练记录已经开始形成规律');

  if (!insufficient) {
    if (completion < 0.6) weaknesses.push(`完成率 ${pct(completion)}%，低于每周 ${target} 天的目标`);
    if (mainTrend != null && mainTrend <= -0.15) weaknesses.push(`最近两周总${trendLabel}下降 ${pct(Math.abs(mainTrend))}%`);
    if (hasWeight && sessions >= 8 && prCount === 0) weaknesses.push('4 周没有刷新力量纪录');
    if (weightTrend != null && weightTrend <= -0.05) weaknesses.push(`平均每组重量下降 ${pct(Math.abs(weightTrend))}%`);
    if (declining.length) {
      const e = declining[0];
      weaknesses.push(`${e.name} 容量下降 ${pct(Math.abs(e.trend))}%`);
    }
    if (trainedGroups.length <= 2 && trainedGroups.length > 0) weaknesses.push('训练集中在少数部位');
    if (missingKey) weaknesses.push(`近 4 周没有${missingKey}训练`);
    if (avgSets < 6) weaknesses.push(`平均每次 ${fmt(avgSets, 1)} 组，单次训练量偏小`);
    if (daysSinceLast != null && daysSinceLast > 10) weaknesses.push(`最近 ${daysSinceLast} 天没有训练`);
    if (topGroupShare > 0.6 && trainedGroups.length >= 3) {
      weaknesses.push(`训练量集中在${topGroup.group}（${pct(topGroupShare)}%）`);
    }
    if (topExercise && topExerciseShare > 0.6 && sessions >= 6 && exercises.length >= 2) {
      weaknesses.push(`训练量集中在${topExercise.name}（${pct(topExerciseShare)}%）`);
    }
  }
  if (!weaknesses.length) weaknesses.push('暂无明显短板');

  const tips = [];
  if (completion < 0.8) {
    tips.push(`每周固定 ${target} 天（例如周二、周六），先把 4 周补到 ${targetTotal} 天；稳定后再加量。`);
  }
  if (volumeTrend != null && volumeTrend <= -0.15) {
    tips.push('先判断容量下降是疲劳还是时间：疲劳就减一组保住频率，时间紧就把训练压缩到 40 分钟。');
  }
  if (sessions >= 8 && prCount === 0 && !declining.length) {
    tips.push('选一个主项做渐进：下次加 2.5kg，或每组多 1 次，连续 2 周再评估。');
  }
  if (missingKey) {
    tips.push(`每周加 1 次${missingKey}训练，例如${GROUP_EXAMPLE[missingKey] || '一个复合动作'}，先从中等重量 3 组开始。`);
  }
  if (avgSets < 6 && sessions >= 4) {
    tips.push('每个动作从 3 组起，主项 4 组；先把单次训练量补到 12–16 组。');
  }
  if (!tips.length) {
    tips.push('保持当前频率；主项按 +2.5kg 或 +1 次渐进，每 2–4 周回看一次趋势。');
  }

  return {
    window: { days: WINDOW_DAYS, start: dates[0], end: dates[dates.length - 1] },
    sessions,
    activeWeeks,
    target,
    targetIsDefault,
    targetTotal,
    completion,
    totalVolume,
    avgVolume,
    avgSets,
    avgWeight,
    volumeTrend,
    setsTrend,
    weightTrend,
    prCount,
    hasWeight,
    mainTrend,
    trendLabel,
    daysSinceLast,
    weeks,
    exercises: exercises.slice(0, 5),
    improving,
    declining,
    trainedGroups,
    missingKey,
    topGroup,
    topGroupShare,
    topExercise,
    topExerciseShare,
    status,
    headline,
    summary,
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    tips: tips.slice(0, 3),
    insufficient,
    partial,
    disclaimer: '基于你记录的训练数据做趋势分析，不替代教练判断；如有疼痛或伤病，请先咨询专业人士。',
  };
}
