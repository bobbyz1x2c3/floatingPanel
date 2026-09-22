use base64::Engine;

pub mod board;
pub mod audio;

use serde::Serialize;

/// 拖进来的东西是文件还是文件夹：文件夹没有内容可读，只能留一条链接。
#[derive(Serialize)]
pub struct PathInfo {
    name: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
fn path_info(path: String) -> Result<PathInfo, String> {
    let meta = std::fs::metadata(&path).map_err(|error| error.to_string())?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    Ok(PathInfo {
        name,
        is_dir: meta.is_dir(),
        size: if meta.is_dir() { 0 } else { meta.len() },
    })
}

pub fn mime_for(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".avif") {
        "image/avif"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    }
}

#[tauri::command]
fn read_file_data_url(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", mime_for(&path), encoded))
}

#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    opener::open(&target).map_err(|error| error.to_string())
}

/// 跑一条用户自己在托盘里配的命令（Windows 走 cmd /C，其它平台走 sh -c）。
/// 只负责启动，不等它结束，输出也不接管——它就是个快捷方式。
#[tauri::command]
fn run_command(command: String) -> Result<(), String> {
    if command.trim().is_empty() {
        return Err("命令是空的".into());
    }
    #[cfg(target_os = "windows")]
    let spawned = {
        use std::os::windows::process::CommandExt;
        // 用 raw_arg 原样交给 cmd：走普通 arg 的话 Rust 会加一层引号，
        // 带引号或重定向的命令（echo x > "%TEMP%\y"）会被拆坏。
        std::process::Command::new("cmd")
            .arg("/C")
            .raw_arg(&command)
            .spawn()
    };
    #[cfg(not(target_os = "windows"))]
    let spawned = std::process::Command::new("sh").arg("-c").arg(&command).spawn();
    spawned.map(|_| ()).map_err(|error| error.to_string())
}

/* ---------- 状态文件：CLI 和界面共用这一份 ---------- */

#[tauri::command]
fn board_path_string() -> String {
    board::board_path().to_string_lossy().to_string()
}

#[tauri::command]
fn read_board_file() -> Option<String> {
    board::read()
}

#[tauri::command]
fn write_board_file(contents: String) -> Result<u64, String> {
    board::write(&contents)?;
    Ok(board::mtime_millis())
}

#[tauri::command]
fn board_file_stamp() -> u64 {
    board::mtime_millis()
}

/* ---------- 音频响应（系统播放的声音） ---------- */

#[tauri::command]
fn audio_available() -> bool {
    audio::available()
}

#[tauri::command]
fn audio_start(app: tauri::AppHandle, state: tauri::State<'_, audio::AudioState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    if slot.is_some() {
        return Ok(());
    }
    let capture = audio::start(app)?;
    *slot = Some(capture);
    Ok(())
}

#[tauri::command]
fn audio_stop(state: tauri::State<'_, audio::AudioState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    if let Some(capture) = slot.take() {
        capture.stop();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(audio::AudioState::default())
        // 自动更新：检查 + 下载 + 安装（配置见 tauri.conf.json 的 plugins.updater）。
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            read_file_data_url,
            open_target,
            run_command,
            path_info,
            board_path_string,
            read_board_file,
            write_board_file,
            board_file_stamp,
            audio_available,
            audio_start,
            audio_stop
        ])
        .run(tauri::generate_context!())
        .expect("failed to start NemuFloat");
}
