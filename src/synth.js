// 纸上键 · 合成音色引擎
// 零版权、纯 Web Audio 参数化合成，给键盘第二种灵魂
// Copyright (C) 2026 01fish · GPL-3.0-or-later

(function(){
  'use strict';

  // ===== 核心合成函数 =====
  // cfg: { duration, voices: [{freq, type, gain, decay, attack, detune, pitchMod}], noise: {level, decay, filter}, pitchEnv }
  function synthBuffer(ctx, cfg) {
    var sr = ctx.sampleRate;
    var dur = cfg.duration || 0.35;
    var len = Math.max(1, Math.floor(sr * dur));
    var buf = ctx.createBuffer(1, len, sr);
    var out = buf.getChannelData(0);

    var voices = cfg.voices || [];
    var noise = cfg.noise || null;

    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var s = 0;

      // 和声振子
      for (var v = 0; v < voices.length; v++) {
        var vo = voices[v];
        var freq = vo.freq || 440;
        if (vo.pitchEnv) freq *= Math.exp(-vo.pitchEnv * t);  // 音高下滑
        if (vo.vibrato) freq *= (1 + vo.vibrato.d * Math.sin(2*Math.PI*vo.vibrato.f*t));
        var w = wave(vo.type || 'sine', freq, t);
        var env = envelope(t, vo.attack || 0.002, vo.decay || 0.15);
        s += w * env * (vo.gain || 0.5);
      }

      // 噪声成分（破音/气流/金属质感）
      if (noise) {
        var n = (Math.random() * 2 - 1);
        if (noise.filter) n = noiseFilter(n, noise.filter, i);
        var ne = envelope(t, noise.attack || 0.001, noise.decay || 0.05);
        s += n * ne * (noise.level || 0.3);
      }

      // 限幅
      out[i] = Math.max(-1, Math.min(1, s));
    }

    return buf;
  }

  function wave(type, freq, t) {
    var p = 2 * Math.PI * freq * t;
    switch(type) {
      case 'square':   return Math.sin(p) >= 0 ? 1 : -1;
      case 'triangle': return (2/Math.PI) * Math.asin(Math.sin(p));
      case 'sawtooth': return 2 * (freq*t - Math.floor(freq*t + 0.5));
      case 'fm':       return Math.sin(p + 0.5*Math.sin(p*2));
      case 'sine':
      default:         return Math.sin(p);
    }
  }

  function envelope(t, attack, decay) {
    if (t < attack) return t / attack;
    return Math.exp(-(t - attack) / decay);
  }

  // 超简陋"带通"噪声（靠历史累加做低通/高通）
  var noiseState = { lp: 0, hp: 0 };
  function noiseFilter(n, kind, i) {
    if (i === 0) { noiseState.lp = 0; noiseState.hp = 0; }
    if (kind === 'lowpass') {
      noiseState.lp = noiseState.lp * 0.85 + n * 0.15;
      return noiseState.lp * 3;
    }
    if (kind === 'highpass') {
      var prev = noiseState.hp;
      noiseState.hp = n;
      return (n - prev);
    }
    return n;
  }

  // ===== 20 款精选合成音色 =====
  // theme: zen(禅意) / retro(老派) / game(8-bit) / fun(趣味)
  window.SYNTH_PACKS = {
    // ----- 禅意 6 款 -----
    'synth-woodfish': {
      name: '木鱼', sub: '禅意 · 空心敲击', emoji: '🪵', theme: 'zen',
      cfg: { duration: 0.35, voices: [
        { freq: 180, type: 'sine',     gain: 0.55, decay: 0.08, pitchEnv: 3 },
        { freq: 420, type: 'sine',     gain: 0.30, decay: 0.05 },
        { freq: 900, type: 'triangle', gain: 0.15, decay: 0.03 }
      ], noise: { level: 0.18, decay: 0.008, filter: 'lowpass' } }
    },
    'synth-waterdrop': {
      name: '水滴', sub: '禅意 · 清泉滴石', emoji: '💧', theme: 'zen',
      cfg: { duration: 0.25, voices: [
        { freq: 1200, type: 'sine', gain: 0.5, decay: 0.04, pitchEnv: -4 }
      ], noise: { level: 0.08, decay: 0.005, filter: 'highpass' } }
    },
    'synth-porcelain': {
      name: '瓷器', sub: '禅意 · 青花叮响', emoji: '🏺', theme: 'zen',
      cfg: { duration: 0.5, voices: [
        { freq: 2400, type: 'triangle', gain: 0.35, decay: 0.12 },
        { freq: 3200, type: 'sine',     gain: 0.2,  decay: 0.08 },
        { freq: 4800, type: 'sine',     gain: 0.12, decay: 0.05 }
      ], noise: { level: 0.15, decay: 0.004, filter: 'highpass' } }
    },
    'synth-bronzebell': {
      name: '铜磬', sub: '禅意 · 寺院磬声', emoji: '🛎️', theme: 'zen',
      cfg: { duration: 0.9, voices: [
        { freq: 420, type: 'sine', gain: 0.4,  decay: 0.35 },
        { freq: 630, type: 'sine', gain: 0.25, decay: 0.3 },
        { freq: 890, type: 'sine', gain: 0.15, decay: 0.2 },
        { freq: 1260,type: 'sine', gain: 0.08, decay: 0.15 }
      ] }
    },
    'synth-guqin': {
      name: '古琴', sub: '禅意 · 一拨九回', emoji: '🎐', theme: 'zen',
      cfg: { duration: 0.7, voices: [
        { freq: 220, type: 'sawtooth', gain: 0.35, decay: 0.25 },
        { freq: 440, type: 'sine',     gain: 0.25, decay: 0.25 },
        { freq: 660, type: 'sine',     gain: 0.12, decay: 0.15, vibrato: { f: 6, d: 0.008 } }
      ] }
    },
    'synth-bamboo': {
      name: '竹筒', sub: '禅意 · 空竹回响', emoji: '🎋', theme: 'zen',
      cfg: { duration: 0.3, voices: [
        { freq: 340, type: 'sine',     gain: 0.45, decay: 0.07, pitchEnv: 2 },
        { freq: 680, type: 'triangle', gain: 0.25, decay: 0.05 }
      ], noise: { level: 0.25, decay: 0.01, filter: 'lowpass' } }
    },

    // ----- 老派机械 5 款 -----
    'synth-typewriter': {
      name: '打字机', sub: '老派 · 咔哒一声', emoji: '⌨️', theme: 'retro',
      cfg: { duration: 0.22, voices: [
        { freq: 1800, type: 'triangle', gain: 0.3, decay: 0.03 },
        { freq: 2600, type: 'square',   gain: 0.15, decay: 0.02 }
      ], noise: { level: 0.55, decay: 0.015, filter: 'highpass' } }
    },
    'synth-modem': {
      name: '拨号猫', sub: '老派 · 8N1 赛博声', emoji: '📠', theme: 'retro',
      cfg: { duration: 0.15, voices: [
        { freq: 1200, type: 'square', gain: 0.35, decay: 0.04, pitchEnv: -2 },
        { freq: 2100, type: 'square', gain: 0.25, decay: 0.04 }
      ] }
    },
    'synth-telegraph': {
      name: '电报机', sub: '老派 · 摩尔斯滴', emoji: '📡', theme: 'retro',
      cfg: { duration: 0.18, voices: [
        { freq: 800, type: 'sine', gain: 0.55, decay: 0.06 }
      ] }
    },
    'synth-abacus': {
      name: '算盘', sub: '老派 · 算珠相击', emoji: '🧮', theme: 'retro',
      cfg: { duration: 0.2, voices: [
        { freq: 1500, type: 'triangle', gain: 0.3, decay: 0.04 },
        { freq: 2200, type: 'triangle', gain: 0.2, decay: 0.03 }
      ], noise: { level: 0.35, decay: 0.008, filter: 'highpass' } }
    },
    'synth-clock': {
      name: '齿轮钟', sub: '老派 · 机械腕表', emoji: '⏱️', theme: 'retro',
      cfg: { duration: 0.12, voices: [
        { freq: 2800, type: 'triangle', gain: 0.4, decay: 0.02 }
      ], noise: { level: 0.2, decay: 0.006, filter: 'highpass' } }
    },

    // ----- 8-bit 游戏 5 款 -----
    'synth-nes-blip': {
      name: 'NES Blip', sub: '8-bit · 红白机短音', emoji: '🎮', theme: 'game',
      cfg: { duration: 0.1, voices: [
        { freq: 880, type: 'square', gain: 0.45, decay: 0.05, pitchEnv: -5 }
      ] }
    },
    'synth-coin': {
      name: '金币', sub: '8-bit · 马里奥收集', emoji: '🪙', theme: 'game',
      cfg: { duration: 0.22, voices: [
        { freq: 988, type: 'square', gain: 0.4, decay: 0.06 },
        { freq: 1319,type: 'square', gain: 0.35, decay: 0.12 }
      ] }
    },
    'synth-jump': {
      name: '马里奥跳', sub: '8-bit · 跳跃上扬', emoji: '🍄', theme: 'game',
      cfg: { duration: 0.18, voices: [
        { freq: 523, type: 'square', gain: 0.45, decay: 0.08, pitchEnv: -8 }
      ] }
    },
    'synth-laser': {
      name: '激光枪', sub: '8-bit · 太空射击', emoji: '🔫', theme: 'game',
      cfg: { duration: 0.16, voices: [
        { freq: 2400, type: 'sawtooth', gain: 0.4, decay: 0.06, pitchEnv: 8 }
      ] }
    },
    'synth-pacman': {
      name: 'Pac-Man', sub: '8-bit · 吃豆子', emoji: '👾', theme: 'game',
      cfg: { duration: 0.1, voices: [
        { freq: 1200, type: 'triangle', gain: 0.4, decay: 0.03, pitchEnv: -3 }
      ] }
    },

    // ----- 日常趣味 4 款 -----
    'synth-bubble': {
      name: '气泡', sub: '趣味 · 水中冒泡', emoji: '🫧', theme: 'fun',
      cfg: { duration: 0.2, voices: [
        { freq: 500, type: 'sine', gain: 0.45, decay: 0.05, pitchEnv: -6 }
      ] }
    },
    'synth-pop': {
      name: '泡泡破', sub: '趣味 · pop 一下', emoji: '🎈', theme: 'fun',
      cfg: { duration: 0.1, voices: [
        { freq: 320, type: 'sine', gain: 0.55, decay: 0.04, pitchEnv: 6 }
      ], noise: { level: 0.3, decay: 0.005, filter: 'highpass' } }
    },
    'synth-spring': {
      name: '弹簧', sub: '趣味 · boing', emoji: '🪀', theme: 'fun',
      cfg: { duration: 0.35, voices: [
        { freq: 280, type: 'triangle', gain: 0.5, decay: 0.15, vibrato: { f: 28, d: 0.15 } }
      ] }
    },
    'synth-cat': {
      name: '猫叫', sub: '趣味 · 一声喵', emoji: '🐱', theme: 'fun',
      cfg: { duration: 0.4, voices: [
        { freq: 520, type: 'sawtooth', gain: 0.35, decay: 0.15, vibrato: { f: 7, d: 0.08 } },
        { freq: 780, type: 'sine',     gain: 0.15, decay: 0.12 }
      ] }
    }
  };

  // ===== 生成 + 播放 API =====
  window.__pk_synth = {
    generate: function(ctx, id) {
      var def = window.SYNTH_PACKS[id];
      if (!def) return null;
      return synthBuffer(ctx, def.cfg);
    },
    play: function(ctx, buf, volume, scan) {
      // 根据按键做 ±15% 音高随机偏移，避免每次一模一样
      var src = ctx.createBufferSource();
      src.buffer = buf;
      // 用 scancode hash 出一个稳定偏移（同一个键声音一致）
      var h = (((scan || 0) * 2654435761) >>> 0) / 4294967295;
      src.playbackRate.value = 0.88 + h * 0.24;  // 0.88 ~ 1.12
      var g = ctx.createGain();
      g.gain.value = volume * (0.9 + Math.random() * 0.2);
      src.connect(g).connect(ctx.destination);
      src.start(ctx.currentTime);
    }
  };
})();
