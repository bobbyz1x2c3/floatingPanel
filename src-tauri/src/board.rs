//! 卡片面板的状态文件。
//!
//! 界面（WebView 里）和 CLI 都读写同一个 JSON 文件：
//! 谁改了都会落到磁盘上，界面端靠比对修改时间把 CLI 的改动捞回来，
//! 因此 CLI 在 app 没开的时候也能往里写，app 下次启动就能看到。

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// 和 tauri.conf.json 里的 identifier 保持一致——Tauri 的 app_data_dir 就是这么拼的。
pub const IDENTIFIER: &str = "app.nemufloat.desktop";
pub const FILE_NAME: &str = "board.json";

pub fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// 各平台的数据目录，和 Tauri 的 `app_data_dir()` 结果一致。
pub fn data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return PathBuf::from(appdata).join(IDENTIFIER);
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = home_dir() {
            return home.join("Library/Application Support").join(IDENTIFIER);
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
            if !xdg.is_empty() {
                return PathBuf::from(xdg).join(IDENTIFIER);
            }
        }
        if let Some(home) = home_dir() {
            return home.join(".local/share").join(IDENTIFIER);
        }
    }

    PathBuf::from(".").join(IDENTIFIER)
}

pub fn board_path() -> PathBuf {
    data_dir().join(FILE_NAME)
}

pub fn read() -> Option<String> {
    read_from(&board_path())
}

pub fn read_from(path: &std::path::Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

/// 先写临时文件再替换：CLI 和界面同时写的时候，不会读到写了一半的内容。
pub fn write(contents: &str) -> Result<(), String> {
    write_to(&board_path(), contents)
}

pub fn write_to(path: &std::path::Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|error| error.to_string())?;
    fs::rename(&tmp, &path).map_err(|error| error.to_string())
}

/// 文件的最后修改时间（毫秒）。文件不存在时返回 0。
pub fn mtime_millis() -> u64 {
    mtime_of(&board_path())
}

pub fn mtime_of(path: &std::path::Path) -> u64 {
    fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// 兜底：文件系统时间戳精度不够时用它做二次判断。
pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
