"""把运行时静态文件收拢到 dist/，供 Cloudflare Pages 直接上传。

只收游戏真正会加载的东西：index.html、src/、assets/。
assets/raw 与 image_形象/ 是重新生成素材用的源文件（见 .gitignore：
「不随运行时公开版发布」），所以这里显式排除，免得它们哪天回到本地时
被一起打包进 dist/。

缓存版本串在这里按内容哈希生成，源码里不再手写：
  - dist/index.html 里 src/*.js、src/*.css 的 ?v= 逐文件取内容哈希，
    所以只有真改过的文件换 URL，没动的继续吃浏览器缓存；
  - dist/src/game.js 的 ASSET_VERSION 取整个 assets/ 树的内容哈希。粒度
    与它原本「一个串管所有素材」的语义一致（见 game.js 的 assetURL），
    即任一素材变化会让所有素材换 URL。
内容不变则哈希不变，所以重复构建产出完全相同的 dist/，不会平白无故让
老访客重下 16 MB。

用法：
    python tools/make_dist.py
之后在 Cloudflare Pages 里对 dist/ 做 Direct Upload，或：
    npx wrangler pages deploy dist --project-name <项目名>
"""
import hashlib
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
INCLUDE = ['index.html', 'src', 'assets']
SKIP_DIRS = [Path('assets/raw')]          # 只用于重新生成素材，不进公开版

# 引用形如 src="src/game.js" 或 href="src/coast.css?v=旧串"：旧的版本串一律覆盖，
# 免得源码里残留的手写串和构建结果打架。
REF = re.compile(r'((?:src|href)=")((?:src|assets)/[^"?]+)(?:\?v=[^"]*)?(")')
ASSET_DECL = re.compile(r"(var ASSET_VERSION = ')[^']*(')")

VERSION_CHARS = 8


def skipped(rel):
    return any(rel == d or d in rel.parents for d in SKIP_DIRS)


def digest(root, rels):
    """对一组文件取内容哈希：rel 相对 root 解析。带上路径本身，改名也会换哈希。

    两点别搞错：
      - rel 必须相对 root，不是相对 dist/。传错会拼出不存在的路径（踩过两次，
        都是拿 dist/ 去拼 assets/ 下的相对路径）。
      - 哈希里只能进相对路径。混进绝对路径，同一个包在两台机器上就会得出
        不同的版本串。
    """
    h = hashlib.sha256()
    for rel in rels:
        h.update(rel.encode('utf-8'))
        h.update(b'\0')
        h.update((root / rel).read_bytes())
        h.update(b'\0')
    return h.hexdigest()[:VERSION_CHARS]


def files_under(root):
    return sorted(p.relative_to(root).as_posix()
                  for p in root.rglob('*') if p.is_file())


def hash_tree(subdir):
    """{相对 dist 的路径: 文件内容哈希}，键和 index.html 里的引用写法一致。

    digest() 收的是「相对某个基准的路径」，所以这里把基准和键的拼法绑在一处：
    先前两版都是这里对不上（拿 dist/ 去拼 assets/ 下的相对路径），别再拆开写。
    """
    base = DIST / subdir
    return {f'{subdir}/{rel}': digest(base, [rel])
            for rel in files_under(base)}


def assets_digest():
    """整个 assets/ 树的内容哈希，也就是素材的版本串。"""
    base = DIST / 'assets'
    return digest(base, files_under(base))


def stamp_assets():
    """把 assets/ 的内容哈希写进 dist/src/game.js 的 ASSET_VERSION。"""
    game = DIST / 'src/game.js'
    if not game.exists():
        sys.exit('dist/src/game.js 不存在，版本串无处可写。')
    version = assets_digest()
    text, n = ASSET_DECL.subn(lambda m: m.group(1) + version + m.group(2),
                              game.read_text(encoding='utf-8'))
    if n != 1:
        # 静默漏写会让所有素材一直吃旧缓存，宁可直接失败。
        sys.exit(f'在 game.js 里找到 {n} 处 ASSET_VERSION 声明，期望 1 处；'
                 f'是不是改名了？')
    game.write_text(text, encoding='utf-8')
    return version


def stamp_index():
    """给 dist/index.html 的本地引用打上逐文件内容哈希。"""
    index = DIST / 'index.html'
    html = index.read_text(encoding='utf-8')

    src_hash = hash_tree('src')
    asset_version = None
    stamped = []

    def repl(m):
        nonlocal asset_version
        pre, ref, post = m.group(1), m.group(2), m.group(3)
        if ref.startswith('src/'):
            version = src_hash.get(ref)
            if version is None:
                sys.exit(f'index.html 引用了不存在的 {ref}，路径写错了？')
        else:
            if asset_version is None:
                asset_version = assets_digest()
            version = asset_version
        stamped.append(f'{ref}?v={version}')
        return f'{pre}{ref}?v={version}{post}'

    html = REF.sub(repl, html)
    if not stamped:
        sys.exit('index.html 里一个 src/ 或 assets/ 引用都没找到，'
                 '打包脚本的匹配规则可能已经失效。')
    index.write_text(html, encoding='utf-8')
    return src_hash, stamped


def audit():
    """让「漏一个引用」在构建期就出声，而不是等老访客吃到旧缓存。"""
    problems = []

    # 1) 打完版本串后，dist 里不该再有裸引用。这主要是在盯 REF 规则本身
    #    是否失效（比如 index.html 以后改用别的写法）。
    for p in [DIST / 'index.html'] + sorted((DIST / 'src').rglob('*.css')):
        text = p.read_text(encoding='utf-8')
        where = p.relative_to(DIST)
        for m in re.finditer(r'(?:src|href)="((?:src|assets)/[^"]*)"', text):
            if '?v=' not in m.group(1):
                problems.append(f'{where} 引用了 {m.group(1)}，没有版本串')
        # CSS 的 url() 是构建脚本够不到的地方：写死资源路径就会永远停在旧
        # 版本上（正确做法是走 game.js 的 assetCSSURL 拿自定义属性）。
        for m in re.finditer(r'url\(\s*[\'"]?([^"\')]+)', text):
            if re.search(r'(?:^|/)assets/', m.group(1)):
                problems.append(f'{where} 的 url({m.group(1)}) 绕过了 assetURL，'
                                f'带不上版本串')

    # 2) 源码 index.html 里不许直接引 assets/。给这类引用补版本串能做到「不
    #    过期」，但补不了真正的问题：它绕过了预加载在内存里的那份拷贝，浏览器
    #    会在游戏中途再下一次同一个文件——慢网下没加载出来就是破图。外壳图片
    #    一律写 data-asset="<key>"，由 bindShellAssets() 统一解析。
    src_index = ROOT / 'index.html'
    for m in re.finditer(r'(?:src|href)="(assets/[^"?]*)"',
                         src_index.read_text(encoding='utf-8')):
        problems.append(f'index.html 直接引用了 {m.group(1)}；'
                        f'改用 data-asset="{m.group(1)[len("assets/"):].rsplit(".", 1)[0]}"，'
                        f'否则会绕过预加载、在游戏中途重复下载')
    return problems


def main():
    if DIST.is_symlink():
        sys.exit('dist/ 是个符号链接，停手不删。')
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    for item in INCLUDE:
        src = ROOT / item
        if not src.exists():
            sys.exit(f'缺少 {item}')
        if src.is_dir():
            for f in sorted(src.rglob('*')):
                rel = f.relative_to(ROOT)
                if not f.is_file() or skipped(rel):
                    continue
                target = DIST / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, target)
        else:
            shutil.copy2(src, DIST / item)

    # 顺序要紧：先写素材版本串，game.js 的内容哈希才会反映这一步，
    # index.html 引用的也就是最终那份 game.js。
    asset_version = stamp_assets()
    src_hash, stamped = stamp_index()

    problems = audit()
    if problems:
        sys.exit('版本串没打全：\n  ' + '\n  '.join(problems))

    files = [p for p in DIST.rglob('*') if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(f'dist/ 已生成：{len(files)} 个文件，{total / 1048576:.1f} MB')
    print(f'最大文件：{biggest.relative_to(DIST)} '
          f'({biggest.stat().st_size / 1048576:.1f} MB)')
    print(f'素材版本 ASSET_VERSION = {asset_version}')
    for ref in stamped:
        print(f'  {ref}')
    print(f'位置：{DIST}')


if __name__ == '__main__':
    main()
