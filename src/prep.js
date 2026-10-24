/* 预处理：补全"选项台词"，并给每句配音台词编号（VO001…）。
   浏览器和导出配音表的脚本共用这一份，保证编号一致。 */
(function (root) {
  function unquote(s) { return s.replace(/^“/, '').replace(/”$/, ''); }

  function prepSteps(steps, self) {
    steps.forEach(function (st) {
      if (st.choice) {
        st.opts.forEach(function (o, i) {
          if (!o.key) o.key = String.fromCharCode(97 + i);
          o.then = o.then || [];
          var first = o.then[0];
          var spoken = /^“[^”]*”$/.test(o.label);
          if (spoken && !(first && first.who === self)) {
            o.then.unshift({ who: self, text: unquote(o.label), echo: true });
          }
          prepSteps(o.then, self);
        });
      }
      if (st.explore) st.explore.items.forEach(function (it) { if (it.steps) prepSteps(it.steps, self); });
    });
  }

  function walk(steps, fn, ctx) {
    steps.forEach(function (st) {
      fn(st, ctx);
      if (st.choice) st.opts.forEach(function (o) { walk(o.then, fn, ctx + ' / ' + st.prompt + ' → ' + o.label.slice(0, 14)); });
      if (st.explore) st.explore.items.forEach(function (it) { if (it.steps) walk(it.steps, fn, ctx + ' / ' + it.label); });
    });
  }

  root.prepStory = function (S, VOICED) {
    if (S._prepped) return S;
    prepSteps(S.mom, S.roles.mom.self);
    prepSteps(S.dau, S.roles.dau.self);
    prepSteps(S.decision, '李秀兰');
    if (S.decisionDau) prepSteps(S.decisionDau, '王佳');
    var n = 0, rows = [];
    function tag(st, ctx) {
      if (st.who && VOICED.indexOf(st.who) >= 0) {
        st.vo = 'VO' + String(++n).padStart(3, '0');
        rows.push({ id: st.vo, who: st.who, text: st.text, where: ctx });
      }
    }
    walk(S.mom, tag, '老人线');
    walk(S.dau, tag, '子女线');
    walk(S.decision, tag, '结局·秀兰的决定');
    ['A', 'B', 'C'].forEach(function (k) {
      ['good', 'bad'].forEach(function (g) {
        walk(S.endings[k][g].steps, tag, '结局' + k + '·' + S.endings[k].title + '·' + (g === 'good' ? '和解' : '隔阂'));
      });
    });
    // 后加的台词一律排在最后，保证已有编号不变
    if (S.decisionDau) walk(S.decisionDau, tag, '结局·王佳的表态');
    S._voiceRows = rows;
    S._prepped = true;
    return S;
  };
})(typeof window !== 'undefined' ? window : globalThis);
