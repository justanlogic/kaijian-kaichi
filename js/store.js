/* 本地数据存储：localStorage + 订阅式更新 */

import { uid } from './util.js';
import { DEFAULT_GOALS, MEALS } from './data.js';
import { GOALS, ACTIVITIES, DURATIONS } from './recommend.js';

const KEY = 'kjkc.state.v1';
const listeners = new Set();

const defaults = () => ({
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  settings: {
    theme: 'dark',
    goals: { ...DEFAULT_GOALS },
    lastMeal: 'breakfast',
    lastBackupAt: null,
    profile: null,
    recommendation: null,
    installDismissed: false,
  },
  workouts: [],
  meals: [],
  measurements: [],
  customFoods: [],
  routines: [],
});

let state = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const age = Number(raw.age);
  const height = Number(raw.height);
  const weight = Number(raw.weight);
  if (!Number.isFinite(age) || !Number.isFinite(height) || !Number.isFinite(weight)) return null;
  const sessions = Number(raw.sessions);
  return {
    sex: raw.sex === 'female' ? 'female' : 'male',
    age,
    height,
    weight,
    goal: GOALS.some((g) => g.id === raw.goal) ? raw.goal : 'maintain',
    sessions: Number.isFinite(sessions) ? Math.min(7, Math.max(0, sessions)) : 3,
    duration: DURATIONS.includes(Number(raw.duration)) ? Number(raw.duration) : 60,
    activity: ACTIVITIES.some((a) => a.id === raw.activity) ? raw.activity : 'light',
  };
}

function normalizeRecommendation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const profile = normalizeProfile(raw.profile);
  const result = raw.result;
  if (!profile || !result || typeof result !== 'object') return null;
  if (!['targetKcal', 'protein', 'carbs', 'fat'].every((key) => Number.isFinite(Number(result[key])))) return null;
  return {
    profile,
    result: {
      ...result,
      targetKcal: Number(result.targetKcal),
      protein: Number(result.protein),
      carbs: Number(result.carbs),
      fat: Number(result.fat),
    },
    computedAt:
      typeof raw.computedAt === 'string' && !Number.isNaN(Date.parse(raw.computedAt))
        ? raw.computedAt
        : new Date().toISOString(),
  };
}

function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const goals = settings.goals && typeof settings.goals === 'object' ? settings.goals : {};
  const theme = ['dark', 'light', 'auto'].includes(settings.theme) ? settings.theme : base.settings.theme;
  const lastMeal = MEALS.some((m) => m.id === settings.lastMeal) ? settings.lastMeal : base.settings.lastMeal;
  const lastBackupAt =
    typeof settings.lastBackupAt === 'string' && !Number.isNaN(Date.parse(settings.lastBackupAt))
      ? settings.lastBackupAt
      : null;
  return {
    ...base,
    ...raw,
    updatedAt:
      typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
        ? raw.updatedAt
        : typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
          ? raw.createdAt
          : new Date().toISOString(),
    settings: {
      ...base.settings,
      ...settings,
      theme,
      lastMeal,
      lastBackupAt,
      profile: normalizeProfile(settings.profile),
      recommendation: normalizeRecommendation(settings.recommendation),
      goals: {
        kcal: Number(goals.kcal) > 0 ? Number(goals.kcal) : base.settings.goals.kcal,
        protein: Number(goals.protein) >= 0 ? Number(goals.protein) : base.settings.goals.protein,
        carbs: Number(goals.carbs) >= 0 ? Number(goals.carbs) : base.settings.goals.carbs,
        fat: Number(goals.fat) >= 0 ? Number(goals.fat) : base.settings.goals.fat,
      },
    },
    workouts: Array.isArray(raw.workouts) ? raw.workouts.map(normalizeWorkout).filter(Boolean) : [],
    meals: Array.isArray(raw.meals) ? raw.meals.map(normalizeMeal).filter(Boolean) : [],
    measurements: Array.isArray(raw.measurements)
      ? raw.measurements.map(normalizeMeasurement).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
      : [],
    customFoods: Array.isArray(raw.customFoods) ? raw.customFoods.map(normalizeCustomFood).filter(Boolean) : [],
    routines: Array.isArray(raw.routines) ? raw.routines.map(normalizeRoutine).filter(Boolean) : [],
  };
}

function normalizeMeasurement(raw) {
  if (!raw || !raw.date) return null;
  const weight = Number(raw.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  const round1 = (v) => Math.round(v * 10) / 10;
  const waist = Number(raw.waist);
  const bodyFat = Number(raw.bodyFat);
  return {
    id: raw.id || uid(),
    date: String(raw.date).slice(0, 10),
    weight: round1(weight),
    waist: Number.isFinite(waist) && waist > 0 ? round1(waist) : null,
    bodyFat: Number.isFinite(bodyFat) && bodyFat > 0 && bodyFat < 70 ? round1(bodyFat) : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, 100) : '',
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeCustomFood(raw) {
  if (!raw || !raw.name) return null;
  const kcal = Number(raw.kcal);
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > 5000) return null;
  const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
  return {
    id: raw.id || uid(),
    name: String(raw.name).slice(0, 30),
    kcal: Math.round(kcal),
    p: round1(raw.p),
    c: round1(raw.c),
    f: round1(raw.f),
    amount: Number(raw.amount) > 0 ? Math.round(Number(raw.amount)) : 100,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeRoutine(raw) {
  if (!raw || !raw.name) return null;
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((it) => {
      const sets = (Array.isArray(it?.sets) ? it.sets : [])
        .filter((set) => set && Number(set.reps) > 0)
        .map((set) => ({ weight: Math.max(0, Number(set.weight) || 0), reps: Math.round(Number(set.reps)) }));
      if (!it?.name || !sets.length) return null;
      return { name: String(it.name).slice(0, 60), sets };
    })
    .filter(Boolean);
  if (!items.length) return null;
  return {
    id: raw.id || uid(),
    name: String(raw.name).slice(0, 30),
    items,
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

function normalizeWorkout(w) {
  if (!w || !w.date || !w.name) return null;
  const sets = Array.isArray(w.sets)
    ? w.sets
        .filter((s) => s && Number(s.reps) > 0)
        .map((s) => ({ weight: Math.max(0, Number(s.weight) || 0), reps: Math.round(Number(s.reps)) }))
    : [];
  if (!sets.length) return null;
  return {
    id: w.id || uid(),
    date: String(w.date).slice(0, 10),
    name: String(w.name).slice(0, 60),
    sets,
    note: typeof w.note === 'string' ? w.note.slice(0, 200) : '',
    createdAt: w.createdAt || new Date().toISOString(),
  };
}

function normalizeMeal(m) {
  if (!m || !m.date || !m.name) return null;
  return {
    id: m.id || uid(),
    date: String(m.date).slice(0, 10),
    meal: ['breakfast', 'lunch', 'dinner', 'snack'].includes(m.meal) ? m.meal : 'snack',
    name: String(m.name).slice(0, 60),
    foodId: typeof m.foodId === 'string' ? m.foodId : '',
    amount: Math.max(0, Number(m.amount) || 0),
    portion: typeof m.portion === 'string' ? m.portion.slice(0, 30) : '',
    kcal: Math.max(0, Number(m.kcal) || 0),
    protein: Math.max(0, Number(m.protein) || 0),
    carbs: Math.max(0, Number(m.carbs) || 0),
    fat: Math.max(0, Number(m.fat) || 0),
    createdAt: m.createdAt || new Date().toISOString(),
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : defaults();
  } catch (err) {
    console.warn('[开健开吃] 本地数据读取失败，已使用空数据启动', err);
    state = defaults();
  }
  return state;
}

export function get() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[开健开吃] 本地数据保存失败', err);
  }
}

function commit() {
  state.updatedAt = new Date().toISOString();
  persist();
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (err) {
      console.error('[开健开吃] 界面渲染失败', err);
    }
  });
}

export const actions = {
  addWorkout(payload) {
    const item = normalizeWorkout({ ...payload, id: uid(), createdAt: new Date().toISOString() });
    if (!item) return null;
    state.workouts.push(item);
    commit();
    return item;
  },
  updateWorkout(id, payload) {
    const index = state.workouts.findIndex((w) => w.id === id);
    if (index < 0) return null;
    const merged = normalizeWorkout({ ...state.workouts[index], ...payload, id });
    if (!merged) return null;
    state.workouts.splice(index, 1, merged);
    commit();
    return merged;
  },
  removeWorkout(id) {
    state.workouts = state.workouts.filter((w) => w.id !== id);
    commit();
  },
  addWorkouts(list) {
    const items = (list || [])
      .map((payload) => normalizeWorkout({ ...payload, id: uid(), createdAt: new Date().toISOString() }))
      .filter(Boolean);
    if (!items.length) return [];
    state.workouts.push(...items);
    commit();
    return items;
  },
  addMeal(payload) {
    const item = normalizeMeal({ ...payload, id: uid(), createdAt: new Date().toISOString() });
    if (!item) return null;
    state.meals.push(item);
    commit();
    return item;
  },
  updateMeal(id, payload) {
    const index = state.meals.findIndex((m) => m.id === id);
    if (index < 0) return null;
    const merged = normalizeMeal({ ...state.meals[index], ...payload, id });
    if (!merged) return null;
    state.meals.splice(index, 1, merged);
    commit();
    return merged;
  },
  removeMeal(id) {
    state.meals = state.meals.filter((m) => m.id !== id);
    commit();
  },
  addMeasurement(payload) {
    const item = normalizeMeasurement({ ...payload, id: uid(), createdAt: new Date().toISOString() });
    if (!item) return null;
    const index = state.measurements.findIndex((m) => m.date === item.date);
    if (index >= 0) state.measurements.splice(index, 1, { ...item, id: state.measurements[index].id });
    else state.measurements.push(item);
    state.measurements.sort((a, b) => a.date.localeCompare(b.date));
    commit();
    return item;
  },
  removeMeasurement(id) {
    state.measurements = state.measurements.filter((m) => m.id !== id);
    commit();
  },
  addCustomFood(payload) {
    const item = normalizeCustomFood({ ...payload, id: uid(), createdAt: new Date().toISOString() });
    if (!item) return null;
    const key = item.name.trim().toLowerCase();
    const index = state.customFoods.findIndex((f) => f.name.trim().toLowerCase() === key);
    if (index >= 0) {
      state.customFoods.splice(index, 1, { ...item, id: state.customFoods[index].id });
      commit();
      return { ...item, id: state.customFoods[index].id, replaced: true };
    }
    state.customFoods.push(item);
    commit();
    return item;
  },
  removeCustomFood(id) {
    state.customFoods = state.customFoods.filter((f) => f.id !== id);
    commit();
  },
  addRoutine(payload) {
    const item = normalizeRoutine({ ...payload, id: uid(), createdAt: new Date().toISOString() });
    if (!item) return null;
    state.routines.push(item);
    commit();
    return item;
  },
  removeRoutine(id) {
    state.routines = state.routines.filter((r) => r.id !== id);
    commit();
  },
  setGoals(goals) {
    state.settings.goals = { ...state.settings.goals, ...goals };
    commit();
  },
  setTheme(theme) {
    state.settings.theme = theme;
    commit();
  },
  setLastMeal(meal) {
    state.settings.lastMeal = meal;
    persist();
  },
  markBackup() {
    state.settings.lastBackupAt = new Date().toISOString();
    commit();
  },
  applyRecommendation(profile, result) {
    state.settings.profile = { ...profile };
    state.settings.recommendation = {
      profile: { ...profile },
      result: { ...result },
      computedAt: new Date().toISOString(),
    };
    state.settings.goals = {
      kcal: result.targetKcal,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
    };
    commit();
  },
  replaceAll(raw) {
    const next = normalize(raw);
    Object.keys(state).forEach((key) => { delete state[key]; });
    Object.assign(state, next);
    commit();
    return next;
  },
  clearAll() {
    const next = defaults();
    Object.keys(state).forEach((key) => { delete state[key]; });
    Object.assign(state, next);
    commit();
  },
  exportJSON() {
    return JSON.stringify({ app: '开健开吃', exportedAt: new Date().toISOString(), ...state }, null, 2);
  },
};

export function normalizeState(raw) {
  return normalize(raw);
}

export const STORAGE_KEY = KEY;
