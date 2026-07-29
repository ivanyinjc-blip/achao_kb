# 阿超知识库

> 我的个人图书馆 · 24,071 本电子书 · 50 主分类 + 7,187 本「其他」

数据源:[jbiaojerry/ebook-treasure-chest](https://github.com/jbiaojerry/ebook-treasure-chest)
所有下载链接跳转**城通网盘** (CTFile,提取码 `8866`)。

## 启动

```bash
cd /home/ivanyinjc/achaokb/site
python3 -m http.server 8765
# 浏览器打开 http://localhost:8765
```

或直接双击 `site/index.html` (file:// 模式,功能完整,只是批量下载会被部分浏览器拦截)。

## 文件结构

```
achaokb/
├── README.md           ← 你正在看的
├── build.py            ← 数据重建脚本 (重跑会刷新 site/data.js)
├── data/
│   ├── books.json      ← 原始数据 (GitHub 仓库)
│   └── parse-stats.json
└── site/
    ├── index.html      ← 单文件 SPA,所有逻辑内联
    └── data.js         ← 全量书目 (≈ 4.4 MB)
```

## 功能

| 功能 | 说明 |
|---|---|
| 实时搜索 | 书名 / 作者 / 分类 / 简介,空格分隔 = 多关键词 (AND) |
| 分类过滤 | 50 个 top 标签 + 「其他」桶,点选切换 |
| 简介生成 | 基于分类自动一句话 (例:`文学` → `文学作品集`) |
| 单本下载 | 卡片底部 `下载 →` 按钮,新标签打开网盘页面 |
| 批量下载 | 多选 → 浮窗 → 顺序打开新标签 (250ms 间隔,避拦截) |
| 链接导出 | 多选 → 导出 .txt (书名 / 作者 / 链接,Tab 分隔) |
| 收藏夹 | localStorage 持久化,右侧抽屉 |
| 随机一本 | 一键跳到随机书,用于闲逛 |
| 统计 | 总书目 / 分类 / 作者 / 格式覆盖数 |

## 重新拉数据

```bash
cd /home/ivanyinjc/achaokb
curl -sL https://raw.githubusercontent.com/jbiaojerry/ebook-treasure-chest/main/docs/books.json -o data/books.json
python3 build.py
```

## 设计选择

- **风格**:近白底 + Inter 字体 + 暖灰文字,一套冷色 (Indigo `#4f46e5`) 作唯一重点色
- **暗色**:自动跟随 `prefers-color-scheme`
- **零依赖**:无 npm package、无 CDN,JS 内联,~1500 行原生代码
- **零后端**:全静态,本地可断网运行
- **响应式**:360px 起可用,desktop 卡片三栏
