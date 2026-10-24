const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.py'), 'utf8');

assert.match(html, /id="rotate-gate"/, '竖屏需要独立的转屏引导层');
assert.match(html, /id="rotate-continue"/, '转屏引导需要允许竖屏继续的按钮');
assert.match(js, /mobile-landscape/, '布局脚本需要标记手机横屏状态');
assert.match(js, /portrait-allowed/, '布局脚本需要记录用户允许竖屏继续');
assert.match(css, /#rotate-gate/, '样式表需要定义转屏引导层');
assert.match(css, /body\.mobile-landscape/, '样式表需要独立的手机横屏规则');
assert.match(css, /safe-area-inset-left/, '手机横屏需要兼容左侧刘海安全区');
assert.match(css, /safe-area-inset-right/, '手机横屏需要兼容右侧刘海安全区');
assert.match(css, /min-height:\s*44px/, '主要手机按钮触控高度不得小于 44px');
assert.match(build, /except ImportError/, '构建脚本应在 fontTools 不可用时复用现有内嵌字体');
assert.match(build, /existing_index/, '字体回退应来自当前已构建页面');

console.log('mobile layout source contract: PASS');
