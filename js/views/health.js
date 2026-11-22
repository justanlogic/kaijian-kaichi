/* 健康评估页 */

import { esc, fmt } from '../util.js';
import { buildHealthReport } from '../health.js';
import { icon } from '../icons.js';

const RISK_LABEL = { high: '高', medium: '中', low: '低' };

function hero(report) {
  const c = report.coverage;
  const empty = c.nutritionDays === 0 && c.sessions === 0;
  return `<article class="card health-hero is-${report.status.status}">
    <div class="hh-head">
      <span class="hh-badge"><i></i>${esc(report.status.label)}</span>
      <span class="hh-note">趋势参考 · 非医疗诊断</span>
    </div>
    <h2>${esc(report.headline)}</h2>
    <p class="hh-summary">${esc(report.summary)}</p>
    ${
      empty
        ? ''
        : `<div class="hh-stats">
            <span><b>${c.nutritionDays}</b>/28 天饮食</span>
            <span><b>${c.sessions}</b> 天训练</span>
            <span><b>${c.activeWeeks}</b>/4 周有训练</span>
            <span><b>${c.vegDays}</b> 天有蔬菜</span>
          </div>`
    }
  </article>`;
}

function metricCards(report) {
  return `<div class="health-metrics">
    ${report.metrics
      .map(
        (m) => `<article class="card hm is-${m.status}">
          <div class="hm-head">
            <span>${esc(m.title)}</span>
            <span class="hm-tag">${esc(m.label)}</span>
          </div>
          <div class="hm-value">${esc(m.value)}<small>${esc(m.unit)}</small></div>
          <p>${esc(m.detail)}</p>
          ${m.note ? `<span class="hm-note">${esc(m.note)}</span>` : ''}
        </article>`
      )
      .join('')}
  </div>`;
}

function weekTable(report) {
  return `<article class="card">
    <div class="card-head">
      <div><h2>近 4 周趋势</h2><p class="muted">每格为 7 天窗口；日均只统计有饮食记录的天</p></div>
    </div>
    <div class="week-table">
      <div class="wt-row wt-head"><span>周期</span><span>日均热量</span><span>训练</span><span>总容量</span></div>
      ${report.weeks
        .map(
          (w) => `<div class="wt-row${w.index === 3 ? ' is-last' : ''}">
            <span class="wt-week"><b>${esc(w.label)}</b><small>${esc(w.range)}</small></span>
            <span>${w.avgKcal != null ? fmt(w.avgKcal) : '—'}<small> kcal</small></span>
            <span>${w.sessions}<small> 天</small></span>
            <span>${w.volume ? `${fmt(w.volume)}<small> kg</small>` : w.sessions ? '自重' : '—'}</span>
          </div>`
        )
        .join('')}
    </div>
  </article>`;
}

function riskCard(report) {
  return `<article class="card">
    <div class="card-head">
      <div><h2>主要风险</h2><p class="muted">按影响程度排序，最多列出 4 项</p></div>
      <span class="chip-static">${report.risks.length ? `${report.risks.length} 项` : '无'}</span>
    </div>
    ${
      report.risks.length
        ? `<ul class="risk-list">
            ${report.risks
              .map(
                (r, i) => `<li class="risk-item is-${r.severity}">
                  <span class="risk-num">${i + 1}</span>
                  <div><b>${esc(r.title)}</b><p>${esc(r.detail)}</p></div>
                  <span class="risk-tag">${RISK_LABEL[r.severity]}</span>
                </li>`
              )
              .join('')}
          </ul>`
        : `<div class="health-none">${icon('check', 16)}<span>暂无明显风险，保持当前节奏。</span></div>`
    }
  </article>`;
}

function tipCard(report) {
  return `<article class="card">
    <div class="card-head">
      <div><h2>可以怎么做</h2><p class="muted">从最容易执行的一步开始，不需要一次全改</p></div>
    </div>
    <ol class="tip-list">
      ${report.tips
        .map(
          (t, i) => `<li>
            <span class="tip-num">${i + 1}</span>
            <div><b>${esc(t.title)}</b><p>${esc(t.detail)}</p></div>
          </li>`
        )
        .join('')}
    </ol>
  </article>`;
}

function noteCard(report) {
  return `<article class="card health-note">
    <div class="card-head">
      <div><h2>数据与说明</h2><p class="muted">判断基于近 28 天记录，更早的数据不参与本次趋势</p></div>
      <span class="chip-static">${icon('calendar')}${report.coverage.nutritionDays} 天饮食 · ${report.coverage.sessions} 天训练</span>
    </div>
    ${
      report.missing.length
        ? `<ul class="gap-list">${report.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
        : `<p class="health-ok">${icon('check', 14)}数据完整度足够；建议每 2–4 周回看一次趋势。</p>`
    }
    <p class="health-disclaimer">${icon('sparkle', 13)}${esc(report.disclaimer)}</p>
  </article>`;
}

function emptyCard(report) {
  return `<article class="card">
    <div class="card-head"><div><h2>有记录后会分析什么</h2><p class="muted">现在还没有足够数据，先把最近一周记起来</p></div></div>
    <ul class="health-about">
      <li><b>饮食结构</b><span>蛋白质、碳水、脂肪的供能比例，蔬菜水果出现频率</span></li>
      <li><b>摄入稳定性</b><span>每天热量是否大起大落，热量与蛋白质达标天数</span></li>
      <li><b>训练频率</b><span>近 4 周每周练几天，和你设定的目标差多少</span></li>
      <li><b>训练持续性</b><span>是否有断档，训练容量/组数在上升还是下降</span></li>
    </ul>
    <div class="health-cta">
      <button class="btn primary" type="button" data-act="nav" data-view="nutrition">${icon('apple')}记录今天吃了什么</button>
      <button class="btn soft" type="button" data-act="nav" data-view="fitness">${icon('dumbbell')}记录一次训练</button>
    </div>
    <p class="health-disclaimer">${icon('sparkle', 13)}${esc(report.disclaimer)}</p>
  </article>`;
}

export function render(state, ctx) {
  const report = buildHealthReport(state, ctx.today);
  const empty = report.coverage.nutritionDays === 0 && report.coverage.sessions === 0;

  return `
    <section class="view-head">
      <div>
        <p class="eyebrow">健康评估 · 趋势参考</p>
        <h1>近 28 天 <span class="tiny">${report.window.start.slice(5).replace('-', '/')}–${report.window.end.slice(5).replace('-', '/')}</span></h1>
      </div>
      ${
        empty
          ? ''
          : `<div class="head-actions">
              <button class="btn soft" type="button" data-act="nav" data-view="nutrition">${icon('apple')}记饮食</button>
              <button class="btn soft" type="button" data-act="nav" data-view="fitness">${icon('dumbbell')}记训练</button>
            </div>`
      }
    </section>

    ${hero(report)}
    ${empty ? emptyCard(report) : `${metricCards(report)}${weekTable(report)}<div class="health-grid">${riskCard(report)}${tipCard(report)}</div>${noteCard(report)}`}
  `;
}
