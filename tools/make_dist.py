"""把运行时静态文件收拢到 dist/，供 Cloudflare Pages 直接上传。

只收游戏真正会加载的东西：index.html、src/、assets/。
assets/raw 与 image_形象/ 是重新生成素材用的源文件（见 .gitignore：
「不随运行时公开版发布」），所以这里显式排除，免得它们哪天回到本地时
被一起打包进 dist/。

用法：
    python tools/make_dist.py
之后在 Cloudflare Pages 里对 dist/ 做 Direct Upload，或：
    npx wrangler pages deploy dist --project-name <项目名>
"""
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
INCLUDE = ['index.html', 'src', 'assets']
SKIP_DIRS = [Path('assets/raw')]          # 只用于重新生成素材，不进公开版


def skipped(rel):
    return any(rel == d or d in rel.parents for d in SKIP_DIRS)


def main():
    if DIST.is_symlink():
        sys.exit('dist/ 是个符号链接，停手不删。')
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    count = 0
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
                count += 1
        else:
            shutil.copy2(src, DIST / item)
            count += 1

    files = [p for p in DIST.rglob('*') if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(f'dist/ 已生成：{len(files)} 个文件，{total / 1048576:.1f} MB')
    print(f'最大文件：{biggest.relative_to(DIST)} '
          f'({biggest.stat().st_size / 1048576:.1f} MB)')
    print(f'位置：{DIST}')


if __name__ == '__main__':
    main()
