//! Poll the spool and run any task that has no result yet. Each task is
//! processed once, then its files are deleted so the spool self-cleans.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::log;
use crate::protocol::{Task, TaskResult, PROTOCOL_VERSION};
use crate::tasks;

pub fn drain(spool: &Path) {
    let Ok(entries) = fs::read_dir(spool) else { return };

    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
        if !name.ends_with(".task.json") {
            continue;
        }
        let id_base = name.trim_end_matches(".task.json");
        let result_path = spool.join(format!("{id_base}.result.json"));
        if result_path.exists() {
            continue;
        }
        process_one(spool, &path, &result_path);
    }
}

fn process_one(spool: &Path, task_path: &Path, result_path: &Path) {
    let started = Instant::now();

    // A half-written file just gets retried next tick.
    let Some(task) = fs::read_to_string(task_path).ok().and_then(|s| serde_json::from_str::<Task>(&s).ok()) else {
        return;
    };

    // Forward-compat: an older baked-in agent skips a newer task.
    if task.v != 0 && task.v > PROTOCOL_VERSION {
        return;
    }

    log::line(&format!("processing task {} ({:?})", task.id, task.kind));
    let outcome = tasks::run(spool, &task.kind);
    let took = started.elapsed().as_millis();

    let result = match &outcome {
        Ok(()) => TaskResult::ok(&task.id, took),
        Err(e) => TaskResult::failed(&task.id, e.clone(), took),
    };
    write_result(result_path, &result);

    let _ = fs::remove_file(task_path);
    for payload in task.kind.payload_files() {
        let _ = fs::remove_file(spool.join(payload));
    }

    match outcome {
        Ok(()) => log::line(&format!("task {} ok in {}ms", task.id, took)),
        Err(e) => log::line(&format!("task {} failed in {}ms: {}", task.id, took, e)),
    }
}

fn write_result(path: &Path, result: &TaskResult) {
    if let Ok(json) = serde_json::to_string_pretty(result) {
        // Write-then-rename so Payload never reads a partial result.
        let tmp = path.with_extension("json.tmp");
        if fs::write(&tmp, json).is_ok() {
            let _ = fs::rename(&tmp, path);
        }
    }
}

impl crate::protocol::TaskKind {
    fn payload_files(&self) -> Vec<PathBuf> {
        use crate::protocol::TaskKind::*;
        match self {
            Wallpaper { payload_file } | RunScript { payload_file, .. } => vec![PathBuf::from(payload_file)],
        }
    }
}
