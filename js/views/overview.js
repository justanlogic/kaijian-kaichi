/* 概览页 */

import { esc, fmt, fullDateLabel, lastNDates, weekdayShort, sum, dateLabel } from '../util.js';
import { nutritionOn, workoutsOn, workoutVolume, workoutSetCount, streak, trainingInRange } from '../selectors.js';
import { ring, macroBar, weekChart, emptyState } from '../components.js';
import { MEALS } from '../data.js';
import { icon } from '../icons.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function sparkline(list) {
  const points = list.slice(-14);
  if (points.length < 3) return '';
  const values = points.map((p) => p.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 300;
  const h = 56;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((p.weight - min) / span) * (h - 10) - 5).toFixed(1)}`)
    .join(' ');
  return `<svg class="body-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="var(--lime)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function bodyBlock(state) {
  const list = state.measurements;
  if (!list.length) {
    return emptyState({
      iconName: 'target',
      title: '还没有身体数据',
      text: '每周固定时间称一次，比每天称更能看出趋势',
      action: `<button class="btn primary small" type="button" data-act="open-measure">记录第一次</button>`,
    });
  }
  const latest = list[list.length - 1];
  const first = list[0];
  const delta = Math.round((latest.weight - first.weight) * 10) / 10;
  const range = list.length > 1 ? `较 ${first.date.slice(5).replace('-', '/')} ${delta > 0 ? '+' : ''}${delta} kg` : '首次记录';
  const recent = list.slice(-3).reverse();

  return `<div class="body-main">
      <div class="body-num">${fmt(latest.weight, 1)}<small>kg</small></div>
      <div class="body-side">
        <span class="body-delta">${range}</span>
        <div class="body-meta">
          ${latest.waist ? `<span>腰围 ${fmt(latest.waist, 1)} cm</span>` : ''}
          ${latest.bodyFat ? `<span>体脂 ${fmt(latest.bodyFat, 1)}%</span>` : ''}
          <span>${dateLabel(latest.date)}</span>
        </div>
      </div>
    </div>
    ${sparkline(list)}
    <ul class="body-history">
      ${recent
        .map(
          (m) => `<li class="body-row">
            <span>${m.date.slice(5).replace('-', '/')}</span>
            <b>${fmt(m.weight, 1)} kg</b>
            <button class="icon-btn danger" type="button" data-act="delete-measure" data-id="${m.id}" aria-label="删除 ${m.date} 的体重记录">${icon('x', 13)}</button>
          </li>`
        )
        .join('')}
    </ul>`;
}

export function render(state, ctx) {
  const today = ctx.today;
  const goals = state.settings.goals;
  const { meals, totals } = nutritionOn(state, today);
  const workouts = workoutsOn(state, today);
  const volume = sum(workouts, workoutVolume);
  const sets = sum(workouts, workoutSetCount);
  const days = streak(state, today);
  const weekDates = lastNDates(7, today);
  const week = trainingInRange(state, weekDates);
  const weekKcal = weekDates.map((d) => nutritionOn(state, d).totals.kcal);
  const loggedDays = weekKcal.filter((v) => v > 0);
  const avg = loggedDays.length ? Math.round(sum(loggedDays) / loggedDays.length) : 0;
  const remaining = goals.kcal - totals.kcal;
  const over = remaining < 0;

  const chartItems = weekDates.map((d) => ({
    short: d === today ? '今天' : weekdayShort(d).slice(1),
    value: nutritionOn(state, d).totals.kcal,
    today: d === today,
    unit: ' kcal',
  }));

  return `
    <section class="view-head">
      <div>
        <p class="eyebrow">${greeting()} · 今日概览</p>
        <h1>${fullDateLabel(today)} <span class="today-chip">今天</span></h1>
      </div>
      <div class="head-actions">
        <button class="btn soft" type="button" data-act="open-workout">${icon('dumbbell')}记录训练</button>
        <button class="btn soft" type="button" data-act="open-meal">${icon('apple')}记录饮食</button>
      </div>
    </section>

    <div class="grid-2">
      <article class="card hero">
        <div class="hero-main">
          ${ring({
            value: totals.kcal,
            total: goals.kcal,
            label: fmt(totals.kcal),
            sub: `/ ${fmt(goals.kcal)} kcal`,
            size: 168,
            accent: over ? 'orange' : 'lime',
          })}
          <div class="hero-copy">
            <p class="eyebrow">今日热量</p>
            <h2>${over ? `已超出 ${fmt(-remaining)} kcal` : `还可摄入 ${fmt(remaining)} kcal`}</h2>
            <div class="hero-macros">
              ${macroBar({ label: '蛋白质', value: totals.protein, total: goals.protein, color: 'var(--blue)' })}
              ${macroBar({ label: '碳水', value: totals.carbs, total: goals.carbs, color: 'var(--orange)' })}
              ${macroBar({ label: '脂肪', value: totals.fat, total: goals.fat, color: 'var(--pink)' })}
            </div>
          </div>
        </div>
        <div class="hero-foot">
          <span class="chip-static">${icon('dumbbell')}训练 ${workouts.length} 个动作</span>
          <span class="chip-static">${icon('flame')}饮食 ${meals.length} 条</span>
          <span class="chip-static">${icon('target')}连续记录 ${days} 天</span>
        </div>
      </article>

      <div class="stack">
        <div class="card stat">
          <div class="stat-head">
            <span>${icon('dumbbell')}今日训练容量</span>
            <button class="link" type="button" data-act="nav" data-view="fitness">训练页 ${icon('arrowRight')}</button>
          </div>
          <div class="stat-num">${fmt(volume)}<small>kg</small></div>
          <p>${workouts.length} 个动作 · ${sets} 组${workouts.length ? '' : ' · 还没有开始'}</p>
        </div>
        <div class="card stat">
          <div class="stat-head">
            <span>${icon('target')}连续记录</span>
            <span class="link" style="cursor:default">本周 ${week.days} 天训练</span>
          </div>
          <div class="stat-num">${days}<small>天</small></div>
          <p>本周累计容量 ${fmt(week.volume)} kg</p>
        </div>
      </div>
    </div>

    <article class="card">
      <div class="card-head">
        <div>
          <h2>近 7 天热量</h2>
          <p class="muted">与每日目标 ${fmt(goals.kcal)} kcal 对比</p>
        </div>
        <span class="chip-static">${icon('flame')}${loggedDays.length ? `日均 ${fmt(avg)} kcal` : '暂无记录'}</span>
      </div>
      ${weekChart({ items: chartItems, goal: goals.kcal })}
    </article>

    <article class="card">
      <div class="card-head">
        <div>
          <h2>身体数据</h2>
          <p class="muted">${state.measurements.length ? '最近一次体重会作为推荐目标的默认值' : '记录体重与围度，用来看训练是否有效'}</p>
        </div>
        <button class="btn ghost small" type="button" data-act="open-measure">${icon('plus')}记录</button>
      </div>
      ${bodyBlock(state)}
    </article>

    <div class="grid-2-even">
      <article class="card">
        <div class="card-head">
          <div><h2>今日训练</h2><p class="muted">${dateLabel(today)} · ${sets} 组</p></div>
          <button class="btn ghost small" type="button" data-act="open-workout">${icon('plus')}新增</button>
        </div>
        ${
          workouts.length
            ? `<ul class="mini-list">
                ${workouts
                  .map(
                    (w) => `<li class="mini-row">
                      <span class="mi-dot"></span>
                      <span class="mi-name">${esc(w.name)}</span>
                      <span class="mi-sub">${w.sets.length} 组 · ${fmt(workoutVolume(w))} kg</span>
                    </li>`
                  )
                  .join('')}
              </ul>`
            : emptyState({
                iconName: 'dumbbell',
                title: '今天还没有训练',
                text: '记录动作、重量与次数，容量会自动累计',
                action: `<button class="btn primary small" type="button" data-act="open-workout">去记录</button>`,
              })
        }
      </article>

      <article class="card">
        <div class="card-head">
          <div><h2>今日饮食</h2><p class="muted">${meals.length} 条 · ${fmt(totals.kcal)} kcal</p></div>
          <button class="btn ghost small" type="button" data-act="open-meal">${icon('plus')}新增</button>
        </div>
        ${
          meals.length
            ? `<ul class="mini-list">
                ${MEALS.map((m) => {
                  const list = meals.filter((x) => x.meal === m.id);
                  const kcal = sum(list, (x) => x.kcal);
                  return `<li class="mini-row">
                    <span class="mi-dot" style="background:${list.length ? 'var(--lime)' : 'var(--line-strong)'}"></span>
                    <span class="mi-name">${m.label}</span>
                    <span class="mi-sub">${list.length ? `${list.length} 项 · ${fmt(kcal)} kcal` : '未记录'}</span>
                  </li>`;
                }).join('')}
              </ul>`
            : emptyState({
                iconName: 'apple',
                title: '今天还没有饮食记录',
                text: '添加食物后会与每日营养目标自动对比',
                action: `<button class="btn primary small" type="button" data-act="open-meal">去记录</button>`,
              })
        }
      </article>
    </div>
  `;
}
