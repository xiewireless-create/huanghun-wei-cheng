(function () {
  'use strict';
  var S = window.prepStory(window.STORY, window.VOICED);
  var VOICE_FILES = window.VOICE_FILES || [];
  var BGM = window.BGM || null;
  var $ = function (s) { return document.querySelector(s); };
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* 断行：在标点后切成"意群"，每个短意群整体不拆行，避免一两个字孤零零落到下一行 */
  var PUNC = '，。！？；：、…—';
  var CLOSE = '”’」）》';
  function units(line) {
    var out = [], cur = '', arr = Array.from(line);
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] === '|') { if (cur) out.push(cur); cur = ''; continue; } // | = 建议断行处，不显示
      cur += arr[i];
      if (PUNC.indexOf(arr[i]) >= 0) {
        while (i + 1 < arr.length && (PUNC.indexOf(arr[i + 1]) >= 0 || CLOSE.indexOf(arr[i + 1]) >= 0)) cur += arr[++i];
        out.push(cur); cur = '';
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  // n = 已经打出来的字数（打字机效果），未打出的字占位但不可见，排版不会跳
  function fmt(text, n) {
    var left = n == null ? Infinity : n;
    return String(text).split('\n').map(function (line) {
      return units(line).map(function (u) {
        var ch = Array.from(u), shown = ch.slice(0, Math.max(0, left)).join(''), hid = ch.slice(Math.max(0, left)).join('');
        left -= ch.length;
        var inner = esc(shown) + (hid ? '<span class="gh">' + esc(hid) + '</span>' : '');
        return ch.length <= 14 ? '<span class="u">' + inner + '</span>' : inner;
      }).join('');
    }).join('<br>');
  }

  var COLORS = { '李秀兰': 'var(--rouge)', '王佳': 'var(--slate)', '陈建国': 'var(--jade)', '护士': '#9fb3b8', '老姐妹': 'var(--dusk)' };
  // 名牌颜色在深底上需要更亮一点
  var NAMECOL = { '李秀兰': '#e08b7f', '王佳': '#a9bcd6', '陈建国': '#9cc0a6', '护士': '#b9cdd2', '老姐妹': '#f0b36d' };

  /* ───── 持久化（只存"哪条线通关过"，失败也不影响游玩） ───── */
  var done = {};
  try { done = JSON.parse(localStorage.getItem('hhwc_done') || '{}') || {}; } catch (e) { done = {}; }
  function markDone(line) { done[line] = true; try { localStorage.setItem('hhwc_done', JSON.stringify(done)); } catch (e) {} }

  /* ───── 布局：16:9 画框 ───── */
  var root = document.documentElement;
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var portrait = vh > vw * 1.15 && vw < 900;
    document.body.classList.toggle('portrait', portrait);
    var fw, fh, fx, fy;
    if (portrait) { fw = vw; fh = vw * 9 / 16; fx = 0; fy = 56; }
    else { fw = Math.min(vw, vh * 16 / 9); fh = fw * 9 / 16; fx = (vw - fw) / 2; fy = (vh - fh) / 2; }
    root.style.setProperty('--fw', fw + 'px'); root.style.setProperty('--fh', fh + 'px');
    root.style.setProperty('--fx', fx + 'px'); root.style.setProperty('--fy', fy + 'px');
    document.body.classList.toggle('short', !portrait && fh < 520);
  }
  window.addEventListener('resize', layout); layout();

  /* ───── 状态 ───── */
  var st = null;            // 当前周目
  var runTok = 0;           // 返回标题时作废正在播放的协程
  var ABORT = { abort: true };
  var sound = true;
  function check(tok) { if (tok !== runTok) throw ABORT; }

  /* ───── 背景 ───── */
  var bgA = $('#bgA'), bgB = $('#bgB'), curBg = null, front = bgA;
  // 单文件版会把图片和声音内嵌在 window.ASSETS 里；文件夹版直接读相对路径
  function asset(path) { return (window.ASSETS && window.ASSETS[path]) || path; }
  function img(id) { return asset('img/' + id + '.webp'); }
  function setBg(id) {
    if (!id || id === curBg) return;
    curBg = id;
    var back = front === bgA ? bgB : bgA, old = front;
    back.classList.remove('kb', 'on', 'top'); void back.offsetWidth;
    back.src = img(id);
    var show = function () {
      old.classList.remove('top'); back.classList.add('top', 'on', 'kb'); front = back;
      setTimeout(function () { if (front !== old) old.classList.remove('on'); }, 950);
    };
    if (back.complete && back.naturalWidth) show(); else back.onload = show;
    $('#ambient').style.backgroundImage = 'url(' + img(id) + ')';
  }

  /* ───── 等待点击 ───── */
  var advanceFn = null;
  function waitAdvance() { return new Promise(function (res) { advanceFn = res; }); }
  function advance() { if (advanceFn) { var f = advanceFn; advanceFn = null; f(); } }
  function onAdvanceInput(e) {
    if (e.target.closest('#bar, .modal, #choice, #explore, #btnwrap, .acts, #title, #memo')) return;
    if (typing) { finishType(); return; }
    advance();
  }
  $('#stage').addEventListener('click', onAdvanceInput);
  $('#hud').addEventListener('click', onAdvanceInput);
  $('#phone').addEventListener('click', onAdvanceInput);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeLog(); closeMemo(); return; }
    var openModal = document.querySelector('.modal:not([hidden])');
    if (/^[1-9]$/.test(e.key) && !$('#choice').hidden && !openModal) {
      var b = $('#choice').querySelectorAll('.opt')[+e.key - 1]; if (b) b.click(); return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && !openModal) {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      if (typing) { finishType(); return; }
      advance();
    }
  });

  /* ───── 配音 ───── */
  var voice = new Audio(), bgm = null;
  var BGM_VOL = .32, BGM_DUCK = .1;
  function duck(on) { if (bgm) bgm.volume = on ? BGM_DUCK : BGM_VOL; }
  function hasVoice(id) { return !!id && VOICE_FILES.indexOf(id) >= 0; }
  function playVoice(id) {
    voice.pause();
    if (!sound || !hasVoice(id)) { duck(false); return false; }
    voice.src = asset('audio/' + id + '.mp3'); voice.currentTime = 0;
    duck(true);
    voice.play().catch(function () { duck(false); });
    return true;
  }
  voice.addEventListener('ended', function () { duck(false); });
  // 音效：点物品 / 知识卡片 = tap；手机来消息 = msg
  var SFX = window.SFX || [], sfxCache = {};
  function sfx(name) {
    if (!sound || FF) return;
    var f = 'sfx_' + name + '.mp3'; if (SFX.indexOf(f) < 0) return;
    var a = sfxCache[name] || (sfxCache[name] = new Audio(asset('audio/' + f)));
    a.volume = .7; try { a.currentTime = 0; } catch (e) {}
    a.play().catch(function () {});
  }
  function stopVoice() { voice.pause(); duck(false); }
  function startBgm() {
    if (!BGM || !sound) return;
    if (!bgm) { bgm = new Audio(asset('audio/' + BGM)); bgm.loop = true; bgm.volume = BGM_VOL; }
    bgm.play().catch(function () {});
  }

  /* ───── 对话框（打字机） ───── */
  var dlg = $('#dlg'), dlgWho = dlg.querySelector('.who'), dlgName = dlg.querySelector('.who .nm'), dlgTxt = dlg.querySelector('.txt');
  var typing = false, typeTimer = null, typeFull = '';
  function finishType() { clearInterval(typeTimer); typing = false; dlgTxt.innerHTML = fmt(typeFull); dlg.classList.add('done'); }
  function typeText(s) {
    typeFull = s; dlg.classList.remove('done'); typing = true;
    var i = 0, total = Array.from(s.replace(/[\n|]/g, '')).length;
    dlgTxt.innerHTML = fmt(s, 0);
    clearInterval(typeTimer);
    typeTimer = setInterval(function () {
      i += 1; dlgTxt.innerHTML = fmt(s, i);
      if (i >= total) finishType();
    }, 34);
  }
  async function showLine(kind, who, text, vo, tok) {
    dlg.hidden = false;
    dlg.className = 'dlg ' + kind;
    if (who) { dlgWho.hidden = false; dlgName.textContent = who; }
    else { dlgWho.hidden = true; }
    typeText(text);
    playVoice(vo);
    log(who || (kind === 'think' ? '心里话' : ''), text);
    await waitAdvance(); check(tok);
    stopVoice();
  }
  function hideDlg() { dlg.hidden = true; }

  /* ───── 回看 ───── */
  var logLines = [];
  function log(w, t, pick) { logLines.push({ w: w, t: t, pick: pick }); }
  function openLog() {
    var box = $('#log .lines'); box.innerHTML = '';
    logLines.slice(-80).forEach(function (l) {
      var p = el('div', l.pick ? 'pick' : '');
      p.innerHTML = (l.w ? '<span class="w">' + esc(l.w) + '</span>' : '') + esc(l.t).replace(/\n/g, '<br>');
      box.appendChild(p);
    });
    $('#log').hidden = false; box.scrollTop = box.scrollHeight;
  }
  function closeLog() { $('#log').hidden = true; }
  $('#log').addEventListener('click', function (e) { if (e.target.id === 'log' || e.target.closest('[data-close]')) closeLog(); });

  /* ───── 模式：通话 / 短信 ───── */
  var mode = null, callTimer = null;
  function setMode(m, peer) {
    mode = m;
    document.body.classList.toggle('sms', m === 'sms');
    $('#call').hidden = m !== 'call';
    $('#phone').hidden = m !== 'sms';
    clearInterval(callTimer);
    if (m === 'call') {
      $('#call .p').textContent = '与' + peer + '通话中';
      var t0 = Date.now(), t = $('#call .t');
      var tick = function () { var s = Math.floor((Date.now() - t0) / 1000); t.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
      tick(); callTimer = setInterval(tick, 1000);
    }
    if (m === 'sms') { $('#phone .peer').textContent = peer; $('#phone .msgs').innerHTML = ''; }
  }
  // 妈妈发来的是语音（老人习惯发语音），点语音条可以重听；女儿发的是文字
  async function bubble(cls, text, vo, tok, who) {
    hideDlg();
    var box = $('#phone .msgs');
    if (FF) { // 快进时只把消息摆上去
      box.appendChild(el('div', 'bub ' + cls + (cls === 'in' && who === '李秀兰' ? ' voice' : ''), cls === 'in' && who === '李秀兰'
        ? '<button class="vbar" type="button" tabindex="-1"><i class="play"></i><span class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="sec">' + Math.max(3, Math.round(Array.from(text).length / 4.5)) + '″</span></button><div class="tr">' + fmt(text) + '</div>' : fmt(text)));
      box.scrollTop = box.scrollHeight; log(who, text); return;
    }
    sfx('msg');
    var asVoice = cls === 'in' && who === '李秀兰';
    var b;
    if (asVoice) {
      var sec = Math.max(3, Math.round(Array.from(text).length / 4.5));
      b = el('div', 'bub in voice', '<button class="vbar" type="button" aria-label="播放语音"><i class="play"></i><span class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="sec">' + sec + '″</span></button><div class="tr">' + fmt(text) + '</div>');
      var bar = b.querySelector('.vbar');
      var run = function () {
        b.classList.add('playing');
        var real = playVoice(vo);
        clearTimeout(b._t);
        if (!real) b._t = setTimeout(function () { b.classList.remove('playing'); }, sec * 1000);
      };
      voice.addEventListener('ended', function () { b.classList.remove('playing'); });
      bar.addEventListener('click', function (e) { e.stopPropagation(); run(); });
      box.appendChild(b); run();
    } else {
      b = el('div', 'bub ' + cls, fmt(text));
      box.appendChild(b); playVoice(vo);
    }
    box.scrollTop = box.scrollHeight;
    log(who, text);
    await waitAdvance(); check(tok); stopVoice(); b.classList.remove('playing');
  }

  /* ───── 全屏页 ───── */
  function page(html, cls) {
    var p = $('#page'); p.className = 'page' + (cls ? ' ' + cls : ''); p.innerHTML = html; p.hidden = false; return p;
  }
  function closePage() { $('#page').hidden = true; $('#page').innerHTML = ''; }
  function clickPage(html, cls, tok) {
    return new Promise(function (res, rej) {
      var p = page(html, cls);
      var go = function (e) { if (e && e.target.closest('button')) return; p.removeEventListener('click', go); advanceFn = null; closePage(); res(); };
      p.addEventListener('click', go);
      advanceFn = function () { go(); };
    }).then(function () { check(tok); });
  }
  function povLabel() { return st.line === 'mom' ? '老人视角 · 李秀兰' : '子女视角 · 王佳'; }

  /* ───── 各类步骤 ───── */
  async function cap(text, tok) {
    hideDlg();
    var c = el('div', 'capband', '<span>' + esc(text) + '</span>'); $('#stage').appendChild(c);
    var t = setTimeout(advance, 2200);
    await waitAdvance(); clearTimeout(t); c.remove(); check(tok);
  }
  async function second(text, tok) {
    if (!done[st.line === 'mom' ? 'dau' : 'mom']) return;
    hideDlg();
    var c = el('div', 'second', '<span>' + esc(text) + '</span>'); $('#stage').appendChild(c);
    await waitAdvance(); c.remove(); check(tok);
  }

  async function choose(stp, tok) {
    hideDlg();
    if (FF && FF.queue.length) {
      var key = FF.queue.shift(), pk = stp.opts.filter(function (o) { return o.key === key; })[0] || stp.opts[0];
      if (!FF.queue.length && FF.stop === 'after') endFF();
      record(stp, pk);
      await play(pk.then, tok);
      return;
    }
    if (FF) endFF();
    st.pending = stp.choice;
    saveGame();
    toast('已自动存档 · ' + chapterName(stp.choice));
    var box = $('#choice'); box.innerHTML = '';
    box.appendChild(el('div', 'q', esc(stp.prompt)));
    var list = el('div', 'opts'); box.appendChild(list);
    var picked = await new Promise(function (res) {
      stp.opts.forEach(function (o, i) {
        var b = el('button', 'opt', '<span class="k">' + (i + 1) + '</span><span>' + esc(o.label) + '</span>');
        b.addEventListener('click', function () { res(o); });
        list.appendChild(b);
      });
      box.hidden = false;
      setTimeout(function () { var f = list.querySelector('.opt'); if (f) f.focus({ preventScroll: true }); }, 50);
    });
    check(tok);
    box.hidden = true;
    record(stp, picked);
    st.pending = null;
    saveGame();
    await play(picked.then, tok);
  }

  function record(stp, picked) {
    if (!(stp.choice in st.choices)) { st.S += picked.S || 0; st.R += picked.R || 0; }
    st.choices[stp.choice] = picked.key;
    st.picks.push({ q: stp.prompt, a: picked.label, id: stp.choice, key: picked.key, dS: picked.S || 0, dR: picked.R || 0 });
    log('你的选择', picked.label, true);
    dbg();
  }

  async function explore(ex, tok) {
    hideDlg();
    await new Promise(function (r) { setTimeout(r, 700); }); check(tok);
    var layer = $('#explore'), bar = $('#exbar');
    layer.querySelectorAll('.hot').forEach(function (h) { h.remove(); });
    bar.innerHTML = '';
    var chips = el('div', 'chips'), label = el('span', '', esc(ex.prompt)), go = el('button', 'btn-go', '继续 →');
    label.style.color = 'var(--paper)';
    var busy = false;
    var open = async function (it, node) {
      if (busy) return; busy = true; node.classList.add('seen'); sfx('tap');
      if (it.steps) { layer.hidden = true; await play(it.steps, tok); hideDlg(); layer.hidden = false; }
      else await objModal(it);
      busy = false;
    };
    ex.items.forEach(function (it) {
      if (it.x != null) {
        var h = el('button', 'hot', '<span class="ring"></span><span class="lb">' + esc(it.label) + '</span>');
        h.style.setProperty('--x', it.x); h.style.setProperty('--y', it.y);
        h.setAttribute('aria-label', it.label);
        h.addEventListener('click', function () { open(it, h); });
        layer.appendChild(h);
        var pc = el('button', 'chip pos', esc(it.label));
        pc.addEventListener('click', function () { h.classList.add('seen'); open(it, pc); });
        chips.appendChild(pc);
      } else {
        var c = el('button', 'chip', esc(it.label));
        c.addEventListener('click', function () { open(it, c); });
        chips.appendChild(c);
      }
    });
    bar.appendChild(chips); bar.appendChild(label); bar.appendChild(go);
    layer.hidden = false;
    await new Promise(function (res) { go.addEventListener('click', function () { if (!busy) res(); }); });
    check(tok);
    layer.hidden = true;
  }
  function objModal(it) {
    return new Promise(function (res) {
      var m = $('#obj');
      m.innerHTML = '';
      var card = el('div', 'obj');
      card.appendChild(el('img', '')).src = img(it.img);
      card.querySelector('img').alt = it.label;
      var body = el('div', 'body');
      body.appendChild(el('h3', '', esc(it.label)));
      if (it.toasts) { var ts = el('div', 'toasts'); it.toasts.forEach(function (t, i) { var x = el('div', 'toast', esc(t)); x.style.animationDelay = (i * .5) + 's'; ts.appendChild(x); }); body.appendChild(ts); }
      body.appendChild(el('p', '', fmt(it.text)));
      var act = el('div', 'act'), b = el('button', '', '放回去');
      act.appendChild(b); body.appendChild(act); card.appendChild(body); m.appendChild(card);
      m.hidden = false; b.focus({ preventScroll: true });
      log(it.label, it.text);
      var close = function () { m.hidden = true; res(); };
      b.addEventListener('click', close);
      m.onclick = function (e) { if (e.target === m) close(); };
    });
  }

  function slides(key, tok) {
    var c = S.cards[key];
    sfx('tap');
    return new Promise(function (res) {
      var m = $('#obj'); m.innerHTML = ''; m.onclick = null;
      var w = el('div', 'slides');
      w.appendChild(el('h2', '', esc(c.title)));
      var row = el('div', 'row');
      c.items.forEach(function (it, i) {
        row.appendChild(el('div', 'card', '<span class="n">' + ['一', '二', '三', '四'][i] + '</span><h4>' + esc(it.h) + '</h4><p>' + fmt(it.p) + '</p>'));
      });
      w.appendChild(row);
      var acts = el('div', 'acts'), go = el('button', 'btn-go', '继续');
      acts.appendChild(go); w.appendChild(acts); m.appendChild(w); m.hidden = false;
      go.focus({ preventScroll: true });
      go.addEventListener('click', function () { m.hidden = true; res(); });
    }).then(function () { check(tok); });
  }

  function leaflet(key, tok) {
    var c = S.info[key], i = 0;
    return new Promise(function (res) {
      var m = $('#obj'); m.onclick = null;
      var render = function () {
        var it = c.items[i]; sfx('tap');
        m.innerHTML = '';
        var w = el('div', 'leaflet');
        w.appendChild(el('span', 'tag', esc(c.tag)));
        w.appendChild(el('h3', '', esc(it.k)));
        w.appendChild(el('p', '', fmt(it.p)));
        var foot = el('div', 'foot', '<span>' + (c.items.length > 1 ? (i + 1) + ' / ' + c.items.length : '') + '</span>');
        var b = el('button', '', i < c.items.length - 1 ? '下一张' : '知道了');
        b.addEventListener('click', function () { i += 1; if (i < c.items.length) render(); else { m.hidden = true; res(); } });
        foot.appendChild(b); w.appendChild(foot); m.appendChild(w); m.hidden = false; b.focus({ preventScroll: true });
        log(c.tag + ' · ' + it.k, it.p);
      };
      render();
    }).then(function () { check(tok); });
  }

  function button(label, tok) {
    hideDlg();
    return new Promise(function (res) {
      var w = $('#btnwrap'); w.innerHTML = '';
      var b = el('button', 'btn-go', esc(label)); w.appendChild(b); w.hidden = false; b.focus({ preventScroll: true });
      b.addEventListener('click', function () { w.hidden = true; res(); });
    }).then(function () { check(tok); });
  }

  async function step(x, tok) {
    check(tok);
    if (x.bg) setBg(x.bg);
    if ('mode' in x) setMode(x.mode, x.peer);
    if (FF) {
      if (x.who) { if (mode === 'sms' && x.who !== '旁白') await bubble(x.who === st.self ? 'out' : 'in', x.text, null, tok, x.who); else log(x.who === '旁白' ? '' : x.who, x.text); }
      if (x.narr) log('', x.narr);
      if (x.think) log('心里话', x.think);
      if (x.chapter) curChapter = x.chapter;
      if (x.choice) await choose(x, tok);
      if (x.ending) await ending(tok);
      if (FF) return;
      return;
    }
    if (x.chapter) curChapter = x.chapter;
    if (x.chapter) { hideDlg(); await clickPage('<div class="chap"><span class="tt">' + fmt(x.title) + '</span>' + (x.when ? '<span class="when">' + esc(x.when) + '</span>' : '') + (x.intro ? '<p class="intro">' + fmt(x.intro) + '</p>' : '') + '<small>点击继续</small></div>', '', tok); }
    if (x.cap) await cap(x.cap, tok);
    if (x.quote) { hideDlg(); await clickPage('<div class="quote">' + fmt(x.quote) + '<small>点击继续</small></div>', 'clear', tok); }
    if (x.second) await second(x.second, tok);
    if (x.explore) await explore(x.explore, tok);
    if (x.who) {
      if (mode === 'sms' && x.who !== '旁白') await bubble(x.who === st.self ? 'out' : 'in', x.text, x.vo, tok, x.who);
      else if (x.who === '旁白') await showLine('narr', '', x.text, x.vo, tok);
      else await showLine('say', x.who, x.text, x.vo, tok);
    }
    if (x.narr) await showLine('narr', '', x.narr, null, tok);
    if (x.think) await showLine('think', '心里话', x.think, null, tok);
    if (x.sms) {
      setMode('sms', '佳佳');
      await bubble('in', x.sms, null, tok, '佳佳');
      setMode(null);
    }
    if (x.choice) await choose(x, tok);
    if (x.cards) await slides(x.cards, tok);
    if (x.info) { hideDlg(); await leaflet(x.info, tok); }
    if (x.btn) await button(x.btn, tok);
    if (x.ending) await ending(tok);
  }
  async function play(steps, tok) { for (var i = 0; i < steps.length; i++) await step(steps[i], tok); }

  /* ───── 结局与总结 ───── */
  async function ending(tok) {
    await play(st.line === 'dau' && S.decisionDau ? S.decisionDau : S.decision, tok);
    hideDlg(); setMode(null);
    var key = st.choices.final || 'B';
    var good = st.S >= 3, E = S.endings[key], body = good ? E.good : E.bad;
    setBg(body.bg);
    await clickPage('<div class="endt"><span class="lbl">结局 ' + key + '</span><h2>' + esc(E.title) + '</h2><span class="state">母女之间 · ' + (good ? '互相体谅，和解' : '心存隔阂') + '</span></div>', 'scene', tok);
    await play(body.steps, tok);
    hideDlg();
    var rd = st.R >= 3 ? S.ready.yes : S.ready.no;
    setBg(rd.bg);
    await clickPage('<div class="ready' + (st.R >= 3 ? '' : ' no') + '"><p>' + fmt(rd.text) + '</p>' +
      (rd.list ? '<ul>' + rd.list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>', 'scene', tok);
    setBg(body.bg);
    await clickPage('<div class="quote">' + fmt(body.reflect) + '<small>点击继续</small></div>', 'scene', tok);
    markDone(st.line); clearSave();
    await summary(key, good, tok);
    await dataPage(tok);
    finalPage();
  }

  function dots(n, c) { var h = ''; for (var i = 0; i < 5; i++) h += '<i class="' + (i < n ? 'on' : '') + '"></i>'; return '<div class="dots" style="--c:' + c + '">' + h + '</div>'; }
  function tagOf(p) {
    if (p.id === 'final') return '';
    if (p.dS > 0 && p.dR > 0) return '<em class="t both">听见了，也想到了以后</em>';
    if (p.dS > 0) return '<em class="t s">听见了对方</em>';
    if (p.dR > 0) return '<em class="t r">想到了现实</em>';
    if (p.dS < 0) return '<em class="t neg">这句说重了</em>';
    return '<em class="t">先放下了</em>';
  }
  function summary(key, good, tok) {
    return new Promise(function (res) {
      var Sv = Math.max(0, Math.min(5, st.S)), Rv = Math.max(0, Math.min(5, st.R));
      var other = st.line === 'mom' ? '女儿' : '妈妈';
      var html = '<div class="summary">' +
        '<span class="eyebrow">结局 ' + key + ' · ' + esc(S.endings[key].title) + '</span><h2>这一次，你听见了什么</h2>' +
        '<div class="meters">' +
        '<div class="meter"><span class="nm">听见对方，也说出自己</span>' + dots(Sv, 'var(--dusk-deep)') +
        '<span class="res">' + (good ? '母女互相体谅' : '母女心存隔阂') + '</span>' +
        '<p>' + (good ? '你听见了对方的需要，也把自己的难处说出了口。' : '有些话这一次还没说出口：对方的需要，或者你自己的难处。') + '</p></div>' +
        '<div class="meter"><span class="nm">把现实摆到桌面上</span>' + dots(Rv, 'var(--jade)') +
        '<span class="res">' + (st.R >= 3 ? '基础准备已落实' : '安排还待落实') + '</span>' +
        '<p>' + (st.R >= 3 ? '住房、医疗、照护、财产，你提前想到了几件，也落到了纸上。' : '住房、医疗、照护、财产，几件要紧事又留到了“下次再说”。') + '</p></div>' +
        '</div><h3>你说过的话</h3><div class="picks">' +
        st.picks.map(function (p) { return '<div><span class="q">' + esc(p.q) + '</span><span class="a">' + esc(p.a) + tagOf(p) + '</span></div>'; }).join('') +
        '</div><p class="ask">如果重来一次，你最想换掉哪一句？<br>站在' + other + '那头，这些话又是怎么听到的？</p>' +
        '<div class="acts"><button class="btn-ghost dark" id="sumback">↺ 回到某个选择</button><button class="btn-go" id="sumgo">继续</button></div></div>';
      var p = page(html, 'scene sum');
      p.style.cursor = 'default';
      var card = p.querySelector('.summary'); card.scrollTop = 0;
      $('#sumgo').focus({ preventScroll: true });
      $('#sumgo').addEventListener('click', function () { closePage(); res(); });
      $('#sumback').addEventListener('click', openMemo);
    }).then(function () { check(tok); });
  }
  function dataPage(tok) {
    var d = S.data;
    return new Promise(function (res) {
      var html = '<div class="data"><h2>' + esc(d.title) + '</h2><p class="lead">' + esc(d.lead) + '</p><div class="grid">' +
        d.items.map(function (it) { return '<div><b>' + esc(it.n) + '</b><span>' + esc(it.p) + '</span></div>'; }).join('') +
        '</div><span class="src">' + esc(d.source) + '</span><div class="acts"><button class="btn-go" id="datago">继续</button></div></div>';
      page(html, '').style.cursor = 'default';
      $('#datago').addEventListener('click', function () { closePage(); res(); });
    }).then(function () { check(tok); });
  }
  function finalPage() {
    var other = st.line === 'mom' ? 'dau' : 'mom';
    var html = '<div class="final"><div class="quote">这次，你听见了谁的话？<br>换个身份<br>再听听另一头</div>' +
      '<div class="acts"><button class="btn-go" id="swap">切换身份：' + S.roles[other].self + '</button><button class="btn-ghost" id="home">回到标题</button></div></div>';
    page(html, '').style.cursor = 'default';
    $('#swap').addEventListener('click', function () { closePage(); start(other); });
    $('#home').addEventListener('click', function () { closePage(); title(); });
  }

  /* ───── 标题与开始 ───── */
  function resetUi() {
    hideDlg(); setMode(null); stopVoice();
    ['#choice', '#explore', '#btnwrap', '#obj', '#log', '#confirm', '#memo', '#toast'].forEach(function (s) { $(s).hidden = true; });
    document.querySelectorAll('.capband, .second').forEach(function (n) { n.remove(); });
    advanceFn = null; clearInterval(typeTimer); typing = false;
  }
  function title() {
    runTok++; resetUi(); closePage();
    $('#bar').hidden = true; $('#pov').hidden = true;
    setBg('P01');
    var t = $('#title'); t.hidden = false;
    ['mom', 'dau'].forEach(function (k) {
      var b = t.querySelector('[data-line="' + k + '"] .done'); b.hidden = !done[k];
    });
    var sv = loadSave(), cb = t.querySelector('.cont');
    cb.hidden = !sv;
    if (sv) {
      var nd = NODES[sv.line][Math.min(sv.keys.length, NODES[sv.line].length - 1)];
      cb.innerHTML = '继续上次<small>' + (sv.line === 'mom' ? '老人视角' : '子女视角') + ' · ' + esc(nd ? nd.chapter : '') + '</small>';
    }
  }
  async function start(line, ff) {
    runTok++; var tok = runTok;
    resetUi(); closePage(); closeMemo();
    $('#title').hidden = true; $('#bar').hidden = false;
    st = { line: line, self: S.roles[line].self, S: 0, R: 0, choices: {}, picks: [], pending: null };
    logLines = []; curChapter = '序章';
    FF = ff && ff.queue && ff.queue.length ? ff : (ff && ff.stop === 'choice' ? { queue: [], stop: 'choice' } : null);
    $('#ffveil').hidden = !FF;
    $('#pov').textContent = povLabel(); $('#pov').hidden = !TEST; dbg();
    startBgm();
    try { await play(S[line], tok); }
    catch (e) { if (e !== ABORT) { console.error(e); } }
  }

  /* ───── 存档与回溯 ───── */
  var FF = null, curChapter = '序章';
  function endFF() { FF = null; $('#ffveil').hidden = true; }
  // 每条线的所有选择节点（用于"回忆"红线）
  var BIG = ['m_tell', 'm_house', 'd_first', 'd_reply', 'final'];
  var NODES = {};
  ['mom', 'dau'].forEach(function (line) {
    var list = [], ch = '序章';
    var walk = function (steps) { steps.forEach(function (x) { if (x.chapter) ch = x.chapter; if (x.choice) list.push({ id: x.choice, prompt: x.prompt, chapter: ch, big: BIG.indexOf(x.choice) >= 0 }); }); };
    walk(S[line]); walk(line === 'dau' && S.decisionDau ? S.decisionDau : S.decision);
    NODES[line] = list;
  });
  function chapterName(id) { var n = NODES[st.line].filter(function (x) { return x.id === id; })[0]; return n ? n.chapter : ''; }
  var SAVE_KEY = 'hhwc_save';
  function saveGame() {
    if (!st) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ line: st.line, keys: st.picks.map(function (p) { return p.key; }), at: Date.now() })); } catch (e) {}
  }
  function loadSave() { try { var v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && v.line && Array.isArray(v.keys) ? v : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  var toastT = null;
  function toast(t) {
    var n = $('#toast'); n.textContent = t; n.hidden = false; n.classList.remove('show'); void n.offsetWidth; n.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { n.hidden = true; }, 2600);
  }
  function rewind(k) {
    var keys = st.picks.slice(0, k).map(function (p) { return p.key; });
    start(st.line, { queue: keys, stop: 'choice' });
  }
  function tagText(p) {
    if (p.id === 'final') return '';
    if (p.dS > 0 && p.dR > 0) return '<em class="t both">听见了，也想到了以后</em>';
    if (p.dS > 0) return '<em class="t s">听见了对方</em>';
    if (p.dR > 0) return '<em class="t r">想到了现实</em>';
    if (p.dS < 0) return '<em class="t neg">这句说重了</em>';
    return '<em class="t">先放下了</em>';
  }
  function openMemo() {
    if (!st) return;
    var m = $('#memo'), list = m.querySelector('.thread'); list.innerHTML = '';
    var lastCh = null;
    NODES[st.line].forEach(function (n, i) {
      if (n.chapter !== lastCh) { list.appendChild(el('div', 'ch', '<span>' + esc(n.chapter) + '</span>')); lastCh = n.chapter; }
      var p = st.picks[i], cur = !p && st.pending === n.id;
      var cls = 'node' + (n.big ? ' big' : '') + (p ? ' done' : cur ? ' cur' : ' todo');
      var item = el('div', cls);
      if (p) {
        item.innerHTML = '<i class="mk"></i><div class="card"><span class="q">' + esc(n.prompt) + '</span><span class="a">' + esc(p.a) + tagText(p) + '</span><button class="back" type="button">↺ 回到这里重选</button></div>';
        var b = item.querySelector('.back');
        b.addEventListener('click', function () {
          var c = item.querySelector('.card');
          if (c.querySelector('.ask')) return;
          var ask = el('div', 'ask', '<span>回到这里重新选择？这之后的选择会被清空。</span><button class="yes" type="button">确定</button><button class="no" type="button">再想想</button>');
          c.appendChild(ask); b.hidden = true;
          ask.querySelector('.yes').addEventListener('click', function () { rewind(i); });
          ask.querySelector('.no').addEventListener('click', function () { ask.remove(); b.hidden = false; });
        });
      } else if (cur) {
        item.innerHTML = '<i class="mk"></i><div class="card"><span class="q">' + esc(n.prompt) + '</span><span class="a now">正在选择</span></div>';
      } else {
        item.innerHTML = '<i class="mk"></i><div class="card"><span class="q">？？？</span></div>';
      }
      list.appendChild(item);
    });
    m.hidden = false;
    var f = m.querySelector('.close'); if (f) f.focus({ preventScroll: true });
  }
  function closeMemo() { $('#memo').hidden = true; }
  $('#memo').addEventListener('click', function (e) { if (e.target.id === 'memo' || e.target.closest('.close')) closeMemo(); });
  $('#b-memo').addEventListener('click', openMemo);

  /* 标题页按钮 */
  (function buildTitle() {
    var t = $('#title');
    t.querySelector('.cont').addEventListener('click', function () { var sv = loadSave(); if (sv) start(sv.line, { queue: sv.keys.slice(), stop: 'after' }); });
    t.querySelector('h1').textContent = S.title;
    t.querySelector('.head p').textContent = S.subtitle;
    t.querySelector('.syn').innerHTML = fmt(S.synopsis || '');
    t.querySelector('.synbtn').addEventListener('click', function () {
      var m = $('#obj'); m.innerHTML = '';
      var w = el('div', 'leaflet'); w.appendChild(el('span', 'tag', '故事简介'));
      w.appendChild(el('p', '', fmt(S.synopsis || '')));
      var f = el('div', 'foot', '<span></span>'), b = el('button', '', '知道了'); f.appendChild(b); w.appendChild(f);
      m.appendChild(w); m.hidden = false; b.focus({ preventScroll: true });
      b.addEventListener('click', function () { m.hidden = true; });
      m.onclick = function (e) { if (e.target === m) m.hidden = true; };
    });
    ['mom', 'dau'].forEach(function (k) {
      var b = t.querySelector('[data-line="' + k + '"]');
      b.querySelector('.nm').textContent = S.roles[k].label;
      b.querySelector('.mt').textContent = S.roles[k].meta;
      b.addEventListener('click', function () { start(k); });
    });
  })();

  /* 顶栏 */
  $('#b-log').addEventListener('click', openLog);
  $('#b-snd').addEventListener('click', function () {
    sound = !sound; this.textContent = sound ? '声音：开' : '声音：关';
    if (!sound) { stopVoice(); if (bgm) bgm.pause(); } else startBgm();
  });
  $('#b-home').addEventListener('click', function () {
    var c = $('#confirm'); c.hidden = false;
    c.querySelector('[data-yes]').onclick = function () { c.hidden = true; title(); };
    c.querySelector('[data-no]').onclick = function () { c.hidden = true; };
  });

  /* 预加载图片（标题出现后慢慢加载） */
  setTimeout(function () {
    var ids = (window.PRELOAD || []);
    var i = 0; (function next() { if (i >= ids.length) return; var im = new Image(); im.onload = im.onerror = next; im.src = img(ids[i++]); })();
  }, 800);

  /* 测试模式：网址后加 #test，左上角实时显示分数 */
  var TEST = /test/.test(location.hash);
  function dbg() {
    if (!TEST || !st) return;
    $('#pov').textContent = povLabel() + '　｜　S ' + st.S + ' · R ' + st.R + '　' + Object.keys(st.choices).map(function (k) { return k + ':' + st.choices[k]; }).join(' ');
  }
  window.__game = { start: start, title: title, state: function () { return st; } };
  title();
})();
