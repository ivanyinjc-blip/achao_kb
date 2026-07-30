#!/usr/bin/env python3
"""achaokb build v2 — 分级目录 + 热度榜 + 年份提取"""
import argparse, csv, gzip, json, re, sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

TAXONOMY = [
    {'name':'文学小说','icon':'\U0001f4d6','match':['文学','小说','经典','名著','外国','言情','青春','爱情','奇幻','玄幻','武侠','童话','诗歌','诗词','诗集','散文','随笔','杂文','故事','神话','红楼梦','莎士比亚','唐诗','宋词','诺贝尔']},
    {'name':'历史与社会','icon':'\U0001f3db','match':['历史','社会','政治','战争','二战','一战','军事','冷战','近代','古代','文明','回忆录','纪实','晚清','明朝','宋朝','唐朝','汉朝','春秋','秦汉','魏晋','先秦','近代史','世界','欧洲史','思想史','明史','清史','宋史','文革','中国','抗战','谍战','间谍','中世纪','古希腊','古罗马','罗马','帝国','纳粹','苏联','独裁','民主','官场','变革','起义','革命','考古','文物','故宫','敦煌']},
    {'name':'商业经济','icon':'\U0001f4bc','match':['经济','金融','投资','股票','理财','商业','管理','企管','创业','营销','销售','职场','企业','经管','经济学','资本','证券','货币','交易','基金','期货','量化','战略','领导','领导力','经营','规划','运营','市场','贸易','财务','零售','消费','财富','商战','并购','上市','审计','财会','数字化','新经济','新零售','华为','硅谷','巴菲特','华尔街','企业家','团队','谈判','策划','期权','私募','杠杆','通胀','汇率','税务','趋势','增长','定位','品牌','公关','广告','商务','产品']},
    {'name':'科技科普','icon':'\U0001f52c','match':['科普','科学','科技','物理','数学','生物','化学','天文','宇宙','进化','自然','医学','健康','养生','保健','脑科学','人工智能','AI','Python','计算机','编程','数据','大数据','算法','区块链','互联网','技术','量子','基因','动物','植物','海洋','地球','元宇宙','黑客','网络安全','操作系统','软件工程','机器学习','深度学习','数据可视化','网络','硬件','云','芯片','半导体','航天','航空','科幻']},
    {'name':'哲学与思想','icon':'\U0001f9e0','match':['哲学','思想','思维','逻辑','国学','宗教','佛教','佛学','道家','儒家','周易','易经','尼采','黑格尔','叔本华','苏格拉底','柏拉图','亚里士多德','人文','社科','人类学','人类','社会学','伦理学','美学','存在主义','基督教','基督','圣经','道教','法家','老子','庄子','孔子','孟子','朱熹','王阳明','博弈']},
    {'name':'心理与成长','icon':'\U0001f331','match':['心理','心理学','成长','励志','情商','情绪','焦虑','人格','性格','行为','习惯','认知','记忆','自我','亲密关系','情感','两性','人性','心理分析','心理治疗','心理自助','成功','成功学','沟通','口才','演讲','社交','心灵','温暖','治愈','冥想','正念','断舍离','极简','潜意识','梦境','荣格','阿德勒']},
    {'name':'生活与健康','icon':'☂','match':['生活','健康','养生','保健','饮食','美食','运动','健身','跑步','瑜伽','减肥','睡眠','旅行','游记','咖啡','茶','茶文化','烘焙','厨房','家居','收纳','日常','食帖','急救','癌症','近视','中医学','中医','病毒','细菌','食品','营养','母婴','怀孕','胎教']},
    {'name':'艺术与设计','icon':'\U0001f3a8','match':['艺术','绘画','设计','摄影','电影','音乐','戏剧','戏曲','博物馆','艺术史','艺术文化','美学','建筑','时尚','服装','动画','动漫','卡通','字体','海报','插画','油画','雕塑','工艺品','文艺','舞台','影视','纪录片']},
    {'name':'教育与学习','icon':'\U0001f393','match':['教育','学习','育儿','亲子','家教','启蒙','小学','中学','高中','大学','考研','留学','雅思','托福','GRE','方法','效率','笔记','阅读','写作','思考','速读','思维导图','知识','通识','百科','教材','教辅','备课','课堂','教师','学霸','校园','毕业','求职','简历','面试','职业规划','跳槽','加薪','MBA','商学院']},
    {'name':'少儿与漫画','icon':'\U0001f338','match':['绘本','漫画','少儿','格林童话','安徒生','萌宠','猫','狗','宠物','恐龙','童话','儿童','婴幼儿','幼儿','儿童文学','少年','青春文学','儿童绘本','睡前故事','益智','玩具','亲子游戏','伊索寓言','安徒生童话','格林兄弟']},
    {'name':'传记与人物','icon':'\U0001f464','match':['传记','人物','自传','自述','日记','书信','访谈','对谈录','口述史','大师','科学家','名人','领袖','政治家','军事家','文学家','思想家','哲学家','心理学家','艺术家','音乐家','画家','作家','诗人','导演','演员','老舍','鲁迅','金庸','莫言','马尔克斯','海明威','村上春树','东野圭吾','余华','三毛','张爱玲','萧红','林徽因','杨绛','钱钟书','季羡林','傅雷','拿破仑','丘吉尔','罗斯福','肯尼迪','乔布斯','马斯克','马云','任正非','雷军','扎克伯格','比尔盖茨','稻盛和夫','松下幸之助','李嘉诚','王健林','马化腾','刘强东','特朗普','普京','本拉登','成吉思汗','凯撒','屋大维','李小龙','秦始皇']},
    {'name':'国家与地区','icon':'\U0001f30d','match':['美国','英国','法国','德国','意大利','俄罗斯','俄国','西班牙','葡萄牙','北欧','挪威','瑞典','荷兰','瑞士','奥地利','希腊','埃及','以色列','印度','日本','韩国','台湾','香港','新加坡','中东','非洲','拉美','阿根廷','巴西','墨西哥','智利','加拿大','澳大利亚','新西兰','南斯拉夫','巴尔干','亚洲','欧洲','美洲','英格兰','苏格兰','爱尔兰','威尔士','法兰西','普鲁士','日耳曼','东欧','西欧','南欧','北非','南非','西非','东非','中亚','南亚','东南亚','西亚','乌克兰','波兰','捷克','匈牙利','罗马尼亚','保加利亚','塞尔维亚','土耳其','伊朗','伊拉克','沙特','越南','泰国','缅甸','马来西亚','印尼','菲律宾']},
]

DESC_TEMPLATES = {
    '文学':'文学作品集','历史':'历史类读物','科普':'科普类读物','管理':'管理类读物',
    '社会':'社会议题相关','推理':'推理/悬疑类小说','经典':'经典著作','经济':'经济类读物',
    '哲学':'哲学思辨类','传记':'人物传记','美国':'美国背景','心理':'心理学相关',
    '悬疑':'悬疑类小说','商业':'商业管理类','励志':'励志成长类','金融':'金融类读物',
    '随笔':'随笔散文集','投资':'投资类读物','思维':'思维方法类','文化':'文化议题相关',
    '科幻':'科幻小说','中国':'中国背景','成长':'成长类读物','漫画':'漫画/图像作品',
    '英国':'英国背景','政治':'政治议题相关','纪实':'纪实类作品','艺术':'艺术类作品',
    '科学':'科学类读物','散文':'散文集','职场':'职场类读物','法国':'法国背景',
    '生活':'生活类读物','互联网':'互联网行业相关','营销':'营销类读物','女性':'女性议题相关',
    '二战':'二战背景','奇幻':'奇幻小说','股票':'股票投资类','德国':'德国背景',
    '战争':'战争主题','学习':'学习方法类','绘本':'绘本类读物','理财':'个人理财类',
    '世界':'世界背景','教育':'教育类读物','创业':'创业类读物','欧洲':'欧洲背景',
    '治愈':'治愈系读物','沟通':'沟通技巧类','名著':'世界名著',
}

YEAR_RE = re.compile(r'[((（](\d{4})\s*年?\s*[)）]|(19|20)\d{2}\s*版')
YR_RANGE = (1900, 2027)

def extract_year(title):
    if not title: return '—'
    m = YEAR_RE.search(title)
    if m:
        try:
            g = m.group(1) or m.group(0).rstrip('版').strip()
            y = int(g)
            if YR_RANGE[0] <= y <= YR_RANGE[1]:
                return str(y)
        except (ValueError, AttributeError):
            pass
    return '—'

def classify_top(cat):
    for g in TAXONOMY:
        for kw in g['match']:
            if kw in cat:
                return g['name']
    return '其他细分'

def gen_desc(cat, title):
    base = DESC_TEMPLATES.get(cat, f'{cat}主题')
    if '套装' in title or ('共' in title and '册' in title):
        suf = '(系列/套装)'
    elif '全集' in title:
        suf = '(全集)'
    else:
        suf = ''
    return f'{base}{suf}'

def slim_full(b, idx):
    cat = b['category']
    return {
        'i': idx, 't': b['title'].strip(), 'a': b.get('author','').strip(),
        'c': cat, 'd': gen_desc(cat, b['title']),
        'p': '—', 'y': extract_year(b['title']),
        'lang': b.get('language', '—'),
        'g': classify_top(cat),
        'l': b['link'], 'f': b.get('formats', []),
    }

def slim_local(b, idx, url):
    """本地书: 用 -idx 区分,标记 local,带 GitHub release URL"""
    title = b.get('title', '').strip() or Path(b['src']).stem
    author = b.get('author', '').strip()
    ext = b.get('ext', b['key'].rsplit('.', 1)[-1] if '.' in b['key'] else '')
    # 简单分类
    cat = classify_top(title) if title else '其他细分'
    return {
        'i': -idx, 't': title, 'a': author,
        'c': cat, 'd': f'本地上传 · {ext.upper()}',
        'p': '—', 'y': extract_year(title),
        'lang': 'ZH', 'g': cat,
        'l': url, 'f': [ext.upper()] if ext else [],
        'local': True,
    }

def slim_index(full):
    return {k: full[k] for k in ('i','t','a','c','d','p','y','lang','g')}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default='data/books.json')
    ap.add_argument('--out', default='site/data')
    ap.add_argument('--local', default='site/data/local_books.json',
                    help='local_books.json 路径(包含 src/title/author/key)')
    ap.add_argument('--local-urls', default='/tmp/book_urls.json',
                    help='book_urls.json 路径(key -> GitHub URL 映射)')
    args = ap.parse_args()

    raw_path = Path(args.raw); out_path = Path(args.out)
    out_path.mkdir(parents=True, exist_ok=True)
    print(f'>> reading {raw_path}')
    raw = json.load(open(raw_path))
    print(f'   {len(raw)} books')

    cat_counter = Counter(b['category'] for b in raw)
    grp_counter = Counter()
    grp_to_tags = defaultdict(Counter)
    long_tail = Counter()
    other = '其他细分'

    for b in raw:
        c = b['category']; g = classify_top(c)
        grp_counter[g] += 1
        if g == other: long_tail[c] += 1
        else: grp_to_tags[g][c] += 1

    pop_scores = []
    for i, b in enumerate(raw):
        score = cat_counter[b['category']] * 10
        t = b['title']
        if '全集' in t: score += 30
        elif '套装' in t or '合集' in t: score += 15
        if '经典' in t: score += 5
        pop_scores.append((score, i))
    pop_scores.sort(reverse=True)
    top_pop = pop_scores[:50]

    grp_top = defaultdict(list)
    for score, idx in pop_scores:
        b = raw[idx]; g = classify_top(b['category'])
        if len(grp_top[g]) < 10:
            grp_top[g].append({'i':idx, 't':b['title'].strip(),
                                'a':b.get('author','').strip(),
                                'c':b['category'], 'score':score})

    full = [slim_full(b, i) for i, b in enumerate(raw)]

    # 本地书(可选): 需要 local_books.json + book_urls.json 都存在
    local_full = []
    local_path = Path(args.local)
    urls_path = Path(args.local_urls)
    if local_path.exists() and urls_path.exists():
        local_src = json.load(open(local_path))
        url_map = json.load(open(urls_path))
        added = 0
        for j, lb in enumerate(local_src.get('books', [])):
            key = lb['key']
            url = url_map.get(key)
            if not url: continue  # 没传完的跳过
            local_full.append(slim_local(lb, j + 1, url))
            added += 1
        if added:
            print(f'>> local: 合并 {added} 本 (来自 {local_path.name} + {urls_path.name})')
            full.extend(local_full)

    index = [slim_index(b) for b in full]

    taxonomy = []
    for grp in TAXONOMY:
        n = grp_counter.get(grp['name'], 0)
        if n == 0: continue
        taxonomy.append({
            'name': grp['name'], 'icon': grp['icon'], 'count': n,
            'subs': [{'name':t, 'count':c} for t, c in grp_to_tags[grp['name']].most_common(50)],
        })
    if long_tail:
        taxonomy.append({
            'name': other, 'icon': '\U0001f5c2', 'count': grp_counter.get(other, 0),
            'subs': [{'name':t, 'count':n} for t, n in long_tail.most_common(50)],
            'is_long_tail': True,
        })

    meta = {
        'total': len(raw), 'categories': len(cat_counter),
        'local_count': len(local_full),
        'taxonomy': taxonomy,
        'popular': [{'i':idx, 't':raw[idx]['title'].strip(),
                     'a':raw[idx].get('author','').strip(),
                     'c':raw[idx]['category'], 'score':s}
                    for s, idx in top_pop],
        'group_top': dict(grp_top),
        'generated_at': datetime.now().isoformat(timespec='seconds'),
        'source': 'jbiaojerry/ebook-treasure-chest',
    }

    p_index = out_path / 'index.json'
    json.dump(index, open(p_index,'w'), ensure_ascii=False, separators=(',',':'))
    p_books = out_path / 'books.json'
    json.dump(full, open(p_books,'w'), ensure_ascii=False, separators=(',',':'))
    p_gz = out_path / 'books.json.gz'
    with gzip.open(p_gz,'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(full, f, ensure_ascii=False, separators=(',',':'))
    p_csv = out_path / 'books.csv'
    with open(p_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['i','title','author','category','publisher','year','language','top_group','link','formats','description'])
        for b in full:
            w.writerow([b['i'], b['t'], b['a'], b['c'], b['p'], b['y'], b['lang'], b['g'], b['l'], '|'.join(b['f']), b['d']])
    p_meta = out_path / 'meta.json'
    json.dump(meta, open(p_meta,'w'), ensure_ascii=False, separators=(',',':'))

    def show(p, sz):
        print(f'   {p.name:20s}  {sz:>10,} bytes')
    print('>> wrote:')
    show(p_index, p_index.stat().st_size)
    show(p_books, p_books.stat().st_size)
    show(p_gz, p_gz.stat().st_size)
    show(p_csv, p_csv.stat().st_size)
    show(p_meta, p_meta.stat().st_size)
    print()
    print('>> taxonomy:')
    for g in taxonomy:
        print(f'   {g["icon"]} {g["name"]:8s} {g["count"]:>5d}  ({len(g["subs"])} subs)')

if __name__ == '__main__':
    main()
