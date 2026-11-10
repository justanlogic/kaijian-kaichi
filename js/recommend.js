/* 每日营养目标推荐：Mifflin-St Jeor + 训练消耗估算 */

import { clamp, round } from './util.js';

export const SEXES = [
  { id: 'male', label: '男' },
  { id: 'female', label: '女' },
];

export const GOALS = [
  { id: 'cut', label: '减脂', factor: 0.85, protein: 2.0, hint: '热量缺口 15%' },
  { id: 'maintain', label: '维持', factor: 1, protein: 1.7, hint: '热量收支平衡' },
  { id: 'bulk', label: '增肌', factor: 1.1, protein: 1.8, hint: '热量盈余 10%' },
];

export const ACTIVITIES = [
  { id: 'sedentary', label: '久坐', factor: 1.2, hint: '办公室工作，每天不足 5000 步' },
  { id: 'light', label: '轻度', factor: 1.3, hint: '偶尔走动，约 5000–8000 步' },
  { id: 'moderate', label: '中度', factor: 1.4, hint: '经常走动或站立工作' },
  { id: 'high', label: '高强度', factor: 1.5, hint: '体力劳动或每天 12000 步以上' },
];

export const DURATIONS = [30, 45, 60, 90];
export const TRAINING_MET = 6.0;

export const DEFAULT_PROFILE = {
  sex: 'male',
  age: null,
  height: null,
  weight: null,
  goal: 'maintain',
  sessions: 3,
  duration: 60,
  activity: 'light',
};

export function goalLabel(id) {
  return (GOALS.find((g) => g.id === id) || GOALS[1]).label;
}

export function activityLabel(id) {
  return (ACTIVITIES.find((a) => a.id === id) || ACTIVITIES[1]).label;
}

export function bmiCategory(bmi) {
  if (bmi < 18.5) return '偏瘦';
  if (bmi < 24) return '正常';
  if (bmi < 28) return '偏高';
  return '肥胖';
}

export function validateProfile(profile) {
  const errors = {};
  const age = Number(profile.age);
  const height = Number(profile.height);
  const weight = Number(profile.weight);
  const sessions = Number(profile.sessions);
  if (!Number.isFinite(age) || age < 14 || age > 90) errors.age = '年龄需在 14–90 岁之间';
  if (!Number.isFinite(height) || height < 120 || height > 220) errors.height = '身高需在 120–220 cm 之间';
  if (!Number.isFinite(weight) || weight < 30 || weight > 250) errors.weight = '体重需在 30–250 kg 之间';
  if (!Number.isFinite(sessions) || sessions < 0 || sessions > 7) errors.sessions = '每周训练 0–7 次';
  if (!DURATIONS.includes(Number(profile.duration))) errors.duration = '请选择每次训练时长';
  return errors;
}

export function calculate(profile) {
  const age = Number(profile.age);
  const height = Number(profile.height);
  const weight = Number(profile.weight);
  const errors = validateProfile(profile);
  if (Object.keys(errors).length) return { valid: false, errors };

  const sex = profile.sex === 'female' ? 'female' : 'male';
  const sessions = clamp(Number(profile.sessions) || 0, 0, 7);
  const duration = Number(profile.duration) || 60;
  const activity = ACTIVITIES.find((a) => a.id === profile.activity) || ACTIVITIES[1];
  const requestedGoal = GOALS.find((g) => g.id === profile.goal) || GOALS[1];

  // 1. 基础代谢（Mifflin-St Jeor）
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);

  // 2. 日常活动消耗（不含训练）
  const neat = bmr * activity.factor;

  // 3. 训练消耗：MET 6.0，kcal/min = MET × 3.5 × 体重 / 200
  const kcalPerMin = (TRAINING_MET * 3.5 * weight) / 200;
  const perSession = kcalPerMin * duration;
  const trainingDaily = (perSession * sessions) / 7;
  const tdee = neat + trainingDaily;

  const bmi = weight / ((height / 100) ** 2);
  const bmiLabel = bmiCategory(bmi);
  const notes = [];

  // 4. 目标修正与安全边界
  let goal = requestedGoal;
  if (requestedGoal.id === 'cut' && bmi < 18.5) {
    goal = GOALS.find((g) => g.id === 'maintain');
    notes.push({ type: 'warn', text: 'BMI 偏瘦，不建议继续减脂，已按维持热量计算。' });
  }
  if (requestedGoal.id === 'bulk' && bmi >= 28) {
    notes.push({ type: 'warn', text: 'BMI 偏高时增肌容易同时增脂，建议先调整体成分。' });
  }
  if (requestedGoal.id === 'bulk' && sessions === 0) {
    notes.push({ type: 'warn', text: '还没有训练频率，增肌期建议先把训练稳定在每周 3 次以上。' });
  }
  if (age < 18) {
    notes.push({ type: 'warn', text: '未成年人的能量需求差异较大，建议在专业人士指导下使用本结果。' });
  }

  let target = tdee * goal.factor;
  const floor = Math.max(bmr, sex === 'male' ? 1500 : 1200);
  if (target < floor) {
    target = floor;
    notes.push({ type: 'info', text: '已按基础代谢下限修正热量，避免过度节食。' });
  }

  // 5. 三大营养素分配
  let protein = weight * goal.protein;
  let fat = weight * 0.9;
  const minFatKcal = target * 0.2;
  const maxFatKcal = target * 0.35;
  fat = clamp(fat, minFatKcal / 9, maxFatKcal / 9);

  let carbs = (target - protein * 4 - fat * 9) / 4;
  const minCarbs = weight * 1.2;
  if (carbs < minCarbs) {
    fat = Math.max((target * 0.15) / 9, (target - protein * 4 - minCarbs * 4) / 9);
    carbs = Math.max(0, (target - protein * 4 - fat * 9) / 4);
    notes.push({ type: 'info', text: '为保证训练所需碳水，已适当下调脂肪供能比例。' });
  }

  const targetKcal = Math.round(target / 10) * 10;
  const proteinG = Math.round(protein);
  const fatG = Math.round(fat);
  const carbsG = Math.round(carbs);
  const macroKcal = proteinG * 4 + carbsG * 4 + fatG * 9;

  return {
    valid: true,
    bmr: Math.round(bmr),
    neat: Math.round(neat),
    trainingDaily: Math.round(trainingDaily),
    perSession: Math.round(perSession),
    weeklyTraining: Math.round(perSession * sessions),
    tdee: Math.round(tdee),
    targetKcal,
    protein: proteinG,
    carbs: carbsG,
    fat: fatG,
    proteinPerKg: round(proteinG / weight, 1),
    carbsPerKg: round(carbsG / weight, 1),
    fatPerKg: round(fatG / weight, 1),
    proteinPct: Math.round((proteinG * 4) / targetKcal * 100),
    carbsPct: Math.round((carbsG * 4) / targetKcal * 100),
    fatPct: Math.round((fatG * 9) / targetKcal * 100),
    macroKcal,
    bmi: round(bmi, 1),
    bmiLabel,
    goal,
    requestedGoal,
    activity,
    notes,
  };
}
