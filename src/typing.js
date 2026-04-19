// 纸上键 · 手敲金句（真打字游戏）
// 一句一句地敲出来 — 错字不前进，光标跟随，中英都行
// 数据格式对齐「卡片书斋」(https://github.com/...) 的 cards.json
// Copyright (C) 2026 01fish · GPL-3.0-or-later

(function(){
  'use strict';

  // ===== 内置金句库（精选 12 条，中英混搭）=====
  var BUILTIN = [
    { text: "The best moments in our lives are not the passive, receptive, relaxing times.", author: "Mihaly Csikszentmihalyi", source: "《心流》", lang: "en" },
    { text: "反过来想，总是反过来想。", author: "查理·芒格", source: "《穷查理宝典》", lang: "zh" },
    { text: "It is remarkable how much long-term advantage we have gotten by trying to be consistently not stupid.", author: "Charlie Munger", source: "《穷查理宝典》", lang: "en" },
    { text: "人生最美好的时刻，往往发生在身心被推向极限的自愿努力中。", author: "米哈里", source: "《心流》", lang: "zh" },
    { text: "Stay hungry, stay foolish.", author: "Stewart Brand", source: "Whole Earth Catalog", lang: "en" },
    { text: "凡是过去，皆为序章。", author: "莎士比亚", source: "《暴风雨》", lang: "zh" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs", source: "Stanford 2005", lang: "en" },
    { text: "知人者智，自知者明。", author: "老子", source: "《道德经》", lang: "zh" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci", source: "笔记", lang: "en" },
    { text: "山川异域，风月同天。", author: "长屋王", source: "《绣袈裟衣缘》", lang: "zh" },
    { text: "What we cannot speak about we must pass over in silence.", author: "Wittgenstein", source: "Tractatus", lang: "en" },
    { text: "纸上得来终觉浅，绝知此事要躬行。", author: "陆游", source: "《冬夜读书示子聿》", lang: "zh" }
  ];

  var state = {
    library: [],        // 当前金句库（内置 + 导入）
    quote: null,        // 当前金句
    startTs: 0,
    errors: 0,          // 累计错误字符数
    maxLen: 0,          // 历史最大正确长度（避免退格刷分）
    running: false,
    composing: false    // IME 中
  };

  function loadLibrary() {
    var imported = [];
    try {
      var raw = localStorage.getItem('paperkey.quotes');
      if (raw) imported = JSON.parse(raw) || [];
    } catch (e) {}
    state.library = BUILTIN.concat(imported);
  }

  function saveImported(arr) {
    localStorage.setItem('paperkey.quotes', JSON.stringify(arr));
    loadLibrary();
  }

  function randomQuote() {
    return state.library[Math.floor(Math.random() * state.library.length)];
  }

  // ===== 渲染 =====
  function render() {
    var stage = document.getElementById('typeText');
    if (!stage || !state.quote) return;
    var target = state.quote.text;
    var input = document.getElementById('typeInput');
    var val = input ? input.value : '';
    var html = '';

    for (var i = 0; i < target.length; i++) {
      var cls = 'tch';
      if (i < val.length) {
        cls += (val[i] === target[i]) ? ' ok' : ' bad';
      } else if (i === val.length) {
        cls += ' cur';
      }
      var ch = target[i] === ' ' ? '·' : target[i];
      html += '<span class="' + cls + '">' + escape(ch) + '</span>';
    }
    stage.innerHTML = html;

    // 进度条
    var done = 0;
    for (var j = 0; j < Math.min(val.length, target.length); j++) {
      if (val[j] === target[j]) done++;
      else break;
    }
    var bar = document.getElementById('typeProgress');
    if (bar) bar.style.width = (100 * done / target.length).toFixed(1) + '%';

    if (done > state.maxLen) state.maxLen = done;
  }

  function escape(s) {
    return s.replace(/[&<>"']/g, function(c){
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  function updateMeta() {
    var meta = document.getElementById('typeMeta');
    if (!meta || !state.quote) return;
    var q = state.quote;
    var len = [].slice.call(q.text).length;
    meta.innerHTML =
      '<span class="tm-source">' + escape(q.source || '') + (q.author ? ' · ' + escape(q.author) : '') + '</span>' +
      '<span class="tm-sep">|</span>' +
      '<span class="tm-lang">' + (q.lang === 'zh' ? '中文' : q.lang === 'en' ? '英文' : (q.lang || '其他')) + ' · ' + len + ' 字</span>';
  }

  // ===== 游戏流程 =====
  function start() {
    state.quote = randomQuote();
    state.startTs = 0;
    state.errors = 0;
    state.maxLen = 0;
    state.running = true;
    var input = document.getElementById('typeInput');
    if (input) {
      input.value = '';
      input.disabled = false;
      setTimeout(function(){ input.focus(); }, 20);
    }
    hideResult();
    updateMeta();
    render();
    setHint('对着文字敲 · 错字要退格');
  }

  function onInput() {
    if (!state.running || !state.quote) return;
    if (state.composing) return;  // IME 组合中不判断
    var input = document.getElementById('typeInput');
    var val = input.value;
    var target = state.quote.text;
    if (state.startTs === 0 && val.length > 0) state.startTs = performance.now();

    // 统计错误：当前 value 中有多少位不匹配（一次性算，避免抖动）
    var miss = 0;
    for (var i = 0; i < val.length && i < target.length; i++) {
      if (val[i] !== target[i]) miss++;
    }
    if (val.length > target.length) miss += val.length - target.length;
    // 累加错误：本次 miss 数比历史记录多则 +1
    if (miss > state.errors) state.errors = miss;

    render();

    // 完成
    if (val === target) finish();
  }

  function onCompositionStart() { state.composing = true; }
  function onCompositionEnd() { state.composing = false; onInput(); }

  function finish() {
    state.running = false;
    var elapsed = (performance.now() - state.startTs) / 1000;
    var target = state.quote.text;
    var len = target.length;
    var total = len + state.errors;
    var accuracy = total > 0 ? (len / total) : 1;
    // WPM 按英文 5 字符=1 词的惯例；中文按字计，不太一样
    var words = state.quote.lang === 'zh' ? len : len / 5;
    var wpm = elapsed > 0 ? (words / (elapsed / 60)) : 0;

    var rank = judge(accuracy, wpm, state.quote.lang);
    showResult({ elapsed: elapsed, chars: len, errors: state.errors, accuracy: accuracy, wpm: wpm, rank: rank });
    var input = document.getElementById('typeInput');
    if (input) input.disabled = true;
  }

  function judge(acc, wpm, lang) {
    var fast = lang === 'zh' ? 60 : 50;  // 中文 60 cpm (字/分), 英文 50 wpm
    if (acc >= 0.98 && wpm >= fast)      return { title: '入木三分', desc: '快而不错，笔下有神。' };
    if (acc >= 0.95)                     return { title: '行云流水', desc: '准头稳，速度也不赖。' };
    if (acc >= 0.85)                     return { title: '笔走龙蛇', desc: '大体顺畅，个别字踉跄。' };
    if (wpm >= fast)                     return { title: '快手毛糙', desc: '手速够了，准头再练练。' };
    return { title: '初学乍练', desc: '先慢下来，稳稳敲。' };
  }

  function showResult(r) {
    var box = document.getElementById('typeResult');
    if (!box) return;
    box.innerHTML =
      '<div class="rc-rank">' + r.rank.title + '</div>' +
      '<div class="rc-desc">' + r.rank.desc + '</div>' +
      '<div class="rc-stats">' +
        '<span>用时 ' + r.elapsed.toFixed(1) + ' 秒</span> · ' +
        '<span>准确率 ' + (r.accuracy * 100).toFixed(1) + '%</span> · ' +
        '<span>速度 ' + r.wpm.toFixed(0) + (state.quote.lang === 'zh' ? ' 字/分' : ' WPM') + '</span> · ' +
        '<span>错 ' + r.errors + ' 字</span>' +
      '</div>' +
      '<div class="rc-quote">"' + escape(state.quote.text) + '"<span class="rc-from"> — ' +
         escape(state.quote.author || '') + (state.quote.source ? '《' + escape(state.quote.source.replace(/《|》/g, '')) + '》' : '') + '</span></div>' +
      '<button class="calli-btn primary" onclick="window.__pk_typing.start()">换一句</button>';
    box.hidden = false;
  }

  function hideResult() {
    var box = document.getElementById('typeResult');
    if (box) box.hidden = true;
  }

  function setHint(msg) {
    var h = document.getElementById('typeHint');
    if (h) h.textContent = msg;
  }

  // ===== 导入：支持卡片书斋 cards.json =====
  function importFromCards(json) {
    try {
      var cards = typeof json === 'string' ? JSON.parse(json) : json;
      if (!Array.isArray(cards)) throw new Error('JSON 必须是数组（cards.json 格式）');
      var extracted = [];
      cards.forEach(function(c){
        if (c.type !== 'quote' || !c.fields) return;
        var f = c.fields;
        // 优先英文原句 → 中译 → 其他任何带"金句"的字段
        if (f['金句']) extracted.push({ text: f['金句'], author: f['作者'] || '', source: c.source || '', lang: detectLang(f['金句']) });
        if (f['中译'] && f['中译'] !== f['金句']) extracted.push({ text: f['中译'], author: f['作者'] || '', source: c.source || '', lang: 'zh' });
      });
      if (extracted.length === 0) {
        alert('没找到金句（cards.json 里需要 type=quote 的卡，并含"金句"字段）');
        return 0;
      }
      var existing = [];
      try { existing = JSON.parse(localStorage.getItem('paperkey.quotes') || '[]'); } catch(e){}
      saveImported(existing.concat(extracted));
      alert('已导入 ' + extracted.length + ' 条金句。当前库共 ' + state.library.length + ' 条。');
      return extracted.length;
    } catch (e) {
      alert('导入失败：' + e.message);
      return 0;
    }
  }

  function detectLang(s) {
    if (/[\u4e00-\u9fff]/.test(s)) return 'zh';
    if (/^[\x00-\x7f\s]+$/.test(s)) return 'en';
    return 'other';
  }

  function openImport() {
    var txt = prompt('粘贴卡片书斋的 cards.json 内容\n(自动抽取 type=quote 的卡片)');
    if (txt) importFromCards(txt);
  }

  function clearImported() {
    if (!confirm('清空导入的金句？（内置 12 条不受影响）')) return;
    localStorage.removeItem('paperkey.quotes');
    loadLibrary();
    alert('已清空');
  }

  // ===== 挂载 =====
  function ready() {
    loadLibrary();
    var input = document.getElementById('typeInput');
    if (input) {
      input.addEventListener('input', onInput);
      input.addEventListener('compositionstart', onCompositionStart);
      input.addEventListener('compositionend', onCompositionEnd);
    }
    var stage = document.getElementById('typeText');
    if (stage) {
      stage.innerHTML = '<span class="type-empty">点"抽一句"开始 · 真打字，错字不前进</span>';
    }
  }

  window.__pk_typing = {
    start: start,
    import: openImport,
    clear: clearImported,
    isRunning: function(){ return state.running; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
