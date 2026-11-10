#!/usr/bin/env node
/**
 * 食物库自检：node scripts/check-foods.mjs
 * 新增或修改食物后跑一次，判断是否重复、分类与营养值是否合规。
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { CATS, FOODS } = await import(new URL('../js/data.js', import.meta.url).href);

const normalize = (name) =>
  String(name)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・,，、（）()]/g, '');

const errors = [];
const warns = [];
const seenIds = new Map();
const seenNames = new Map();
const seenAliases = new Map();

for (const food of FOODS) {
  if (!food.id || seenIds.has(food.id)) errors.push(`id 重复或缺失：${food.id} / ${food.name}`);
  seenIds.set(food.id, food.name);

  const key = normalize(food.name);
  if (seenNames.has(key)) errors.push(`名称重复：${food.name} 与 ${seenNames.get(key)}`);
  seenNames.set(key, food.name);

  if (!CATS[food.cat]) errors.push(`分类不存在：${food.name} → ${food.cat}`);
  if (!Number.isFinite(food.amount) || food.amount <= 0) warns.push(`缺少默认份量：${food.name}`);

  for (const field of ['kcal', 'p', 'c', 'f']) {
    if (!Number.isFinite(food[field]) || food[field] < 0) errors.push(`数值异常：${food.name} → ${field}`);
  }

  const macroKcal = food.p * 4 + food.c * 4 + food.f * 9;
  if (food.kcal > 20 && Math.abs(macroKcal - food.kcal) / food.kcal > 0.22) {
    warns.push(`热量与三大营养素偏差较大：${food.name}（标称 ${food.kcal}，折算 ${Math.round(macroKcal)}）`);
  }

  if (food.alias) {
    for (const alias of String(food.alias).split(',').filter(Boolean)) {
      const aliasKey = normalize(alias);
      if (seenNames.has(aliasKey)) errors.push(`别名与已有名称冲突：${alias}（${food.name} 与 ${seenNames.get(aliasKey)}）`);
      if (seenAliases.has(aliasKey)) errors.push(`别名重复：${alias}（${food.name} 与 ${seenAliases.get(aliasKey)}）`);
      seenAliases.set(aliasKey, food.name);
    }
  }
}

const byCat = {};
for (const food of FOODS) byCat[food.cat] = (byCat[food.cat] || 0) + 1;

console.log(`食物总数：${FOODS.length}`);
console.log(Object.entries(byCat).map(([cat, n]) => `${cat} ${n}`).join(' · '));
if (warns.length) console.log(`\n提醒 ${warns.length} 条：\n- ${warns.join('\n- ')}`);
if (errors.length) {
  console.error(`\n❌ 发现 ${errors.length} 个问题：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('\n✅ 无重复、分类与数值校验通过');
