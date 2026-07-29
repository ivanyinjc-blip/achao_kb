/* 阿超知识库 — 前端引擎
 * ============================
 * 三档加载:
 *   1. meta.json  (3 KB)        — 启动 fetch,拿到统计 + top-50
 *   2. index.json (~535 KB gz) — 启动 fetch,精简书目(无链接)
 *   3. books.json (~1 MB gz)   — 首次「下载」时 fetch,带链接的全量
 *
 * 状态:
 *   - 搜索/过滤/tag/bookshelf:全部基于 index(无网络)
 *   - 下载/批量下载:惰性加载 books.json,缓存到 window 全局
 */
(() => {
'use strict';

const DATA = 'data/';
const STORAGE_KEY = 'achaokb_bookshelf_v1';

const state = {
  meta: null,
  index: null,           // 24k × {i,t,a,c,d}
  books: null,           // 24k × {i,t,a,c,d,l,f} — lazy
  booksLoading: null,    // Promise (避免重复 fetch)
  query: '',
  activeTag: null,
  selected: new Set(),
  shelf: loadShelf(),
};

const $ = (id) => document.getElementById(id);
const els = {
  stats: $('stats'),
  searchInput: $('searchInput'),
  searchWrap: $('searchWrap'),
  searchClear: $('searchClear'),
  resultMeta: $('resultMeta'),
  tags: $('tags'),
  grid: $('grid'),
  fab: $('fab'),
  fabCount: $('fabCount'),
  fabDownload: $('fabDownload'),
  fabExport: $('fabExport'),
  fabClear: $('fabClear'),
  toast: $('toast'),
  randomPickBtn: $('randomPickBtn'),
  openBookshelfBtn: $('openBookshelfBtn'),
  bookshelfCount: $('bookshelfCount'),
  drawer: $('drawer'),
  drawerBg: $('drawerBg'),
  drawerClose: $('drawerClose'),
  drawerBody: $('drawerBody'),
  bulkDownloadBtn: $('bulkDownloadBtn'),
  bulkDownloadInfo: $('bulkDownloadInfo'),
};

// ---------- fetch helpers ----------
async function fetchJSON(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------- 启动 ----------
async function init() {
  try {
    const [meta, index] = await Promise.all([
      fetchJSON(DATA + 'meta.json'),
      fetchJSON(DATA + 'index.json'),
    ]);
    state.meta = meta;
    state.index = index;
    renderStats();
    renderTags();
    updateBookshelfCount();
    applyFilter();
    els.bulkDownloadInfo.textContent = `(${formatBytes(meta.total * 200)} 数据)`;
  } catch (e) {
    console.error(e);
    els.grid.innerHTML = `<div class="empty"><p class="empty-title">加载失败</p><p class="empty-sub">${escapeHtml(String(e.message))}</p></div>`;
  }
}

function renderStats() {
  const m = state.meta;
  if (!m) return;
  const authors = new Set();
  let fmt = 0;
  for (const b of state.index) { if (b.a) authors.add(b.a); }
  for (const c of m.top) fmt += c.count * 3; // 估算
  const cats = m.top.length + (m.other_count ? 1 : 0);

  els.stats.innerHTML = `
    <div class="stat"><div class="stat-num">${m.total.toLocaleString()}</div><div class="stat-label">总书目</div></div>
    <div class="stat"><div class="stat-num">${cats}</div><div class="stat-label">主分类</div></div>
    <div class="stat"><div class="stat-num">${authors.size.toLocaleString()}</div><div class="stat-label">作者</div></div>
    <div class="stat"><div class="stat-num">${fmt.toLocaleString()}+</div><div class="stat-label">格式覆盖</div></div>
  `;
}

function renderTags() {
  const m = state.meta;
  if (!m) return;
  let html = `<span class="tag ${state.activeTag === null ? 'active' : ''}" data-tag="">全部<span class="tag-count">${m.total}</span></span>`;
  for (const c of m.top) {
    html += `<span class="tag ${state.activeTag === c.name ? 'active' : ''}" data-tag="${escapeAttr(c.name)}">${escapeHtml(c.name)}<span class="tag-count">${c.count}</span></span>`;
  }
  if (m.other_count) {
    html += `<span class="tag ${state.activeTag === '其他' ? 'active' : ''}" data-tag="其他">其他<span class="tag-count">${m.other_count}</span></span>`;
  }
  els.tags.innerHTML = html;
  els.tags.querySelectorAll('.tag').forEach(el => {
    el.addEventListener('click', () => {
      state.activeTag = el.dataset.tag === '' ? null : el.dataset.tag;
      renderTags();
      applyFilter();
    });
  });
}

function applyFilter() {
  const q = state.query.trim().toLowerCase();
  const kws = q ? q.split(/\s+/) : [];
  const tag = state.activeTag;
  const idx = state.index;
  const filtered = [];

  for (let i = 0; i < idx.length; i++) {
    const b = idx[i];
    if (tag && b.c !== tag) continue;
    if (kws.length === 0) { filtered.push({ idx: i, b, matched: null }); continue; }
    const hay = (b.t + ' ' + b.a + ' ' + b.c + ' ' + b.d).toLowerCase();
    let matched = null, ok = true;
    for (const k of kws) {
      if (!k) continue;
      const p = hay.indexOf(k);
      if (p === -1) { ok = false; break; }
      if (matched === null) matched = { k, idx: p };
    }
    if (ok) filtered.push({ idx: i, b, matched });
  }

  renderGrid(filtered);
  els.resultMeta.textContent = filtered.length === state.index.length
    ? `${state.index.length.toLocaleString()} 本`
    : `${filtered.length.toLocaleString()} / ${state.index.length.toLocaleString()} 本`;
}

function renderGrid(items) {
  if (items.length === 0) {
    els.grid.innerHTML = `<div class="empty"><p class="empty-title">没有匹配的书</p><p class="empty-sub">试试别的关键词,或换一个分类标签</p></div>`;
    return;
  }
  const MAX = 500;
  const slice = items.slice(0, MAX);
  const frag = document.createDocumentFragment();

  for (const { idx, b, matched } of slice) {
    const card = document.createElement('div');
    card.className = 'card' + (state.selected.has(idx) ? ' selected' : '');

    const titleHtml = matched ? highlight(b.t, matched.k) : escapeHtml(b.t);
    const authorHtml = b.a ? (matched ? highlight(b.a, matched.k) : escapeHtml(b.a)) : '<span style="opacity:.4">佚名</span>';

    card.innerHTML = `
      <div class="card-head">
        <input type="checkbox" class="card-check" ${state.selected.has(idx) ? 'checked' : ''} aria-label="选中">
        <div class="card-body">
          <p class="card-title">${titleHtml}</p>
          <p class="card-author">${authorHtml}</p>
          <p class="card-desc">${escapeHtml(b.d)}</p>
          <div class="card-foot">
            <span class="card-tag">${escapeHtml(b.c)}</span>
            <span class="card-formats"><span class="fmt">epub</span><span class="fmt">mobi</span><span class="fmt">azw3</span></span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary" data-act="download">下载 →</button>
            <button class="btn btn-bookshelf ${state.shelf[idx] ? 'on' : ''}" data-act="shelf">${state.shelf[idx] ? '★ 已收藏' : '☆ 收藏'}</button>
          </div>
        </div>
      </div>
    `;

    card.querySelector('.card-check').addEventListener('change', e => {
      if (e.target.checked) state.selected.add(idx); else state.selected.delete(idx);
      card.classList.toggle('selected', e.target.checked);
      updateFab();
    });

    card.querySelector('[data-act="download"]').addEventListener('click', () => downloadOne(idx));
    card.querySelector('[data-act="shelf"]').addEventListener('click', e => {
      state.shelf[idx] = !state.shelf[idx];
      if (!state.shelf[idx]) delete state.shelf[idx];
      saveShelf();
      const btn = e.currentTarget;
      btn.classList.toggle('on', !!state.shelf[idx]);
      btn.textContent = state.shelf[idx] ? '★ 已收藏' : '☆ 收藏';
      updateBookshelfCount();
      toast(state.shelf[idx] ? '已加入收藏夹' : '已移出收藏夹');
    });

    frag.appendChild(card);
  }
  els.grid.innerHTML = '';
  els.grid.appendChild(frag);

  if (items.length > MAX) {
    const more = document.createElement('div');
    more.className = 'empty';
    more.innerHTML = `<p class="empty-sub">仅显示前 ${MAX} 条 — 请缩小搜索范围以查看更多</p>`;
    els.grid.appendChild(more);
  }
}

// ---------- 下载 (惰性加载 books.json) ----------
async function ensureBooks() {
  if (state.books) return state.books;
  if (state.booksLoading) return state.booksLoading;
  state.booksLoading = (async () => {
    toast('首次下载,正在加载完整链接 (~1 MB)…');
    const data = await fetchJSON(DATA + 'books.json');
    state.books = data;
    return data;
  })();
  return state.booksLoading;
}

async function downloadOne(idx) {
  try {
    const books = await ensureBooks();
    const b = books[idx];
    if (!b || !b.l) { toast('链接缺失'); return; }
    window.open(b.l, '_blank', 'noopener');
  } catch (e) {
    toast('加载失败:' + e.message);
  }
}

// ---------- FAB ----------
function updateFab() {
  const n = state.selected.size;
  els.fabCount.textContent = n;
  els.fab.classList.toggle('show', n > 0);
}

els.fabDownload.addEventListener('click', async () => {
  const ids = [...state.selected];
  if (ids.length === 0) return;
  try {
    const books = await ensureBooks();
    toast(`将打开 ${ids.length} 个新标签 — 在网盘页点「普通下载」`);
    ids.forEach((id, i) => {
      const b = books[id];
      if (b && b.l) setTimeout(() => window.open(b.l, '_blank', 'noopener'), i * 250);
    });
  } catch (e) { toast('加载失败'); }
});

els.fabExport.addEventListener('click', async () => {
  const ids = [...state.selected];
  if (ids.length === 0) return;
  try {
    const books = await ensureBooks();
    const lines = ['﻿书名\t作者\t分类\t链接'];
    ids.forEach(id => { const b = books[id]; if (b) lines.push(`${b.t}\t${b.a}\t${b.c}\t${b.l}`); });
    downloadBlob(lines.join('\n'), `achaokb-${ids.length}-${Date.now()}.txt`, 'text/plain;charset=utf-8');
    toast(`已导出 ${ids.length} 条链接`);
  } catch (e) { toast('加载失败'); }
});

els.fabClear.addEventListener('click', () => {
  state.selected.clear();
  applyFilter();
  updateFab();
});

// ---------- 完整数据包下载 ----------
els.bulkDownloadBtn.addEventListener('click', () => {
  const choice = prompt(
    '选择下载格式:\n' +
    '  1 — JSON (gzip, ~900 KB) - 适合任何脚本\n' +
    '  2 — CSV (~3.5 MB)         - 适合 Excel / pandas / SQLite\n' +
    '  3 — JSON 原始 (~4.5 MB)   - 适合直接阅读\n\n' +
    '输入 1 / 2 / 3:'
  );
  const map = { '1': 'books.json.gz', '2': 'books.csv', '3': 'books.json' };
  const file = map[choice];
  if (!file) { toast('已取消'); return; }
  const a = document.createElement('a');
  a.href = DATA + file;
  a.download = 'achao-knowledge-base-' + file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(`开始下载 ${file}`);
});

// ---------- 搜索 ----------
els.searchInput.addEventListener('input', e => {
  state.query = e.target.value;
  els.searchWrap.classList.toggle('has-query', !!state.query);
  applyFilter();
});
els.searchClear.addEventListener('click', () => {
  els.searchInput.value = '';
  state.query = '';
  els.searchWrap.classList.remove('has-query');
  applyFilter();
  els.searchInput.focus();
});

// ---------- 随机 ----------
els.randomPickBtn.addEventListener('click', () => {
  const n = state.index.length;
  if (!n) return;
  const idx = Math.floor(Math.random() * n);
  const b = state.index[idx];
  state.query = b.t;
  state.activeTag = null;
  els.searchInput.value = b.t;
  els.searchWrap.classList.add('has-query');
  renderTags();
  applyFilter();
  toast(`随机: 《${b.t}》 · ${b.a || '佚名'}`);
});

// ---------- 收藏夹 ----------
function loadShelf() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } }
function saveShelf() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.shelf)); }
function updateBookshelfCount() { els.bookshelfCount.textContent = Object.keys(state.shelf).length; }

function openBookshelf() { renderBookshelf(); els.drawer.classList.add('show'); els.drawerBg.classList.add('show'); }
function closeBookshelf() { els.drawer.classList.remove('show'); els.drawerBg.classList.remove('show'); }
els.openBookshelfBtn.addEventListener('click', openBookshelf);
els.drawerClose.addEventListener('click', closeBookshelf);
els.drawerBg.addEventListener('click', closeBookshelf);

function renderBookshelf() {
  const keys = Object.keys(state.shelf).filter(k => state.shelf[k]);
  if (keys.length === 0) {
    els.drawerBody.innerHTML = '<div class="shelf-empty">收藏夹是空的<br><br>在任何书卡片上点 <b>☆ 收藏</b> 即可加入</div>';
    return;
  }
  let html = `<div class="drawer-section"><h4>共 ${keys.length} 本</h4><div class="drawer-section">`;
  keys.forEach(idx => {
    const b = state.index[+idx];
    if (!b) return;
    html += `
      <div class="shelf-item">
        <div class="shelf-item-title">
          <div>${escapeHtml(b.t)}</div>
          <div style="font-size:11px;color:var(--fg-faint);margin-top:2px">${escapeHtml(b.a || '佚名')} · ${escapeHtml(b.c)}</div>
        </div>
        <button class="btn btn-primary" data-dl="${idx}" style="font-size:11px;padding:4px 8px">下载</button>
        <button class="shelf-item-remove" data-rm="${idx}" aria-label="移除">×</button>
      </div>
    `;
  });
  html += '</div></div>';
  els.drawerBody.innerHTML = html;
  els.drawerBody.querySelectorAll('[data-dl]').forEach(btn =>
    btn.addEventListener('click', () => downloadOne(+btn.dataset.dl))
  );
  els.drawerBody.querySelectorAll('[data-rm]').forEach(btn =>
    btn.addEventListener('click', () => {
      delete state.shelf[btn.dataset.rm];
      saveShelf(); updateBookshelfCount(); renderBookshelf(); applyFilter();
    })
  );
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

// ---------- Utils ----------
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function escapeAttr(s) { return escapeHtml(s); }
function highlight(text, kw) {
  if (!kw) return escapeHtml(text);
  const lower = text.toLowerCase();
  const k = kw.toLowerCase();
  let i = lower.indexOf(k), out = [], cursor = 0;
  while (i !== -1) {
    out.push(escapeHtml(text.slice(cursor, i)));
    out.push('<mark>' + escapeHtml(text.slice(i, i + kw.length)) + '</mark>');
    cursor = i + kw.length;
    i = lower.indexOf(k, cursor);
  }
  out.push(escapeHtml(text.slice(cursor)));
  return out.join('');
}
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

init();
})();
