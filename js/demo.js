/* 演示模式：?demo=1 时注入一份示例数据，不触碰真实用户数据。
   注意：本模块必须在 store.js 之前执行，才能在 load() 前写入 localStorage。 */

import { FOODS } from './data.js';
import { todayStr, shiftDate } from './util.js';
import { calculate } from './recommend.js';

const DEMO_KEY = 'kjkc.state.v1';
const PROFILE = {
  sex: 'male',
  age: 28,
  height: 178,
  weight: 70,
  goal: 'maintain',
  sessions: 3,
  duration: 60,
  activity: 'light',
};

let seq = 0;
const today = todayStr();
const at = (offset) => shiftDate(today, offset);

function foodByName(name) {
  const item = FOODS.find((f) => f.name === name);
  if (!item) throw new Error('demo food missing: ' + name);
  return item;
}

function meal(date, type, name, grams) {
  const f = foodByName(name);
  const k = grams / 100;
  return {
    id: `demo-m${++seq}`,
    date,
    meal: type,
    name: f.name,
    foodId: f.id,
    amount: grams,
    portion: `${grams} g`,
    kcal: Math.round(f.kcal * k),
    protein: Math.round(f.p * k * 10) / 10,
    carbs: Math.round(f.c * k * 10) / 10,
    fat: Math.round(f.f * k * 10) / 10,
    createdAt: `${date}T12:00:00.000Z`,
  };
}

function workout(offset, name, sets, note = '') {
  return {
    id: `demo-w${++seq}`,
    date: at(offset),
    name,
    sets,
    note,
    createdAt: `${at(offset)}T10:00:00.000Z`,
  };
}

function measure(offset, weight, waist, bodyFat) {
  return {
    id: `demo-b${++seq}`,
    date: at(offset),
    weight,
    waist,
    bodyFat,
    note: '',
    createdAt: `${at(offset)}T07:00:00.000Z`,
  };
}

const meals = [
  meal(at(0), 'breakfast', '燕麦片（干）', 50),
  meal(at(0), 'breakfast', '牛奶（全脂）', 250),
  meal(at(0), 'breakfast', '鸡蛋', 100),
  meal(at(0), 'lunch', '米饭（熟）', 200),
  meal(at(0), 'lunch', '鸡胸肉（熟）', 150),
  meal(at(0), 'lunch', '西兰花', 150),
  meal(at(0), 'snack', '希腊酸奶（无糖）', 150),
  meal(at(0), 'snack', '香蕉', 100),
  meal(at(0), 'snack', '杏仁', 25),
  meal(at(0), 'dinner', '三文鱼', 120),
  meal(at(0), 'dinner', '红薯（蒸）', 200),
  meal(at(0), 'dinner', '菠菜', 150),
  meal(at(0), 'dinner', '米饭（熟）', 150),

  meal(at(-1), 'breakfast', '全麦面包', 80),
  meal(at(-1), 'breakfast', '鸡蛋', 100),
  meal(at(-1), 'lunch', '牛肉拉面', 600),
  meal(at(-1), 'dinner', '米饭（熟）', 150),
  meal(at(-1), 'dinner', '叉烧', 120),
  meal(at(-1), 'dinner', '油麦菜', 150),

  meal(at(-2), 'breakfast', '豆浆（无糖）', 300),
  meal(at(-2), 'breakfast', '馒头', 100),
  meal(at(-2), 'lunch', '巨无霸', 215),
  meal(at(-2), 'lunch', '薯条', 110),
  meal(at(-2), 'dinner', '米饭（熟）', 180),
  meal(at(-2), 'dinner', '鲈鱼', 150),
  meal(at(-2), 'dinner', '西兰花', 200),

  meal(at(-3), 'breakfast', '燕麦片（干）', 50),
  meal(at(-3), 'breakfast', '牛奶（全脂）', 250),
  meal(at(-3), 'lunch', '米饭（熟）', 200),
  meal(at(-3), 'lunch', '猪梅花肉', 120),
  meal(at(-3), 'lunch', '生菜', 150),
  meal(at(-3), 'dinner', '三文鱼', 100),
  meal(at(-3), 'dinner', '红薯（蒸）', 180),

  meal(at(-4), 'breakfast', '希腊酸奶（无糖）', 200),
  meal(at(-4), 'breakfast', '蓝莓', 80),
  meal(at(-4), 'lunch', '黄焖鸡米饭', 500),
  meal(at(-4), 'dinner', '米饭（熟）', 150),
  meal(at(-4), 'dinner', '虾仁', 150),
  meal(at(-4), 'dinner', '菠菜', 150),

  meal(at(-5), 'breakfast', '鸡蛋', 100),
  meal(at(-5), 'breakfast', '牛奶（全脂）', 200),
  meal(at(-5), 'lunch', '米饭（熟）', 200),
  meal(at(-5), 'lunch', '鸡胸肉（熟）', 180),
  meal(at(-5), 'dinner', '烧鹅', 120),
  meal(at(-5), 'dinner', '米饭（熟）', 150),

  meal(at(-6), 'breakfast', '燕麦片（干）', 45),
  meal(at(-6), 'lunch', '牛肉拉面', 550),
  meal(at(-6), 'dinner', '北豆腐', 200),
  meal(at(-6), 'dinner', '米饭（熟）', 150),
];

const workouts = [
  workout(0, '杠铃卧推', [{ weight: 55, reps: 5 }, { weight: 60, reps: 5 }, { weight: 65, reps: 5 }, { weight: 65, reps: 4 }], '最后一组有点吃力'),
  workout(0, '引体向上', [{ weight: 0, reps: 8 }, { weight: 0, reps: 7 }, { weight: 0, reps: 6 }]),
  workout(0, '哑铃肩推', [{ weight: 18, reps: 10 }, { weight: 18, reps: 9 }, { weight: 18, reps: 8 }]),
  workout(-2, '杠铃深蹲', [{ weight: 70, reps: 5 }, { weight: 80, reps: 5 }, { weight: 90, reps: 5 }, { weight: 90, reps: 5 }]),
  workout(-2, '罗马尼亚硬拉', [{ weight: 70, reps: 8 }, { weight: 75, reps: 8 }, { weight: 75, reps: 8 }]),
  workout(-2, '保加利亚分腿蹲', [{ weight: 18, reps: 10 }, { weight: 18, reps: 10 }, { weight: 18, reps: 9 }]),
  workout(-4, '杠铃硬拉', [{ weight: 90, reps: 5 }, { weight: 100, reps: 5 }, { weight: 110, reps: 3 }]),
  workout(-4, '杠铃划船', [{ weight: 55, reps: 8 }, { weight: 55, reps: 8 }, { weight: 55, reps: 8 }]),
  workout(-7, '杠铃卧推', [{ weight: 55, reps: 5 }, { weight: 60, reps: 5 }, { weight: 62.5, reps: 5 }]),
  workout(-9, '杠铃深蹲', [{ weight: 70, reps: 5 }, { weight: 80, reps: 5 }, { weight: 85, reps: 5 }]),
  workout(-14, '杠铃卧推', [{ weight: 50, reps: 8 }, { weight: 55, reps: 6 }, { weight: 60, reps: 4 }]),
  workout(-17, '杠铃深蹲', [{ weight: 65, reps: 5 }, { weight: 75, reps: 5 }, { weight: 80, reps: 5 }]),
  workout(-23, '杠铃硬拉', [{ weight: 80, reps: 5 }, { weight: 90, reps: 5 }, { weight: 100, reps: 3 }]),
];

const measurements = [
  measure(-28, 73.2, 81.0, 19.0),
  measure(-24, 72.8, 80.6, 18.7),
  measure(-20, 72.4, 80.2, 18.4),
  measure(-16, 72.0, 79.8, 18.0),
  measure(-12, 71.6, 79.4, 17.6),
  measure(-8, 71.2, 79.0, 17.2),
  measure(-4, 70.6, 78.4, 16.0),
  measure(-1, 70.0, 78.0, 15.0),
];

const result = calculate(PROFILE);
const state = {
  version: 1,
  demo: true,
  createdAt: `${at(-28)}T08:00:00.000Z`,
  updatedAt: `${at(0)}T13:20:00.000Z`,
  settings: {
    theme: 'dark',
    goals: {
      kcal: result.targetKcal,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
    },
    lastMeal: 'dinner',
    lastBackupAt: `${at(-2)}T07:10:00.000Z`,
    profile: { ...PROFILE },
    recommendation: {
      profile: { ...PROFILE },
      result: { ...result },
      computedAt: `${at(0)}T08:00:00.000Z`,
    },
    installDismissed: false,
  },
  workouts,
  meals,
  measurements,
  customFoods: [],
  routines: [
    {
      id: 'demo-r1',
      name: '上肢 A',
      items: [
        { name: '杠铃卧推', sets: [{ weight: 55, reps: 5 }, { weight: 60, reps: 5 }, { weight: 65, reps: 5 }] },
        { name: '引体向上', sets: [{ weight: 0, reps: 8 }, { weight: 0, reps: 7 }] },
      ],
      createdAt: `${at(-10)}T10:00:00.000Z`,
    },
  ],
};

function mountBanner(seeded) {
  if (document.querySelector('.demo-banner')) return;
  const bar = document.createElement('div');
  bar.className = 'demo-banner';
  bar.setAttribute('role', 'status');
  bar.innerHTML = seeded
    ? '<span><b>演示模式</b> · 示例数据，刷新会重置</span><button type="button" class="demo-exit">清除并退出</button>'
    : '<span><b>本机已有数据</b> · 未加载示例，避免覆盖你的记录</span><button type="button" class="demo-exit">返回应用</button>';
  bar.querySelector('.demo-exit').addEventListener('click', () => {
    if (seeded) {
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch (err) {
        /* 忽略隐私模式下的存储异常 */
      }
    }
    location.href = './index.html';
  });
  document.body.appendChild(bar);
}

const demo = new URLSearchParams(location.search).get('demo') === '1';
if (demo) {
  let seeded = false;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    const existing = raw ? JSON.parse(raw) : null;
    if (!existing || existing.demo) {
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
      seeded = true;
    }
  } catch (err) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(state));
      seeded = true;
    } catch (writeErr) {
      /* 隐私模式下无法写入，页面仍可打开 */
    }
  }
  document.documentElement.classList.add('demo-mode');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountBanner(seeded), { once: true });
  } else {
    mountBanner(seeded);
  }
}
