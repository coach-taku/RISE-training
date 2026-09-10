/**
 * KUKI GYMRATS - 共通 Table API ラッパー
 * RESTful Table API (tables/{table}) を扱うための共通関数群
 */

const Api = (() => {
  const BASE = 'tables';

  async function list(table, { page = 1, limit = 100, search = '', sort = '' } = {}) {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    const res = await fetch(`${BASE}/${table}?${params.toString()}`);
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
    return res.json();
  }

  // ページングを気にせず全件取得（デモ規模なので limit を大きく取る）
  async function listAll(table, opts = {}) {
    const data = await list(table, { limit: 1000, ...opts });
    return data.data || [];
  }

  async function get(table, id) {
    const res = await fetch(`${BASE}/${table}/${id}`);
    if (!res.ok) throw new Error(`GET ${table}/${id} failed: ${res.status}`);
    return res.json();
  }

  async function create(table, data) {
    const res = await fetch(`${BASE}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`POST ${table} failed: ${res.status}`);
    return res.json();
  }

  async function update(table, id, data) {
    const res = await fetch(`${BASE}/${table}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`PATCH ${table}/${id} failed: ${res.status}`);
    return res.json();
  }

  async function remove(table, id) {
    const res = await fetch(`${BASE}/${table}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(`DELETE ${table}/${id} failed: ${res.status}`);
    return true;
  }

  function uuid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function todayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  return { list, listAll, get, create, update, remove, uuid, todayStr };
})();

// ===== ログイン中ユーザーの簡易管理（デモ用 localStorage） =====
const Session = (() => {
  const KEY = 'kuki_gymrats_current_user';

  function setUser(user) {
    localStorage.setItem(KEY, JSON.stringify(user));
  }

  function getUser() {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { setUser, getUser, clear };
})();
