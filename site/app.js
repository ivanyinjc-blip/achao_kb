/* 阿超知识库 — 前端引擎 v2
 * ============================
 * Layout: 左侧目录栏 + 主区(顶栏 + 免责横幅 + 统计 + 搜索 + 卡片网格)
 * 加载: meta.json + index.json 一次拉完;books.json 惰性下载时拉
 * 本地: 上传的书存 localStorage,合并进内存索引;localStorage 累积点击 → 个人热榜
 */
(() => {
'use strict';

const DATA = 'data/';
const LS_KEYS = {
  shelf:    'achaokb_bookshelf_v1',
  uploads:  'achaokb_uploads_v1',
  clicks:   'achaokb_clicks_v1',
  hidden:   'achaokb_disclaimer_hidden_v1',
};

const state = {
  meta: null,
  index: [],          // [{i,t,a,c,d,p,y,lang,g}, ...] (本地 + 远端合并)
  remoteIndex: [],    // 远端 books 索引,远程 id >= 0
  localIndex: [],     // 本地上传,本地 id = -1, -2, ...
  remoteBooks: null,  // 完整链接 (惰性)
  remoteBooksLoading: null,
  query: '',
  filters: { type: 'all', group: null, sub: null },  // type: all|local|shelf, group/sub: 一级/二级
  selected: new Set(),
  shelf: loadLS(LS_KEYS.shelf, {}),
  uploads: loadLS(LS_KEYS.uploads, []),
  clicks: loadLS(LS_KEYS.clicks, {}),
};

const $ = (id) => document.getElementById(id);
const els = {
  stats: $('stats'),
  searchInput: $('searchInput'),
  searchWrap: $('searchWrap'),
  searchClear: $('searchClear'),
  resultMeta: $('resultMeta'),
  activeFilterChips: $('activeFilterChips'),
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
  drawerBody: $('drawerBody'),
  uploadDrawer: $('uploadDrawer'),
  disclaimerDrawer: $('disclaimerDrawer'),
  bulkDownloadBtn: $('bulkDownloadBtn'),
  taxonomy: $('taxonomy'),
  hotList: $('hotList'),
  navAll: $('navAll'),
  navAllCount: $('navAllCount'),
  navLocal: $('navLocal'),
  navLocalCount: $('navLocalCount'),
  navShelf: $('navShelf'),
  navShelfCount: $('navShelfCount'),
  disclaimer: $('disclaimer'),
  disclaimerClose: $('disclaimerClose'),
  openDisclaimerBtn: $('openDisclaimerBtn'),
  openDisclaimerBtn2: $('openDisclaimerBtn2'),
  openUploadBtn: $('openUploadBtn'),
  toggleSidebarBtn: $('toggleSidebarBtn'),
  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebarOverlay'),
  uploadForm: $('uploadForm'),
  upTitle: $('upTitle'),
  upAuthor: $('upAuthor'),
  upGroup: $('upGroup'),
  upDesc: $('upDesc'),
  upDrop: $('upDrop'),
  upFile: $('upFile'),
  upFileInfo: $('upFileInfo'),
  uploadList: $('uploadList'),
};

// ---------- fetch ----------
async function fetchJSON(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------- LS helpers ----------
function loadLS(key, def) { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } }
function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---------- 启动 ----------
async function init() {
  try {
    const [meta, index] = await Promise.all([
      fetchJSON(DATA + 'meta.json'),
      fetchJSON(DATA + 'index.json'),
    ]);
    state.meta = meta;
    state.remoteIndex = index;
    rebuildMergedIndex();
    renderTaxonomy();
    renderHot();
    renderStats();
    populateUploadGroups();
    updateCounts();
    if (loadLS(LS_KEYS.hidden, false)) els.disclaimer.classList.add('hidden');
    applyFilter();
    setupUploader();
  } catch (e) {
    console.error(e);
    els.grid.innerHTML = `<div class="empty"><p class="empty-title">加载失败</p><p class="empty-sub">${escapeHtml(String(e.message))}</p></div>`;
  }
}

function rebuildMergedIndex() {
  // 远端 local(从 index.json 来的负 id,有 GitHub URL) — 标 local,绑定 l
  for (const b of state.remoteIndex) {
    if (b.i < 0) {
      b.local = true;
      b._remoteUrl = b.l || '';
    }
  }
  // 本地 upload(localStorage 里的) — id 用 -(len + i + 1) 避免和远端负 id 冲突
  const remoteNegCount = state.remoteIndex.filter(b => b.i < 0).length;
  state.localIndex = state.uploads.map((u, i) => ({
    i: -(remoteNegCount + i + 1), t: u.t, a: u.a || '', c: u.c || '',
    d: u.d || '本地上传', p: u.p || '—', y: u.y || '—',
    lang: u.lang || '—', g: u.g || '其他细分',
    l: '', f: u.f ? [u.f] : [], local: true, _uploadId: u.id,
  }));
  state.index = state.remoteIndex.concat(state.localIndex);
}

// ---------- 侧边栏: 分类目录 ----------
function renderTaxonomy() {
  const tx = state.meta.taxonomy;
  let html = '';
  for (const g of tx) {
    const isOpen = state.filters.group === g.name;
    html += `<div class="nav-group ${isOpen ? 'open' : ''}" data-group="${escapeAttr(g.name)}">
      <div class="nav-group-head ${state.filters.group === g.name ? 'active' : ''}" data-toggle-group="${escapeAttr(g.name)}">
        <span>${g.icon} ${escapeHtml(g.name)}</span>
        <span style="display:flex;align-items:center;gap:6px"><span class="nav-item-count">${g.count}</span><span class="nav-group-arrow">▶</span></span>
      </div>
      <div class="nav-group-children">
        <div class="nav-item" data-sub="__all__" data-group="${escapeAttr(g.name)}">
          <span>全部 ${escapeHtml(g.name)}</span><span class="nav-item-count">${g.count}</span>
        </div>
        ${g.subs.map(s => `<div class="nav-item" data-sub="${escapeAttr(s.name)}" data-group="${escapeAttr(g.name)}"><span>${escapeHtml(s.name)}</span><span class="nav-item-count">${s.count}</span></div>`).join('')}
      </div>
    </div>`;
  }
  els.taxonomy.innerHTML = html;
  els.taxonomy.querySelectorAll('[data-toggle-group]').forEach(el => {
    el.addEventListener('click', () => {
      const name = el.dataset.toggleGroup;
      if (state.filters.group === name) {
        state.filters.group = null; state.filters.sub = null;
      } else {
        state.filters.group = name;
      }
      renderTaxonomy(); applyFilter();
    });
  });
  els.taxonomy.querySelectorAll('[data-sub]').forEach(el => {
    el.addEventListener('click', () => {
      const g = el.dataset.group, s = el.dataset.sub;
      state.filters.group = g;
      state.filters.sub = (s === '__all__') ? null : s;
      renderTaxonomy(); applyFilter();
    });
  });
}

// ---------- 侧边栏: 热门 ----------
function renderHot() {
  // 合并: 远端 top-50 + 用户本地点击累积 top-10
  const remote = state.meta.popular || [];
  const userTop = Object.entries(state.clicks)
    .map(([k, n]) => ({ i: parseInt(k), n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .filter(x => x.n > 0)
    .map(x => {
      const b = state.index[x.i];
      if (!b) return null;
      return { i: x.i, t: b.t, a: b.a, c: b.c, _userClicks: x.n, local: b.local };
    })
    .filter(Boolean);

  let html = '';
  remote.slice(0, 10).forEach((b, idx) => {
    html += `<div class="hot-item" data-hot-i="${b.i}">
      <span class="hot-rank ${idx < 3 ? 'top' : ''}">${idx + 1}</span>
      <span class="hot-text">
        <span class="hot-title">${escapeHtml(b.t)}</span>
        <span class="hot-meta">${escapeHtml(b.a || '佚名')} · ${escapeHtml(b.c)}</span>
      </span>
    </div>`;
  });
  if (userTop.length > 0) {
    html += `<div style="font-size:10px;color:var(--fg-faint);padding:6px 10px 2px;letter-spacing:.04em">📊 你常翻的</div>`;
    userTop.forEach((b, idx) => {
      html += `<div class="hot-item" data-hot-i="${b.i}">
        <span class="hot-rank">${b._userClicks}</span>
        <span class="hot-text">
          <span class="hot-title">${escapeHtml(b.t)}</span>
          <span class="hot-meta">${escapeHtml(b.a || '佚名')} · ${escapeHtml(b.c)}</span>
        </span>
      </div>`;
    });
  }
  els.hotList.innerHTML = html;
  els.hotList.querySelectorAll('[data-hot-i]').forEach(el => {
    el.addEventListener('click', () => {
      const i = parseInt(el.dataset.hotI);
      const b = state.index[i];
      if (b) {
        state.query = b.t;
        els.searchInput.value = b.t;
        els.searchWrap.classList.add('has-query');
        applyFilter();
        toast(`跳到《${b.t}》${b.local ? ' · 本地' : ''}`);
      }
    });
  });
}

// ---------- 统计 ----------
function renderStats() {
  const m = state.meta;
  const authors = new Set();
  const remoteLocalCount = state.remoteIndex.filter(b => b.local).length;
  for (const b of state.remoteIndex) if (b.a) authors.add(b.a);
  els.stats.innerHTML = `
    <div class="stat"><div class="stat-num">${state.index.length.toLocaleString()}</div><div class="stat-label">总书目</div></div>
    <div class="stat"><div class="stat-num">${m.taxonomy.filter(g => !g.is_long_tail).length}</div><div class="stat-label">一级目录</div></div>
    <div class="stat"><div class="stat-num">${m.categories.toLocaleString()}</div><div class="stat-label">细分标签</div></div>
    <div class="stat"><div class="stat-num">${authors.size.toLocaleString()}</div><div class="stat-label">作者</div></div>
    <div class="stat"><div class="stat-num">${remoteLocalCount + state.localIndex.length}</div><div class="stat-label">本地上传</div></div>
  `;
}

function updateCounts() {
  const remoteLocal = state.remoteIndex.filter(b => b.local).length;
  const totalLocal = remoteLocal + state.localIndex.length;
  els.navAllCount.textContent = state.index.length.toLocaleString();
  els.navLocalCount.textContent = totalLocal;
  els.navShelfCount.textContent = Object.keys(state.shelf).filter(k => state.shelf[k]).length;
  els.bookshelfCount.textContent = els.navShelfCount.textContent;
  // nav active
  const setActive = (id, on) => els[id].classList.toggle('active', on);
  setActive('navAll', state.filters.type === 'all');
  setActive('navLocal', state.filters.type === 'local');
  setActive('navShelf', state.filters.type === 'shelf');
}

// ---------- 过滤 ----------
function applyFilter() {
  const q = state.query.trim().toLowerCase();
  const kws = q ? q.split(/\s+/) : [];
  const { type, group, sub } = state.filters;
  const idx = state.index;
  const filtered = [];

  for (let i = 0; i < idx.length; i++) {
    const b = idx[i];
    if (type === 'local' && !b.local) continue;
    if (type === 'shelf' && !state.shelf[b.i]) continue;
    if (group && b.g !== group) continue;
    if (sub && b.c !== sub) continue;
    if (kws.length === 0) { filtered.push({ idx: i, b, matched: null }); continue; }
    const hay = (b.t + ' ' + b.a + ' ' + b.c + ' ' + b.d + ' ' + b.g).toLowerCase();
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
  const total = state.index.length;
  els.resultMeta.textContent = filtered.length === total
    ? `${total.toLocaleString()} 本`
    : `${filtered.length.toLocaleString()} / ${total.toLocaleString()} 本`;

  // active filter chips
  const chips = [];
  if (type !== 'all') chips.push({ label: type === 'local' ? '📂 本地' : '⭐ 收藏', key: 'type' });
  if (group) chips.push({ label: `${group}${sub ? '/' + sub : ''}`, key: 'sub' });
  if (q) chips.push({ label: `"${q}"`, key: 'q' });
  els.activeFilterChips.innerHTML = chips.map(c =>
    `<span class="chip">${escapeHtml(c.label)}<span class="chip-x" data-clear="${c.key}">×</span></span>`
  ).join('');
  els.activeFilterChips.querySelectorAll('[data-clear]').forEach(el => {
    el.addEventListener('click', () => {
      const k = el.dataset.clear;
      if (k === 'type') { state.filters.type = 'all'; updateCounts(); }
      else if (k === 'sub') { state.filters.sub = null; state.filters.group = null; renderTaxonomy(); }
      else if (k === 'q') { els.searchInput.value = ''; state.query = ''; els.searchWrap.classList.remove('has-query'); }
      applyFilter();
    });
  });
  updateCounts();
}

// ---------- 语言代码 -> 友好中文名 ----------
const LANG_MAP = {
  ZH: '中文', EN: '英文', JA: '日文', KO: '韩文',
  FR: '法文', DE: '德文', ES: '西班牙文', RU: '俄文',
  IT: '意大利文', PT: '葡萄牙文', AR: '阿拉伯文',
};
function langLabel(raw) {
  if (!raw || raw === '—') return '';
  const k = String(raw).trim().toUpperCase();
  return LANG_MAP[k] || raw;
}

// ---------- 卡片 ----------
function renderGrid(items) {
  if (items.length === 0) {
    els.grid.innerHTML = `<div class="empty"><p class="empty-title">没有匹配的书</p><p class="empty-sub">试试别的关键词,或换个分类/目录</p></div>`;
    return;
  }
  const MAX = 500;
  const slice = items.slice(0, MAX);
  const frag = document.createDocumentFragment();

  for (const { idx, b, matched } of slice) {
    const card = document.createElement('div');
    card.className = 'card'
      + (state.selected.has(idx) ? ' selected' : '')
      + (b.local ? ' local' : '');

    const titleHtml = matched ? highlight(b.t, matched.k) : escapeHtml(b.t);
    const authorHtml = b.a ? (matched ? highlight(b.a, matched.k) : escapeHtml(b.a)) : '<span style="opacity:.4">佚名</span>';

    // meta line: 出版社 · 年份 · 语言(中文为默认值, 不显示;非中文显示翻译名)
    const lang = langLabel(b.lang);
    const showLang = lang && lang !== '中文';
    const metaParts = [];
    if (b.p && b.p !== '—') metaParts.push(`<span>出版社: ${escapeHtml(b.p)}</span>`);
    if (b.y && b.y !== '—') metaParts.push(`<span>${escapeHtml(b.y)}</span>`);
    if (showLang) metaParts.push(`<span>${escapeHtml(lang)}</span>`);
    const metaHtml = metaParts.length ? metaParts.join('<span class="sep">·</span>') : '';

    card.innerHTML = `
      <div class="card-head">
        <input type="checkbox" class="card-check" ${state.selected.has(idx) ? 'checked' : ''} aria-label="选中">
        <div class="card-body">
          <p class="card-title">${titleHtml}</p>
          <p class="card-author">${authorHtml}</p>
          ${metaHtml ? `<p class="card-meta">${metaHtml}</p>` : ''}
          ${b.d ? `<p class="card-desc">${escapeHtml(b.d)}</p>` : ''}
          <div class="card-foot">
            <span class="card-tag ${b.local ? 'local' : ''}">${escapeHtml(b.c || b.g)}</span>
            <span class="card-formats">${(b.f || []).slice(0,3).map(f => `<span class="fmt">${escapeHtml(f)}</span>`).join('') || '<span class="fmt">本地</span>'}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary" data-act="download">下载 →</button>
            <button class="btn btn-ghost ${state.shelf[b.i] ? 'on' : ''}" data-act="shelf">${state.shelf[b.i] ? '★ 已收藏' : '☆ 收藏'}</button>
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
      state.shelf[b.i] = !state.shelf[b.i];
      if (!state.shelf[b.i]) delete state.shelf[b.i];
      saveLS(LS_KEYS.shelf, state.shelf);
      const btn = e.currentTarget;
      btn.classList.toggle('on', !!state.shelf[b.i]);
      btn.textContent = state.shelf[b.i] ? '★ 已收藏' : '☆ 收藏';
      updateCounts();
      toast(state.shelf[b.i] ? '已加入收藏夹' : '已移出收藏夹');
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

// ---------- 下载 ----------
async function ensureRemoteBooks() {
  if (state.remoteBooks) return state.remoteBooks;
  if (state.remoteBooksLoading) return state.remoteBooksLoading;
  state.remoteBooksLoading = (async () => {
    toast('首次下载,正在加载完整链接 (~1 MB)…');
    const data = await fetchJSON(DATA + 'books.json');
    state.remoteBooks = data;
    return data;
  })();
  return state.remoteBooksLoading;
}

async function downloadOne(idx) {
  const b = state.index[idx];
  if (!b) return;
  if (b.local) {
    recordClick(idx);
    // 优先: 远端 URL(GitHub release, 公共直链)
    if (b._remoteUrl) { window.open(b._remoteUrl, '_blank', 'noopener'); return; }
    // 兜底: localStorage 里的 dataURL
    const u = state.uploads.find(x => x.id === b._uploadId);
    if (!u) { toast('本地文件丢失'); return; }
    downloadBlob(u._dataUrl, u._filename, u._mime);
    return;
  }
  // 远端: 用 books.json 拿链接
  try {
    const books = await ensureRemoteBooks();
    const full = books[idx];
    if (!full || !full.l) { toast('链接缺失'); return; }
    recordClick(idx);
    window.open(full.l, '_blank', 'noopener');
  } catch (e) { toast('加载失败'); }
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
  let opened = 0;
  for (const id of ids) {
    const b = state.index[id];
    if (!b) continue;
    if (b.local) {
      if (b._remoteUrl) {
        setTimeout(() => window.open(b._remoteUrl, '_blank', 'noopener'), opened * 200);
        opened++;
      } else {
        const u = state.uploads.find(x => x.id === b._uploadId);
        if (u) { downloadBlob(u._dataUrl, u._filename, u._mime); opened++; }
      }
    } else {
      try {
        const books = await ensureRemoteBooks();
        const full = books[id];
        if (full && full.l) { setTimeout(() => window.open(full.l, '_blank', 'noopener'), opened * 200); opened++; }
      } catch {}
    }
  }
  toast(`打开了 ${opened} 本`);
});
els.fabExport.addEventListener('click', async () => {
  const ids = [...state.selected];
  if (ids.length === 0) return;
  try {
    const lines = ['﻿书名\t作者\t分类\t链接'];
    for (const id of ids) {
      const b = state.index[id];
      if (!b) continue;
      let url = '';
      if (b.local) {
        if (b._remoteUrl) url = b._remoteUrl;
        else {
          const u = state.uploads.find(x => x.id === b._uploadId);
          url = u ? `[本地文件 ${u._filename}]` : '';
        }
      } else {
        const books = await ensureRemoteBooks();
        url = books[id]?.l || '';
      }
      lines.push(`${b.t}\t${b.a}\t${b.c}\t${url}`);
    }
    downloadBlob(lines.join('\n'), `achaokb-${ids.length}-${Date.now()}.txt`, 'text/plain;charset=utf-8');
    toast(`已导出 ${ids.length} 条链接`);
  } catch (e) { toast('加载失败'); }
});
els.fabClear.addEventListener('click', () => {
  state.selected.clear();
  applyFilter();
  updateFab();
});

// ---------- 数据包下载 ----------
els.bulkDownloadBtn.addEventListener('click', () => {
  const choice = prompt(
    '选择下载格式:\n' +
    '  1 — JSON (gzip, ~900 KB)   适合任何脚本\n' +
    '  2 — CSV (~4 MB)             适合 Excel / pandas / SQLite\n' +
    '  3 — JSON 原始 (~6 MB)       适合直接阅读\n\n' +
    '输入 1 / 2 / 3:'
  );
  const map = { '1': 'books.json.gz', '2': 'books.csv', '3': 'books.json' };
  const file = map[choice];
  if (!file) { toast('已取消'); return; }
  const a = document.createElement('a');
  a.href = DATA + file;
  a.download = 'achao-knowledge-base-' + file;
  document.body.appendChild(a); a.click(); a.remove();
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
  els.searchInput.value = b.t;
  els.searchWrap.classList.add('has-query');
  applyFilter();
  toast(`随机: 《${b.t}》 · ${b.a || '佚名'}`);
});

// ---------- 顶部导航 ----------
els.navAll.addEventListener('click', () => { state.filters.type = 'all'; applyFilter(); });
els.navLocal.addEventListener('click', () => { state.filters.type = 'local'; applyFilter(); });
els.navShelf.addEventListener('click', () => { state.filters.type = 'shelf'; applyFilter(); });

// ---------- 收藏夹抽屉 ----------
function openBookshelf() { renderBookshelf(); els.drawer.classList.add('show'); els.drawerBg.classList.add('show'); }
function closeBookshelf() { els.drawer.classList.remove('show'); els.drawerBg.classList.remove('show'); }
els.openBookshelfBtn.addEventListener('click', openBookshelf);
function renderBookshelf() {
  const keys = Object.keys(state.shelf).filter(k => state.shelf[k]);
  if (keys.length === 0) {
    els.drawerBody.innerHTML = '<div class="shelf-empty">收藏夹是空的<br><br>在任何书卡片上点 <b>☆ 收藏</b> 即可加入</div>';
    return;
  }
  let html = `<div class="drawer-section"><h4 style="margin:0 0 8px;font-size:11px;color:var(--fg-faint);letter-spacing:.06em;text-transform:uppercase">共 ${keys.length} 本</h4>`;
  keys.forEach(idx => {
    const b = state.index.find(x => x.i == idx);
    if (!b) return;
    html += `
      <div class="shelf-item" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line-soft);align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500">${escapeHtml(b.t)}</div>
          <div style="font-size:11px;color:var(--fg-faint);margin-top:2px">${escapeHtml(b.a || '佚名')} · ${escapeHtml(b.c)}${b.local ? ' · 📂 本地' : ''}</div>
        </div>
        <button class="btn btn-primary" data-dl="${idx}" style="font-size:11px;padding:4px 8px">下载</button>
        <button class="btn btn-ghost" data-rm="${idx}" style="padding:4px 8px">×</button>
      </div>
    `;
  });
  html += '</div>';
  els.drawerBody.innerHTML = html;
  els.drawerBody.querySelectorAll('[data-dl]').forEach(btn => btn.addEventListener('click', () => downloadOne(state.index.findIndex(x => x.i == btn.dataset.dl))));
  els.drawerBody.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => {
    delete state.shelf[btn.dataset.rm];
    saveLS(LS_KEYS.shelf, state.shelf);
    updateCounts(); renderBookshelf(); applyFilter();
  }));
}

// ---------- 免责声明 ----------
els.disclaimerClose.addEventListener('click', () => {
  els.disclaimer.classList.add('hidden');
  saveLS(LS_KEYS.hidden, true);
});
els.openDisclaimerBtn.addEventListener('click', () => { els.disclaimerDrawer.classList.add('show'); els.drawerBg.classList.add('show'); });
els.openDisclaimerBtn2.addEventListener('click', els.openDisclaimerBtn.click);

// ---------- 上传 ----------
function populateUploadGroups() {
  els.upGroup.innerHTML = '<option value="">— 自动判断 —</option>' +
    state.meta.taxonomy.filter(g => !g.is_long_tail).map(g => `<option value="${escapeAttr(g.name)}">${escapeHtml(g.name)}</option>`).join('');
}
function openUpload() { renderUploadList(); els.uploadDrawer.classList.add('show'); els.drawerBg.classList.add('show'); }
els.openUploadBtn.addEventListener('click', openUpload);

let _selectedFile = null;
function setupUploader() {
  const onPick = (file) => {
    _selectedFile = file;
    if (file) {
      const sizeKB = (file.size / 1024).toFixed(1);
      els.upFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong> · ${sizeKB} KB · ${file.type || '未知类型'}`;
      els.upDrop.classList.add('has-file');
    } else {
      els.upFileInfo.textContent = '支持 txt / mobi / epub / azw3 / pdf';
      els.upDrop.classList.remove('has-file');
    }
  };
  els.upDrop.addEventListener('click', () => els.upFile.click());
  els.upFile.addEventListener('change', e => onPick(e.target.files[0]));
  els.upDrop.addEventListener('dragover', e => { e.preventDefault(); els.upDrop.style.borderColor = 'var(--accent)'; });
  els.upDrop.addEventListener('dragleave', () => els.upDrop.style.borderColor = '');
  els.upDrop.addEventListener('drop', e => {
    e.preventDefault();
    els.upDrop.style.borderColor = '';
    if (e.dataTransfer.files.length) onPick(e.dataTransfer.files[0]);
  });

  els.uploadForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!_selectedFile) { toast('请先选择文件'); return; }
    const title = els.upTitle.value.trim();
    if (!title) { toast('书名必填'); return; }
    // 检查 localStorage 配额
    const dataUrl = await fileToDataUrl(_selectedFile);
    const sizeKB = (_selectedFile.size / 1024).toFixed(1);
    if (_selectedFile.size > 30 * 1024 * 1024) {
      toast(`文件过大 (${sizeKB} KB),localStorage 最多 ~5MB,推荐 <2MB`); return;
    }
    const upload = {
      id: 'u' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      t: title,
      a: els.upAuthor.value.trim(),
      c: '',
      d: els.upDesc.value.trim() || '本地上传',
      g: els.upGroup.value || '其他细分',
      p: '—', y: '—', lang: 'ZH',
      f: _selectedFile.name.split('.').pop().toLowerCase(),
      _filename: _selectedFile.name,
      _mime: _selectedFile.type || 'application/octet-stream',
      _dataUrl: dataUrl,
      _addedAt: Date.now(),
    };
    try {
      state.uploads.push(upload);
      saveLS(LS_KEYS.uploads, state.uploads);
      rebuildMergedIndex();
      renderStats();
      updateCounts();
      applyFilter();
      // reset form
      els.uploadForm.reset(); _selectedFile = null;
      els.upFileInfo.textContent = '支持 txt / mobi / epub / azw3 / pdf';
      els.upDrop.classList.remove('has-file');
      renderUploadList();
      toast(`已添加: 《${title}》 (${sizeKB} KB)`);
    } catch (err) {
      state.uploads.pop();
      console.error(err);
      toast('存储失败:' + (err.message || 'localStorage 空间不足'));
    }
  });
}

function renderUploadList() {
  if (state.uploads.length === 0) {
    els.uploadList.innerHTML = '';
    return;
  }
  let html = `<h4 style="margin:0 0 8px;font-size:11px;color:var(--fg-faint);letter-spacing:.06em;text-transform:uppercase">已添加 ${state.uploads.length} 本</h4>`;
  state.uploads.slice().reverse().forEach(u => {
    const sizeKB = u._dataUrl ? Math.round((u._dataUrl.length * 0.75) / 1024) + ' KB' : '';
    html += `<div style="padding:8px 0;border-bottom:1px solid var(--line-soft);display:flex;gap:8px;align-items:center">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${escapeHtml(u.t)}</div>
        <div style="font-size:11px;color:var(--fg-faint)">${escapeHtml(u.a || '佚名')} · ${escapeHtml(u.g)} · ${sizeKB}</div>
      </div>
      <button class="btn btn-primary" data-dl-local="${u.id}" style="font-size:11px;padding:3px 7px">下载</button>
      <button class="btn btn-ghost" data-rm-local="${u.id}" style="padding:3px 7px">×</button>
    </div>`;
  });
  els.uploadList.innerHTML = html;
  els.uploadList.querySelectorAll('[data-dl-local]').forEach(btn => btn.addEventListener('click', () => {
    const u = state.uploads.find(x => x.id === btn.dataset.dlLocal);
    if (u) downloadBlob(u._dataUrl, u._filename, u._mime);
  }));
  els.uploadList.querySelectorAll('[data-rm-local]').forEach(btn => btn.addEventListener('click', () => {
    state.uploads = state.uploads.filter(x => x.id !== btn.dataset.rmLocal);
    saveLS(LS_KEYS.uploads, state.uploads);
    rebuildMergedIndex();
    renderStats();
    updateCounts();
    applyFilter();
    renderUploadList();
    toast('已移除');
  }));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------- Drawer 通用关闭 ----------
document.querySelectorAll('[data-close]').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.close;
    document.getElementById(id).classList.remove('show');
    els.drawerBg.classList.remove('show');
  });
});
els.drawerBg.addEventListener('click', () => {
  [els.drawer, els.uploadDrawer, els.disclaimerDrawer].forEach(d => d.classList.remove('show'));
  els.drawerBg.classList.remove('show');
});

// ---------- 移动端 sidebar ----------
const isMobile = () => window.matchMedia('(max-width:900px)').matches;
els.toggleSidebarBtn.addEventListener('click', () => {
  els.sidebar.classList.toggle('open');
  els.sidebarOverlay.classList.toggle('show');
});
els.sidebarOverlay.addEventListener('click', () => {
  els.sidebar.classList.remove('open');
  els.sidebarOverlay.classList.remove('show');
});
function handleResize() {
  els.toggleSidebarBtn.style.display = isMobile() ? '' : 'none';
}
window.addEventListener('resize', handleResize);
handleResize();

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
  const blob = (content.startsWith('data:')) ? dataUrlToBlob(content) : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:(.*?);/)[1];
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

init();
})();
