/* 营养页 */

import { esc, fmt, fullDateLabel, lastNDates, weekdayShort, sum, clamp, shiftDate } from '../util.js';
import { nutritionOn } from '../selectors.js';
import { dateBar, viewHead, ring, macroBar, weekChart, macroSplit } from '../components.js';
import { MEALS } from '../data.js';
import { icon } from '../icons.js';

const MACRO_COLORS = { protein: 'var(--blue)', carbs: 'var(--orange)', fat: 'var(--pink)' };
const MACRO_NAMES = { protein: '蛋白质', carbs: '碳水', fat: '脂肪' };

/** 四舍五入后把误差补到占比最大的一项，保证三项相加正好 100% */
function percentLabels(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const pct = raw.map((v) => Math.round(v));
  const gap = 100 - pct.reduce((a, b) => a + b, 0);
  if (gap !== 0) pct[raw.indexOf(Math.max(...raw))] += gap;
  return pct;
}

/** 把一天的热量按三大营养素供能比例拆成柱状分段；能量缺失时返回 null */
function macroParts(totals) {
  const energy = {
    protein: (Number(totals.protein) || 0) * 4,
    carbs: (Number(totals.carbs) || 0) * 4,
    fat: (Number(totals.fat) || 0) * 9,
  };
  const keys = ['protein', 'carbs', 'fat'];
  const values = keys.map((k) => energy[k]);
  const sumEnergy = values.reduce((a, b) => a + b, 0);
  const kcal = Number(totals.kcal) || 0;
  if (!sumEnergy || !kcal) return null;
  const pct = percentLabels(values);
  return keys.map((key, i) => ({
    value: (kcal * values[i]) / sumEnergy,
    color: MACRO_COLORS[key],
    label: `${MACRO_NAMES[key]} ${pct[i]}%`,
  }));
}

function portionLabel(meal) {
  if (Number(meal.amount) > 0) return `${fmt(meal.amount)} g`;
  return meal.portion || '1 份';
}

function mealItem(meal) {
  return `<div class="meal-item">
    <div class="mi-main">
      <div class="mi-name">${esc(meal.name)}<span>${esc(portionLabel(meal))}</span></div>
      <div class="mi-macros">蛋白 ${fmt(meal.protein, 1)} · 碳水 ${fmt(meal.carbs, 1)} · 脂肪 ${fmt(meal.fat, 1)}</div>
    </div>
    <div class="mi-kcal">${fmt(meal.kcal)}<small>kcal</small></div>
    <button class="icon-btn" type="button" data-act="edit-meal" data-id="${meal.id}" aria-label="编辑 ${esc(meal.name)}">${icon('pencil', 14)}</button>
    <button class="icon-btn danger" type="button" data-act="delete-meal" data-id="${meal.id}" aria-label="删除 ${esc(meal.name)}">${icon('x', 14)}</button>
  </div>`;
}

export function render(state, ctx) {
  const date = ctx.dates.nutrition;
  const today = ctx.today;
  const goals = state.settings.goals;
  const { meals, totals } = nutritionOn(state, date);
  const remaining = goals.kcal - totals.kcal;
  const over = remaining < 0;
  const range = Number(ctx.nutritionRange) === 30 ? 30 : 7;
  const weekDates = lastNDates(range, date);
  const weekDays = weekDates.map((d) => nutritionOn(state, d));
  const weekKcal = weekDays.map((x) => x.totals.kcal);
  const logged = weekKcal.filter((v) => v > 0);
  const avg = logged.length ? Math.round(sum(logged) / logged.length) : 0;
  const macroGrams = weekDays.reduce(
    (acc, x) => {
      acc.protein += x.totals.protein;
      acc.carbs += x.totals.carbs;
      acc.fat += x.totals.fat;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0 }
  );
  const chartItems = weekDates.map((d, i) => {
    const totals = weekDays[i].totals;
    const short = range === 7 ? (d === today ? '今天' : weekdayShort(d).slice(1)) : d.slice(5).replace('-', '/');
    const parts = macroParts(totals);
    const share = parts ? parts.map((p) => p.label).join(' / ') : '';
    return {
      short,
      value: totals.kcal,
      today: d === date,
      unit: ' kcal',
      parts: parts || undefined,
      tip: totals.kcal ? `${short} ${fmt(totals.kcal)} kcal${share ? ` · ${share}` : ''}` : `${short} 未记录`,
    };
  });
  const summary = `<b>${meals.length}</b> 条记录 · 蛋白质 ${fmt(totals.protein, 1)}g · 碳水 ${fmt(totals.carbs, 1)}g`;

  const yesterday = shiftDate(date, -1);
  const yesterdayCount = state.meals.filter((m) => m.date === yesterday).length;

  return `
    ${viewHead({
      eyebrow: '营养摄入',
      title: fullDateLabel(date),
      chip: date === today ? '<span class="today-chip">今天</span>' : '',
      actions: `<button class="btn ghost" type="button" data-act="copy-yesterday" ${yesterdayCount ? '' : 'disabled'}>${icon('refresh')}复制昨天${yesterdayCount ? ` ${yesterdayCount}` : ''}</button>
        <button class="btn primary" type="button" data-act="open-meal">${icon('plus')}记录饮食</button>`,
    })}

    ${dateBar({ date, scope: 'nutrition', today, summary })}

    <article class="card">
      <div class="nutri-top">
        ${ring({
          value: totals.kcal,
          total: goals.kcal,
          label: fmt(totals.kcal),
          sub: `/ ${fmt(goals.kcal)} kcal`,
          size: 160,
          accent: over ? 'orange' : 'lime',
        })}
        <div class="nutri-macros">
          ${macroBar({ label: '蛋白质', value: totals.protein, total: goals.protein, color: 'var(--blue)' })}
          ${macroBar({ label: '碳水', value: totals.carbs, total: goals.carbs, color: 'var(--orange)' })}
          ${macroBar({ label: '脂肪', value: totals.fat, total: goals.fat, color: 'var(--pink)' })}
        </div>
        <div class="nutri-side">
          <span class="eyebrow">${over ? '已超出目标' : '还可摄入'}</span>
          <span class="big ${over ? 'over' : ''}">${fmt(Math.abs(remaining))}<span class="tiny" style="font-size:11px;margin-left:3px">kcal</span></span>
          <p>${over ? `超出 ${fmt(Math.abs(remaining) / Math.max(goals.kcal, 1) * 100)}%` : `完成 ${fmt(clamp(totals.kcal / Math.max(goals.kcal, 1), 0, 1) * 100)}%`}</p>
          <button class="link" type="button" data-act="nav" data-view="settings" style="margin-top:5px">调整目标 ${icon('arrowRight', 11)}</button>
        </div>
      </div>
    </article>

    <article class="card">
      <div class="card-head">
        <div>
          <h2>近 ${range} 天热量</h2>
          <p class="muted">虚线为每日目标 ${fmt(goals.kcal)} kcal${logged.length ? ` · 日均 ${fmt(avg)} kcal` : ''}<span class="hide-sm"> · 柱内为供能占比</span></p>
        </div>
        <div class="chip-group" role="group" aria-label="趋势区间">
          <button class="chip${range === 7 ? ' is-active' : ''}" type="button" data-act="nutrition-range" data-range="7">7 天</button>
          <button class="chip${range === 30 ? ' is-active' : ''}" type="button" data-act="nutrition-range" data-range="30">30 天</button>
        </div>
      </div>
      ${weekChart({ items: chartItems, goal: goals.kcal, labelEvery: range === 30 ? 5 : 1 })}
      ${
        logged.length
          ? macroSplit({
              grams: macroGrams,
              days: logged.length,
              note: `近 ${range} 天已记录 ${logged.length} 天`,
            })
          : ''
      }
    </article>

    <div class="stack">
      ${MEALS.map((m) => {
        const list = meals.filter((x) => x.meal === m.id);
        const kcal = sum(list, (x) => x.kcal);
        return `<article class="card meal-card">
          <div class="meal-head">
            <span class="meal-ico">${m.short}</span>
            <h3>${m.label}</h3>
            <span class="kcal">${kcal ? `${fmt(kcal)} kcal` : '—'}</span>
            <button class="icon-btn" type="button" data-act="open-meal" data-meal="${m.id}" aria-label="添加到${m.label}">${icon('plus')}</button>
          </div>
          <div class="meal-body">
            ${
              list.length
                ? list.map(mealItem).join('')
                : `<div class="meal-empty"><span>还没有记录</span><button class="link" type="button" data-act="open-meal" data-meal="${m.id}">添加食物 ${icon('arrowRight')}</button></div>`
            }
          </div>
        </article>`;
      }).join('')}
    </div>
  `;
}
