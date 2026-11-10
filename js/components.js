/* 可复用的界面片段 */

import { esc, fmt, clamp, weekdayShort } from './util.js';
import { icon } from './icons.js';

export function ring({ value = 0, total = 0, label = '0', sub = '', size = 168, stroke = 9, accent = 'lime' }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? clamp(value / total, 0, 1) : 0;
  const offset = circumference * (1 - ratio);
  return `<div class="ring" style="--ring-size:${size}px" role="img" aria-label="${esc(label)} ${esc(sub)}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="track" cx="60" cy="60" r="${radius}" stroke-width="${stroke}"/>
      <circle class="bar" cx="60" cy="60" r="${radius}" stroke-width="${stroke}"
        stroke="url(#grad-${accent})" stroke-dasharray="${circumference.toFixed(1)}"
        stroke-dashoffset="${circumference.toFixed(1)}" data-ring="${offset.toFixed(1)}"/>
    </svg>
    <div class="ring-center"><strong>${label}</strong><span>${sub}</span></div>
  </div>`;
}

export function macroBar({ label, value = 0, total = 0, unit = 'g', color = 'var(--blue)' }) {
  const ratio = total > 0 ? clamp(value / total, 0, 1) : 0;
  return `<div class="macro">
    <div class="macro-head">
      <span class="macro-label"><i style="background:${color}"></i>${esc(label)}</span>
      <span class="macro-val"><b>${fmt(value, 1)}</b> / ${fmt(total)}${unit}</span>
    </div>
    <div class="bar"><i style="width:${(ratio * 100).toFixed(1)}%;background:${color}"></i></div>
  </div>`;
}

export function weekChart({ items, goal = 0, labelEvery = 1, empty = '还没有记录，添加饮食后这里会显示每日热量趋势' }) {
  const values = items.map((it) => Number(it.value) || 0);
  if (!values.some((v) => v > 0)) {
    return `<div class="chart-empty">${esc(empty)}</div>`;
  }
  const dense = items.length > 12;
  const max = Math.max(goal, ...values, 1) * 1.12;
  const goalBottom = goal > 0 ? (goal / max) * 100 : null;
  return `<div class="chart">
    <div class="chart-area">
      ${goalBottom !== null ? `<div class="goal-line" style="bottom:${goalBottom.toFixed(2)}%"><span>目标 ${fmt(goal)}</span></div>` : ''}
      <div class="bars">
        ${items
          .map((it) => {
            const value = Number(it.value) || 0;
            const height = clamp(value / max, 0, 1) * 100;
            return `<div class="bar-col${it.today ? ' is-today' : ''}" style="--h:${height.toFixed(2)}%" title="${esc(it.short)} ${fmt(value)}${it.unit || ''}">
              <div class="bar-wrap">
                ${value > 0 && !dense ? `<span class="bar-val">${fmt(value)}</span>` : ''}${value > 0 ? '<div class="bar-fill"></div>' : ''}
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </div>
    <div class="chart-x">
      ${items
        .map((it, i) => {
          const show = it.today || i % labelEvery === 0;
          return `<span class="${it.today ? 'is-today' : ''}">${show ? esc(it.short) : ''}</span>`;
        })
        .join('')}
    </div>
  </div>`;
}

export function emptyState({ iconName = 'sparkle', title, text, action = '' }) {
  return `<div class="empty">
    <span class="empty-icon">${icon(iconName, 18)}</span>
    <p><strong>${esc(title)}</strong><span>${esc(text)}</span></p>
    ${action}
  </div>`;
}

export function dateBar({ date, scope, today, summary = '' }) {
  return `<div class="datebar">
    <div class="datebar-group">
      <button class="icon-btn" type="button" data-act="shift-date" data-scope="${scope}" data-delta="-1" aria-label="前一天">${icon('chevronLeft')}</button>
      <input type="date" value="${date}" data-date-input="${scope}" aria-label="选择日期">
      <button class="icon-btn" type="button" data-act="shift-date" data-scope="${scope}" data-delta="1" aria-label="后一天">${icon('chevronRight')}</button>
      ${date !== today
        ? `<button class="btn ghost small" type="button" data-act="go-today" data-scope="${scope}">回到今天</button>`
        : `<span class="tiny" style="margin-left:4px">${weekdayShort(date)}</span>`}
    </div>
    ${summary ? `<div class="datebar-sum">${summary}</div>` : ''}
  </div>`;
}

export function viewHead({ eyebrow, title, chip = '', actions = '' }) {
  return `<section class="view-head">
    <div>
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1>${esc(title)} ${chip}</h1>
    </div>
    ${actions ? `<div class="head-actions">${actions}</div>` : ''}
  </section>`;
}
