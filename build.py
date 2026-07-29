#!/usr/bin/env python3
"""
achaokb build — 三档数据生成器
================================

输出 (写到 site/data/):
  index.json      — 精简索引 (i, t, a, c, d),首屏 fetch,~180KB gz
  books.json      — 全量     (i, t, a, c, d, l, f),首次「下载」时 fetch,~1MB gz
  books.json.gz   — gzip 压缩全量 (供直接下载 / Cloudflare 静态托管)
  books.csv       — CSV 全量 (供本地 sqlite / pandas / 任何 DB)

用法:
  python3 build.py [--raw data/books.json] [--out site/data]
"""
import argparse, csv, gzip, json, sys
from collections import Counter
from pathlib import Path

# ---- 简介模板 ----
DESC_TEMPLATES = {
    '文学': '文学作品集', '历史': '历史类读物', '科普': '科普类读物',
    '管理': '管理类读物', '社会': '社会议题相关', '推理': '推理/悬疑类小说',
    '经典': '经典著作', '经济': '经济类读物', '哲学': '哲学思辨类',
    '传记': '人物传记', '美国': '美国背景', '心理': '心理学相关',
    '悬疑': '悬疑类小说', '商业': '商业管理类', '励志': '励志成长类',
    '金融': '金融类读物', '随笔': '随笔散文集', '投资': '投资类读物',
    '思维': '思维方法类', '文化': '文化议题相关', '科幻': '科幻小说',
    '中国': '中国背景', '成长': '成长类读物', '漫画': '漫画/图像作品',
    '英国': '英国背景', '政治': '政治议题相关', '纪实': '纪实类作品',
    '艺术': '艺术类作品', '科学': '科学类读物', '散文': '散文集',
    '职场': '职场类读物', '法国': '法国背景', '生活': '生活类读物',
    '互联网': '互联网行业相关', '营销': '营销类读物', '女性': '女性议题相关',
    '二战': '二战背景', '奇幻': '奇幻小说', '股票': '股票投资类',
    '德国': '德国背景', '战争': '战争主题', '学习': '学习方法类',
    '绘本': '绘本类读物', '理财': '个人理财类', '世界': '世界背景',
    '教育': '教育类读物', '创业': '创业类读物', '欧洲': '欧洲背景',
    '治愈': '治愈系读物', '沟通': '沟通技巧类', '名著': '世界名著',
}

def gen_desc(cat: str, title: str) -> str:
    base = DESC_TEMPLATES.get(cat, f'{cat}主题')
    if '套装' in title or ('共' in title and '册' in title):
        suffix = '(系列/套装)'
    elif '全集' in title:
        suffix = '(全集)'
    else:
        suffix = ''
    return f'{base}{suffix}'

def slim_full(book: dict, idx: int, top50_set: set) -> dict:
    cat = book['category'] if book['category'] in top50_set else '其他'
    return {
        'i': idx,
        't': book['title'].strip(),
        'a': book.get('author', '').strip(),
        'c': cat,
        'd': gen_desc(cat, book['title']),
        'l': book['link'],
        'f': book.get('formats', []),
    }

def slim_index(full: dict) -> dict:
    return {k: full[k] for k in ('i', 't', 'a', 'c', 'd')}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw',  default='data/books.json', help='raw upstream json')
    ap.add_argument('--out',  default='site/data',       help='output dir')
    ap.add_argument('--top',  type=int, default=50,       help='top-N categories')
    args = ap.parse_args()

    raw_path = Path(args.raw)
    out_path = Path(args.out)
    out_path.mkdir(parents=True, exist_ok=True)

    print(f'>> reading {raw_path}')
    raw = json.load(open(raw_path))
    print(f'   {len(raw)} books')

    # 统计 top-N
    counter = Counter(b['category'] for b in raw)
    topN = [c for c, _ in counter.most_common(args.top)]
    topN_set = set(topN)
    other_count = sum(c for cat, c in counter.items() if cat not in topN_set)
    print(f'>> top-{args.top} categories + 其他 ({other_count} books)')

    # 三档数据
    full  = [slim_full(b, i, topN_set) for i, b in enumerate(raw)]
    index = [slim_index(b) for b in full]

    meta = {
        'total':        len(full),
        'top':          [{'name': c, 'count': counter[c]} for c in topN],
        'other_count':  other_count,
        'generated_at': __import__('datetime').datetime.now().isoformat(timespec='seconds'),
        'source':       'jbiaojerry/ebook-treasure-chest',
    }

    # 1. index.json
    p_index = out_path / 'index.json'
    json.dump(index, open(p_index, 'w'), ensure_ascii=False, separators=(',', ':'))
    size_index = p_index.stat().st_size

    # 2. books.json
    p_books = out_path / 'books.json'
    json.dump(full, open(p_books, 'w'), ensure_ascii=False, separators=(',', ':'))
    size_books = p_books.stat().st_size

    # 3. books.json.gz
    p_gz = out_path / 'books.json.gz'
    with gzip.open(p_gz, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(full, f, ensure_ascii=False, separators=(',', ':'))
    size_gz = p_gz.stat().st_size

    # 4. books.csv
    p_csv = out_path / 'books.csv'
    with open(p_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['i', 'title', 'author', 'category', 'link', 'formats', 'description'])
        for b in full:
            w.writerow([b['i'], b['t'], b['a'], b['c'], b['l'], '|'.join(b['f']), b['d']])

    # 5. meta.json (frontend 启动时只读这个小文件)
    p_meta = out_path / 'meta.json'
    json.dump(meta, open(p_meta, 'w'), ensure_ascii=False, indent=2)

    def show(path, raw_size):
        gz_approx = int(raw_size * 0.22)  # ~78% compression on JSON
        print(f'   {path.name:20s}  {raw_size:>10,} bytes (≈{gz_approx:>7,} gz)')

    print('>> wrote:')
    show(p_index, size_index)
    show(p_books, size_books)
    show(p_gz,   size_gz)
    print(f'   {p_csv.name:20s}  {p_csv.stat().st_size:>10,} bytes')
    print(f'   {p_meta.name:20s}  {p_meta.stat().st_size:>10,} bytes')

if __name__ == '__main__':
    main()
