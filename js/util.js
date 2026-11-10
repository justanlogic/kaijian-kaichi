/* 通用工具：日期、数值、转义 */

export const pad2 = (n) => String(n).padStart(2, '0');

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDate(str) {
  const [y, m, d] = String(str || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

export function shiftDate(str, delta) {
  const d = parseDate(str);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function diffDays(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayShort(str) {
  return WEEKDAYS[parseDate(str).getDay()];
}

export function dateLabel(str, today = todayStr()) {
  const diff = diffDays(today, str); // 正数代表未来，负数为过去
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === 1) return '明天';
  const d = parseDate(str);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fullDateLabel(str) {
  const d = parseDate(str);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

export function lastNDates(n, end) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) out.push(shiftDate(end, -i));
  return out;
}

export function fmt(n, digits = 0) {
  if (!Number.isFinite(Number(n))) return '0';
  const v = round(Number(n), digits);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function round(n, digits = 1) {
  const p = 10 ** digits;
  return Math.round((Number(n) || 0) * p) / p;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function sum(list, fn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, wait = 160) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
