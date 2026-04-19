// 纸上键 · 纸上描红
// 不比速度，只比节奏 — 每一次落笔都对应古诗里的一个字
// Copyright (C) 2026 01fish · GPL-3.0-or-later

(function(){
  'use strict';

  var POEMS = [
    { title: '静夜思', author: '李白', lines: ['床前明月光','疑是地上霜','举头望明月','低头思故乡'] },
    { title: '登鹳雀楼', author: '王之涣', lines: ['白日依山尽','黄河入海流','欲穷千里目','更上一层楼'] },
    { title: '春晓', author: '孟浩然', lines: ['春眠不觉晓','处处闻啼鸟','夜来风雨声','花落知多少'] },
    { title: '相思', author: '王维', lines: ['红豆生南国','春来发几枝','愿君多采撷','此物最相思'] },
    { title: '江雪', author: '柳宗元', lines: ['千山鸟飞绝','万径人踪灭','孤舟蓑笠翁','独钓寒江雪'] },
    { title: '鹿柴', author: '王维', lines: ['空山不见人','但闻人语响','返景入深林','复照青苔上'] },
    { title: '鸟鸣涧', author: '王维', lines: ['人闲桂花落','夜静春山空','月出惊山鸟','时鸣春涧中'] },
    { title: '独坐敬亭山', author: '李白', lines: ['众鸟高飞尽','孤云独去闲','相看两不厌','只有敬亭山'] },
    { title: '绝句', author: '杜甫', lines: ['两个黄鹂鸣翠柳','一行白鹭上青天','窗含西岭千秋雪','门泊东吴万里船'] },
    { title: '早发白帝城', author: '李白', lines: ['朝辞白帝彩云间','千里江陵一日还','两岸猿声啼不住','轻舟已过万重山'] },
    { title: '枫桥夜泊', author: '张继', lines: ['月落乌啼霜满天','江枫渔火对愁眠','姑苏城外寒山寺','夜半钟声到客船'] },
    { title: '饮湖上初晴后雨', author: '苏轼', lines: ['水光潋滟晴方好','山色空蒙雨亦奇','欲把西湖比西子','淡妆浓抹总相宜'] }
  ];

  var state = {
    poem: null,
    chars: [],          // 全诗拆字数组
    progress: 0,
    startTs: 0,
    pressTs: [],
    running: false
  };

  function pickRandom() {
    return POEMS[Math.floor(Math.random() * POEMS.length)];
  }

  function charsOf(poem) {
    var arr = [];
    poem.lines.forEach(function(l, i){
      for (var j = 0; j < l.length; j++) arr.push({ ch: l[j], line: i, col: j });
    });
    return arr;
  }

  function render() {
    var stage = document.getElementById('calliStage');
    if (!stage) return;
    var html = '';
    html += '<div class="calli-meta"><span class="calli-title">《' + state.poem.title + '》</span>' +
            '<span class="calli-author">' + state.poem.author + '</span></div>';
    html += '<div class="calli-poem">';
    var idx = 0;
    state.poem.lines.forEach(function(line){
      html += '<div class="calli-line">';
      for (var i = 0; i < line.length; i++) {
        var cls = 'calli-ch';
        if (idx < state.progress) cls += ' inked';
        else if (idx === state.progress) cls += ' next';
        html += '<span class="' + cls + '" data-idx="' + idx + '">' + line[i] + '</span>';
        idx++;
      }
      html += '</div>';
    });
    html += '</div>';
    stage.innerHTML = html;
  }

  function start() {
    state.poem = pickRandom();
    state.chars = charsOf(state.poem);
    state.progress = 0;
    state.startTs = 0;
    state.pressTs = [];
    state.running = true;
    hideResult();
    render();
    setHint('点任意键 · 落笔');
  }

  function finish() {
    state.running = false;
    var elapsed = (state.pressTs[state.pressTs.length-1] - state.startTs) / 1000;
    var n = state.pressTs.length;
    var intervals = [];
    for (var i = 1; i < n; i++) intervals.push(state.pressTs[i] - state.pressTs[i-1]);
    var mean = intervals.reduce(function(a,b){return a+b;}, 0) / intervals.length;
    var variance = intervals.reduce(function(s,x){return s + Math.pow(x - mean, 2);}, 0) / intervals.length;
    var stdev = Math.sqrt(variance);
    var cv = mean > 0 ? stdev / mean : 0;
    var rank = judge(elapsed, cv, n);
    showResult({ elapsed: elapsed, chars: n, cv: cv, rank: rank });
  }

  function judge(elapsed, cv, chars) {
    var avg = elapsed / chars;  // 秒/字
    if (cv < 0.35 && avg < 0.6) return { title: '静水流深', desc: '节奏匀稳，笔走如禅。不疾不徐间见真章。' };
    if (cv < 0.45 && avg < 1.0) return { title: '行云流水', desc: '长短有致，起承转合皆顺。' };
    if (avg < 0.4)              return { title: '风骤雨急', desc: '快则快矣，但笔下少了余地。' };
    if (cv < 0.6)               return { title: '笔走龙蛇', desc: '有起伏之势，尚需打磨韵律。' };
    return { title: '踉跄落笔', desc: '初学乍练，贵在坚持。' };
  }

  function showResult(r) {
    var box = document.getElementById('calliResult');
    if (!box) return;
    box.innerHTML =
      '<div class="rc-rank">' + r.rank.title + '</div>' +
      '<div class="rc-desc">' + r.rank.desc + '</div>' +
      '<div class="rc-stats">' +
        '<span>共 ' + r.chars + ' 字</span> · ' +
        '<span>用时 ' + r.elapsed.toFixed(1) + ' 秒</span> · ' +
        '<span>平均 ' + (r.elapsed / r.chars).toFixed(2) + ' s/字</span> · ' +
        '<span>节奏稳定度 ' + (100 * Math.max(0, 1 - r.cv)).toFixed(0) + '%</span>' +
      '</div>' +
      '<button class="calli-btn" onclick="window.__pk_calli.start()">再来一首</button>';
    box.hidden = false;
  }

  function hideResult() {
    var box = document.getElementById('calliResult');
    if (box) box.hidden = true;
  }

  function setHint(msg) {
    var h = document.getElementById('calliHint');
    if (h) h.textContent = msg;
  }

  function onKey() {
    if (!state.running) return;
    var now = performance.now();
    if (state.progress === 0) state.startTs = now;
    state.pressTs.push(now);
    state.progress++;
    render();
    if (state.progress >= state.chars.length) finish();
  }

  // 挂载
  window.__pk_calli = {
    start: start,
    onKey: onKey,
    ready: function(){
      // 初始化不自动开始，用户点按钮开始
      var stage = document.getElementById('calliStage');
      if (stage) {
        stage.innerHTML = '<div class="calli-empty">点"铺纸"开始 · 随意敲键，描一首诗</div>';
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.__pk_calli.ready);
  } else {
    window.__pk_calli.ready();
  }
})();
