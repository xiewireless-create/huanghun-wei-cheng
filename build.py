#!/usr/bin/env python3
"""把 src/ 打包成可直接上传的 dist/：
   - 字体按用到的字裁剪后内嵌（霞鹜文楷 Regular / Medium）
   - 扫描 audio/ 里已有的配音文件，自动接上
   - 导出配音表 dist/配音表.csv
用法：python3 build.py
"""
import base64, csv, io, json, os, re, shutil, subprocess, sys
try:
    from fontTools import subset
    from fontTools.ttLib import TTFont
except ImportError:
    subset = TTFont = None

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
DIST = os.path.join(HERE, 'dist')
FONT_DIR = os.environ.get('FONT_DIR', '/tmp/claude-0/fontpkg/package')

def read(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return f.read()

story, prep, engine, style, tpl = (read(n) for n in ['story.js', 'prep.js', 'engine.js', 'style.css', 'index.html'])

# 用到的字符
text = story + engine + tpl
chars = set(ch for ch in text if ord(ch) > 0x2000)
chars |= set('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,:;!?()[]/-+%·…—“”‘’《》、。，：；！？（）「」')

def subset_font(path):
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']
    f = TTFont(path)
    s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(f)
    buf = io.BytesIO(); f.flavor = 'woff2'; f.save(buf)
    return base64.b64encode(buf.getvalue()).decode()

font_specs = [('WenKai', 'LXGWWenKai-Regular.ttf', 400), ('WenKai Display', 'LXGWWenKai-Medium.ttf', 500)]
can_subset = subset is not None and all(os.path.exists(os.path.join(FONT_DIR, fn)) for _, fn, _ in font_specs)
fonts_css = ''
if can_subset:
    for fam, fn, w in font_specs:
        b64 = subset_font(os.path.join(FONT_DIR, fn))
        fonts_css += "@font-face{font-family:'%s';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:%d;font-display:swap}\n" % (fam, b64, w)
        if fam == 'WenKai Display':
            fonts_css += "@font-face{font-family:'WenKai';src:url(data:font/woff2;base64,%s) format('woff2');font-weight:500 700;font-display:swap}\n" % b64
else:
    # 发布机没有 fontTools 或原始字体时，复用上一次正式构建已经内嵌的字体。
    existing_index = os.path.join(HERE, 'index.html')
    existing = open(existing_index, encoding='utf-8').read() if os.path.exists(existing_index) else ''
    match = re.search(r'<style>((?:@font-face\{.*?\}\s*)+)</style>', existing, re.S)
    if not match:
        raise RuntimeError('缺少字体工具、字体源文件，且现有 index.html 中没有可复用的内嵌字体')
    fonts_css = match.group(1)
    print('复用现有页面中的内嵌字体')

# 配音与音乐
audio_dir = os.path.join(HERE, 'audio')
vo = sorted(f[:-4] for f in os.listdir(audio_dir) if re.match(r'VO\d+\.mp3$', f)) if os.path.isdir(audio_dir) else []
bgm = 'bgm.mp3' if os.path.exists(os.path.join(audio_dir, 'bgm.mp3')) else None
sfx = sorted(f for f in os.listdir(audio_dir) if f.startswith('sfx_') and f.endswith('.mp3')) if os.path.isdir(audio_dir) else []
imgs = sorted(f[:-5] for f in os.listdir(os.path.join(HERE, 'img')) if f.endswith('.webp'))
order = ['P01', 'E01', 'O01', 'O02', 'O03', 'O04', 'O05', 'E06', 'O06', 'O07', 'O08']
used = set(re.findall(r"(?:bg|img): '(\w+)'", story)) | {'P01'}
preload = order + [i for i in imgs if i not in order and i in used]
manifest = 'window.VOICE_FILES=%s;window.BGM=%s;window.SFX=%s;window.PRELOAD=%s;' % (json.dumps(vo), json.dumps(bgm), json.dumps(sfx), json.dumps(preload))

page = (tpl.replace('/*FONTS*/', fonts_css).replace('/*STYLE*/', style)
        .replace('/*MANIFEST*/', manifest).replace('/*STORY*/', story)
        .replace('/*PREP*/', prep).replace('/*ENGINE*/', engine))

if os.path.isdir(DIST): shutil.rmtree(DIST)
os.makedirs(DIST)
shutil.copytree(os.path.join(HERE, 'img'), os.path.join(DIST, 'img'))
if vo or bgm or sfx:
    os.makedirs(os.path.join(DIST, 'audio'))
    for f in [v + '.mp3' for v in vo] + ([bgm] if bgm else []) + sfx:
        shutil.copy(os.path.join(audio_dir, f), os.path.join(DIST, 'audio', f))

# 完整网页（部署用）
head = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
title_end = page.index('</style>', page.index('/*STYLE*/') if '/*STYLE*/' in page else 0)
# 把 <title>/<meta>/<style> 放进 head，其余进 body
split_at = page.index('<div id="stage">')
full = head + page[:split_at] + '</head>\n<body>\n' + page[split_at:] + '</body>\n</html>\n'
with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f: f.write(full)
# 单文件版：图片、声音全部内嵌，一个 html 走到哪都能玩（文件较大）
mime = {'.webp': 'image/webp', '.mp3': 'audio/mpeg'}
assets = {}
for f in sorted(os.listdir(os.path.join(HERE, 'img'))):
    if f.endswith('.webp') and f[:-5] in used:
        assets['img/' + f] = 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(HERE, 'img', f), 'rb').read()).decode()
for f in [v + '.mp3' for v in vo] + ([bgm] if bgm else []) + sfx:
    assets['audio/' + f] = 'data:audio/mpeg;base64,' + base64.b64encode(open(os.path.join(audio_dir, f), 'rb').read()).decode()
single = full.replace('<script>' + manifest, '<script>window.ASSETS=' + json.dumps(assets) + ';' + manifest, 1)
assert single != full
single_name = '黄昏围城_单文件版.html'
with open(os.path.join(DIST, single_name), 'w', encoding='utf-8') as f: f.write(single)
print('单文件版 %.1f MB' % (os.path.getsize(os.path.join(DIST, single_name)) / 1e6))

# Artifact 预览用（不带 html/head/body 外壳）
with open(os.path.join(HERE, 'artifact.html'), 'w', encoding='utf-8') as f: f.write(page)

# 配音表
js = "global.window=global;%s\n%s\nprepStory(window.STORY, window.VOICED);process.stdout.write(JSON.stringify(window.STORY._voiceRows));" % (story, prep)
rows = json.loads(subprocess.check_output(['node', '-e', js]).decode())
with open(os.path.join(DIST, '配音表.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(['编号(文件名)', '角色', '台词', '出现位置', '已配'])
    for r in rows: w.writerow([r['id'], r['who'], r['text'], r['where'], '是' if r['id'] in vo else ''])

size = os.path.getsize(os.path.join(DIST, 'index.html'))
print('页面 %.0f KB，字符 %d 个，配音 %d/%d 条，图片 %d 张' % (size / 1024, len(chars), len(vo), len(rows), len(imgs)))
