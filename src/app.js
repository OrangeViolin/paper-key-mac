// 纸上键 · paper-key — macOS 机械键盘音效 App
// Copyright (C) 2026 01fish
// Licensed under GPL-3.0-or-later. See LICENSE file for details.
//
// 极简健壮版 · JS 负责：点卡加载+播音、敲键播音、全局监听桥
console.log('[paper-key] app.js build-4 loaded');

window.addEventListener('error', (e) => {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#C44536;color:#F2EDE3;padding:8px 14px;z-index:999;font-size:12px;font-family:ui-monospace,monospace;white-space:pre-wrap;';
  bar.textContent = 'JS ERR · ' + e.message + '\n@ ' + e.filename + ':' + e.lineno;
  (document.body || document.documentElement).appendChild(bar);
});
window.addEventListener('unhandledrejection', (e) => {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:28px;left:0;right:0;background:#C44536;color:#F2EDE3;padding:8px 14px;z-index:999;font-size:12px;';
  bar.textContent = 'PROMISE REJ · ' + (e.reason && e.reason.message || e.reason);
  (document.body || document.documentElement).appendChild(bar);
});

document.title = '纸上键 · build-4 · app.js-ok';

// ===== rdev::Key → evdev scancode =====
var RDEV_TO_SCAN = {
  KeyA:30,KeyB:48,KeyC:46,KeyD:32,KeyE:18,KeyF:33,KeyG:34,KeyH:35,
  KeyI:23,KeyJ:36,KeyK:37,KeyL:38,KeyM:50,KeyN:49,KeyO:24,KeyP:25,
  KeyQ:16,KeyR:19,KeyS:31,KeyT:20,KeyU:22,KeyV:47,KeyW:17,KeyX:45,KeyY:21,KeyZ:44,
  Num1:2,Num2:3,Num3:4,Num4:5,Num5:6,Num6:7,Num7:8,Num8:9,Num9:10,Num0:11,
  Minus:12,Equal:13,LeftBracket:26,RightBracket:27,BackSlash:43,
  SemiColon:39,Quote:40,Comma:51,Dot:52,Slash:53,BackQuote:41,
  Escape:1,Backspace:14,Tab:15,Return:28,Space:57,CapsLock:58,
  ShiftLeft:42,ShiftRight:54,ControlLeft:29,Alt:56,MetaLeft:3675,MetaRight:3676,
  UpArrow:57416,DownArrow:57424,LeftArrow:57419,RightArrow:57421
};
var BROWSER_CODE_TO_SCAN = Object.assign({}, RDEV_TO_SCAN, {
  Digit1:2,Digit2:3,Digit3:4,Digit4:5,Digit5:6,Digit6:7,Digit7:8,Digit8:9,Digit9:10,Digit0:11,
  Enter:28
});

// ===== 状态 =====
var currentPackId = localStorage.getItem('paperkey.pack') || 'cherrymx-blue-pbt';
var volume = 0.8;
try {
  var v = parseFloat(localStorage.getItem('paperkey.vol'));
  if (!isNaN(v)) volume = v;
} catch (_) {}
var packs = {}; // id → pack
var audioCtx = null;
var listening = false;

function ensureCtx() {
  if (!audioCtx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ===== 音色包加载 =====
function loadPack(id) {
  if (packs[id]) return Promise.resolve(packs[id]);
  var ctx = ensureCtx();
  setLoadHint('载入 ' + id + ' ⋯⋯');
  return fetch('assets/sounds/' + id + '/config.json')
    .then(function(r){ if(!r.ok) throw new Error('config '+r.status); return r.json(); })
    .then(function(cfg){
      var p = { id: id, config: cfg, spriteBuf: null, fileBufs: {}, genericPool: [] };
      if (cfg.key_define_type === 'single') {
        var soundName = cfg.sound || 'sound.ogg';
        return fetch('assets/sounds/' + id + '/' + soundName)
          .then(function(r){ return r.arrayBuffer(); })
          .then(function(ab){ return ctx.decodeAudioData(ab); })
          .then(function(buf){ p.spriteBuf = buf; packs[id] = p; return p; });
      } else {
        // multi
        var defines = cfg.defines || {};
        var uniqueFiles = {};
        Object.keys(defines).forEach(function(k){
          var v = defines[k];
          if (typeof v === 'string' && k.indexOf('-up') === -1) uniqueFiles[v] = true;
        });
        // 处理 v2 generic 模板
        var generic = [];
        var tpl = cfg.sound;
        if (typeof tpl === 'string') {
          var m = tpl.match(/\{(\d+)-(\d+)\}/);
          if (m) {
            for (var i=parseInt(m[1],10); i<=parseInt(m[2],10); i++) {
              generic.push(tpl.replace(/\{\d+-\d+\}/, String(i)));
            }
          }
        }
        generic.forEach(function(f){ uniqueFiles[f] = true; });
        var files = Object.keys(uniqueFiles).filter(function(f){ return /\.(mp3|wav|ogg)$/i.test(f); });
        return Promise.all(files.map(function(f){
          var url = 'assets/sounds/' + id + '/' + f.split('/').map(encodeURIComponent).join('/');
          return fetch(url).then(function(r){
            if(!r.ok) return null;
            return r.arrayBuffer().then(function(ab){ return ctx.decodeAudioData(ab); });
          }).then(function(buf){ if(buf) p.fileBufs[f] = buf; }).catch(function(){});
        })).then(function(){
          p.genericPool = generic.filter(function(f){ return p.fileBufs[f]; });
          packs[id] = p;
          return p;
        });
      }
    });
}

// ===== 播放 =====
function playScan(scan) {
  var p = packs[currentPackId];
  if (!p) return;
  var ctx = ensureCtx();
  var cfg = p.config;
  var defines = cfg.defines || {};
  var t = ctx.currentTime;
  if (cfg.key_define_type === 'single') {
    var range = defines[String(scan)];
    if (!range) {
      var vals = Object.keys(defines).map(function(k){ return defines[k]; });
      range = vals.find ? vals.find(function(v){ return Array.isArray(v); }) : null;
      if (!range) for (var i=0;i<vals.length;i++) if (Array.isArray(vals[i])) { range = vals[i]; break; }
    }
    if (!range) return;
    var src = ctx.createBufferSource();
    src.buffer = p.spriteBuf;
    var g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(ctx.destination);
    src.start(t, range[0]/1000, Math.max(0.02, range[1]/1000));
  } else {
    var file = defines[String(scan)];
    if (typeof file !== 'string') {
      if (p.genericPool.length) {
        file = p.genericPool[Math.floor(Math.random() * p.genericPool.length)];
      }
    }
    var buf = file ? p.fileBufs[file] : null;
    if (!buf) return;
    var src2 = ctx.createBufferSource();
    src2.buffer = buf;
    var g2 = ctx.createGain();
    g2.gain.value = volume;
    src2.connect(g2).connect(ctx.destination);
    src2.start(t);
  }
}

// ===== UI =====
function setLoadHint(msg) {
  var h = document.getElementById('loadHint');
  if (h) h.textContent = msg;
}
function hideLoadHint() {
  var h = document.getElementById('loadHint');
  if (h) h.style.display = 'none';
}
function markActive(id) {
  var cards = document.querySelectorAll('.card');
  cards.forEach(function(c){
    if (c.getAttribute('data-pack') === id) c.classList.add('active');
    else c.classList.remove('active');
  });
  var cur = document.getElementById('current');
  var active = document.querySelector('.card.active .name');
  if (cur && active) cur.textContent = active.textContent;
}

function pickPack(id) {
  currentPackId = id;
  localStorage.setItem('paperkey.pack', id);
  markActive(id);
  loadPack(id).then(function(){
    hideLoadHint();
    playScan(30); // A 键试听
  }).catch(function(err){
    setLoadHint('✗ 加载失败：' + (err.message || err));
  });
}
window.__pk_pickPack = pickPack;

function setVol(v) {
  volume = parseFloat(v) / 100;
  localStorage.setItem('paperkey.vol', String(volume));
  var t = document.getElementById('volTxt');
  if (t) t.textContent = String(Math.round(volume * 100));
}
window.__pk_setVol = setVol;

// 初始化
markActive(currentPackId);
var volInput = document.getElementById('vol');
if (volInput) { volInput.value = String(Math.round(volume*100)); setVol(volume*100); }

loadPack(currentPackId).then(function(){
  hideLoadHint();
}).catch(function(err){
  setLoadHint('✗ 默认包加载失败：' + (err.message || err));
});

// ===== 键盘监听（窗内） =====
window.addEventListener('keydown', function(e){
  if (e.repeat) return;
  var scan = BROWSER_CODE_TO_SCAN[e.code];
  if (scan) playScan(scan);
});

// ===== Tauri 全局监听 =====
var isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
try {
  if (isTauri && window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
    window.__TAURI__.event.listen('keypress', function(ev){
      var scan = ev.payload && ev.payload.scan;
      if (scan) playScan(scan);
    });
  }
} catch (e) { console.warn('tauri listen failed', e); }

function setListenBtn(cls, msg) {
  var b = document.getElementById('btnListen');
  if (!b) return;
  b.classList.remove('off','on','loading');
  b.classList.add(cls);
  var t = b.querySelector('.txt');
  if (t) t.textContent = msg;
}
function tauriInvoke(cmd) {
  var invoke = (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) || (window.__TAURI__ && window.__TAURI__.invoke);
  if (!invoke) return Promise.reject(new Error('invoke 不可用'));
  return invoke(cmd);
}

function startListen() {
  if (!isTauri) { setListenBtn('off','浏览器内 · 仅本窗口有声'); return; }
  var m = document.getElementById('permModal');
  if (m) m.hidden = false;
  // 关键：调用 AXIsProcessTrustedWithOptions，
  // 这会触发 macOS 弹授权对话框，并把 paper-key 加到辅助功能列表
  tauriInvoke('request_accessibility').then(function(trusted){
    if (trusted) {
      // 已授权，直接启动
      window.__pk_confirmPerm();
    }
  }).catch(function(){});
  tauriInvoke('start_global_listen').catch(function(){});
}
window.__pk_startListen = startListen;

window.__pk_openPrefs = function() {
  tauriInvoke('open_accessibility_prefs').catch(function(err){
    alert('无法打开系统设置：' + (err && err.message || err));
  });
};

window.__pk_closePerm = function() {
  var m = document.getElementById('permModal');
  if (m) m.hidden = true;
};

window.__pk_confirmPerm = function() {
  // 用户刚开启授权：TCC 新状态需要进程重启才生效
  setListenBtn('loading','重启生效中⋯⋯');
  tauriInvoke('relaunch_app').catch(function(err){
    setListenBtn('off','✗ 重启失败：' + (err && err.message || err));
  });
};

if (!isTauri) {
  setListenBtn('off','浏览器内 · 仅本窗口有声');
} else {
  setListenBtn('off','▶ 落笔无声 · 点此开启');
}

console.log('%c纸上键 build-4 · 就绪', 'color:#1A3328;font-weight:600');
