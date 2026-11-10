/* 设置页 */

import { fmt, dateLabel, esc } from '../util.js';
import { viewHead } from '../components.js';
import { icon } from '../icons.js';
import { goalLabel } from '../recommend.js';


function formatSyncTime(iso) {
  if (!iso) return '尚未同步';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  const now = new Date();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
  return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${time}`;
}

function cloudStatusText(cloud) {
  switch (cloud.status) {
    case 'checking': return '检查登录状态…';
    case 'idle': return '未登录';
    case 'syncing': return '正在同步…';
    case 'synced': return '已同步';
    case 'choice': return '需要选择';
    case 'error': return '同步失败';
    case 'offline': return '离线，待同步';
    case 'unavailable': return '不可用';
    case 'pending': return '待同步';
    default: return '等待同步';
  }
}

export function cloudCardInner(cloud) {
  const c = cloud || { available: false, loading: true, status: 'checking', user: null };
  if (c.loading) {
    return '<p class="cloud-desc">正在检查登录状态…</p>';
  }
  if (!c.available) {
    return `<p class="cloud-desc">${esc(c.error || '云服务当前不可用')}</p>
      <div class="cloud-actions"><button class="btn small" type="button" data-act="cloud-retry">重新检查</button></div>
      <p class="cloud-note">不登录也可以继续在本机记录，数据不会丢失。</p>`;
  }
  if (!c.user) {
    return `<p class="cloud-desc">登录后可在手机与电脑之间同步训练、饮食和目标。数据仍会先保存在本机，离线也能记录。</p>
      <div class="cloud-actions">
        <button class="btn primary" type="button" data-act="cloud-login" data-provider="wechat">微信登录</button>
        <button class="btn" type="button" data-act="cloud-login" data-provider="workbuddy">使用 WorkBuddy 登录</button>
      </div>
      <p class="cloud-split">两种登录方式各自独立，请固定用一种，数据不互通。</p>
      ${c.error ? `<p class="cloud-error">${esc(c.error)}</p>${c.errorDetail ? `<p class="cloud-detail">${esc(c.errorDetail)}</p>` : ''}` : ''}
      <p class="cloud-note">微信登录不需要 WorkBuddy 账号，适合家人朋友；云端记录按账号隔离，只有本人能读取。</p>
      ${
        ['localhost', '127.0.0.1'].includes(location.hostname)
          ? '<p class="cloud-note">登录需要在公网链接中使用，本地预览无法完成授权回调。</p>'
          : ''
      }
      ${
        /MicroMessenger/i.test(navigator.userAgent)
          ? '<p class="cloud-note">在微信内点「微信登录」后会出现二维码：长按它选「识别图中二维码」即可完成授权。</p>'
          : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
            ? '<p class="cloud-note">手机上点「微信登录」会进入扫码页：长按二维码选「识别图中二维码」，或把本页链接发到微信里打开。</p>'
            : ''
      }`;
  }

  const status = cloudStatusText(c);
  const tone =
    c.status === 'synced' ? ' ok' : c.status === 'error' || c.status === 'offline' ? ' warn' : '';
  const initial = (c.user.name || '已').slice(0, 1);

  return `<div class="cloud-user">
      <span class="cloud-avatar">${esc(initial)}</span>
      <div><strong>${esc(c.user.name)}</strong><span>${c.provider === 'wechat' ? '微信登录' : 'WorkBuddy 账号'}</span></div>
    </div>
    <div class="cloud-status">
      <span>同步状态</span><b class="${tone.trim()}">${status}</b>
      <span>上次同步</span><b>${esc(formatSyncTime(c.lastSyncedAt))}</b>
      <span>记录数量</span><b>本机 ${c.localCount ?? 0} 条 · 云端 ${c.cloudCount ?? 0} 条</b>
    </div>
    ${c.error ? `<p class="cloud-error">${esc(c.error)}</p>${c.errorDetail ? `<p class="cloud-detail">${esc(c.errorDetail)}</p>` : ''}` : ''}
    ${
      c.choice
        ? `<div class="cloud-choice">
            <strong>云端和本机都有记录</strong>
            云端 ${c.choice.cloudCount} 条（${esc(formatSyncTime(c.choice.cloudTime))}），本机 ${c.choice.localCount} 条。请选择保留哪一边，操作会覆盖另一边。
            <div class="cloud-actions">
              <button class="btn small" type="button" data-act="cloud-resolve-pull">从云端恢复</button>
              <button class="btn small" type="button" data-act="cloud-resolve-push">上传本机</button>
            </div>
          </div>`
        : ''
    }
    <div class="cloud-actions">
      ${
        c.choice
          ? `<button class="btn ghost small" type="button" data-act="cloud-logout">退出登录</button>`
          : `<button class="btn small" type="button" data-act="cloud-push" ${c.status === 'syncing' ? 'disabled' : ''}>立即同步</button>
             <button class="btn small" type="button" data-act="cloud-pull" ${c.status === 'syncing' ? 'disabled' : ''}>从云端恢复</button>
             <button class="btn ghost small" type="button" data-act="cloud-logout">退出登录</button>`
      }
    </div>
    ${
      !c.choice && c.status === 'synced' && c.localCount === 0 && c.cloudCount === 0
        ? '<p class="cloud-note">本机与云端都还没有记录，新增一条训练或饮食后会自动上传。</p>'
        : ''
    }
    ${
      !c.choice && c.localCount > 0 && c.cloudCount === 0 && c.status !== 'syncing'
        ? '<p class="cloud-note">本机有记录但云端为空，点「立即同步」上传。</p>'
        : ''
    }
    <p class="cloud-note">${
      c.status === 'choice'
        ? '选择后才会继续自动同步。'
        : '本机修改会自动上传；其他设备的改动可点「从云端恢复」取回。'
    }</p>`;
}

export function render(state, ctx) {
  const g = state.settings.goals;
  const theme = state.settings.theme;
  const workoutDays = new Set(state.workouts.map((w) => w.date)).size;
  const setCount = state.workouts.reduce((acc, w) => acc + (w.sets?.length || 0), 0);
  const mealCount = state.meals.length;
  const rec = state.settings.recommendation;
  const recMatch = Boolean(
    rec &&
      rec.result &&
      Number(g.kcal) === rec.result.targetKcal &&
      Number(g.protein) === rec.result.protein &&
      Number(g.carbs) === rec.result.carbs &&
      Number(g.fat) === rec.result.fat
  );
  const recDate = rec ? dateLabel(String(rec.computedAt).slice(0, 10)) : '';

  return `
    ${viewHead({ eyebrow: '偏好设置', title: '设置' })}

    <div class="set-grid">
      <article class="card">
        <div class="card-head">
          <div><h2>每日营养目标</h2><p class="muted">营养页与概览的完成度都按这里的目标计算</p></div>
        </div>

        <div class="rec-strip">
          <div class="rec-strip-main">
            <span class="rec-badge">${icon('sparkle', 11)}智能推荐</span>
            ${
              rec
                ? `<p><b>${goalLabel(rec.profile.goal)}</b> · 每周 ${rec.profile.sessions} 练 · ${rec.profile.height}cm / ${rec.profile.weight}kg · 推荐 <b>${fmt(rec.result.targetKcal)}</b> kcal</p>
                   <p class="tiny">蛋白 ${rec.result.protein}g · 碳水 ${rec.result.carbs}g · 脂肪 ${rec.result.fat}g · ${recDate}计算${recMatch ? '' : ' · 当前目标已手动调整'}</p>`
                : `<p>填写身体数据与训练频率，自动计算每日热量与三大营养素建议</p>
                   <p class="tiny">基于 Mifflin-St Jeor 公式与训练消耗估算</p>`
            }
          </div>
          <div class="rec-strip-actions">
            ${rec && !recMatch ? `<button class="btn ghost small" type="button" data-act="apply-last-rec">恢复推荐</button>` : ''}
            <button class="btn ${rec ? 'ghost' : 'primary'} small" type="button" data-act="open-recommend">${rec ? '重新计算' : '开始计算'}</button>
          </div>
        </div>

        <form data-form="goals" class="set-grid" novalidate>
          <div class="form-grid">
            <label class="field"><span>每日热量</span>
              <div class="unit-input"><input type="number" name="kcal" min="800" max="6000" step="50" value="${g.kcal}" required inputmode="numeric"><span>kcal</span></div>
            </label>
            <label class="field"><span>蛋白质</span>
              <div class="unit-input"><input type="number" name="protein" min="0" max="400" step="1" value="${g.protein}" required inputmode="numeric"><span>g</span></div>
            </label>
            <label class="field"><span>碳水</span>
              <div class="unit-input"><input type="number" name="carbs" min="0" max="800" step="1" value="${g.carbs}" required inputmode="numeric"><span>g</span></div>
            </label>
            <label class="field"><span>脂肪</span>
              <div class="unit-input"><input type="number" name="fat" min="0" max="300" step="1" value="${g.fat}" required inputmode="numeric"><span>g</span></div>
            </label>
          </div>
          <p class="form-note">参考区间：蛋白质 <b>1.6–2.2 g/kg</b> 体重，脂肪 <b>0.8–1 g/kg</b>，剩余热量分配给碳水。数值仅作记录参考。</p>
          <p class="goal-check" id="goal-check"></p>
          <div class="form-actions">
            <button class="btn ghost small" type="button" data-act="reset-goals">恢复默认</button>
            <button class="btn primary small" type="submit">${icon('check')}保存目标</button>
          </div>
        </form>
      </article>

      <article class="card" id="cloud-card">
        <div class="card-head">
          <div><h2>云端同步</h2><p class="muted">跨设备同步训练、饮食与目标，两种登录方式任选一种</p></div>
        </div>
        <div id="cloud-card-body">${cloudCardInner(ctx.cloud)}</div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>外观</h2><p class="muted">深色更适合训练场景，浅色适合白天查看</p></div></div>
        <div class="seg lime" role="radiogroup" aria-label="主题">
          <label><input type="radio" name="theme" value="dark" data-theme-opt ${theme === 'dark' ? 'checked' : ''}><span>深色</span></label>
          <label><input type="radio" name="theme" value="light" data-theme-opt ${theme === 'light' ? 'checked' : ''}><span>浅色</span></label>
          <label><input type="radio" name="theme" value="auto" data-theme-opt ${theme === 'auto' ? 'checked' : ''}><span>跟随系统</span></label>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>数据管理</h2><p class="muted">数据只保存在当前浏览器的 localStorage 中</p></div></div>
        <div class="data-stats">
          <div><strong>${workoutDays}</strong><span>训练天数</span></div>
          <div><strong>${setCount}</strong><span>训练组数</span></div>
          <div><strong>${mealCount}</strong><span>饮食记录</span></div>
        </div>

        <div class="storage-box" id="storage-box">
          <div class="sb-row">
            <span>存储保护</span>
            <b data-sb="persist">检测中…</b>
            <button class="link" type="button" data-act="persist-storage" hidden>开启</button>
          </div>
          <div class="sb-row">
            <span>本机占用</span>
            <b data-sb="usage">—</b>
            <span></span>
          </div>
          <div class="sb-row">
            <span>上次备份</span>
            <b data-sb="backup">—</b>
            <button class="link" type="button" data-act="export">立即备份</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="sr-main"><strong>导出备份</strong><span>生成 JSON 文件，换设备或清理浏览器前先备份</span></div>
          <button class="btn small" type="button" data-act="export">${icon('download')}导出</button>
        </div>
        <div class="setting-row">
          <div class="sr-main"><strong>导入备份</strong><span>从之前导出的 JSON 文件恢复，会覆盖当前数据</span></div>
          <button class="btn small" type="button" data-act="import">${icon('upload')}选择文件</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
        </div>
        ${
          ctx.safety
            ? `<div class="setting-row">
                <div class="sr-main"><strong>操作前备份</strong><span>${esc(ctx.safety.reason)} · ${esc(formatSyncTime(new Date(ctx.safety.at).toISOString()))}，可恢复到该时间点</span></div>
                <button class="btn small" type="button" data-act="restore-safety">${icon('refresh')}恢复</button>
              </div>`
            : ''
        }
        <div class="setting-row">
          <div class="sr-main"><strong>清空全部数据</strong><span>训练、饮食、身体数据与自定义内容全部删除，需输入文字确认</span></div>
          <button class="btn small danger" type="button" data-act="clear">${icon('trash')}清空</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>应用</h2><p class="muted">可安装到桌面 / 主屏幕，断网也能记录</p></div></div>
        <div class="setting-row">
          <div class="sr-main"><strong>安装到桌面</strong><span>添加到主屏幕后全屏运行，体验接近原生 App</span></div>
          <button class="btn small" type="button" data-act="install" id="install-settings">${icon('install')}安装</button>
        </div>
        <div class="setting-row">
          <div class="sr-main"><strong>网络状态</strong><span>离线时数据仍会写入本机，联网后无需同步</span></div>
          <span class="net" data-net><i></i><span>在线</span></span>
        </div>
        <div class="setting-row">
          <div class="sr-main"><strong>版本</strong><span>开健开吃 v1.7.1 · PWA · 离线缓存已启用</span></div>
          <button class="btn ghost small" type="button" data-act="refresh-sw">${icon('refresh')}检查更新</button>
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div><h2>关于</h2></div></div>
        <p class="about">
          <b>开健开吃</b>把每日训练与营养摄入记在同一处：训练记录动作、组数、重量、次数与日期；饮食记录食物与热量、蛋白质、碳水、脂肪，并与每日目标对比。<br>
          内置食物营养值为每 100g 常见参考值，仅供记录与自我管理使用，<b>不构成医疗或营养学建议</b>。如有特殊健康需求，请咨询专业人士。
        </p>
      </article>
    </div>
  `;
}
