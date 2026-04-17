// 纸上键 · paper-key — macOS 机械键盘音效 App
// Copyright (C) 2026 01fish
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// See LICENSE file or <https://www.gnu.org/licenses/> for details.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

#[derive(Clone, Serialize)]
struct KeyPayload {
    scan: u32,
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

#[cfg(target_os = "macos")]
#[tauri::command]
fn start_global_listen(app: tauri::AppHandle) -> Result<bool, String> {
    if TAP_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(true);
    }
    let _ = APP_HANDLE.set(app);
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
                let loop_src = t
                    .mach_port
                    .create_runloop_source(0)
                    .expect("runloop source");
                unsafe {
                    CFRunLoop::get_current().add_source(&loop_src, kCFRunLoopCommonModes);
                }
                t.enable();
                CFRunLoop::run_current();
            }
            Err(_) => {
                eprintln!("[paper-key] CGEventTap create failed (no accessibility?)");
                TAP_STARTED.store(false, Ordering::SeqCst);
            }
        }
    });
    Ok(true)
}

#[cfg(target_os = "macos")]
static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn start_global_listen(_app: tauri::AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
fn is_global_listening() -> bool {
    TAP_STARTED.load(Ordering::SeqCst)
}

#[tauri::command]
fn open_accessibility_prefs() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
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
fn request_accessibility() -> bool {
    true
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_global_listen,
            is_global_listening,
            open_accessibility_prefs,
            request_accessibility,
            relaunch_app,
            binary_path
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
