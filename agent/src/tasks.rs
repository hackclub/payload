//! Task handlers, run in the user session so they have the live desktop
//! (DISPLAY/DBUS on Linux, an interactive window station on Windows).

use std::path::Path;

use crate::protocol::{Interpreter, TaskKind};

pub fn run(spool: &Path, kind: &TaskKind) -> Result<(), String> {
    match kind {
        TaskKind::Wallpaper { payload_file } => {
            let img = spool.join(payload_file);
            if !img.exists() {
                return Err(format!("wallpaper payload missing: {payload_file}"));
            }
            // Copy to a stable path (spool's parent, e.g. .../payload/wallpaper.jpg)
            // and point the OS at that — the spool payload is deleted after this
            // task, and a dangling reference would black the desktop on reload.
            let stable = spool.parent().unwrap_or(spool).join("wallpaper.jpg");
            if let Some(parent) = stable.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::copy(&img, &stable).map_err(|e| format!("copy wallpaper failed: {e}"))?;
            set_wallpaper(&stable)
        }
        TaskKind::RunScript { payload_file, interpreter } => {
            let script = spool.join(payload_file);
            if !script.exists() {
                return Err(format!("script payload missing: {payload_file}"));
            }
            run_script(&script, *interpreter)
        }
        TaskKind::Notify { title, body } => notify(title, body),
    }
}

#[cfg(windows)]
fn set_wallpaper(img: &Path) -> Result<(), String> {
    use std::ffi::{c_void, OsStr};
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETDESKWALLPAPER,
    };

    // "Fill" style regardless of the template default.
    let _ = no_window("reg", &["add", r"HKCU\Control Panel\Desktop", "/v", "WallpaperStyle", "/t", "REG_SZ", "/d", "10", "/f"]);
    let _ = no_window("reg", &["add", r"HKCU\Control Panel\Desktop", "/v", "TileWallpaper", "/t", "REG_SZ", "/d", "0", "/f"]);

    let wide: Vec<u16> = OsStr::new(img).encode_wide().chain(once(0)).collect();
    unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            Some(wide.as_ptr() as *mut c_void),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
        .map_err(|e| format!("SystemParametersInfoW failed: {e}"))
    }
}

#[cfg(windows)]
fn run_script(script: &Path, interpreter: Interpreter) -> Result<(), String> {
    let path = script.to_string_lossy().to_string();
    match interpreter {
        Interpreter::Powershell => no_window("powershell", &["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &path]),
        Interpreter::Bash => no_window("bash", &[&path]),
    }
}

#[cfg(windows)]
fn notify(title: &str, body: &str) -> Result<(), String> {
    // A lightweight in-session message that auto-dismisses. No extra deps.
    let text = if title.is_empty() { body.to_string() } else { format!("{title}\n\n{body}") };
    no_window("msg", &["*", "/time:8", text.as_str()])
}

/// Spawn a console program without flashing a window (this binary is
/// GUI-subsystem). CREATE_NO_WINDOW = 0x08000000.
#[cfg(windows)]
fn no_window(exe: &str, args: &[&str]) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    let status = Command::new(exe)
        .args(args)
        .creation_flags(0x0800_0000)
        .status()
        .map_err(|e| format!("spawn {exe} failed: {e}"))?;
    if status.success() { Ok(()) } else { Err(format!("{exe} exited with {status}")) }
}

#[cfg(unix)]
fn set_wallpaper(img: &Path) -> Result<(), String> {
    use std::process::Command;
    use std::thread::sleep;
    use std::time::Duration;

    let path = img.to_string_lossy().to_string();

    // Wait for the XFCE desktop to be up (xfconf reachable + last-image props
    // exist). Lets the agent be launched early in the session without failing;
    // it applies the moment the desktop is ready, minimizing the black window.
    let mut image_props: Vec<String> = Vec::new();
    for _ in 0..60 {
        if let Ok(out) = Command::new("xfconf-query").args(["-c", "xfce4-desktop", "-l"]).output() {
            if out.status.success() {
                image_props = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .map(str::trim)
                    .filter(|p| p.ends_with("last-image"))
                    .map(str::to_string)
                    .collect();
                if !image_props.is_empty() {
                    break;
                }
            }
        }
        sleep(Duration::from_millis(500));
    }
    if image_props.is_empty() {
        return Err("xfce4-desktop last-image properties not available".into());
    }

    for prop in &image_props {
        let _ = Command::new("xfconf-query").args(["-c", "xfce4-desktop", "-p", prop, "-s", &path]).status();
        let base = prop.trim_end_matches("last-image");
        let _ = Command::new("xfconf-query").args(["-c", "xfce4-desktop", "-p", &format!("{base}image-style"), "-s", "5"]).status();
    }

    Command::new("xfdesktop")
        .arg("--reload")
        .status()
        .map_err(|e| format!("xfdesktop --reload failed: {e}"))?;
    Ok(())
}

#[cfg(unix)]
fn run_script(script: &Path, interpreter: Interpreter) -> Result<(), String> {
    use std::process::Command;
    let exe = match interpreter {
        Interpreter::Bash => "bash",
        Interpreter::Powershell => "pwsh",
    };
    let status = Command::new(exe)
        .arg(script)
        .status()
        .map_err(|e| format!("spawn {exe} failed: {e}"))?;
    if status.success() { Ok(()) } else { Err(format!("{exe} exited with {status}")) }
}

#[cfg(unix)]
fn notify(title: &str, body: &str) -> Result<(), String> {
    use std::process::Command;
    let status = Command::new("notify-send")
        .args(["-a", "Payload", "-t", "8000", title, body])
        .status()
        .map_err(|e| format!("notify-send failed: {e}"))?;
    if status.success() { Ok(()) } else { Err(format!("notify-send exited with {status}")) }
}
