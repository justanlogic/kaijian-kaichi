/* 云服务：WorkBuddy 账号登录 + 按用户隔离的整包同步（本机优先，可离线） */

import { get, actions, subscribe, normalizeState } from './store.js';
import { CLOUD_CONFIG } from './cloud-config.js';

const META_KEY = 'kjkc.cloud.meta.v1';

const state = {
  available: false,
  loading: true,
  user: null,
  status: 'checking', // checking | idle | syncing | synced | choice | error | offline | unavailable
  error: '',
  errorDetail: '',
  provider: '',
  lastSyncedAt: null,
  cloudCount: 0,
  localCount: 0,
  choice: null,
};

let client = null;
let started = false;
let bootstrapping = false;
let applyingRemote = false;
let pushTimer = null;
let onChange = () => {};
let onNotice = () => {};

function countRecords(source) {
  return (source?.workouts?.length || 0) + (source?.meals?.length || 0);
}

function setState(patch) {
  Object.assign(state, patch);
  try {
    onChange();
  } catch (err) {
    console.warn('[开健开吃] 云同步界面刷新失败', err);
  }
}

function loadMeta() {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveMeta(patch) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...loadMeta(), ...patch }));
  } catch (err) {
    console.warn('[开健开吃] 同步状态保存失败', err);
  }
}

function toIso(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
}

function errorDetailOf(error) {
  const parts = [error?.message, error?.code, error?.details, error?.hint].filter(Boolean);
  return parts.join(' · ').slice(0, 240);
}

function friendlyError(error) {
  if (!navigator.onLine) return '网络不可用，联网后会自动重试';
  const message = String(error?.message || '');
  if (/42P01/.test(message) || error?.code === '42P01') return '云端数据表尚未就绪';
  if (/42501/.test(message) || error?.code === '42501') return '没有云端访问权限，请重新登录';
  if (/401|session|token|jwt/i.test(message)) return '登录已失效，请重新登录';
  return '同步失败，请稍后重试';
}

function clearAuthParams() {
  const url = new URL(location.href);
  ['code', 'state', 'provider', 'error', 'error_description'].forEach((key) => url.searchParams.delete(key));
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function waitForSdk(timeout = 8000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (window.WorkBuddyCloud && typeof window.WorkBuddyCloud.createWorkBuddyCloud === 'function') {
      return window.WorkBuddyCloud;
    }
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
  return null;
}

export function getCloudState() {
  return {
    available: state.available,
    loading: state.loading,
    user: state.user ? { name: state.user.name || '已登录用户' } : null,
    status: state.status,
    error: state.error,
    errorDetail: state.errorDetail,
    provider: state.provider,
    lastSyncedAt: state.lastSyncedAt,
    cloudCount: state.cloudCount,
    localCount: state.localCount,
    choice: state.choice
      ? {
          cloudCount: state.choice.cloudCount,
          localCount: state.choice.localCount,
          cloudTime: state.choice.cloudTime,
        }
      : null,
  };
}

export async function initCloud(options = {}) {
  onChange = options.onChange || (() => {});
  onNotice = options.onNotice || (() => {});
  if (started) return;
  started = true;

  const meta = loadMeta();
  state.lastSyncedAt = meta.lastSyncedAt || null;

  const sdk = await waitForSdk();
  if (!sdk) {
    setState({
      available: false,
      loading: false,
      status: 'unavailable',
      error: '云服务组件未能加载，登录暂不可用；本机记录不受影响',
    });
    return;
  }

  try {
    client = sdk.createWorkBuddyCloud({
      endpoint: CLOUD_CONFIG.endpoint,
      oauthRelayBaseUrl: CLOUD_CONFIG.oauthRelayBaseUrl,
      publishableKey: CLOUD_CONFIG.publishableKey,
    });
  } catch (err) {
    console.warn('[开健开吃] 云服务初始化失败：' + (err?.message || 'unknown'));
    setState({ available: false, loading: false, status: 'unavailable', error: '云服务初始化失败' });
    return;
  }

  setState({ available: true, loading: true });

  // OAuth 回调必须在页面路由与渲染之前处理；按 provider 分派到各自的处理器
  const url = new URL(location.href);
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    const provider = url.searchParams.get('provider');
    const handler =
      provider === 'workbuddy'
        ? client.auth.handleWorkBuddyCallback
        : provider === 'wechat'
          ? client.auth.handleWechatWebCallback
          : null;

    if (!provider || (provider !== 'workbuddy' && provider !== 'wechat')) {
      setState({ error: '授权回调缺少有效的登录方式，请重新登录', errorDetail: '' });
    } else if (typeof handler !== 'function') {
      setState({ error: '当前组件暂不支持该登录方式，请重试', errorDetail: '' });
    } else {
      try {
        const { data: session, error } = await handler.call(client.auth);
        if (error) {
          setState({
            error: provider === 'wechat' ? '微信登录未完成，请重试' : '登录未完成，请重试',
            errorDetail: errorDetailOf(error),
          });
        } else if (session) {
          setState({ error: '', errorDetail: '', provider });
          saveMeta({ lastProvider: provider });
        }
      } catch (err) {
        console.warn('[开健开吃] 登录回调处理失败：' + (err?.message || 'unknown'));
        setState({
          error: provider === 'wechat' ? '微信登录失败，请重试' : '登录失败，请重试',
          errorDetail: errorDetailOf(err),
        });
      }
    }
    clearAuthParams();
  }

  try {
    const { data: session } = await client.auth.getSession();
    if (session) {
      setState({
        loading: false,
        user: session.user,
        status: 'syncing',
        provider: state.provider || loadMeta().lastProvider || '',
      });
      await bootstrap();
    } else {
      setState({ loading: false, user: null, status: 'idle' });
    }
  } catch (err) {
    console.warn('[开健开吃] 登录状态读取失败：' + (err?.message || 'unknown'));
    setState({ loading: false, status: 'idle' });
  }

  if (typeof client.auth.onAuthStateChange === 'function') {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setState({ user: null, status: 'idle', choice: null, error: '', cloudCount: 0 });
        return;
      }
      if (!session) return;
      const wasSignedIn = Boolean(state.user);
      setState({ user: session.user, loading: false });
      if (event === 'SIGNED_IN' && !wasSignedIn) bootstrap();
    });
  }

  subscribe(() => {
    if (!client || !state.user || applyingRemote || bootstrapping) return;
    if (state.status === 'choice') return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushLocal({ silent: true });
    }, 1600);
  });

  window.addEventListener('online', () => {
    if (state.user && ['offline', 'error', 'pending'].includes(state.status)) {
      setState({ status: 'pending' });
      pushLocal({ silent: true });
    }
  });
}

function applyRemote(row) {
  const remote = normalizeState(row.data);
  applyingRemote = true;
  try {
    actions.replaceAll(remote);
  } finally {
    applyingRemote = false;
  }
  const syncedAt = toIso(row.updated_at);
  saveMeta({ lastSyncedAt: syncedAt, lastPushedAt: get().updatedAt });
  setState({
    status: 'synced',
    lastSyncedAt: syncedAt,
    choice: null,
    error: '',
    cloudCount: countRecords(remote),
    localCount: countRecords(get()),
  });
  onNotice('已从云端恢复');
}

async function bootstrap() {
  if (!client || !state.user || bootstrapping) return;
  bootstrapping = true;
  setState({ status: 'syncing', error: '', errorDetail: '', choice: null });
  try {
    const { data: row, error } = await client.database
      .from('app_states')
      .select('data, client_updated_at, updated_at')
      .maybeSingle();
    if (error) throw error;

    const local = get();
    const localCount = countRecords(local);

    if (!row) {
      if (localCount > 0) {
        await pushLocal({ silent: true, skipStatus: true });
      } else {
        setState({ status: 'synced', cloudCount: 0, localCount: 0, choice: null });
      }
      return;
    }

    if (!row.data || !Array.isArray(row.data.workouts) || !Array.isArray(row.data.meals)) {
      throw new Error('invalid remote state');
    }

    const remote = normalizeState(row.data);
    const cloudCount = countRecords(remote);
    const meta = loadMeta();
    const localUpdated = Date.parse(local.updatedAt || '') || 0;
    const lastPushed = Date.parse(meta.lastPushedAt || '') || 0;
    const lastSynced = Date.parse(meta.lastSyncedAt || '') || 0;
    const cloudUpdated = Date.parse(row.updated_at || '') || 0;
    const localChanged = lastPushed ? localUpdated > lastPushed + 1000 : localCount > 0;
    const cloudChanged = lastSynced ? cloudUpdated > lastSynced + 1000 : cloudCount > 0;
    const syncedAt = toIso(row.updated_at);

    if (cloudCount === 0 && localCount === 0) {
      saveMeta({ lastSyncedAt: syncedAt, lastPushedAt: local.updatedAt });
      setState({ status: 'synced', lastSyncedAt: syncedAt, cloudCount: 0, localCount: 0, choice: null });
      return;
    }
    if (cloudCount === 0) {
      await pushLocal({ silent: true, skipStatus: true });
      return;
    }
    if (localCount === 0) {
      applyRemote(row);
      return;
    }
    if (!localChanged && cloudChanged) {
      applyRemote(row);
      return;
    }
    if (localChanged && !cloudChanged) {
      await pushLocal({ silent: true, skipStatus: true });
      return;
    }
    if (!localChanged && !cloudChanged) {
      saveMeta({ lastSyncedAt: syncedAt, lastPushedAt: local.updatedAt });
      setState({
        status: 'synced',
        lastSyncedAt: syncedAt,
        cloudCount,
        localCount,
        choice: null,
      });
      return;
    }

    setState({
      status: 'choice',
      choice: { row, cloudCount, localCount, cloudTime: syncedAt },
      cloudCount,
      localCount,
    });
  } catch (err) {
    console.warn('[开健开吃] 云端同步失败：' + (err?.message || 'unknown'));
    setState({ status: navigator.onLine ? 'error' : 'offline', error: friendlyError(err), errorDetail: errorDetailOf(err) });
  } finally {
    bootstrapping = false;
  }
}

export async function pushLocal(options = {}) {
  if (!client || !state.user) return false;
  clearTimeout(pushTimer);
  if (!options.skipStatus) setState({ status: 'syncing', error: '' });

  const local = get();
  const payload = {
    data: local,
    client_updated_at: local.updatedAt || new Date().toISOString(),
  };

  try {
    const { data: existing, error: selectError } = await client.database
      .from('app_states')
      .select('owner_id')
      .maybeSingle();
    if (selectError) throw selectError;

    let saved = null;
    if (existing) {
      const { data, error } = await client.database
        .from('app_states')
        .update(payload)
        .eq('owner_id', existing.owner_id)
        .select('updated_at');
      if (error) throw error;
      if (!data || !data.length) throw new Error('cloud write rejected');
      saved = data[0];
    } else {
      const { data, error } = await client.database
        .from('app_states')
        .insert(payload)
        .select('updated_at');
      if (error) throw error;
      if (!data || !data.length) throw new Error('cloud write rejected');
      saved = data[0];
    }

    const syncedAt = toIso(saved?.updated_at);
    saveMeta({ lastSyncedAt: syncedAt, lastPushedAt: local.updatedAt });
    setState({
      status: 'synced',
      lastSyncedAt: syncedAt,
      error: '',
      errorDetail: '',
      choice: null,
      cloudCount: countRecords(local),
      localCount: countRecords(local),
    });
    if (!options.silent) onNotice('已上传到云端');
    return true;
  } catch (err) {
    console.warn('[开健开吃] 云端上传失败：' + (err?.message || 'unknown'));
    setState({ status: navigator.onLine ? 'error' : 'offline', error: friendlyError(err), errorDetail: errorDetailOf(err) });
    return false;
  }
}

export async function pullCloud() {
  if (!client || !state.user) return;
  setState({ status: 'syncing', error: '', errorDetail: '' });
  try {
    const { data: row, error } = await client.database
      .from('app_states')
      .select('data, client_updated_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      setState({ status: 'synced', choice: null });
      onNotice('云端还没有数据');
      return;
    }
    if (!row.data || !Array.isArray(row.data.workouts) || !Array.isArray(row.data.meals)) {
      throw new Error('invalid remote state');
    }
    applyRemote(row);
  } catch (err) {
    console.warn('[开健开吃] 云端恢复失败：' + (err?.message || 'unknown'));
    setState({ status: navigator.onLine ? 'error' : 'offline', error: friendlyError(err), errorDetail: errorDetailOf(err) });
  }
}

export function resolveChoice(which) {
  if (!state.choice) return;
  if (which === 'pull') applyRemote(state.choice.row);
  else pushLocal();
}

export async function signIn(provider = 'workbuddy') {
  if (!client) {
    onNotice('云服务尚未就绪');
    return;
  }
  setState({ error: '', errorDetail: '' });
  try {
    const back = new URL(location.href);
    back.pathname = '/';
    ['code', 'state', 'provider', 'error', 'error_description'].forEach((key) =>
      back.searchParams.delete(key)
    );
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      redirectTo: back.toString(),
    });
    if (error) {
      const message = String(error.message || '');
      if (provider === 'wechat' && /未打开|未开启|not enabled|disabled/i.test(message)) {
        setState({
          status: 'error',
          error: '微信登录尚未开启，请先用 WorkBuddy 登录',
          errorDetail: message,
        });
        return;
      }
      throw error;
    }
    if (!data?.url) throw new Error('missing oauth url');
    saveMeta({ lastProvider: provider });
    location.assign(data.url);
  } catch (err) {
    console.warn('[开健开吃] 登录发起失败：' + (err?.message || 'unknown'));
    setState({
      status: 'error',
      error: '登录失败：' + (err?.message || '请稍后重试'),
      errorDetail: errorDetailOf(err),
    });
  }
}

export async function signOut() {
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch (err) {
    console.warn('[开健开吃] 退出登录失败：' + (err?.message || 'unknown'));
  }
  saveMeta({ lastProvider: '' });
  setState({
    user: null,
    status: 'idle',
    choice: null,
    provider: '',
    error: '',
    lastSyncedAt: loadMeta().lastSyncedAt || null,
    cloudCount: 0,
    localCount: countRecords(get()),
  });
  onNotice('已退出登录，本机数据仍保留');
}
