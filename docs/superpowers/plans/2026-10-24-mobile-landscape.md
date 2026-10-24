# Mobile Landscape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为《黄昏围城》增加手机横屏优先体验，同时保持桌面端不变。

**Architecture:** 在现有单页布局中加入方向引导层，由 `layout()` 维护移动端方向状态；通过限定在手机横屏和竖屏状态下的 CSS 完成交互密度、安全区和触控尺寸适配。构建流程保持不变。

**Tech Stack:** HTML、CSS、原生 JavaScript、Python 静态构建脚本、Node 静态回归测试、Chrome 视觉测试。

**Spec:** `docs/superpowers/specs/2026-10-24-mobile-landscape-design.md`

## Global Constraints

- 不改变桌面端表现。
- 竖屏提示允许跳过，且不依赖方向锁定 API。
- 手机横屏保持 16:9。
- 三个指定移动端尺寸均需截图检查。

## Review Focus

- 方向切换后引导层是否自动更新。
- 667×375 下工具栏和选项是否可点击且不重叠。
- 刘海屏安全区是否同时作用于左右两侧。
- 竖屏跳过引导后是否仍能进入游戏。
- 构建出的根目录页面是否包含源码改动。

---

### Task 1: 方向状态与引导层

**Files:**
- Modify: `src/index.html`
- Modify: `src/engine.js`
- Modify: `src/style.css`
- Test: `tests/mobile-layout.test.js`

- [x] 写入并运行静态回归测试，确认缺少引导层和移动横屏状态时失败。
- [x] 添加可跳过的转屏引导及方向状态。
- [x] 添加手机横屏安全区、44px 触控区、矮屏字幕和选项规则。
- [x] 运行回归测试并确认通过。

### Task 2: 构建、视觉验证与发布

**Files:**
- Regenerate: `index.html`
- Regenerate: `downloads/黄昏围城_单文件版.html`

- [x] 运行构建并进行 JavaScript 语法检查。
- [x] 在 390×844、844×390、667×375 和桌面尺寸截图检查。
- [x] 提交并推送到 `main`。
- [x] 检查 GitHub Pages 新版本可访问且包含方向引导层。

