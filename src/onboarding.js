// 纸上键 · 首次启动引导 + 权限健康体检
// 小范围内测版本，ad-hoc 签名下的 CDHash 失效兜底
(function () {
  'use strict';

  var KEY_DONE = 'paperkey.onboarded.v1';
  var isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);

  function invoke(cmd, args) {
    var inv =
      (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) ||
      (window.__TAURI__ && window.__TAURI__.invoke);
    if (!inv) return Promise.reject(new Error('invoke 不可用'));
    return inv(cmd, args);
  }

  function listen(evt, cb) {
    if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.listen) {
      return window.__TAURI__.event.listen(evt, cb);
    }
    return Promise.resolve(function () {});
  }

  // ============ 诊断聚合 ============
  function diagnose() {
    if (!isTauri) {
      return Promise.resolve({
        input_monitoring: 'browser',
        accessibility: true,
        tap_started: false,
        binary: '',
        os: 'browser',
      });
    }
    return invoke('diagnose').catch(function () {
      return {
        input_monitoring: 'unknown',
        accessibility: false,
        tap_started: false,
        binary: '',
        os: 'unknown',
      };
    });
  }

  // ============ 状态条（右上角常驻） ============
  function updateStatusBtn(state) {
    var b = document.getElementById('btnListen');
    if (!b) return;
    b.classList.remove('off', 'on', 'loading', 'stale');
    b.classList.add(state.cls);
    var t = b.querySelector('.txt');
    if (t) t.textContent = state.txt;
  }

  var STATE = {
    ok:     { cls: 'on',      txt: '全局监听中 · 敲任何键都有声' },
    off:    { cls: 'off',     txt: '▶ 开启全局监听' },
    stale:  { cls: 'stale',   txt: '⚠ 权限失效 · 点此修复' },
    denied: { cls: 'stale',   txt: '⚠ 未授权 · 点此开启' },
    loading:{ cls: 'loading', txt: '申请权限中⋯⋯' },
    browser:{ cls: 'off',     txt: '浏览器内 · 仅本窗口有声' },
  };

  // ============ 首次引导 ============
  function showOnboarding() {
    if (localStorage.getItem(KEY_DONE) === '1') return Promise.resolve();
    if (!isTauri) return Promise.resolve();

    return new Promise(function (resolve) {
      var ob = document.getElementById('pkOnboard');
      if (!ob) {
        resolve();
        return;
      }
      ob.hidden = false;
      var step = 1;
      var totalSteps = 3;

      function render() {
        var head = ob.querySelector('.pk-ob-title');
        var body = ob.querySelector('.pk-ob-body');
        var foot = ob.querySelector('.pk-ob-foot');
        var dots = ob.querySelector('.pk-ob-dots');
        if (dots) {
          dots.innerHTML = '';
          for (var i = 1; i <= totalSteps; i++) {
            var d = document.createElement('span');
            d.className = 'pk-ob-dot' + (i === step ? ' active' : '');
            dots.appendChild(d);
          }
        }

        if (step === 1) {
          head.textContent = '欢迎 · 纸上键';
          body.innerHTML =
            '<p class="pk-ob-p">给你的键盘一百种灵魂。</p>' +
            '<p class="pk-ob-p pk-ob-muted">每一次敲击都有真实的机械音、禅意的敲击声或复古的打字机声。</p>' +
            '<p class="pk-ob-p pk-ob-muted">所有音效在本地播放，不联网、不记录、不上传任何内容。</p>';
          foot.innerHTML =
            '<button class="pk-ob-btn pk-ob-primary" data-next>下一步</button>';
        } else if (step === 2) {
          head.textContent = '关于权限';
          body.innerHTML =
            '<p class="pk-ob-p">为了在<strong>任何应用里</strong>敲键盘都有声，需要一项系统权限：</p>' +
            '<div class="pk-ob-perm">' +
              '<span class="pk-ob-perm-icon">⌨</span>' +
              '<div>' +
                '<div class="pk-ob-perm-name">输入监控</div>' +
                '<div class="pk-ob-perm-desc">系统 → 隐私与安全性 → 输入监控</div>' +
              '</div>' +
            '</div>' +
            '<p class="pk-ob-p pk-ob-muted">我们只读取<strong>按下哪个键</strong>（不是字符内容）来播音效。整个过程离线。</p>';
          foot.innerHTML =
            '<button class="pk-ob-btn" data-back>上一步</button>' +
            '<button class="pk-ob-btn pk-ob-primary" data-next>授权</button>';
        } else if (step === 3) {
          head.textContent = '请授权';
          body.innerHTML =
            '<p class="pk-ob-p">点击下方按钮，系统会弹出授权对话框。</p>' +
            '<p class="pk-ob-p pk-ob-muted">如果对话框没弹，或者你之前点过"不允许"，可以直接去系统设置里把 <code>纸上键</code> 的开关打开。</p>' +
            '<div id="pkObStatus" class="pk-ob-status"></div>';
          foot.innerHTML =
            '<button class="pk-ob-btn" data-openprefs>去系统设置</button>' +
            '<button class="pk-ob-btn pk-ob-primary" data-request>弹出授权</button>' +
            '<button class="pk-ob-btn pk-ob-success" data-done hidden>完成</button>';
          refreshStep3Status();
        }
      }

      function refreshStep3Status() {
        diagnose().then(function (d) {
          var el = document.getElementById('pkObStatus');
          if (!el) return;
          var granted = d.input_monitoring === 'granted';
          el.innerHTML =
            '<div class="pk-ob-check' + (granted ? ' ok' : '') + '">' +
              '<span class="pk-ob-check-dot"></span>' +
              '输入监控：<strong>' + translatePerm(d.input_monitoring) + '</strong>' +
            '</div>';
          var done = ob.querySelector('[data-done]');
          if (done) done.hidden = !granted;
        });
      }

      ob.onclick = function (e) {
        var target = e.target;
        if (target.matches('[data-next]')) {
          step = Math.min(totalSteps, step + 1);
          render();
        } else if (target.matches('[data-back]')) {
          step = Math.max(1, step - 1);
          render();
        } else if (target.matches('[data-request]')) {
          invoke('request_input_monitoring').then(function () {
            setTimeout(refreshStep3Status, 400);
          });
        } else if (target.matches('[data-openprefs]')) {
          invoke('open_input_monitoring_prefs');
          // 开启后要用户手动回来，做轮询
          startPolling();
        } else if (target.matches('[data-done]')) {
          localStorage.setItem(KEY_DONE, '1');
          ob.hidden = true;
          resolve();
        } else if (target.matches('[data-skip]')) {
          // 稍后再设置
          ob.hidden = true;
          resolve();
        }
      };

      var pollTimer = null;
      function startPolling() {
        if (pollTimer) return;
        pollTimer = setInterval(function () {
          if (ob.hidden) {
            clearInterval(pollTimer);
            pollTimer = null;
            return;
          }
          refreshStep3Status();
        }, 1200);
      }

      render();
    });
  }

  function translatePerm(s) {
    if (s === 'granted') return '已授权 ✓';
    if (s === 'denied') return '已拒绝';
    if (s === 'unknown') return '未决定';
    return s;
  }

  // ============ 诊断面板（点状态条展开） ============
  function showDiagnostic() {
    var dlg = document.getElementById('pkDiagDlg');
    if (!dlg) return;
    dlg.hidden = false;
    var body = dlg.querySelector('.pk-dd-body');
    body.innerHTML = '<p class="pk-ob-muted">检测中⋯⋯</p>';

    Promise.all([diagnose(), invoke('get_code_hash').catch(function () { return 'unknown'; })]).then(
      function (arr) {
        var d = arr[0];
        var hash = arr[1];
        var permTxt = translatePerm(d.input_monitoring);
        var tapTxt = d.tap_started ? '运行中 ✓' : '未启动';
        var stale = d.input_monitoring === 'granted' && !d.tap_started;

        body.innerHTML =
          '<table class="pk-dd-tbl">' +
            '<tr><td>输入监控</td><td><strong>' + permTxt + '</strong></td></tr>' +
            '<tr><td>辅助功能</td><td>' + (d.accessibility ? '已授权' : '未授权') + '</td></tr>' +
            '<tr><td>全局监听</td><td>' + tapTxt + '</td></tr>' +
            '<tr><td>代码哈希</td><td><code>' + (hash || 'unknown') + '</code></td></tr>' +
            '<tr><td>程序路径</td><td><code class="pk-dd-path">' + (d.binary || '—') + '</code></td></tr>' +
          '</table>' +
          (stale
            ? '<div class="pk-dd-warn">⚠ 权限显示已授权但监听未启动。这通常是重装 app 后 CDHash 变化导致。请：<br>① 点「打开输入监控」按钮<br>② 在列表里找到「纸上键」，点 <b>-</b> 删除<br>③ 再把 <code>/Applications/纸上键.app</code> 拖回列表（或点 <b>+</b> 添加）<br>④ 回来点「重启 app」</div>'
            : '');

        dlg.querySelector('[data-action="open-im"]').style.display = '';
        dlg.querySelector('[data-action="restart"]').style.display = stale ? '' : 'none';
      }
    );
  }

  // ============ 权限失效修复面板 ============
  function showStaleFix() {
    showDiagnostic();
  }

  // ============ 全局导出 ============
  window.__pk_onboarding = {
    show: showOnboarding,
    diagnose: diagnose,
    showDiagnostic: showDiagnostic,
    showStaleFix: showStaleFix,
    updateStatus: function (key) {
      if (STATE[key]) updateStatusBtn(STATE[key]);
    },
  };

  // ============ 启动流程 ============
  document.addEventListener('DOMContentLoaded', function () {
    // 诊断面板按钮
    var dlg = document.getElementById('pkDiagDlg');
    if (dlg) {
      dlg.onclick = function (e) {
        var t = e.target;
        if (t.matches('[data-close]') || t.matches('.pk-dd-mask')) {
          dlg.hidden = true;
        } else if (t.matches('[data-action="open-im"]')) {
          invoke('open_input_monitoring_prefs');
        } else if (t.matches('[data-action="open-ax"]')) {
          invoke('open_accessibility_prefs');
        } else if (t.matches('[data-action="restart"]')) {
          invoke('relaunch_app');
        } else if (t.matches('[data-action="request"]')) {
          invoke('request_input_monitoring').then(function () {
            setTimeout(showDiagnostic, 400);
          });
        }
      };
    }

    // 监听后端推送的 listen-error 事件
    listen('listen-error', function (e) {
      var reason = (e.payload && e.payload.reason) || 'unknown';
      if (reason === 'stale') {
        window.__pk_onboarding.updateStatus('stale');
        showStaleFix();
      } else if (reason === 'denied') {
        window.__pk_onboarding.updateStatus('denied');
      } else {
        window.__pk_onboarding.updateStatus('off');
      }
    });
    listen('listen-ok', function () {
      window.__pk_onboarding.updateStatus('ok');
    });

    // 首次引导
    showOnboarding().then(function () {
      // 引导完成后自动试开一次
      if (isTauri) {
        diagnose().then(function (d) {
          if (d.input_monitoring === 'granted') {
            invoke('start_global_listen');
          } else {
            updateStatusBtn(STATE.off);
          }
        });
      } else {
        updateStatusBtn(STATE.browser);
      }
    });

    // 窗口重新获得焦点时，静默体检一次
    window.addEventListener('focus', function () {
      if (!isTauri) return;
      diagnose().then(function (d) {
        if (d.input_monitoring === 'granted' && !d.tap_started) {
          // 权限有但 tap 没启动 → 自愈尝试
          invoke('start_global_listen');
        } else if (d.input_monitoring === 'denied') {
          updateStatusBtn(STATE.denied);
        }
      });
    });
  });
})();
