use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
struct KeyPayload {
    scan: u32,
}

#[derive(Clone, Serialize)]
struct ListenErrorPayload {
    reason: String,
}

static TAP_STARTED: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
fn mac_keycode_to_evdev(kc: i64) -> Option<u32> {
    // macOS HIToolbox/Events.h virtual keycode → Linux evdev scancode
    Some(match kc {
        0 => 30, 1 => 31, 2 => 32, 3 => 33, 4 => 35, 5 => 34, 6 => 44, 7 => 45,
        8 => 46, 9 => 47, 11 => 48, 12 => 16, 13 => 17, 14 => 18, 15 => 19,
        16 => 21, 17 => 20,
        18 => 2, 19 => 3, 20 => 4, 21 => 5, 22 => 7, 23 => 6, 24 => 13,
        25 => 10, 26 => 8, 27 => 12, 28 => 9, 29 => 11,
        30 => 27, 31 => 24, 32 => 22, 33 => 26, 34 => 23, 35 => 25,
        36 => 28, 37 => 38, 38 => 36, 39 => 40, 40 => 37, 41 => 39,
        42 => 43, 43 => 51, 44 => 53, 45 => 49, 46 => 50, 47 => 52,
        48 => 15, 49 => 57, 50 => 41, 51 => 14, 53 => 1,
        55 => 3675, 56 => 42, 57 => 58, 58 => 56, 59 => 29, 60 => 54, 62 => 97,
        123 => 57419, 124 => 57421, 125 => 57424, 126 => 57416,
        _ => return None,
    })
}

// ============================================================
// macOS 权限（IOHID · Input Monitoring）
// ============================================================
#[cfg(target_os = "macos")]
mod hid {
    pub const REQUEST_LISTEN_EVENT: u32 = 1;
    pub const ACCESS_GRANTED: u32 = 0;
    pub const ACCESS_DENIED: u32 = 1;

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        pub fn IOHIDCheckAccess(request_type: u32) -> u32;
        pub fn IOHIDRequestAccess(request_type: u32) -> bool;
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn check_input_monitoring() -> String {
    let status = unsafe { hid::IOHIDCheckAccess(hid::REQUEST_LISTEN_EVENT) };
    match status {
        hid::ACCESS_GRANTED => "granted".into(),
        hid::ACCESS_DENIED => "denied".into(),
        _ => "unknown".into(),
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn request_input_monitoring() -> bool {
    unsafe { hid::IOHIDRequestAccess(hid::REQUEST_LISTEN_EVENT) }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn check_input_monitoring() -> String { "granted".into() }

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn request_input_monitoring() -> bool { true }

// ============================================================
// macOS 权限（Accessibility · 静默检查）
// ============================================================
#[cfg(target_os = "macos")]
fn check_accessibility_silent() -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    }
    let key: CFString = CFString::from_static_string("AXTrustedCheckOptionPrompt");
    let value: CFBoolean = CFBoolean::false_value();
    let dict = CFDictionary::from_CFType_pairs(&[(key, value)]);
    unsafe { AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef()) }
}

#[cfg(not(target_os = "macos"))]
fn check_accessibility_silent() -> bool { true }

// ============================================================
// 打开系统设置
// ============================================================
#[tauri::command]
fn open_accessibility_prefs() -> Result<(), String> {
    let new_url = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility";
    let old_url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
    if std::process::Command::new("open").arg(new_url).status().map(|s| s.success()).unwrap_or(false) {
        return Ok(());
    }
    std::process::Command::new("open")
        .arg(old_url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_input_monitoring_prefs() -> Result<(), String> {
    let new_url = "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ListenEvent";
    let old_url = "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";
    if std::process::Command::new("open").arg(new_url).status().map(|s| s.success()).unwrap_or(false) {
        return Ok(());
    }
    std::process::Command::new("open")
        .arg(old_url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn request_accessibility() -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::CFString;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
    }
    let key: CFString = CFString::from_static_string("AXTrustedCheckOptionPrompt");
    let value: CFBoolean = CFBoolean::true_value();
    let dict = CFDictionary::from_CFType_pairs(&[(key, value)]);
    unsafe { AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef()) }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn request_accessibility() -> bool { true }

// ============================================================
// 综合诊断（一次拿全状态）
// ============================================================
#[derive(Serialize)]
struct Diagnosis {
    input_monitoring: String,
    accessibility: bool,
    tap_started: bool,
    binary: String,
    os: String,
}

#[tauri::command]
fn diagnose() -> Diagnosis {
    Diagnosis {
        input_monitoring: check_input_monitoring(),
        accessibility: check_accessibility_silent(),
        tap_started: TAP_STARTED.load(Ordering::SeqCst),
        binary: std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        os: std::env::consts::OS.to_string(),
    }
}

// ============================================================
// 按需拉取 CDHash（诊断面板用）
// ============================================================
#[tauri::command]
fn get_code_hash() -> String {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return "unknown".into(),
    };
    // exe = .../纸上键.app/Contents/MacOS/paper-key
    let app_path = exe
        .ancestors()
        .nth(3)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| exe.clone());

    let output = std::process::Command::new("codesign")
        .args(["-dv", "--verbose=2"])
        .arg(&app_path)
        .output();
    let output = match output {
        Ok(o) => o,
        Err(_) => return "unknown".into(),
    };
    let text = String::from_utf8_lossy(&output.stderr);
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("CDHash=") {
            return rest.trim().to_string();
        }
    }
    "unknown".into()
}

// ============================================================
// 全局键盘监听（CGEventTap · ListenOnly）
// ============================================================
#[cfg(target_os = "macos")]
#[tauri::command]
fn start_global_listen(app: tauri::AppHandle) -> Result<String, String> {
    if TAP_STARTED.load(Ordering::SeqCst) {
        return Ok("already".into());
    }

    // 权限预检
    let perm = check_input_monitoring();
    if perm == "denied" {
        let _ = app.emit("listen-error", ListenErrorPayload {
            reason: "denied".into(),
        });
        return Ok("denied".into());
    }

    TAP_STARTED.store(true, Ordering::SeqCst);
    let _ = APP_HANDLE.set(app.clone());

    std::thread::spawn(move || {
        use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
        use core_graphics::event::{
            CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
            EventField,
        };

        let tap = CGEventTap::new(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::KeyDown],
            |_proxy, _etype, event| {
                let kc = event.get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                if let Some(scan) = mac_keycode_to_evdev(kc) {
                    if let Some(app) = APP_HANDLE.get() {
                        let _ = app.emit("keypress", KeyPayload { scan });
                    }
                }
                None
            },
        );

        match tap {
            Ok(t) => {
                let loop_src = match t.mach_port.create_runloop_source(0) {
                    Ok(s) => s,
                    Err(_) => {
                        eprintln!("[paper-key] runloop source create failed");
                        TAP_STARTED.store(false, Ordering::SeqCst);
                        let _ = app.emit("listen-error", ListenErrorPayload {
                            reason: "runloop-failed".into(),
                        });
                        return;
                    }
                };
                unsafe {
                    CFRunLoop::get_current().add_source(&loop_src, kCFRunLoopCommonModes);
                }
                t.enable();
                let _ = app.emit("listen-ok", ());
                CFRunLoop::run_current();
            }
            Err(_) => {
                eprintln!("[paper-key] CGEventTap create failed (permission stale?)");
                TAP_STARTED.store(false, Ordering::SeqCst);
                // tap 创建失败但权限看起来是 granted → 典型的 ad-hoc CDHash 漂移
                let perm = check_input_monitoring();
                let reason = if perm == "granted" { "stale" } else { "tap-failed" };
                let _ = app.emit("listen-error", ListenErrorPayload {
                    reason: reason.into(),
                });
            }
        }
    });
    Ok("starting".into())
}

#[cfg(target_os = "macos")]
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn start_global_listen(_app: tauri::AppHandle) -> Result<String, String> {
    Ok("unsupported".into())
}

#[tauri::command]
fn is_global_listening() -> bool {
    TAP_STARTED.load(Ordering::SeqCst)
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn binary_path() -> String {
    std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| String::new())
}

// ============================================================
// 金句 LLM 过滤（调用 claude CLI）
// ============================================================
fn find_claude_binary() -> Option<String> {
    for p in &["/usr/local/bin/claude", "/opt/homebrew/bin/claude"] {
        if std::path::Path::new(p).exists() {
            return Some(p.to_string());
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        let p = format!("{}/.claude/bin/claude", home);
        if std::path::Path::new(&p).exists() {
            return Some(p);
        }
    }
    None
}

fn extract_json_array(s: &str) -> Option<String> {
    let start = s.find('[')?;
    let end = s.rfind(']')?;
    if end > start {
        Some(s[start..=end].to_string())
    } else {
        None
    }
}

fn llm_filter_blocking(candidates: Vec<String>) -> Result<Vec<String>, String> {
    if candidates.is_empty() {
        return Ok(vec![]);
    }
    let claude_path = find_claude_binary().ok_or_else(|| "未找到 claude CLI".to_string())?;
    let candidates_json = serde_json::to_string(&candidates).map_err(|e| e.to_string())?;

    let prompt = format!(
        "你是金句鉴赏家。真金句的标准：性感（句子本身有张力、有钩子）、短小精悍、富有哲理、值得深入思考。\n\n下面是候选句子的 JSON 数组。逐条判断，只保留真金句。\n\n严格要求：\n1. 只输出 JSON 数组（以 [ 开头，以 ] 结尾），不要任何解释或 markdown\n2. 元素为被保留的原句字符串，原样不修改\n3. 宁缺毋滥——不确定就丢弃\n4. 操作指引、步骤、章节标题、重复翻译、实用贴士一律丢弃\n5. 如果没有真金句，输出 []\n\n候选：\n{}",
        candidates_json
    );

    let output = std::process::Command::new(&claude_path)
        .arg("--dangerously-skip-permissions")
        .arg("-p")
        .arg(&prompt)
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_BASE_URL")
        .output()
        .map_err(|e| format!("spawn claude failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "claude exited {}: {}",
            output.status,
            stderr.chars().take(300).collect::<String>()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_str = extract_json_array(&stdout).ok_or_else(|| {
        let preview: String = stdout.chars().take(200).collect();
        format!("no JSON array in output: {}", preview)
    })?;
    serde_json::from_str::<Vec<String>>(&json_str).map_err(|e| format!("parse json failed: {}", e))
}

#[tauri::command]
async fn llm_filter_quotes(candidates: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || llm_filter_blocking(candidates))
        .await
        .map_err(|e| format!("join error: {}", e))?
}

#[tauri::command]
fn has_claude_cli() -> bool {
    find_claude_binary().is_some()
}

// ============================================================
// 拉 URL（curl）
// ============================================================
fn fetch_url_blocking(url: &str) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("只支持 http/https 链接".into());
    }
    let output = std::process::Command::new("curl")
        .args([
            "-sL",
            "--max-time", "30",
            "--compressed",
            "-A",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
            url,
        ])
        .output()
        .map_err(|e| format!("curl spawn failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "curl exited {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(200)
                .collect::<String>()
        ));
    }
    let body = String::from_utf8_lossy(&output.stdout).into_owned();
    Ok(body)
}

#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_url_blocking(&url))
        .await
        .map_err(|e| format!("join error: {}", e))?
}

// ============================================================
// 入口
// ============================================================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_global_listen,
            is_global_listening,
            open_accessibility_prefs,
            open_input_monitoring_prefs,
            request_accessibility,
            check_input_monitoring,
            request_input_monitoring,
            diagnose,
            get_code_hash,
            relaunch_app,
            binary_path,
            llm_filter_quotes,
            has_claude_cli,
            fetch_url
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title("纸上键 · paper-key");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
