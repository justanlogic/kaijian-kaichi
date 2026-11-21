/* 每日营养评估：判断今天是否吃够，并给出可执行的补充建议 */

import { clamp, fmt } from './util.js';
import { FOODS } from './data.js';

const CAL_MIN = 0.9;
const CAL_MAX = 1.1;
const PROTEIN_OK = 0.9;
const PROTEIN_NEAR = 0.8;
const FAT_MIN = 0.8;
const FAT_MAX = 1.2;

/** 蛋白补充优先从这些食物里选，份量上限按常见一餐设定 */
const PROTEIN_PICKS = [
  { name: '鸡胸肉（熟）', max: 200 },
  { name: '金枪鱼（水浸）', max: 200 },
  { name: '希腊酸奶（无糖）', max: 300 },
  { name: '鸡蛋', max: 150 },
];

function ratio(value, goal) {
  return goal > 0 ? value / goal : 0;
}

function shortfall(goal, value) {
  return Math.max(0, Math.round(goal - value));
}

function portionText(food, targetProtein, max) {
  const grams = (targetProtein / food.p) * 100;
  const rounded = clamp(Math.round(grams / 10) * 10, 50, max);
  const protein = Math.round((rounded * food.p) / 100);
  const kcal = Math.round((rounded * food.kcal) / 100);
  return { text: `${food.name}${rounded}g（蛋白 ${protein}g）`, kcal };
}

function proteinOptions(gap, remainingKcal) {
  const target = Math.min(gap, 30);
  const picks = PROTEIN_PICKS.map(({ name, max }) => {
    const food = FOODS.find((f) => f.name === name);
    if (!food || !food.p) return null;
    return portionText(food, target, max);
  }).filter(Boolean);
  if (!picks.length) return [];
  const fit = picks.filter((p) => p.kcal <= Math.max(remainingKcal + 100, 220));
  return (fit.length >= 2 ? fit : picks).slice(0, 2).map((p) => p.text);
}

/**
 * 判定当天营养是否吃够。
 * 热量 90%–110% 且蛋白质 ≥90% 为「吃够了」；热量达标但蛋白 <80% 单列为「蛋白不足」。
 */
export function assessDay(totals, goals) {
  const intake = {
    kcal: Math.max(0, Number(totals.kcal) || 0),
    protein: Math.max(0, Number(totals.protein) || 0),
    carbs: Math.max(0, Number(totals.carbs) || 0),
    fat: Math.max(0, Number(totals.fat) || 0),
  };
  const target = {
    kcal: Math.max(1, Number(goals.kcal) || 0),
    protein: Math.max(0, Number(goals.protein) || 0),
    carbs: Math.max(0, Number(goals.carbs) || 0),
    fat: Math.max(0, Number(goals.fat) || 0),
  };
  const ratios = {
    kcal: ratio(intake.kcal, target.kcal),
    protein: ratio(intake.protein, target.protein),
    carbs: ratio(intake.carbs, target.carbs),
    fat: ratio(intake.fat, target.fat),
  };
  const gaps = {
    kcal: shortfall(target.kcal, intake.kcal),
    protein: shortfall(target.protein, intake.protein),
    carbs: shortfall(target.carbs, intake.carbs),
    fat: shortfall(target.fat, intake.fat),
  };
  const excess = {
    kcal: shortfall(intake.kcal, target.kcal),
    protein: shortfall(intake.protein, target.protein),
    carbs: shortfall(intake.carbs, target.carbs),
    fat: shortfall(intake.fat, target.fat),
  };

  let status = 'under';
  let label = '还没吃够';
  let tone = 'warn';

  if (intake.kcal <= 0) {
    status = 'empty';
    label = '还没开始';
    tone = 'muted';
  } else if (ratios.kcal > CAL_MAX) {
    status = 'over';
    label = '吃超了';
    tone = 'over';
  } else if (ratios.kcal >= CAL_MIN) {
    if (ratios.protein >= PROTEIN_OK) {
      status = 'enough';
      label = '吃够了';
      tone = 'ok';
    } else if (ratios.protein >= PROTEIN_NEAR) {
      status = 'nearly';
      label = '基本吃够';
      tone = 'ok';
    } else {
      status = 'protein-low';
      label = '蛋白不足';
      tone = 'warn';
    }
  }

  const fatLow = target.fat > 0 && ratios.fat < FAT_MIN;
  const fatHigh = ratios.fat > FAT_MAX;
  const carbsHigh = ratios.carbs > 1.3;

  const kcalPart = gaps.kcal > 0 ? `热量还差 ${fmt(gaps.kcal)} kcal` : '热量已达标';
  const proteinPart = gaps.protein > 0 ? `蛋白质还差 ${fmt(gaps.protein)} g` : '蛋白质已达标';
  let summary;
  if (status === 'empty') {
    summary = '还没有饮食记录，记一餐就能看到评估。';
  } else if (status === 'over') {
    summary = `热量已超出 ${fmt(excess.kcal)} kcal${fatHigh ? '，脂肪偏高' : ''}。`;
  } else if (status === 'enough') {
    summary = `热量和蛋白质都达标了${fatLow ? '，但脂肪偏低' : ''}。`;
  } else if (status === 'protein-low') {
    summary = `热量已经够了，蛋白质还差 ${fmt(gaps.protein)} g${fatHigh ? '，脂肪偏高' : ''}。`;
  } else if (status === 'nearly') {
    summary = gaps.kcal > 0 ? `${kcalPart}，${proteinPart}。` : `${proteinPart}。`;
  } else {
    summary = `${kcalPart}，${proteinPart}${fatHigh ? '，脂肪偏高' : carbsHigh ? '，碳水偏高' : ''}。`;
  }

  return { status, label, tone, ratios, gaps, excess, fatLow, fatHigh, carbsHigh, summary };
}

/** 最多两条建议：先补最缺的，再处理热量或脂肪的偏差 */
export function buildTips(a) {
  if (a.status === 'empty') return [];
  if (a.status === 'over') return ['下一餐以瘦肉和蔬菜为主，少油少糖；不必跳餐。'];
  if (a.status === 'enough') return ['今天已经吃够了，不用再刻意加餐；训练日注意补水。'];

  const tips = [];
  const remaining = a.gaps.kcal;

  if (a.gaps.protein >= 10) {
    const options = proteinOptions(a.gaps.protein, remaining);
    if (options.length) {
      if (a.status === 'protein-low' || remaining < 150) {
        tips.push(`热量余量不多，优先用蛋白替换主食：${options[0]}，替换约 100g 米饭。`);
      } else {
        tips.push(`补蛋白：${options.join('或')}。`);
      }
    }
  }

  if (a.ratios.kcal < 0.9 && remaining >= 150) {
    tips.push('补热量：米饭 150g + 脱脂牛奶 250ml（约 257 kcal）。');
  } else if (a.ratios.kcal < 0.9 && a.fatLow && remaining >= 80) {
    tips.push('补脂肪：杏仁 15g（约 87 kcal）。');
  }

  if (a.fatHigh && tips.length < 2) {
    tips.push('脂肪偏高，下一餐少油，优先蒸、煮、清炒。');
  }

  return tips.slice(0, 2);
}
