//! NemuFloat 的命令行入口：给人和 agent 直接操作卡片用。
//!
//! 它和界面共用同一个状态文件（见 `nemufloat_lib::board`），
//! 界面每 1.2 秒比对一次文件改动，所以 CLI 写完卡片马上就能在窗口里看到。

use nemufloat_lib::board;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::OnceLock;

/// `--file` 可以指向别的状态文件（测试或同时管多块面板时用）。
static BOARD_FILE: OnceLock<PathBuf> = OnceLock::new();

fn board_path() -> PathBuf {
    BOARD_FILE.get().cloned().unwrap_or_else(board::board_path)
}

const QUADRANTS: [&str; 4] = ["do", "schedule", "delegate", "drop"];
const QUADRANT_TONE: [(&str, &str); 4] = [
    ("do", "rose"),
    ("schedule", "sky"),
    ("delegate", "amber"),
    ("drop", "graphite"),
];
const QUADRANT_LABEL: [(&str, &str); 4] = [
    ("do", "紧急 · 重要（右上）"),
    ("schedule", "重要 · 不紧急（左上）"),
    ("delegate", "紧急 · 不重要（右下）"),
    ("drop", "不重要 · 不紧急（左下）"),
];

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("nemu: {error}");
            ExitCode::FAILURE
        }
    }
}

struct Flags {
    positionals: Vec<String>,
    options: HashMap<String, Vec<String>>,
}

impl Flags {
    fn parse(args: &[String]) -> Flags {
        let mut positionals = Vec::new();
        let mut options: HashMap<String, Vec<String>> = HashMap::new();
        let mut index = 0;
        while index < args.len() {
            let item = &args[index];
            if let Some(name) = item.strip_prefix("--") {
                let (key, inline) = match name.split_once('=') {
                    Some((key, value)) => (key.to_string(), Some(value.to_string())),
                    None => (name.to_string(), None),
                };
                let value = match inline {
                    Some(value) => value,
                    None => {
                        index += 1;
                        args.get(index).cloned().unwrap_or_default()
                    }
                };
                options.entry(key).or_default().push(value);
            } else {
                positionals.push(item.clone());
            }
            index += 1;
        }
        Flags { positionals, options }
    }

    fn has(&self, key: &str) -> bool {
        self.options.contains_key(key)
    }

    fn one(&self, key: &str) -> Option<String> {
        self.options.get(key).and_then(|list| list.last()).cloned()
    }

    fn many(&self, key: &str) -> Vec<String> {
        self.options.get(key).cloned().unwrap_or_default()
    }
}

fn run(args: &[String]) -> Result<(), String> {
    let mut args: Vec<String> = args.to_vec();
    if let Some(index) = args.iter().position(|item| item == "--file") {
        let value = args.get(index + 1).cloned().ok_or("--file 后面要跟路径")?;
        let _ = BOARD_FILE.set(PathBuf::from(value));
        args.drain(index..=index + 1);
    } else if let Some(index) = args.iter().position(|item| item.starts_with("--file=")) {
        let value = args[index].trim_start_matches("--file=").to_string();
        let _ = BOARD_FILE.set(PathBuf::from(value));
        args.remove(index);
    }
    let args = args.as_slice();
    let (command, rest) = match args.split_first() {
        Some((head, tail)) => (head.as_str(), tail),
        None => {
            print_help();
            return Ok(());
        }
    };
    let flags = Flags::parse(rest);

    match command {
        "help" | "-h" | "--help" => {
            print_help();
            Ok(())
        }
        "path" => {
            println!("{}", board_path().to_string_lossy());
            Ok(())
        }
        "list" | "ls" => list(&flags),
        "search" | "find" => search(&flags),
        "show" | "get" => show(&flags),
        "add" | "new" => add(&flags),
        "set" | "update" => set(&flags),
        "done" | "archive" | "complete" => archive(&flags),
        "rm" | "delete" | "remove" => remove(&flags),
        "restore" | "unarchive" => restore(&flags),
        "archived" | "trash" => archived(&flags),
        "clear-archive" => clear_archive(&flags),
        "board" | "stats" => stats(&flags),
        _ => Err(format!("未知命令「{command}」，用 `nemu help` 看用法")),
    }
}

fn load() -> Result<Value, String> {
    match board::read_from(&board_path()) {
        Some(raw) => serde_json::from_str(&raw).map_err(|error| format!("状态文件解析失败：{error}")),
        None => Ok(json!({
            "version": 2,
            "cards": [],
            "archived": [],
            "settings": {},
            "nextZ": 1
        })),
    }
}

fn save(board_value: &mut Value) -> Result<(), String> {
    let cards = board_value.get("cards").and_then(Value::as_array).cloned().unwrap_or_default();
    let archived = board_value.get("archived").and_then(Value::as_array).cloned().unwrap_or_default();
    let max_z = cards
        .iter()
        .chain(archived.iter())
        .filter_map(|card| card.get("z").and_then(Value::as_u64))
        .max()
        .unwrap_or(0);
    let next_z = board_value.get("nextZ").and_then(Value::as_u64).unwrap_or(1).max(max_z + 1);
    if let Some(object) = board_value.as_object_mut() {
        object.insert("nextZ".into(), json!(next_z));
        object.insert("archived".into(), json!(archived));
    }
    let text = serde_json::to_string(board_value).map_err(|error| error.to_string())?;
    board::write_to(&board_path(), &text)
}

fn cards_of(board_value: &Value) -> Vec<Value> {
    let mut cards = board_value
        .get("cards")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    // 和界面一样：z 大的排后面（显示时更靠前），这里按象限 + z 排一个稳定顺序。
    cards.sort_by_key(|card| {
        let quadrant = card.get("quadrant").and_then(Value::as_str).unwrap_or("do").to_string();
        let order = QUADRANTS.iter().position(|item| *item == quadrant).unwrap_or(9);
        let z = card.get("z").and_then(Value::as_i64).unwrap_or(0);
        (order, z)
    });
    cards
}

fn text_of(card: &Value, key: &str) -> String {
    card.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

fn number_of(card: &Value, key: &str) -> u64 {
    card.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn quadrant_label(key: &str) -> String {
    QUADRANT_LABEL
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, label)| (*label).to_string())
        .unwrap_or_else(|| key.to_string())
}

fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

/// 在给定的一组卡片里解析选择器：完整 id、id 前缀，或者 `#3`（这组里的第 3 张，从 1 开始）。
fn resolve(pool: &[Value], selector: &str) -> Result<String, String> {
    if let Some(index) = selector.strip_prefix('#') {
        let position: usize = index.parse().map_err(|_| format!("`{selector}` 不是合法的序号"))?;
        return pool
            .get(position.checked_sub(1).ok_or("序号从 1 开始")?)
            .map(|card| text_of(card, "id"))
            .ok_or_else(|| format!("没有第 {position} 张卡片"));
    }
    if pool.iter().any(|card| text_of(card, "id") == selector) {
        return Ok(selector.to_string());
    }
    let matches: Vec<String> = pool
        .iter()
        .map(|card| text_of(card, "id"))
        .filter(|id| id.starts_with(selector))
        .collect();
    match matches.len() {
        0 => Err(format!("找不到卡片「{selector}」")),
        1 => Ok(matches[0].clone()),
        _ => Err(format!("「{selector}」匹配到 {} 张卡片，多写几位", matches.len())),
    }
}

fn archived_of(board_value: &Value) -> Vec<Value> {
    board_value.get("archived").and_then(Value::as_array).cloned().unwrap_or_default()
}

/// 先当卡片找，找不到再当归档找（`#序号` 只在卡片列表里数）。
fn resolve_any(cards: &[Value], archived: &[Value], selector: &str) -> Result<String, String> {
    if selector.starts_with('#') {
        return resolve(cards, selector);
    }
    resolve(cards, selector).or_else(|_| resolve(archived, selector))
}

fn card_position(cards: &[Value], quadrant: &str) -> (i64, i64) {
    let column = i64::from(quadrant == "do" || quadrant == "delegate");
    let row = i64::from(quadrant == "delegate" || quadrant == "drop");
    let nth = cards
        .iter()
        .filter(|card| card.get("quadrant").and_then(Value::as_str) == Some(quadrant))
        .count() as i64;
    let step = (nth % 3) * 26;
    (column * 560 + 16 + step, row * 400 + 62 + step)
}

/// 随机 id：时间戳 + 进程 + 一份递增计数，够本地唯一了。
fn new_id(existing: &[Value]) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now = board::now_millis();
    let pid = std::process::id() as u64;
    let mut state = now ^ (pid << 32) ^ (count << 48);
    let mut bytes = [0u8; 16];
    for slot in bytes.iter_mut() {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *slot = (state >> 33) as u8;
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let id = format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    );
    if existing.iter().any(|card| text_of(card, "id") == id) {
        return new_id(existing);
    }
    id
}

fn tone_for(quadrant: &str) -> &'static str {
    QUADRANT_TONE
        .iter()
        .find(|(name, _)| *name == quadrant)
        .map(|(_, tone)| *tone)
        .unwrap_or("sky")
}

fn attachment_for(path: &str) -> Value {
    let name = std::path::Path::new(path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let is_image = {
        let lower = name.to_ascii_lowercase();
        [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg"]
            .iter()
            .any(|ext| lower.ends_with(ext))
    };
    // 界面会自己把图片读成内嵌图，这里只留路径和名字。
    json!({
        "id": format!("att-{}", new_id(&[])),
        "name": name,
        "kind": if is_image { "image" } else { "file" },
        "src": file_href(path),
        "size": 0
    })
}

fn file_href(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') {
        format!("file://{normalized}")
    } else {
        format!("file:///{normalized}")
    }
}

fn print_card_line(index: usize, card: &Value, with_index: bool) {
    let prefix = if with_index { format!("#{index} ") } else { String::new() };
    let title = text_of(card, "title");
    let body: String = text_of(card, "body").replace('\n', " ").chars().take(48).collect();
    let quadrant = text_of(card, "quadrant");
    let attachments = card.get("attachments").and_then(Value::as_array).map(|list| list.len()).unwrap_or(0);
    print!("{prefix}{}  [{}]  {}", title, quadrant_label(&quadrant), short_id(&text_of(card, "id")));
    if attachments > 0 {
        print!("  📎{attachments}");
    }
    if !body.is_empty() {
        print!("  {body}");
    }
    println!();
}

fn list(flags: &Flags) -> Result<(), String> {
    let board_value = load()?;
    let cards = cards_of(&board_value);
    let filter = flags.one("quadrant");
    let limit: usize = flags.one("limit").and_then(|value| value.parse().ok()).unwrap_or(0);
    let picked: Vec<&Value> = cards
        .iter()
        .filter(|card| match &filter {
            Some(quadrant) => card.get("quadrant").and_then(Value::as_str) == Some(quadrant.as_str()),
            None => true,
        })
        .collect();
    let shown: Vec<&Value> = picked.iter().take(if limit > 0 { limit } else { picked.len() }).copied().collect();

    if flags.has("json") {
        let payload = json!({ "total": picked.len(), "cards": shown });
        println!("{}", serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?);
        return Ok(());
    }
    if shown.is_empty() {
        println!("（没有卡片）");
        return Ok(());
    }
    for (index, card) in shown.iter().enumerate() {
        print_card_line(index + 1, card, true);
    }
    println!("共 {} 张", picked.len());
    Ok(())
}

fn search(flags: &Flags) -> Result<(), String> {
    let needle = flags
        .positionals
        .first()
        .cloned()
        .ok_or("用法：nemu search <关键词>")?
        .to_lowercase();
    let board_value = load()?;
    let cards = cards_of(&board_value);
    let hits: Vec<Value> = cards
        .into_iter()
        .filter(|card| {
            let haystack = format!(
                "{} {} {}",
                text_of(card, "title").to_lowercase(),
                text_of(card, "body").to_lowercase(),
                card.get("attachments")
                    .and_then(Value::as_array)
                    .map(|list| list
                        .iter()
                        .map(|item| text_of(item, "name"))
                        .collect::<Vec<_>>()
                        .join(" "))
                    .unwrap_or_default()
                    .to_lowercase()
            );
            haystack.contains(&needle)
        })
        .collect();

    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(&hits).map_err(|error| error.to_string())?);
        return Ok(());
    }
    if hits.is_empty() {
        println!("没有匹配「{needle}」的卡片");
        return Ok(());
    }
    for (index, card) in hits.iter().enumerate() {
        print_card_line(index + 1, card, true);
    }
    Ok(())
}

fn show(flags: &Flags) -> Result<(), String> {
    let selector = flags.positionals.first().cloned().ok_or("用法：nemu show <id|#序号>")?;
    let board_value = load()?;
    let cards = cards_of(&board_value);
    let archived_cards = archived_of(&board_value);
    let id = resolve_any(&cards, &archived_cards, &selector)?;
    let all: Vec<Value> = cards.iter().cloned().chain(archived_cards.iter().cloned()).collect();
    let card = all.iter().find(|item| text_of(item, "id") == id).ok_or("卡片不见了")?;

    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(card).map_err(|error| error.to_string())?);
        return Ok(());
    }
    println!("标题：{}", text_of(card, "title"));
    println!("id：{}", text_of(card, "id"));
    println!("象限：{}", quadrant_label(&text_of(card, "quadrant")));
    println!("位置：{},{}  {}×{}", number_of(card, "x"), number_of(card, "y"), number_of(card, "width"), number_of(card, "height"));
    println!("收起：{}", card.get("collapsed").and_then(Value::as_bool).unwrap_or(false));
    if let Some(archived_at) = card.get("archivedAt").and_then(Value::as_u64) {
        println!("归档时间：{archived_at}");
    }
    let attachments = card.get("attachments").and_then(Value::as_array).cloned().unwrap_or_default();
    if attachments.is_empty() {
        println!("附件：无");
    } else {
        println!("附件：");
        for item in attachments {
            println!("  - {} ({}) {}", text_of(&item, "name"), text_of(&item, "kind"), text_of(&item, "src"));
        }
    }
    println!("---");
    println!("{}", text_of(card, "body"));
    Ok(())
}

fn add(flags: &Flags) -> Result<(), String> {
    let mut board_value = load()?;
    let quadrant = flags.one("quadrant").unwrap_or_else(|| "do".into());
    if !QUADRANTS.contains(&quadrant.as_str()) {
        return Err(format!("象限只能是 {} 之一", QUADRANTS.join(" / ")));
    }
    let mut cards = cards_of(&board_value);
    let position = card_position(&cards, &quadrant);
    let mut attachments: Vec<Value> = Vec::new();
    for path in flags.many("attach") {
        attachments.push(attachment_for(&path));
    }
    for url in flags.many("url") {
        attachments.push(json!({
            "id": format!("att-{}", new_id(&[])),
            "name": url,
            "kind": "file",
            "src": url,
            "size": 0
        }));
    }

    let z = board_value.get("nextZ").and_then(Value::as_u64).unwrap_or(1);
    let now = board::now_millis();
    let card = json!({
        "id": new_id(&cards),
        "title": flags.one("title").unwrap_or_else(|| "新卡片".into()),
        "body": flags.one("body").unwrap_or_default(),
        "tone": tone_for(&quadrant),
        "quadrant": quadrant,
        "attachments": attachments,
        "x": position.0,
        "y": position.1,
        "width": 340,
        "height": 230,
        "z": z,
        "collapsed": false,
        "createdAt": now,
        "updatedAt": now
    });
    cards.push(card.clone());
    if let Some(object) = board_value.as_object_mut() {
        object.insert("cards".into(), json!(cards));
        object.insert("nextZ".into(), json!(z + 1));
    }
    save(&mut board_value)?;

    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(&card).map_err(|error| error.to_string())?);
    } else {
        println!("已新建卡片 {}  {}", short_id(&text_of(&card, "id")), text_of(&card, "title"));
        println!("id：{}", text_of(&card, "id"));
    }
    Ok(())
}

fn mutate_card<F>(flags: &Flags, usage: &str, mutate: F, moved_message: &str) -> Result<(), String>
where
    F: FnOnce(&mut Value),
{
    let selector = flags.positionals.first().cloned().ok_or(usage)?;
    let mut board_value = load()?;
    let cards = cards_of(&board_value);
    let id = resolve(&cards, &selector)?;
    let mut updated = cards.clone();
    let mut found = None;
    for card in updated.iter_mut() {
        if text_of(card, "id") == id {
            mutate(card);
            found = Some(card.clone());
            break;
        }
    }
    let card = found.ok_or("卡片不见了")?;
    if let Some(object) = board_value.as_object_mut() {
        object.insert("cards".into(), json!(updated));
    }
    save(&mut board_value)?;
    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(&card).map_err(|error| error.to_string())?);
    } else {
        println!("{moved_message} {}  {}", short_id(&text_of(&card, "id")), text_of(&card, "title"));
    }
    Ok(())
}

fn set(flags: &Flags) -> Result<(), String> {
    let title = flags.one("title");
    let body = flags.one("body");
    let append = flags.one("append");
    let quadrant = flags.one("quadrant");
    let collapsed = flags.one("collapsed");
    if title.is_none() && body.is_none() && append.is_none() && quadrant.is_none() && collapsed.is_none() {
        return Err("至少给一个要改的字段：--title / --body / --append / --quadrant / --collapsed".into());
    }
    if let Some(value) = &quadrant {
        if !QUADRANTS.contains(&value.as_str()) {
            return Err(format!("象限只能是 {} 之一", QUADRANTS.join(" / ")));
        }
    }
    let now = board::now_millis();
    mutate_card(
        flags,
        "用法：nemu set <id|#序号> --title 新标题",
        move |card| {
            if let Some(object) = card.as_object_mut() {
                if let Some(value) = &title {
                    object.insert("title".into(), json!(value));
                }
                if let Some(value) = &body {
                    object.insert("body".into(), json!(value));
                }
                if let Some(value) = &append {
                    let current = object.get("body").and_then(Value::as_str).unwrap_or("").to_string();
                    let joined = if current.is_empty() {
                        value.clone()
                    } else {
                        format!("{current}\n{value}")
                    };
                    object.insert("body".into(), json!(joined));
                }
                if let Some(value) = &quadrant {
                    object.insert("quadrant".into(), json!(value));
                    object.insert("tone".into(), json!(tone_for(value)));
                }
                if let Some(value) = &collapsed {
                    object.insert("collapsed".into(), json!(value == "true"));
                }
                object.insert("updatedAt".into(), json!(now));
            }
        },
        "已更新",
    )
}

fn archive(flags: &Flags) -> Result<(), String> {
    let selector = flags.positionals.first().cloned().ok_or("用法：nemu done <id|#序号>")?;
    let mut board_value = load()?;
    let cards = cards_of(&board_value);
    let id = resolve(&cards, &selector)?;
    let mut remaining = Vec::new();
    let mut moved: Option<Value> = None;
    for card in cards {
        if text_of(&card, "id") == id {
            moved = Some(card);
        } else {
            remaining.push(card);
        }
    }
    let mut card = moved.ok_or("卡片不见了")?;
    if let Some(object) = card.as_object_mut() {
        object.insert("archivedAt".into(), json!(board::now_millis()));
    }
    let mut archived = board_value.get("archived").and_then(Value::as_array).cloned().unwrap_or_default();
    archived.insert(0, card.clone());
    if let Some(object) = board_value.as_object_mut() {
        object.insert("cards".into(), json!(remaining));
        object.insert("archived".into(), json!(archived));
    }
    save(&mut board_value)?;

    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(&card).map_err(|error| error.to_string())?);
    } else {
        println!("已归档 {}  {}", short_id(&text_of(&card, "id")), text_of(&card, "title"));
    }
    Ok(())
}

fn remove(flags: &Flags) -> Result<(), String> {
    let selector = flags.positionals.first().cloned().ok_or("用法：nemu rm <id|#序号>")?;
    let mut board_value = load()?;
    let cards = cards_of(&board_value);
    let archived_before = archived_of(&board_value);
    let id = resolve_any(&cards, &archived_before, &selector)?;
    let before = cards.len();
    let cards: Vec<Value> = cards.into_iter().filter(|card| text_of(card, "id") != id).collect();
    let archived_all = archived_before;
    let archived: Vec<Value> = archived_all.iter().filter(|card| text_of(card, "id") != id).cloned().collect();
    let removed = before - cards.len() + (archived_all.len() - archived.len());
    if removed == 0 {
        return Err("卡片不见了".into());
    }
    if let Some(object) = board_value.as_object_mut() {
        object.insert("cards".into(), json!(cards));
        object.insert("archived".into(), json!(archived));
    }
    save(&mut board_value)?;
    println!("已删除 {removed} 张卡片");
    Ok(())
}

fn restore(flags: &Flags) -> Result<(), String> {
    let selector = flags.positionals.first().cloned().ok_or("用法：nemu restore <id|#序号>")?;
    let mut board_value = load()?;
    let cards = cards_of(&board_value);
    let archived_all = archived_of(&board_value);
    // 恢复时 `#序号` 数的是归档列表。
    let id = resolve(&archived_all, &selector)?;
    let mut restored: Option<Value> = None;
    let archived: Vec<Value> = archived_all
        .into_iter()
        .filter(|card| {
            if text_of(card, "id") == id {
                restored = Some(card.clone());
                false
            } else {
                true
            }
        })
        .collect();
    let mut card = restored.ok_or("归档里没有这张卡片")?;
    let quadrant = text_of(&card, "quadrant");
    let position = card_position(&cards, &quadrant);
    let z = board_value.get("nextZ").and_then(Value::as_u64).unwrap_or(1);
    if let Some(object) = card.as_object_mut() {
        object.remove("archivedAt");
        object.insert("x".into(), json!(position.0));
        object.insert("y".into(), json!(position.1));
        object.insert("z".into(), json!(z));
        object.insert("updatedAt".into(), json!(board::now_millis()));
    }
    let mut cards = cards;
    cards.push(card.clone());
    if let Some(object) = board_value.as_object_mut() {
        object.insert("cards".into(), json!(cards));
        object.insert("archived".into(), json!(archived));
        object.insert("nextZ".into(), json!(z + 1));
    }
    save(&mut board_value)?;
    println!("已恢复 {}  {}", short_id(&text_of(&card, "id")), text_of(&card, "title"));
    Ok(())
}

fn archived(flags: &Flags) -> Result<(), String> {
    let board_value = load()?;
    let list = board_value.get("archived").and_then(Value::as_array).cloned().unwrap_or_default();
    if flags.has("json") {
        println!("{}", serde_json::to_string_pretty(&list).map_err(|error| error.to_string())?);
        return Ok(());
    }
    if list.is_empty() {
        println!("（归档是空的）");
        return Ok(());
    }
    for (index, card) in list.iter().enumerate() {
        print_card_line(index + 1, card, true);
    }
    println!("共 {} 张已归档", list.len());
    Ok(())
}

fn clear_archive(flags: &Flags) -> Result<(), String> {
    let mut board_value = load()?;
    let count = board_value.get("archived").and_then(Value::as_array).map(|list| list.len()).unwrap_or(0);
    if let Some(object) = board_value.as_object_mut() {
        object.insert("archived".into(), json!([]));
    }
    save(&mut board_value)?;
    if flags.has("json") {
        println!("{}", json!({ "cleared": count }));
    } else {
        println!("已清空 {count} 张归档");
    }
    Ok(())
}

fn stats(flags: &Flags) -> Result<(), String> {
    let board_value = load()?;
    let cards = cards_of(&board_value);
    let archived = board_value.get("archived").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut counts: Vec<(String, usize)> = Vec::new();
    for quadrant in QUADRANTS {
        let count = cards
            .iter()
            .filter(|card| card.get("quadrant").and_then(Value::as_str) == Some(quadrant))
            .count();
        counts.push((quadrant.to_string(), count));
    }
    if flags.has("json") {
        let payload = json!({
            "total": cards.len(),
            "archived": archived.len(),
            "quadrants": counts.iter().map(|(key, count)| json!({ "quadrant": key, "count": count })).collect::<Vec<_>>(),
            "path": board_path().to_string_lossy()
        });
        println!("{}", serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?);
        return Ok(());
    }
    println!("卡片 {} 张，已归档 {} 张", cards.len(), archived.len());
    for (key, count) in counts {
        println!("  {:<28} {count}", quadrant_label(&key));
    }
    println!("状态文件：{}", board_path().to_string_lossy());
    Ok(())
}

fn print_help() {
    println!(
        "\
nemu — NemuFloat 卡片面板的命令行

用法： nemu <命令> [参数...] [--json]

  卡片
    list [--quadrant do|schedule|delegate|drop] [--limit N]
                            列出卡片（默认按象限 + 层叠顺序）
    search <关键词>          按标题 / 正文 / 附件名搜索
    show <id|#序号>          看一张卡片的全部信息
    add [--title T] [--body B] [--quadrant Q] [--attach 路径]... [--url 链接]...
                            新建卡片（--attach / --url 可以给多次）
    set <id|#序号> [--title T] [--body B] [--append B] [--quadrant Q] [--collapsed true|false]
                            改一张卡片
    done <id|#序号>          完成并归档（等同于点卡片上的「完成」）
    rm <id|#序号>            删除（卡片或归档都能删）

  归档
    archived                 列出已归档的卡片
    restore <id|#序号>       从归档恢复到原来的象限
    clear-archive            清空归档

  其它
    board                    每个象限各有多少张 + 状态文件路径
    path                     只打印状态文件路径

全局参数： --file <路径>     换成别的状态文件（默认用界面那份）

选择器可以写完整 id、id 的前几位，或者 `#3`（当前列表里的第 3 张）。
加 --json 输出机器可读的 JSON。
界面每 1.2 秒检查一次状态文件，写完立刻就能在窗口里看到。"
    );
}
