/* 开健开吃 · 应用主逻辑 */

// 演示模式必须在 store 之前执行：它会先写入示例数据，再交给 load() 读取
import './demo.js';
import { load, actions, subscribe, normalizeState } from './store.js';
import { todayStr, shiftDate, dateLabel, esc, fmt, clamp, round } from './util.js';
import { MEALS, FOODS, CATS, EXERCISES, DEFAULT_GOALS } from './data.js';
import { icon } from './icons.js';
import { nutritionOn, streak } from './selectors.js';
import {
  initCloud,
  getCloudState,
  signIn,
  signOut,
  pushLocal,
  pullCloud,
  resolveChoice,
} from './cloud.js';
import {
  calculate as calculateRec,
  validateProfile,
  DEFAULT_PROFILE,
  SEXES,
  GOALS as REC_GOALS,
  ACTIVITIES,
  DURATIONS,
} from './recommend.js';
import { render as renderOverview } from './views/overview.js';
import { render as renderFitness } from './views/fitness.js';
import { render as renderNutrition } from './views/nutrition.js';
import { render as renderSettings, cloudCardInner } from './views/settings.js';

const state = load();
const ctx = {
  today: todayStr(),
  view: 'overview',
  dates: { fitness: todayStr(), nutrition: todayStr() },
  historyLimit: 14,
  nutritionRange: 7,
  cloud: null,
};

const VIEWS = {
  overview: renderOverview,
  fitness: renderFitness,
  nutrition: renderNutrition,
  settings: renderSettings,
};

const main = document.getElementById('main');
const dlg = document.getElementById('dlg');
const toaster = document.getElementById('toaster');
const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');

let picker = null;
let currentRec = null;
let deferredPrompt = null;
let lastFocus = null;

/* ============================ 主题 ============================ */

function resolvedTheme(theme) {
  if (theme === 'auto') return mediaDark.matches ? 'dark' : 'light';
  return theme === 'light' ? 'light' : 'dark';
}

function applyTheme() {
  const resolved = resolvedTheme(state.settings.theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  const meta = document.getElementById('meta-theme');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#080d0b' : '#f4f6f1');
}

mediaDark.addEventListener('change', () => {
  if (state.settings.theme === 'auto') applyTheme();
});

/* ============================ 静态图标 ============================ */

function hydrateIcons() {
  document.querySelectorAll('[data-ico]').forEach((el) => {
    el.innerHTML = icon(el.dataset.ico, 18);
  });
}

/* ============================ 提示 ============================ */

function toast(message, options = {}) {
  const { action, onAction, duration = 2800 } = options;
  const el = document.createElement('div');
  el.className = 'toast';
  el.append(document.createTextNode(message));
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 280);
  };
  if (action && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action;
    btn.addEventListener('click', () => {
      onAction();
      dismiss();
    });
    el.append(btn);
  }
  toaster.appendChild(el);
  timer = setTimeout(dismiss, duration);
}

/* ============================ 渲染 ============================ */

function render(options = {}) {
  ctx.today = todayStr();
  ctx.cloud = getCloudState();
  ctx.safety = readSafety();
  main.innerHTML = `<div class="view">${VIEWS[ctx.view](state, ctx)}</div>`;
  document.querySelectorAll('.nav-item, .tab').forEach((el) => {
    const active = el.dataset.view === ctx.view;
    el.classList.toggle('is-active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  updateRailGoal();
  updateGoalCheck();
  animateRings();
  updateNet();
  updateInstallButtons();
  refreshStoragePanel();
  if (options.scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function refreshCloudCard() {
  const body = document.getElementById('cloud-card-body');
  if (!body) return;
  body.innerHTML = cloudCardInner(getCloudState());
}

function updateRailGoal() {
  const el = document.getElementById('rail-goal');
  if (!el) return;
  const goals = state.settings.goals;
  const { totals } = nutritionOn(state, ctx.today);
  const left = goals.kcal - totals.kcal;
  const ratio = clamp(totals.kcal / Math.max(goals.kcal, 1), 0, 1);
  el.innerHTML = `<div class="rail-goal-head">
      <span>今日热量</span>
      <b>${left >= 0 ? `剩 ${fmt(left)}` : `超 ${fmt(-left)}`} kcal</b>
    </div>
    <div class="bar"><i style="width:${(ratio * 100).toFixed(1)}%${left < 0 ? ';background:var(--orange)' : ''}"></i></div>
    <p><b>${fmt(totals.kcal)}</b> / ${fmt(goals.kcal)} kcal · 连续 ${streak(state, ctx.today)} 天</p>`;
}

function updateGoalCheck() {
  const form = document.querySelector('form[data-form="goals"]');
  const el = document.getElementById('goal-check');
  if (!form || !el) return;
  const num = (name) => Number(form.elements[name]?.value);
  const kcal = num('kcal');
  const protein = num('protein');
  const carbs = num('carbs');
  const fat = num('fat');
  if (![kcal, protein, carbs, fat].every((n) => Number.isFinite(n) && n > 0)) {
    el.textContent = '';
    el.className = 'goal-check';
    return;
  }
  const macroKcal = Math.round(protein * 4 + carbs * 4 + fat * 9);
  const diff = macroKcal - kcal;
  const pct = Math.round((macroKcal / kcal) * 100);
  el.className = `goal-check${Math.abs(diff) > 50 ? ' warn' : ''}`;
  el.innerHTML = `按 4/4/9 折算：三大营养素合计 <b>${fmt(macroKcal)}</b> kcal，为目标热量的 <b>${pct}%</b>${
    Math.abs(diff) > 50 ? `（相差 ${diff > 0 ? '+' : ''}${fmt(diff)} kcal）` : ''
  }`;
}

function animateRings() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-ring]').forEach((el) => {
        el.style.strokeDashoffset = el.dataset.ring;
      });
    });
  });
}

/* ============================ 弹层 ============================ */

function openDialog(html, options = {}) {
  lastFocus = document.activeElement;
  dlg.classList.toggle('wide', Boolean(options.wide));
  dlg.innerHTML = html;
  if (!dlg.open) dlg.showModal();
  const target = dlg.querySelector('[data-autofocus]') || dlg.querySelector('input:not([type="hidden"])');
  const canAutofocus = window.matchMedia('(pointer: fine)').matches;
  if (target && canAutofocus) setTimeout(() => target.focus({ preventScroll: true }), 90);
}

function closeDialog() {
  if (dlg.open) dlg.close();
  dlg.innerHTML = '';
  dlg.classList.remove('wide');
  picker = null;
  currentRec = null;
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus({ preventScroll: true });
  }
}

/* ============================ 训练弹层 ============================ */

function setRowHTML(set = {}, index = 0) {
  return `<div class="set-row">
    <span class="set-idx">${index + 1}</span>
    <label class="unit-input">
      <input type="number" name="weight" inputmode="decimal" step="0.5" min="0" max="999" placeholder="0"
        value="${set.weight ?? ''}" aria-label="第 ${index + 1} 组重量">
      <span>kg</span>
    </label>
    <label class="unit-input">
      <input type="number" name="reps" inputmode="numeric" step="1" min="0" max="999" placeholder="0"
        value="${set.reps ?? ''}" aria-label="第 ${index + 1} 组次数">
      <span>次</span>
    </label>
    <button class="icon-btn danger" type="button" data-act="remove-set" aria-label="删除第 ${index + 1} 组">${icon('x', 14)}</button>
  </div>`;
}

const EX_GROUP_STYLE = {
  胸: ['rgba(111, 181, 255, .15)', 'var(--blue)'],
  背: ['rgba(150, 214, 110, .15)', 'var(--lime-text)'],
  腿: ['rgba(255, 196, 90, .15)', 'var(--orange)'],
  肩: ['rgba(255, 138, 181, .14)', 'var(--pink)'],
  手臂: ['rgba(120, 200, 220, .16)', 'var(--blue)'],
  核心: ['rgba(255, 157, 92, .15)', 'var(--orange-text)'],
  有氧: ['rgba(160, 200, 235, .16)', 'var(--blue)'],
  全身: ['rgba(255, 138, 181, .11)', 'var(--pink)'],
};

let exIndex = -1;

function exerciseMenuHTML(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = EXERCISES.filter((e) => !q || `${e.name} ${e.group}`.toLowerCase().includes(q));
  if (!list.length) {
    return `<div class="ex-empty">没有匹配的动作，可直接用这个名称记录</div>`;
  }
  return list
    .map((e, i) => {
      const [bg, color] = EX_GROUP_STYLE[e.group] || ['var(--surface-2)', 'var(--text-2)'];
      return `<button type="button" class="ex-item${i === exIndex ? ' is-active' : ''}" role="option"
          aria-selected="${i === exIndex}" data-act="pick-exercise" data-name="${esc(e.name)}">
          <span class="ex-avatar" style="background:${bg};color:${color}">${esc(e.name.slice(0, 1))}</span>
          <span class="ex-main"><strong>${esc(e.name)}</strong><small>${esc(e.group)}</small></span>
        </button>`;
    })
    .join('');
}

function openExerciseMenu() {
  const menu = dlg.querySelector('#ex-menu');
  const input = dlg.querySelector('#ex-name');
  if (!menu || !input) return;
  menu.innerHTML = exerciseMenuHTML(input.value);
  menu.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeExerciseMenu() {
  const menu = dlg.querySelector('#ex-menu');
  const input = dlg.querySelector('#ex-name');
  if (menu) menu.hidden = true;
  if (input) input.setAttribute('aria-expanded', 'false');
  exIndex = -1;
}

function highlightExercise(step) {
  const items = [...dlg.querySelectorAll('.ex-item')];
  if (!items.length) return;
  exIndex = (exIndex + step + items.length) % items.length;
  items.forEach((el, i) => {
    el.classList.toggle('is-active', i === exIndex);
    el.setAttribute('aria-selected', String(i === exIndex));
  });
  items[exIndex].scrollIntoView({ block: 'nearest' });
}

function chooseExercise(name) {
  const input = dlg.querySelector('#ex-name');
  if (!input) return;
  input.value = name;
  closeExerciseMenu();
  input.focus({ preventScroll: true });
}

function openWorkoutDialog(id, dateOverride) {
  closeDialog();
  const existing = id ? state.workouts.find((w) => w.id === id) : null;
  const date = existing ? existing.date : dateOverride || ctx.dates.fitness;
  const sets = existing && existing.sets.length ? existing.sets : [{ weight: '', reps: '' }];

  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">${dateLabel(date, ctx.today)}</p>
        <h2 id="dlg-title">${existing ? '编辑训练' : '新增训练'}</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="workout-form" class="dlg-body" data-form="workout" novalidate>
      <input type="hidden" name="id" value="${existing ? existing.id : ''}">
      <input type="hidden" name="date" value="${date}">
      <label class="field ex-field">
        <span>动作名称</span>
        <div class="ex-combo">
          <div class="food-search ex-search">
            ${icon('search')}
            <input class="input" id="ex-name" name="name" role="combobox" aria-expanded="false"
              aria-controls="ex-menu" aria-autocomplete="list" maxlength="40" autocomplete="off"
              placeholder="搜索或输入动作，如 深蹲" value="${esc(existing ? existing.name : '')}" data-autofocus>
          </div>
          <div class="ex-menu" id="ex-menu" role="listbox" aria-label="动作库" hidden></div>
        </div>
      </label>
      <div class="field">
        <div class="field-row"><span>组数明细</span><span class="hint">重量留空表示自重</span></div>
        <div class="set-rows" id="set-rows">${sets.map((s, i) => setRowHTML(s, i)).join('')}</div>
        <button class="btn ghost small" type="button" data-act="add-set" style="align-self:flex-start">${icon('plus')}添加一组</button>
      </div>
      <label class="field">
        <span>备注（可选）</span>
        <input class="input" name="note" maxlength="100" placeholder="状态、节奏、感受…" value="${esc(existing ? existing.note : '')}">
      </label>
      <p class="form-note">总容量 = 重量 × 次数，逐组累加。超过该动作历史最大重量时会标记 <b>PR</b>。</p>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn primary" type="submit" form="workout-form">${existing ? '保存修改' : '保存训练'}</button>
    </div>
  `);
}

function renumberSets() {
  dlg.querySelectorAll('#set-rows .set-row').forEach((row, i) => {
    const idx = row.querySelector('.set-idx');
    if (idx) idx.textContent = i + 1;
  });
}

function saveWorkout(form) {
  const data = new FormData(form);
  const id = String(data.get('id') || '');
  const name = String(data.get('name') || '').trim();
  const date = String(data.get('date') || ctx.dates.fitness);
  const note = String(data.get('note') || '').trim();
  const weights = data.getAll('weight');
  const reps = data.getAll('reps');
  const sets = [];

  for (let i = 0; i < weights.length; i += 1) {
    const rawWeight = String(weights[i] ?? '').trim();
    const rawReps = String(reps[i] ?? '').trim();
    if (rawWeight === '' && rawReps === '') continue;
    const weight = rawWeight === '' ? 0 : Number(rawWeight);
    const rep = Number(rawReps);
    if (!Number.isFinite(weight) || !Number.isFinite(rep) || rep <= 0) {
      toast('请检查每组的重量与次数');
      return;
    }
    if (weight > 999 || rep > 999) {
      toast('重量或次数超出范围（≤999）');
      return;
    }
    sets.push({ weight: Math.max(0, round(weight, 1)), reps: Math.round(rep) });
  }

  if (!name) {
    toast('请填写动作名称');
    return;
  }
  if (!sets.length) {
    toast('请至少填写一组有效数据');
    return;
  }

  closeDialog();
  ctx.dates.fitness = date;
  if (id) {
    actions.updateWorkout(id, { name, date, sets, note });
    toast(`已更新 ${name}`);
  } else {
    actions.addWorkout({ name, date, sets, note });
    toast(`已记录 ${name} · ${sets.length} 组`);
  }
}

function repeatLastWorkout() {
  const date = ctx.dates.fitness;
  const dates = [...new Set(state.workouts.map((w) => w.date))].sort();
  const previousDates = dates.filter((d) => d < date);
  const sourceDate = previousDates[previousDates.length - 1];
  if (!sourceDate) {
    toast('这一天之前还没有训练可复制');
    return;
  }
  const source = state.workouts.filter((w) => w.date === sourceDate);
  if (!source.length) return;
  const items = source.map((w) => ({
    date,
    name: w.name,
    sets: w.sets.map((s) => ({ ...s })),
    note: w.note || '',
  }));
  ctx.dates.fitness = date;
  actions.addWorkouts(items);
  toast(`已复制 ${items.length} 个动作到${dateLabel(date, ctx.today)}`);
}

/* ============================ 饮食弹层 ============================ */

function computeFood(food, grams) {
  const factor = (Number(grams) || 0) / 100;
  return {
    kcal: Math.round(food.kcal * factor),
    protein: round(food.p * factor, 1),
    carbs: round(food.c * factor, 1),
    fat: round(food.f * factor, 1),
  };
}

function foodCatChips() {
  const active = picker?.cat || '全部';
  return ['全部', ...Object.keys(CATS)]
    .map(
      (c) =>
        `<button type="button" class="chip${c === active ? ' is-active' : ''}" data-act="food-cat" data-cat="${esc(c)}">${esc(c)}</button>`
    )
    .join('');
}

function allFoods() {
  const custom = state.customFoods.map((f) => ({ ...f, cat: '我的', custom: true }));
  return [...FOODS, ...custom];
}

function foodMatches(f, q) {
  if (!q) return true;
  const hay = `${f.name} ${f.alias || ''} ${f.cat}`.toLowerCase();
  if (hay.includes(q)) return true;
  // 「汉堡」与「XX堡」互通，避免搜汉堡漏掉鸡腿堡类
  if (q.includes('汉堡')) return hay.includes(q.replace(/汉堡/g, '堡'));
  return false;
}

function foodListHTML(filter = '') {
  const q = filter.trim().toLowerCase();
  const cat = picker?.cat || '全部';
  const list = allFoods().filter((f) => (cat === '全部' || f.cat === cat) && foodMatches(f, q));
  if (!list.length) {
    return `<div class="food-empty">没有找到「${esc(filter)}」，换个关键词，或切换到手动输入</div>`;
  }
  return list
    .map(
      (f) => `<button type="button" class="food-item${f.id === picker.foodId ? ' is-active' : ''}" data-act="pick-food" data-id="${f.id}">
        <span class="food-avatar" style="background:${CATS[f.cat].tint};color:${CATS[f.cat].color}">${esc(f.name.slice(0, 1))}</span>
        <span class="food-main">
          <strong>${esc(f.name)}</strong>
          <small>每 100g · 蛋白 ${fmt(f.p, 1)} · 碳水 ${fmt(f.c, 1)} · 脂肪 ${fmt(f.f, 1)}</small>
        </span>
        <span class="food-kcal">${fmt(f.kcal)} kcal</span>
        ${
          f.custom
            ? `<span class="food-del" role="button" tabindex="0" data-act="delete-custom-food" data-id="${f.id}" aria-label="删除自定义食物 ${esc(f.name)}">${icon('x', 12)}</span>`
            : ''
        }
      </button>`
    )
    .join('');
}

function previewHTML() {
  if (!picker || picker.mode !== 'library') return '';
  const food = allFoods().find((f) => f.id === picker.foodId);
  if (!food) return '<span class="muted">没有匹配的食物，可换个关键词或手动输入</span>';
  const m = computeFood(food, picker.amount);
  return `<span class="pk">≈ ${fmt(m.kcal)} kcal</span>
    <span>蛋白 <b>${fmt(m.protein, 1)}</b> g</span>
    <span>碳水 <b>${fmt(m.carbs, 1)}</b> g</span>
    <span>脂肪 <b>${fmt(m.fat, 1)}</b> g</span>`;
}

function recentMealsHTML() {
  const seen = new Set();
  const list = [...state.meals]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .filter((m) => {
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
  if (!list.length) return '';
  return `<div class="recent-row">
      <span class="recent-label">最近吃过</span>
      ${list
        .map(
          (m) => `<button type="button" class="chip" data-act="quick-meal" data-id="${m.id}" title="再记一份 ${esc(m.name)}">${esc(m.name)}</button>`
        )
        .join('')}
    </div>`;
}

function copyYesterdayMeals() {
  const date = ctx.dates.nutrition;
  const yesterday = shiftDate(date, -1);
  const list = state.meals.filter((m) => m.date === yesterday);
  if (!list.length) {
    toast('昨天没有饮食记录');
    return;
  }
  const added = list
    .map((m) =>
      actions.addMeal({
        date,
        meal: m.meal,
        name: m.name,
        foodId: m.foodId,
        amount: m.amount,
        portion: m.portion,
        kcal: m.kcal,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
      })
    )
    .filter(Boolean);
  toast(`已复制昨天 ${added.length} 条饮食`, {
    action: '撤销',
    duration: 10000,
    onAction: () => {
      added.forEach((item) => actions.removeMeal(item.id));
      toast('已撤销复制');
    },
  });
}

function openMealDialog(mealId, dateOverride, editId) {
  closeDialog();
  const existing = editId ? state.meals.find((m) => m.id === editId) : null;
  const date = existing ? existing.date : dateOverride || ctx.dates.nutrition;
  const type = existing
    ? existing.meal
    : MEALS.some((m) => m.id === mealId)
      ? mealId
      : state.settings.lastMeal || 'breakfast';

  const matchedFood = existing
    ? allFoods().find((f) => f.id === existing.foodId) ||
      (Number(existing.amount) > 0 ? allFoods().find((f) => f.name === existing.name) : null)
    : null;
  const mode = existing ? (matchedFood ? 'library' : 'manual') : 'library';
  const food = matchedFood || FOODS[0];
  const amount = existing && matchedFood ? Number(existing.amount) : food.amount || 100;
  picker = { mode, foodId: food.id, amount, cat: '全部' };

  const isEdit = Boolean(existing);
  const manual = existing || {};
  const inputValue = (value, digits = 1) => {
    if (!isEdit) return '';
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    return digits === 0 ? String(Math.round(num)) : String(num);
  };

  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">${dateLabel(date, ctx.today)}</p>
        <h2 id="dlg-title">${isEdit ? '编辑饮食' : '记录饮食'}</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="meal-form" class="dlg-body" data-form="meal" novalidate>
      <input type="hidden" name="editId" value="${isEdit ? existing.id : ''}">
      <input type="hidden" name="date" value="${date}">
      <div class="field">
        <span>餐次</span>
        <div class="seg lime" role="radiogroup" aria-label="餐次">
          ${MEALS.map((m) => `<label><input type="radio" name="meal" value="${m.id}" ${m.id === type ? 'checked' : ''}><span>${m.label}</span></label>`).join('')}
        </div>
      </div>

      <div class="field">
        <span>添加方式</span>
        <div class="seg" role="radiogroup" aria-label="添加方式">
          <label><input type="radio" name="mode" value="library" data-meal-mode ${mode === 'library' ? 'checked' : ''}><span>食物库</span></label>
          <label><input type="radio" name="mode" value="manual" data-meal-mode ${mode === 'manual' ? 'checked' : ''}><span>手动输入</span></label>
        </div>
      </div>

      <div class="food-toolbar${mode === 'library' ? '' : ' hidden'}" data-panel="library">
        ${recentMealsHTML()}
        <div class="food-search">
          ${icon('search')}
          <input type="search" id="food-search" placeholder="搜索食物或别名，如 鸡胸肉、西红柿" autocomplete="off" ${mode === 'library' ? 'data-autofocus' : ''}>
        </div>
        <div class="chips food-cats" data-food-cats>${foodCatChips()}</div>
        <div class="food-list" id="food-list" role="listbox" aria-label="食物库">${foodListHTML()}</div>
        <div class="amount-block">
          <label class="field">
            <span>份量</span>
            <div class="unit-input">
              <input type="number" id="food-amount" name="amount" min="1" max="2000" step="1" value="${picker.amount}" inputmode="numeric">
              <span>g</span>
            </div>
          </label>
          <div class="chips">
            ${[50, 100, 150, 200]
              .map(
                (v) => `<button type="button" class="chip${Number(picker.amount) === v ? ' is-active' : ''}" data-act="amount-chip" data-value="${v}">${v}g</button>`
              )
              .join('')}
          </div>
        </div>
        <div class="preview" id="meal-preview">${previewHTML()}</div>
      </div>

      <div class="manual-grid${mode === 'manual' ? '' : ' hidden'}" data-panel="manual">
        <label class="field span-2">
          <span>食物名称</span>
          <input class="input" name="manual-name" maxlength="30" placeholder="例如：公司食堂的牛肉饭"
            value="${esc(manual.name || '')}" ${mode === 'manual' ? 'data-autofocus' : ''}>
        </label>
        <label class="field">
          <span>热量</span>
          <div class="unit-input"><input type="number" name="manual-kcal" min="0" max="5000" step="10" placeholder="0" inputmode="numeric" value="${inputValue(manual.kcal, 0)}"><span>kcal</span></div>
        </label>
        <label class="field">
          <span>份量说明</span>
          <input class="input" name="manual-portion" maxlength="20" placeholder="1 份 / 1 碗" value="${esc(manual.portion || '')}">
        </label>
        <label class="field">
          <span>蛋白质</span>
          <div class="unit-input"><input type="number" name="manual-protein" min="0" max="500" step="1" placeholder="0" inputmode="decimal" value="${inputValue(manual.protein)}"><span>g</span></div>
        </label>
        <label class="field">
          <span>碳水</span>
          <div class="unit-input"><input type="number" name="manual-carbs" min="0" max="800" step="1" placeholder="0" inputmode="decimal" value="${inputValue(manual.carbs)}"><span>g</span></div>
        </label>
        <label class="field">
          <span>脂肪</span>
          <div class="unit-input"><input type="number" name="manual-fat" min="0" max="300" step="1" placeholder="0" inputmode="decimal" value="${inputValue(manual.fat)}"><span>g</span></div>
        </label>
        <label class="check-row span-2">
          <input type="checkbox" name="save-food" value="1">
          <span>保存到「我的食物」，下次直接选</span>
        </label>
      </div>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn primary" type="submit" form="meal-form">${isEdit ? '保存修改' : '保存记录'}</button>
    </div>
  `);
}

function syncFoodSelection() {
  dlg.querySelectorAll('.food-item').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.id === picker.foodId);
  });
  const amountInput = dlg.querySelector('#food-amount');
  if (amountInput) amountInput.value = picker.amount;
  dlg.querySelectorAll('[data-act="amount-chip"]').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.value) === Number(picker.amount));
  });
  const preview = dlg.querySelector('#meal-preview');
  if (preview) preview.innerHTML = previewHTML();
}

/* 搜索结果或分类变化后，保证“当前选中项”仍然可见：
   如果不在结果里，就自动选中第一条；没有结果则清空选择，避免保存到上一次的食物。 */
function ensurePickerVisible() {
  if (!picker || picker.mode !== 'library' || !dlg) return;
  const items = [...dlg.querySelectorAll('#food-list .food-item')];
  if (!items.length) {
    picker.foodId = '';
    syncFoodSelection();
    return;
  }
  if (items.some((el) => el.dataset.id === picker.foodId)) return;
  const first = allFoods().find((f) => f.id === items[0].dataset.id);
  if (!first) return;
  picker.foodId = first.id;
  picker.amount = first.amount || 100;
  syncFoodSelection();
}

function switchMealMode(mode) {
  if (!picker) return;
  picker.mode = mode === 'manual' ? 'manual' : 'library';
  dlg.querySelector('[data-panel="library"]').classList.toggle('hidden', picker.mode !== 'library');
  dlg.querySelector('[data-panel="manual"]').classList.toggle('hidden', picker.mode !== 'manual');
}

function saveMeal(form) {
  const data = new FormData(form);
  const editId = String(data.get('editId') || '');
  const date = String(data.get('date') || ctx.dates.nutrition);
  const meal = String(data.get('meal') || 'breakfast');
  let payload = null;

  if (picker && picker.mode === 'library') {
    const food = allFoods().find((f) => f.id === picker.foodId);
    const amount = Number(data.get('amount'));
    if (!food) {
      toast('请先选择一个食物');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 2000) {
      toast('份量需在 1–2000 g 之间');
      return;
    }
    payload = { date, meal, name: food.name, foodId: food.id, amount, portion: '', ...computeFood(food, amount) };
  } else {
    const name = String(data.get('manual-name') || '').trim();
    const kcal = Number(data.get('manual-kcal') || 0);
    if (!name) {
      toast('请填写食物名称');
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 5000) {
      toast('热量需在 0–5000 kcal 之间');
      return;
    }
    payload = {
      date,
      meal,
      name,
      foodId: '',
      amount: 0,
      portion: String(data.get('manual-portion') || '').trim(),
      kcal: Math.round(kcal),
      protein: Math.max(0, Number(data.get('manual-protein')) || 0),
      carbs: Math.max(0, Number(data.get('manual-carbs')) || 0),
      fat: Math.max(0, Number(data.get('manual-fat')) || 0),
    };
  }

  if (!editId && data.get('save-food') && picker?.mode !== 'library') {
    const duplicated = FOODS.some((f) => f.name.trim() === payload.name.trim());
    if (duplicated) {
      toast('食物库已有同名食物，未加入「我的」');
    } else {
      actions.addCustomFood({
        name: payload.name,
        kcal: payload.kcal,
        p: payload.protein,
        c: payload.carbs,
        f: payload.fat,
        amount: 100,
      });
    }
  }

  closeDialog();
  ctx.dates.nutrition = date;
  actions.setLastMeal(meal);
  if (editId) {
    actions.updateMeal(editId, payload);
    toast(`已更新 ${payload.name}`);
  } else {
    actions.addMeal(payload);
    toast(`已记录 ${payload.name} · ${fmt(payload.kcal)} kcal`);
  }
}

/* ============================ 营养目标推荐 ============================ */

function recSeg(name, options, value, label, className) {
  return `<div class="seg lime${className ? ` ${className}` : ''}" role="radiogroup" aria-label="${label || name}">
    ${options
      .map(
        (o) => `<label><input type="radio" name="${name}" value="${o.id}" ${
          String(o.id) === String(value) ? 'checked' : ''
        }><span>${o.label}</span></label>`
      )
      .join('')}
  </div>`;
}

function recDialogHTML(profile) {
  const durations = DURATIONS.map((d) => ({ id: d, label: `${d} 分` }));
  return `
    <div class="dlg-head">
      <div>
        <p class="eyebrow">根据身体数据与训练频率</p>
        <h2 id="dlg-title">营养目标推荐</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="rec-form" class="dlg-body" data-form="recommend" novalidate>
      <div class="rec-section">
        <div class="rec-section-head"><span>身体数据</span><span class="tiny">用于计算基础代谢</span></div>
        <div class="field"><span>性别</span>${recSeg('sex', SEXES, profile.sex, '性别', 'seg-narrow')}</div>
        <div class="form-grid three">
          <label class="field">
            <span>年龄</span>
            <div class="unit-input"><input type="number" name="age" min="14" max="90" step="1" inputmode="numeric" placeholder="28" value="${profile.age ?? ''}" data-autofocus><span>岁</span></div>
          </label>
          <label class="field">
            <span>身高</span>
            <div class="unit-input"><input type="number" name="height" min="120" max="220" step="1" inputmode="numeric" placeholder="175" value="${profile.height ?? ''}"><span>cm</span></div>
          </label>
          <label class="field">
            <span>体重</span>
            <div class="unit-input"><input type="number" name="weight" min="30" max="250" step="0.5" inputmode="decimal" placeholder="70" value="${profile.weight ?? ''}"><span>kg</span></div>
          </label>
        </div>
      </div>

      <div class="rec-section">
        <div class="rec-section-head"><span>训练与目标</span><span class="tiny">训练消耗单独计入</span></div>
        <div class="rec-two">
          <label class="field">
            <span>每周训练次数</span>
            <div class="unit-input"><input type="number" name="sessions" min="0" max="7" step="1" inputmode="numeric" value="${profile.sessions}"><span>次/周</span></div>
          </label>
          <div class="field"><span>每次训练时长</span>${recSeg('duration', durations, profile.duration, '每次训练时长')}</div>
        </div>
        <div class="field"><span>健身目标</span>${recSeg('goal', REC_GOALS, profile.goal, '健身目标')}</div>
        <div class="field"><span>日常活动强度（不含训练）</span>${recSeg('activity', ACTIVITIES, profile.activity, '日常活动强度')}</div>
      </div>

      <div id="rec-result"></div>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn primary" type="button" data-act="apply-rec" disabled>应用到每日目标</button>
    </div>
  `;
}

function readRecProfile() {
  const form = dlg.querySelector('#rec-form');
  const data = new FormData(form);
  return {
    sex: String(data.get('sex') || 'male'),
    age: Number(data.get('age')),
    height: Number(data.get('height')),
    weight: Number(data.get('weight')),
    goal: String(data.get('goal') || 'maintain'),
    sessions: Number(data.get('sessions')),
    duration: Number(data.get('duration')),
    activity: String(data.get('activity') || 'light'),
  };
}

function recMacroRow(label, grams, perKg, pct, color) {
  return `<div class="rec-macro">
    <span class="rm-name"><i style="background:${color}"></i>${label}</span>
    <span class="rm-sub">${perKg} g/kg · ${pct}% 热量</span>
    <b>${grams} g</b>
  </div>`;
}

function recResultHTML(rec) {
  const goals = state.settings.goals;
  const delta = rec.targetKcal - Number(goals.kcal);
  const deltaText =
    delta === 0 ? '与当前目标一致' : delta > 0 ? `较当前目标 +${fmt(delta)} kcal` : `较当前目标 ${fmt(delta)} kcal`;
  const goalText =
    rec.goal.id !== rec.requestedGoal.id
      ? `已从「${rec.requestedGoal.label}」调整为「${rec.goal.label}」`
      : `${rec.goal.label} · ${rec.goal.hint}`;

  return `<div class="rec-result">
    <div class="rec-hero">
      <div>
        <p class="eyebrow">每日目标热量</p>
        <div class="rec-kcal">${fmt(rec.targetKcal)}<span>kcal</span></div>
        <p class="tiny">${goalText} · ${deltaText}</p>
      </div>
      <div class="rec-mini">
        <span>基础代谢 <b>${fmt(rec.bmr)}</b> kcal</span>
        <span>训练消耗 <b>${fmt(rec.trainingDaily)}</b> kcal/天</span>
        <span>BMI <b>${rec.bmi}</b> · ${rec.bmiLabel}</span>
      </div>
    </div>

    <div class="rec-macros">
      ${recMacroRow('蛋白质', rec.protein, rec.proteinPerKg, rec.proteinPct, 'var(--blue)')}
      ${recMacroRow('碳水', rec.carbs, rec.carbsPerKg, rec.carbsPct, 'var(--orange)')}
      ${recMacroRow('脂肪', rec.fat, rec.fatPerKg, rec.fatPct, 'var(--pink)')}
    </div>

    ${rec.notes.length ? `<div class="rec-notes">${rec.notes.map((n) => `<p class="rec-note ${n.type}">${esc(n.text)}</p>`).join('')}</div>` : ''}

    <details class="rec-method">
      <summary>查看计算依据</summary>
      <div class="rec-method-body">
        <p><b>基础代谢（Mifflin-St Jeor）</b>：男 10W + 6.25H − 5A + 5；女 10W + 6.25H − 5A − 161（W 体重 kg，H 身高 cm，A 年龄）。本次 ${fmt(rec.bmr)} kcal。</p>
        <p><b>日常消耗</b>：基础代谢 × 活动系数（久坐 1.2 / 轻度 1.3 / 中度 1.4 / 高强度 1.5），本次 ${fmt(rec.neat)} kcal。</p>
        <p><b>训练消耗</b>：MET 6.0 × 3.5 × 体重 ÷ 200 × 时长 × 每周次数 ÷ 7，本次约 ${fmt(rec.trainingDaily)} kcal/天（单次约 ${fmt(rec.perSession)} kcal）。</p>
        <p><b>目标热量</b>：总消耗 × ${rec.goal.factor}（${rec.goal.label}），并不低于基础代谢（男 1500 / 女 1200 kcal 兜底）。</p>
        <p><b>蛋白质</b>：体重 × ${rec.goal.protein} g/kg（按目标）；<b>脂肪</b>：体重 × 0.9 g/kg，限制在总热量 20%–35%；<b>碳水</b>：剩余热量 ÷ 4，不低于 1.2 g/kg。</p>
        <p>结果为估算值，不构成医疗或营养建议。孕期、哺乳期、慢性病人群请咨询专业人士。</p>
      </div>
    </details>
  </div>`;
}

function updateRecResult() {
  const form = dlg.querySelector('#rec-form');
  if (!form) return;
  const resultBox = dlg.querySelector('#rec-result');
  const applyBtn = dlg.querySelector('[data-act="apply-rec"]');
  if (!resultBox) return;

  const profile = readRecProfile();
  const errors = validateProfile(profile);
  const empty = !profile.age || !profile.height || !profile.weight;

  ['age', 'height', 'weight'].forEach((key) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (!input) return;
    const hasValue = String(input.value).trim() !== '';
    const focused = document.activeElement === input;
    input.classList.toggle('is-invalid', Boolean(errors[key]) && hasValue && !focused);
  });

  if (empty) {
    resultBox.innerHTML = `<div class="rec-empty">${icon('sparkle')}<span>填写年龄、身高、体重后，这里会实时生成推荐目标</span></div>`;
    if (applyBtn) applyBtn.disabled = true;
    currentRec = null;
    return;
  }

  if (Object.keys(errors).length) {
    resultBox.innerHTML = `<div class="rec-empty">${icon('sparkle')}<span>${esc(Object.values(errors)[0])}</span></div>`;
    if (applyBtn) applyBtn.disabled = true;
    currentRec = null;
    return;
  }

  const rec = calculateRec(profile);
  if (!rec.valid) {
    if (applyBtn) applyBtn.disabled = true;
    currentRec = null;
    return;
  }
  currentRec = { profile, rec };
  resultBox.innerHTML = recResultHTML(rec);
  if (applyBtn) applyBtn.disabled = false;
}

function openTemplateDialog() {
  closeDialog();
  const list = state.workouts.filter((w) => w.date === ctx.dates.fitness);
  const routines = state.routines;
  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">一键开练</p>
        <h2 id="dlg-title">训练模板</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <div class="dlg-body">
      ${
        routines.length
          ? `<div class="tpl-list">${routines
              .map((r) => {
                const sets = r.items.reduce((acc, it) => acc + it.sets.length, 0);
                return `<div class="tpl-row">
                  <div class="tpl-main">
                    <strong>${esc(r.name)}</strong>
                    <span>${r.items.length} 个动作 · ${sets} 组</span>
                  </div>
                  <button class="btn small" type="button" data-act="apply-routine" data-id="${r.id}">填入当天</button>
                  <button class="icon-btn danger" type="button" data-act="delete-routine" data-id="${r.id}" aria-label="删除模板 ${esc(r.name)}">${icon('x', 14)}</button>
                </div>`;
              })
              .join('')}</div>`
          : `<div class="rec-empty">${icon('copy')}<span>还没有模板。把某天的训练存为模板，之后一键填入，不用每次重新加动作。</span></div>`
      }
    </div>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">关闭</button>
      <button class="btn primary" type="button" data-act="save-routine" ${list.length ? '' : 'disabled'}>把 ${dateLabel(ctx.dates.fitness, ctx.today)} 的训练存为模板</button>
    </div>
  `);
}

function openSaveTemplateDialog() {
  const date = ctx.dates.fitness;
  const list = state.workouts.filter((w) => w.date === date);
  if (!list.length) {
    toast('这一天还没有训练可以保存');
    return;
  }
  const sets = list.reduce((acc, w) => acc + w.sets.length, 0);
  closeDialog();
  const canAutofocus = window.matchMedia('(pointer: fine)').matches;
  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">${dateLabel(date, ctx.today)}</p>
        <h2 id="dlg-title">存为训练模板</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="routine-form" class="dlg-body" data-form="routine" novalidate>
      <label class="field">
        <span>模板名称</span>
        <input class="input" name="name" maxlength="30" placeholder="例如：推日 / 腿日 / 周末全身" ${canAutofocus ? 'data-autofocus' : ''}>
      </label>
      <p class="form-note">将保存 ${list.length} 个动作、${sets} 组，含当前重量与次数；之后可一键填入任意日期。</p>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn primary" type="submit" form="routine-form">保存模板</button>
    </div>
  `);
}

function saveRoutine(form) {
  const name = String(new FormData(form).get('name') || '').trim();
  if (!name) {
    toast('请填写模板名称');
    return;
  }
  const list = state.workouts.filter((w) => w.date === ctx.dates.fitness);
  const created = actions.addRoutine({
    name,
    items: list.map((w) => ({ name: w.name, sets: w.sets.map((s) => ({ ...s })) })),
  });
  closeDialog();
  if (created) toast(`已保存模板「${created.name}」`);
}

function applyRoutine(id) {
  const routine = state.routines.find((r) => r.id === id);
  if (!routine) return;
  const date = ctx.dates.fitness;
  const items = routine.items.map((it) => ({
    date,
    name: it.name,
    sets: it.sets.map((s) => ({ ...s })),
    note: '',
  }));
  const added = actions.addWorkouts(items);
  closeDialog();
  toast(`已填入 ${added.length} 个动作到${dateLabel(date, ctx.today)}`);
}

function openMeasureDialog() {
  closeDialog();
  const today = ctx.today;
  const existing = state.measurements.find((m) => m.date === today);
  const latest = state.measurements[state.measurements.length - 1];
  const base = existing || {};
  const canAutofocus = window.matchMedia('(pointer: fine)').matches;
  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">${dateLabel(today, ctx.today)}</p>
        <h2 id="dlg-title">记录身体数据</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="measure-form" class="dlg-body" data-form="measure" novalidate>
      <div class="form-grid">
        <label class="field">
          <span>日期</span>
          <input class="input" type="date" name="date" value="${base.date || today}" max="${today}">
        </label>
        <label class="field">
          <span>体重</span>
          <div class="unit-input">
            <input type="number" name="weight" step="0.1" min="20" max="300" inputmode="decimal"
              placeholder="${latest ? latest.weight : '65'}" value="${base.weight ?? ''}" ${canAutofocus ? 'data-autofocus' : ''}>
            <span>kg</span>
          </div>
        </label>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>腰围（可选）</span>
          <div class="unit-input">
            <input type="number" name="waist" step="0.5" min="30" max="200" inputmode="decimal"
              placeholder="80" value="${base.waist ?? ''}">
            <span>cm</span>
          </div>
        </label>
        <label class="field">
          <span>体脂率（可选）</span>
          <div class="unit-input">
            <input type="number" name="bodyFat" step="0.1" min="3" max="60" inputmode="decimal"
              placeholder="18" value="${base.bodyFat ?? ''}">
            <span>%</span>
          </div>
        </label>
      </div>
      <label class="field">
        <span>备注（可选）</span>
        <input class="input" name="note" maxlength="100" placeholder="空腹 / 训练后 / 状态…" value="${esc(base.note || '')}">
      </label>
      <p class="form-note">同一天再次记录会覆盖当天数据。建议固定在早晨空腹、排空后称重。</p>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn primary" type="submit" form="measure-form">保存</button>
    </div>
  `);
}

function saveMeasurement(form) {
  const data = new FormData(form);
  const date = String(data.get('date') || ctx.today);
  const weight = Number(data.get('weight'));
  if (!Number.isFinite(weight) || weight < 20 || weight > 300) {
    toast('请填写 20–300 kg 之间的体重');
    return;
  }
  const created = actions.addMeasurement({
    date,
    weight,
    waist: data.get('waist'),
    bodyFat: data.get('bodyFat'),
    note: String(data.get('note') || '').trim(),
  });
  if (!created) {
    toast('记录失败，请检查数值');
    return;
  }
  closeDialog();
  toast(`已记录 ${fmt(created.weight, 1)} kg`);
}

function openRecommendDialog() {
  closeDialog();
  const saved = state.settings.profile;
  const profile = { ...DEFAULT_PROFILE, ...(saved || {}) };
  const latestWeight = state.measurements.length ? state.measurements[state.measurements.length - 1].weight : null;
  if (!saved?.weight && latestWeight) profile.weight = latestWeight;
  const hasSaved = Boolean(saved && saved.weight);
  openDialog(recDialogHTML(profile), { wide: true });
  updateRecResult();
  if (!hasSaved) {
    const age = dlg.querySelector('input[name="age"]');
    if (age && window.matchMedia('(pointer: fine)').matches) {
      setTimeout(() => age.focus({ preventScroll: true }), 120);
    }
  }
}

function applyRecommendation() {
  if (!currentRec) {
    toast('请先补全年龄、身高和体重');
    return;
  }
  const snapshot = currentRec;
  closeDialog();
  actions.applyRecommendation(snapshot.profile, snapshot.rec);
  toast(`已应用推荐目标：${fmt(snapshot.rec.targetKcal)} kcal · 蛋白 ${snapshot.rec.protein}g`);
}

function applyLastRecommendation() {
  const saved = state.settings.recommendation;
  if (!saved) return;
  actions.setGoals({
    kcal: saved.result.targetKcal,
    protein: saved.result.protein,
    carbs: saved.result.carbs,
    fat: saved.result.fat,
  });
  toast('已恢复为推荐目标');
}

function openClearDialog() {
  closeDialog();
  const cloudUser = getCloudState().user;
  const total = state.workouts.length + state.meals.length + state.measurements.length;
  if (!total) {
    toast('当前没有可清空的数据');
    return;
  }
  const canAutofocus = window.matchMedia('(pointer: fine)').matches;
  openDialog(`
    <div class="dlg-head">
      <div>
        <p class="eyebrow">不可恢复</p>
        <h2 id="dlg-title">清空全部数据</h2>
      </div>
      <button class="icon-btn" type="button" data-act="close-dialog" aria-label="关闭">${icon('x')}</button>
    </div>
    <form id="clear-form" class="dlg-body" data-form="clear" novalidate>
      <p class="form-note">将删除 <b>${state.workouts.length}</b> 条训练、<b>${state.meals.length}</b> 条饮食、<b>${state.measurements.length}</b> 条身体数据，以及自定义食物与训练模板。</p>
      ${
        cloudUser
          ? '<p class="rec-note">你已登录云端同步：清空后会同步覆盖云端记录，其他设备下次同步也会被清空。</p>'
          : ''
      }
      <p class="form-note">执行前会自动留一份备份，可在「设置 → 数据管理」恢复；清空后 10 秒内也能撤销。</p>
      <label class="field">
        <span>输入「清空」确认</span>
        <input class="input" name="confirm" placeholder="清空" autocomplete="off" maxlength="8" ${canAutofocus ? 'data-autofocus' : ''}>
      </label>
    </form>
    <div class="dlg-actions">
      <button class="btn ghost" type="button" data-act="close-dialog">取消</button>
      <button class="btn danger" type="submit" form="clear-form" id="clear-submit" disabled>确认清空</button>
    </div>
  `);
}

function doClear(form) {
  const value = String(new FormData(form).get('confirm') || '').trim();
  if (value !== '清空') {
    toast('请输入「清空」两个字确认');
    return;
  }
  const snapshot = actions.exportJSON();
  saveSafety('清空全部数据');
  actions.clearAll();
  closeDialog();
  toast('已清空全部数据', {
    action: '撤销',
    duration: 10000,
    onAction: () => {
      actions.replaceAll(JSON.parse(snapshot));
      toast('已恢复清空前的数据');
    },
  });
}

/* ============================ 操作前安全备份 ============================ */

const SAFETY_KEY = 'kjkc.safety.v1';

function saveSafety(reason) {
  try {
    localStorage.setItem(
      SAFETY_KEY,
      JSON.stringify({ at: Date.now(), reason, json: actions.exportJSON() })
    );
  } catch (err) {
    console.warn('[开健开吃] 操作前备份写入失败：' + (err?.message || 'unknown'));
  }
}

function readSafety() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAFETY_KEY) || 'null');
    if (!raw || typeof raw.json !== 'string' || !Number.isFinite(Number(raw.at))) return null;
    return { at: Number(raw.at), reason: String(raw.reason || '操作前备份'), json: raw.json };
  } catch {
    return null;
  }
}

function restoreSafety() {
  const safety = readSafety();
  if (!safety) {
    toast('没有可恢复的操作前备份');
    return;
  }
  actions.replaceAll(JSON.parse(safety.json));
  toast('已恢复到操作前的数据');
}

/* ============================ 数据导入导出 ============================ */

function exportData() {
  const blob = new Blob([actions.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `开健开吃-备份-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  actions.markBackup();
  toast('备份文件已导出');
}

async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    toast('导入失败：文件不是有效的 JSON');
    return;
  }
  if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.meals)) {
    toast('导入失败：不是「开健开吃」的备份文件');
    return;
  }

  const normalized = normalizeState(data);
  const sourceCount = data.workouts.length + data.meals.length;
  const validCount = normalized.workouts.length + normalized.meals.length;
  if (sourceCount > 0 && validCount === 0) {
    toast('导入失败：记录格式无法识别');
    return;
  }

  const cloudUser = getCloudState().user;
  const ok = window.confirm(
    `将导入 ${normalized.workouts.length} 条训练、${normalized.meals.length} 条饮食，覆盖当前 ${state.workouts.length} 条训练、${state.meals.length} 条饮食。\n\n` +
      (cloudUser ? '你已登录云端同步，导入结果会同步覆盖云端记录。\n\n' : '') +
      '执行前会自动留一份备份，导入后 10 秒内也可撤销。'
  );
  if (!ok) return;

  const snapshot = actions.exportJSON();
  saveSafety('导入备份前');
  const imported = actions.replaceAll(data);
  toast(`已导入 ${imported.workouts.length} 条训练、${imported.meals.length} 条饮食`, {
    action: '撤销',
    duration: 10000,
    onAction: () => {
      actions.replaceAll(JSON.parse(snapshot));
      toast('已恢复导入前的数据');
    },
  });
}

/* ============================ 安装 / 离线 ============================ */

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallButtons() {
  const hide = isStandalone();
  ['install-btn', 'install-settings'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = hide;
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function refreshStoragePanel() {
  const box = document.getElementById('storage-box');
  if (!box) return;
  const persistEl = box.querySelector('[data-sb="persist"]');
  const usageEl = box.querySelector('[data-sb="usage"]');
  const backupEl = box.querySelector('[data-sb="backup"]');
  const persistBtn = box.querySelector('[data-act="persist-storage"]');

  const last = state.settings.lastBackupAt;
  if (last) {
    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    backupEl.textContent = days <= 0 ? '今天已备份' : days === 1 ? '昨天备份' : `${days} 天前备份`;
    backupEl.classList.toggle('warn', days >= 30);
  } else {
    backupEl.textContent = '从未备份';
    backupEl.classList.add('warn');
  }

  const raw = localStorage.getItem('kjkc.state.v1') || '';
  usageEl.textContent = formatBytes(new Blob([raw]).size);

  if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
    persistEl.textContent = '当前环境不支持检测';
    persistEl.classList.remove('warn');
    if (persistBtn) persistBtn.hidden = true;
    return;
  }
  try {
    const persisted = await navigator.storage.persisted();
    persistEl.textContent = persisted ? '已开启 · 浏览器不会自动清理' : '未开启 · 空间不足时可能被清理';
    persistEl.classList.toggle('warn', !persisted);
    if (persistBtn) persistBtn.hidden = persisted;
  } catch (err) {
    console.warn('[开健开吃] 存储状态读取失败', err);
    persistEl.textContent = '状态未知';
  }
}

async function requestPersist() {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
    toast('当前浏览器不支持存储保护，请定期导出备份');
    return;
  }
  try {
    const granted = await navigator.storage.persist();
    toast(granted ? '已开启存储保护' : '浏览器暂未授予，安装到桌面后再试更有效');
    refreshStoragePanel();
  } catch (err) {
    console.warn(err);
    toast('开启失败，请改用导出备份');
  }
}

async function promptInstall() {
  if (!deferredPrompt) {
    toast('可在浏览器菜单选择「安装」或「添加到主屏幕」');
    return;
  }
  deferredPrompt.prompt();
  try {
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') toast('已安装到桌面');
  } catch (err) {
    console.warn(err);
  }
  deferredPrompt = null;
  updateInstallButtons();
}

function updateNet() {
  const offline = !navigator.onLine;
  document.querySelectorAll('[data-net]').forEach((el) => {
    el.dataset.offline = String(offline);
    const label = el.querySelector('span');
    if (label) label.textContent = offline ? '离线可用' : '在线';
  });
}

let updateNotified = false;

function notifyUpdate() {
  if (updateNotified) return;
  updateNotified = true;
  toast('有新版本可用', {
    action: '刷新',
    duration: 15000,
    onAction: () => window.location.reload(),
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 首次安装不刷新；只有从旧版本切换过来时才处理
    if (!hadController || reloading) return;
    const dialogOpen = Boolean(document.querySelector('dialog[open]'));
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
    if (dialogOpen || typing) {
      notifyUpdate();
      return;
    }
    reloading = true;
    window.location.reload();
  });
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    if (reg.waiting) notifyUpdate();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) notifyUpdate();
      });
    });
    let lastCheck = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheck < 30 * 60 * 1000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    });
  } catch (err) {
    console.warn('[开健开吃] Service Worker 注册失败', err);
  }
}

async function refreshCache() {
  if (!('serviceWorker' in navigator)) {
    toast('当前环境不支持离线缓存');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      toast('离线缓存尚未就绪，请稍后再试');
      return;
    }
    await reg.update();
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (reg.waiting || reg.installing) {
      updateNotified = false;
      notifyUpdate();
    } else {
      toast('已是最新版本');
    }
  } catch (err) {
    console.warn(err);
    toast('检查更新失败');
  }
}

/* ============================ 事件 ============================ */

document.addEventListener('keydown', (event) => {
  const el = event.target;
  if (!el || el.id !== 'ex-name') return;
  const menu = dlg.querySelector('#ex-menu');
  const open = menu && !menu.hidden;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open) openExerciseMenu();
    highlightExercise(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open) openExerciseMenu();
    highlightExercise(-1);
    return;
  }
  if (event.key === 'Enter' && open && exIndex >= 0) {
    event.preventDefault();
    const item = dlg.querySelectorAll('.ex-item')[exIndex];
    if (item) chooseExercise(item.dataset.name);
    return;
  }
  if (event.key === 'Escape' && open) {
    event.preventDefault();
    closeExerciseMenu();
  }
});

document.addEventListener('mousedown', (event) => {
  if (event.target.closest && event.target.closest('#ex-menu')) event.preventDefault();
});

document.addEventListener('focusout', (event) => {
  if (event.target.id !== 'ex-name') return;
  setTimeout(() => {
    if (!dlg.querySelector('#ex-menu')) return;
    closeExerciseMenu();
  }, 120);
});

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-act]');
  if (!trigger) return;
  const act = trigger.dataset.act;

  switch (act) {
    case 'nav': {
      const view = trigger.dataset.view;
      if (!VIEWS[view] || view === ctx.view) return;
      ctx.view = view;
      render({ scrollTop: true });
      break;
    }
    case 'shift-date': {
      const scope = trigger.dataset.scope;
      if (!ctx.dates[scope]) return;
      ctx.dates[scope] = shiftDate(ctx.dates[scope], Number(trigger.dataset.delta) || 0);
      render();
      break;
    }
    case 'goto-date': {
      const date = trigger.dataset.date;
      if (!date || !ctx.dates.fitness) return;
      ctx.dates.fitness = date;
      render({ scrollTop: true });
      break;
    }
    case 'go-today': {
      const scope = trigger.dataset.scope;
      if (!ctx.dates[scope]) return;
      ctx.dates[scope] = ctx.today;
      render();
      break;
    }
    case 'open-workout':
      openWorkoutDialog(null, ctx.view === 'fitness' ? '' : ctx.today);
      break;
    case 'edit-workout':
      openWorkoutDialog(trigger.dataset.id);
      break;
    case 'delete-workout': {
      const workout = state.workouts.find((w) => w.id === trigger.dataset.id);
      if (!workout) return;
      actions.removeWorkout(workout.id);
      toast(`已删除 ${workout.name}`, {
        action: '撤销',
        onAction: () => actions.addWorkout({ ...workout }),
      });
      break;
    }
    case 'add-set': {
      const rows = dlg.querySelector('#set-rows');
      if (!rows) return;
      rows.insertAdjacentHTML('beforeend', setRowHTML({}, rows.children.length));
      renumberSets();
      rows.lastElementChild?.querySelector('input')?.focus();
      break;
    }
    case 'remove-set': {
      const rows = dlg.querySelector('#set-rows');
      if (!rows) return;
      const row = trigger.closest('.set-row');
      if (rows.children.length > 1) row?.remove();
      else row?.querySelectorAll('input').forEach((input) => { input.value = ''; });
      renumberSets();
      break;
    }
    case 'repeat-last':
      repeatLastWorkout();
      break;
    case 'more-history':
      ctx.historyLimit += 14;
      render();
      break;
    case 'open-meal':
      openMealDialog(trigger.dataset.meal, ctx.view === 'nutrition' ? '' : ctx.today);
      break;
    case 'nutrition-range':
      ctx.nutritionRange = Number(trigger.dataset.range) === 30 ? 30 : 7;
      render();
      break;
    case 'copy-yesterday':
      copyYesterdayMeals();
      break;
    case 'delete-custom-food': {
      const id = trigger.dataset.id;
      const food = state.customFoods.find((f) => f.id === id);
      if (!food) break;
      actions.removeCustomFood(id);
      const search = dlg.querySelector('#food-search');
      const list = dlg.querySelector('#food-list');
      if (list) list.innerHTML = foodListHTML(search ? search.value : '');
      toast(`已删除「${food.name}」`, {
        action: '撤销',
        onAction: () => actions.addCustomFood(food),
      });
      break;
    }
    case 'quick-meal': {
      const src = state.meals.find((m) => m.id === trigger.dataset.id);
      const form = dlg.querySelector('#meal-form');
      if (!src || !form) break;
      const data = new FormData(form);
      const date = String(data.get('date') || ctx.dates.nutrition);
      const meal = String(data.get('meal') || state.settings.lastMeal || 'breakfast');
      const created = actions.addMeal({
        date,
        meal,
        name: src.name,
        foodId: src.foodId,
        amount: src.amount,
        portion: src.portion,
        kcal: src.kcal,
        protein: src.protein,
        carbs: src.carbs,
        fat: src.fat,
      });
      if (created) toast(`已添加 ${created.name} · ${fmt(created.kcal)} kcal`);
      break;
    }
    case 'open-templates':
      openTemplateDialog();
      break;
    case 'save-routine':
      openSaveTemplateDialog();
      break;
    case 'apply-routine':
      applyRoutine(trigger.dataset.id);
      break;
    case 'delete-routine': {
      const id = trigger.dataset.id;
      const routine = state.routines.find((r) => r.id === id);
      if (!routine) break;
      actions.removeRoutine(id);
      openTemplateDialog();
      toast(`已删除模板「${routine.name}」`, {
        action: '撤销',
        onAction: () => {
          actions.addRoutine(routine);
          openTemplateDialog();
        },
      });
      break;
    }
    case 'open-measure':
      openMeasureDialog();
      break;
    case 'delete-measure': {
      const id = trigger.dataset.id;
      const item = state.measurements.find((m) => m.id === id);
      if (!item) break;
      actions.removeMeasurement(id);
      toast('已删除该条记录', {
        action: '撤销',
        onAction: () => actions.addMeasurement(item),
      });
      break;
    }
    case 'open-recommend':
      openRecommendDialog();
      break;
    case 'apply-rec':
      applyRecommendation();
      break;
    case 'apply-last-rec':
      applyLastRecommendation();
      break;
    case 'pick-food': {
      if (!picker) return;
      const food = allFoods().find((f) => f.id === trigger.dataset.id);
      if (!food) return;
      picker.foodId = food.id;
      picker.amount = food.amount || 100;
      syncFoodSelection();
      break;
    }
    case 'pick-exercise':
      chooseExercise(trigger.dataset.name || '');
      break;
    case 'food-cat': {
      if (!picker) return;
      picker.cat = trigger.dataset.cat || '全部';
      const chips = dlg.querySelector('[data-food-cats]');
      if (chips) chips.innerHTML = foodCatChips();
      const list = dlg.querySelector('#food-list');
      if (list) {
        const input = dlg.querySelector('#food-search');
        list.innerHTML = foodListHTML(input ? input.value : '');
        ensurePickerVisible();
      }
      break;
    }
    case 'amount-chip': {
      if (!picker) return;
      picker.amount = Number(trigger.dataset.value) || 100;
      syncFoodSelection();
      break;
    }
    case 'edit-meal':
      openMealDialog(null, null, trigger.dataset.id);
      break;
    case 'delete-meal': {
      const meal = state.meals.find((m) => m.id === trigger.dataset.id);
      if (!meal) return;
      actions.removeMeal(meal.id);
      toast(`已删除 ${meal.name}`, {
        action: '撤销',
        onAction: () => actions.addMeal({ ...meal }),
      });
      break;
    }
    case 'close-dialog':
      closeDialog();
      break;
    case 'export':
      exportData();
      break;
    case 'import':
      document.getElementById('import-file')?.click();
      break;
    case 'clear':
      openClearDialog();
      break;
    case 'restore-safety':
      if (window.confirm('用「操作前备份」覆盖当前数据？当前未保存的改动会丢失。')) restoreSafety();
      break;
    case 'install':
      promptInstall();
      break;
    case 'refresh-sw':
      refreshCache();
      break;
    case 'persist-storage':
      requestPersist();
      break;
    case 'cloud-login':
      signIn(trigger.dataset.provider === 'wechat' ? 'wechat' : 'workbuddy');
      break;
    case 'cloud-logout':
      if (window.confirm('退出登录后本机数据仍会保留，但不再自动同步。继续？')) signOut();
      break;
    case 'cloud-push':
      if (window.confirm('将本机数据上传到云端，会覆盖云端已有记录。继续？')) pushLocal();
      break;
    case 'cloud-pull':
      if (window.confirm('从云端恢复会覆盖本机现有记录，当前未上传的改动会丢失。继续？')) pullCloud();
      break;
    case 'cloud-resolve-pull':
      if (window.confirm('用云端记录覆盖本机？')) resolveChoice('pull');
      break;
    case 'cloud-resolve-push':
      if (window.confirm('用本机记录覆盖云端？')) resolveChoice('push');
      break;
    case 'cloud-retry':
      window.location.reload();
      break;
    case 'reset-goals':
      actions.setGoals({ ...DEFAULT_GOALS });
      toast('已恢复推荐目标值');
      break;
    default:
      break;
  }
});

document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.name === 'confirm' && el.closest && el.closest('#clear-form')) {
    const btn = document.getElementById('clear-submit');
    if (btn) btn.disabled = el.value.trim() !== '清空';
    return;
  }
  if (el.id === 'ex-name') {
    exIndex = -1;
    openExerciseMenu();
    return;
  }
  if (el.closest && el.closest('#rec-form')) {
    updateRecResult();
    return;
  }
  if (el.closest && el.closest('form[data-form="goals"]')) {
    updateGoalCheck();
    return;
  }
  if (el.id === 'food-search') {
    if (picker && el.value.trim()) picker.cat = '全部';
    const chips = dlg.querySelector('[data-food-cats]');
    if (chips) chips.innerHTML = foodCatChips();
    const list = dlg.querySelector('#food-list');
    if (list) list.innerHTML = foodListHTML(el.value);
    ensurePickerVisible();
  }
  if (el.id === 'food-amount' && picker) {
    const value = Number(el.value);
    if (Number.isFinite(value) && value > 0) {
      picker.amount = value;
      dlg.querySelectorAll('[data-act="amount-chip"]').forEach((chip) => {
        chip.classList.toggle('is-active', Number(chip.dataset.value) === Number(value));
      });
      const preview = dlg.querySelector('#meal-preview');
      if (preview) preview.innerHTML = previewHTML();
    }
  }
});

document.addEventListener('change', (event) => {
  const el = event.target;

  if (el.closest && el.closest('#rec-form')) {
    updateRecResult();
    return;
  }

  if (el.matches('[data-date-input]')) {
    const scope = el.dataset.dateInput;
    if (ctx.dates[scope] && el.value) {
      ctx.dates[scope] = el.value;
      render();
    }
    return;
  }

  if (el.matches('[data-meal-mode]')) {
    switchMealMode(el.value);
    return;
  }

  if (el.matches('[data-theme-opt]')) {
    actions.setTheme(el.value);
    applyTheme();
    toast(el.value === 'auto' ? '已跟随系统外观' : el.value === 'light' ? '已切换为浅色' : '已切换为深色');
    return;
  }

  if (el.id === 'import-file' && el.files?.length) {
    importFile(el.files[0]);
    el.value = '';
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'workout') saveWorkout(form);
  if (kind === 'meal') saveMeal(form);
  if (kind === 'recommend') applyRecommendation();
  if (kind === 'clear') doClear(form);
  if (kind === 'measure') saveMeasurement(form);
  if (kind === 'routine') saveRoutine(form);
  if (kind === 'goals') {
    const data = new FormData(form);
    const next = {};
    let valid = true;
    ['kcal', 'protein', 'carbs', 'fat'].forEach((key) => {
      const value = Number(data.get(key));
      if (!Number.isFinite(value) || value < 0) valid = false;
      next[key] = value;
    });
    if (
      !valid ||
      next.kcal < 800 || next.kcal > 6000 ||
      next.protein > 400 || next.carbs > 800 || next.fat > 300
    ) {
      toast('请填写有效的营养目标');
      return;
    }
    actions.setGoals(next);
    toast('每日营养目标已更新');
  }
});

dlg.addEventListener('click', (event) => {
  if (event.target === dlg) closeDialog();
});

dlg.addEventListener('close', () => {
  if (dlg.open) return;
  dlg.innerHTML = '';
  picker = null;
  currentRec = null;
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  updateInstallButtons();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  updateInstallButtons();
  toast('已安装，可从桌面直接打开');
});

window.addEventListener('online', () => {
  updateNet();
  toast('网络已恢复');
});

window.addEventListener('offline', () => {
  updateNet();
  toast('已离线，仍可继续记录');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const now = todayStr();
    if (now !== ctx.today) {
      ctx.today = now;
      ctx.dates.fitness = now;
      ctx.dates.nutrition = now;
      render();
    }
  }
});

/* ============================ 启动 ============================ */

hydrateIcons();
applyTheme();
render();
updateNet();
subscribe(() => {
  applyTheme();
  render();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', registerServiceWorker);
}

initCloud({
  onChange: refreshCloudCard,
  onNotice: (message) => toast(message),
});

if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}
