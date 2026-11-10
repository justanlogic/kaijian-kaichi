/* 营养页 */

import { esc, fmt, fullDateLabel, lastNDates, weekdayShort, sum, clamp, shiftDate } from '../util.js';
import { nutritionOn } from '../selectors.js';
import { dateBar, viewHead, ring, macroBar, weekChart } from '../components.js';
import { MEALS } from '../data.js';
import { icon } from '../icons.js';

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
  const weekKcal = weekDates.map((d) => nutritionOn(state, d).totals.kcal);
  const logged = weekKcal.filter((v) => v > 0);
  const avg = logged.length ? Math.round(sum(logged) / logged.length) : 0;
  const chartItems = weekDates.map((d) => ({
    short: range === 7 ? (d === today ? '今天' : weekdayShort(d).slice(1)) : d.slice(5).replace('-', '/'),
    value: nutritionOn(state, d).totals.kcal,
    today: d === date,
    unit: ' kcal',
  }));
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
          <p class="muted">虚线为每日目标 ${fmt(goals.kcal)} kcal${logged.length ? ` · 日均 ${fmt(avg)} kcal` : ''}</p>
        </div>
        <div class="chip-group" role="group" aria-label="趋势区间">
          <button class="chip${range === 7 ? ' is-active' : ''}" type="button" data-act="nutrition-range" data-range="7">7 天</button>
          <button class="chip${range === 30 ? ' is-active' : ''}" type="button" data-act="nutrition-range" data-range="30">30 天</button>
        </div>
      </div>
      ${weekChart({ items: chartItems, goal: goals.kcal, labelEvery: range === 30 ? 5 : 1 })}
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
