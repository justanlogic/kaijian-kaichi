/* 数据派生：训练容量、营养合计、连续记录、PR 判定 */

import { round, sum, shiftDate } from './util.js';

export function workoutVolume(workout) {
  return sum(workout.sets || [], (s) => (Number(s.weight) || 0) * (Number(s.reps) || 0));
}

export function workoutSetCount(workout) {
  return (workout.sets || []).length;
}

export function workoutsOn(state, date) {
  return state.workouts
    .filter((w) => w.date === date)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function mealsOn(state, date) {
  return state.meals
    .filter((m) => m.date === date)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function emptyTotals() {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export function nutritionOn(state, date) {
  const meals = mealsOn(state, date);
  const totals = emptyTotals();
  meals.forEach((m) => {
    totals.kcal += Number(m.kcal) || 0;
    totals.protein += Number(m.protein) || 0;
    totals.carbs += Number(m.carbs) || 0;
    totals.fat += Number(m.fat) || 0;
  });
  return {
    meals,
    totals: {
      kcal: Math.round(totals.kcal),
      protein: round(totals.protein, 1),
      carbs: round(totals.carbs, 1),
      fat: round(totals.fat, 1),
    },
  };
}

export function hasAnyLog(state, date) {
  return state.workouts.some((w) => w.date === date) || state.meals.some((m) => m.date === date);
}

export function streak(state, today) {
  let cursor = today;
  if (!hasAnyLog(state, cursor)) cursor = shiftDate(cursor, -1);
  let count = 0;
  while (count < 999 && hasAnyLog(state, cursor)) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

export function trainingInRange(state, dates) {
  const set = new Set(dates);
  const list = state.workouts.filter((w) => set.has(w.date));
  const days = new Set(list.map((w) => w.date));
  return {
    sessions: list.length,
    days: days.size,
    volume: sum(list, workoutVolume),
  };
}

/** 判定每条训练记录是否刷新了该动作的历史最大重量 */
export function prIds(state) {
  const sorted = [...state.workouts].sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    return byDate !== 0 ? byDate : String(a.createdAt).localeCompare(String(b.createdAt));
  });
  const best = new Map();
  const ids = new Set();
  sorted.forEach((w) => {
    const maxWeight = Math.max(0, ...(w.sets || []).map((s) => Number(s.weight) || 0));
    const previous = best.get(w.name) || 0;
    if (previous > 0 && maxWeight > previous) ids.add(w.id);
    if (maxWeight > previous) best.set(w.name, maxWeight);
  });
  return ids;
}

export function bestWeight(state, name, excludeId) {
  let max = 0;
  state.workouts.forEach((w) => {
    if (w.name !== name || w.id === excludeId) return;
    (w.sets || []).forEach((s) => {
      max = Math.max(max, Number(s.weight) || 0);
    });
  });
  return max;
}
