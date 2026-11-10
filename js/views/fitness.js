/* 训练页 */

import { esc, fmt, fullDateLabel, sum, weekdayShort, shiftDate } from '../util.js';
import { workoutsOn, workoutVolume, workoutSetCount, prIds } from '../selectors.js';
import { dateBar, viewHead, emptyState, weekChart } from '../components.js';
import { icon } from '../icons.js';

function setChips(sets) {
  return (sets || [])
    .map(
      (s, i) => `<span class="set-chip"><i>${i + 1}</i>${
        Number(s.weight) > 0 ? `<b>${fmt(s.weight, 1)}</b>kg` : '<b>自重</b>'
      } × ${s.reps}</span>`
    )
    .join('');
}

function workoutCard(w, isPR) {
  const volume = workoutVolume(w);
  const maxWeight = Math.max(0, ...(w.sets || []).map((s) => Number(s.weight) || 0));
  const meta = [
    `${w.sets.length} 组`,
    volume > 0 ? `总容量 <b>${fmt(volume)}</b> kg` : '自重训练',
    maxWeight > 0 ? `最高 <b>${fmt(maxWeight, 1)}</b> kg` : '',
  ].filter(Boolean).join(' · ');
  return `<article class="card wo-card">
    <div class="wo-head">
      <div>
        <h3>${esc(w.name)}${isPR ? '<span class="badge pr" title="刷新该动作的最重纪录">PR</span>' : ''}</h3>
        <p class="wo-meta">${meta}</p>
      </div>
      <div class="row-actions">
        <button class="icon-btn" type="button" data-act="edit-workout" data-id="${w.id}" aria-label="编辑 ${esc(w.name)}">${icon('pencil')}</button>
        <button class="icon-btn danger" type="button" data-act="delete-workout" data-id="${w.id}" aria-label="删除 ${esc(w.name)}">${icon('trash')}</button>
      </div>
    </div>
    <div class="set-chips">${setChips(w.sets)}</div>
    ${w.note ? `<p class="wo-note">${esc(w.note)}</p>` : ''}
  </article>`;
}

function historyBlock(state, selectedDate, limit = 14) {
  const map = new Map();
  state.workouts.forEach((w) => {
    if (!map.has(w.date)) map.set(w.date, []);
    map.get(w.date).push(w);
  });
  const days = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, limit);
  if (!days.length) return '';
  const openDate = days.find(([d]) => d !== selectedDate)?.[0];

  return `<div class="hist">
    ${days
      .map(([date, list]) => {
        const volume = sum(list, workoutVolume);
        return `<details class="hist-day" ${date === openDate ? 'open' : ''}>
          <summary>
            <span class="hist-date"><b>${date.slice(5).replace('-', '/')}</b> ${weekdayShort(date)}${
              date === selectedDate ? ' <span class="tag">当前</span>' : ''
            }</span>
            <span class="hist-sum">${list.length} 个动作 · ${fmt(volume)} kg ${icon('chevronRight', 12)}</span>
          </summary>
          <div class="hist-body">
            ${list
              .map(
                (w) => `<button class="hist-row" type="button" data-act="goto-date" data-date="${date}" title="查看 ${date} 的训练明细">
                  <span>${esc(w.name)}</span>
                  <span>${w.sets.length} 组 · ${fmt(workoutVolume(w))} kg</span>
                </button>`
              )
              .join('')}
          </div>
        </details>`;
      })
      .join('')}
  </div>`;
}

export function render(state, ctx) {
  const date = ctx.dates.fitness;
  const today = ctx.today;
  const list = workoutsOn(state, date);
  const volume = sum(list, workoutVolume);
  const sets = sum(list, workoutSetCount);
  const prs = prIds(state);
  const hasPrevious = state.workouts.some((w) => w.date < date);
  const summary = `<b>${list.length}</b> 个动作 · <b>${sets}</b> 组 · <b>${fmt(volume)}</b> kg 总容量`;
  const totalDays = new Set(state.workouts.map((w) => w.date)).size;
  const limit = Math.max(14, Number(ctx.historyLimit) || 14);

  const weekly = [];
  for (let k = 7; k >= 0; k--) {
    const end = shiftDate(today, -7 * k);
    const start = shiftDate(end, -6);
    const vol = state.workouts
      .filter((w) => w.date >= start && w.date <= end)
      .reduce((acc, w) => acc + workoutVolume(w), 0);
    weekly.push({ short: start.slice(5).replace('-', '/'), value: vol, today: k === 0, unit: ' kg' });
  }
  const activeWeeks = weekly.filter((w) => w.value > 0);
  const avgWeekly = activeWeeks.length ? Math.round(sum(activeWeeks, (w) => w.value) / activeWeeks.length) : 0;

  return `
    ${viewHead({
      eyebrow: '训练日志',
      title: fullDateLabel(date),
      chip: date === today ? '<span class="today-chip">今天</span>' : '',
      actions: `
        <button class="btn ghost" type="button" data-act="open-templates">${icon('copy')}模板${state.routines.length ? ` ${state.routines.length}` : ''}</button>
        ${hasPrevious ? `<button class="btn ghost" type="button" data-act="repeat-last">${icon('refresh')}复制上次</button>` : ''}
        <button class="btn primary" type="button" data-act="open-workout">${icon('plus')}新增动作</button>
      `,
    })}

    ${dateBar({ date, scope: 'fitness', today, summary })}

    ${
      list.length
        ? `<div class="list">${list.map((w) => workoutCard(w, prs.has(w.id))).join('')}</div>`
        : emptyState({
            iconName: 'dumbbell',
            title: '这一天还没有训练记录',
            text: '记录动作、每组重量与次数，自动计算总容量与个人纪录',
            action: `<button class="btn primary small" type="button" data-act="open-workout">${icon('plus')}新增动作</button>`,
          })
    }

    ${
      state.workouts.length
        ? `<article class="card">
            <div class="card-head">
              <div>
                <h2>近 8 周训练容量</h2>
                <p class="muted">每周总容量，用来判断训练量是否在推进</p>
              </div>
              <span class="chip-static">${activeWeeks.length ? `周均 ${fmt(avgWeekly)} kg` : '暂无记录'}</span>
            </div>
            ${weekChart({ items: weekly, empty: '还没有足够的训练记录，先练几周再回来看' })}
          </article>`
        : ''
    }

    ${
      state.workouts.length
        ? `<div class="section-head">
            <h2>历史记录</h2>
            <p>共 ${totalDays} 个训练日 · 点记录可跳到当天</p>
          </div>
          ${historyBlock(state, date, limit)}
          ${
            totalDays > limit
              ? `<div class="history-more"><button class="btn ghost small" type="button" data-act="more-history">显示更早记录（还有 ${totalDays - limit} 天）</button></div>`
              : ''
          }`
        : ''
    }
  `;
}
