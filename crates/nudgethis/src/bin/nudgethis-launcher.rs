#![cfg_attr(windows, windows_subsystem = "windows")]
//! Double-click entry point. It starts only the welcome, never an agent or project command.
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};
fn launch() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.iter().any(|a| a == "--version") {
        println!("NudgeThis launcher {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    let directory = std::env::current_exe()?
        .parent()
        .ok_or("Cannot locate the application")?
        .to_path_buf();
    let binary: PathBuf = directory.join(if cfg!(windows) {
        "nudgethis.exe"
    } else {
        "nudgethis"
    });
    if !binary.is_file() {
        return Err(
            "Keep the launcher and NudgeThis executable together in the extracted folder".into(),
        );
    }
    let mut child = Command::new(binary);
    child
        .arg("welcome")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        child.creation_flags(0x08000000);
    }
    let mut process = child.spawn()?;
    let stdout = process.stdout.take().ok_or("Cannot read startup status")?;
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if line.starts_with("NudgeThis welcome: http://127.0.0.1:") {
                let _ = send.send(());
                break;
            }
        }
    });
    if receive.recv_timeout(Duration::from_secs(20)).is_err() {
        let _ = process.kill();
        return Err("The local welcome could not start. Check that your user folder is writable and no other NudgeThis process has locked the library. Run nudgethis welcome in a terminal for details".into());
    }
    Ok(())
}
fn main() {
    if let Err(error) = launch() {
        let message = format!("NudgeThis could not open: {error}");
        #[cfg(windows)]
        {
            let _=Command::new("powershell.exe").args(["-NoProfile","-Command","Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:NUDGETHIS_LAUNCH_MESSAGE,'NudgeThis')"]).env("NUDGETHIS_LAUNCH_MESSAGE",&message).status();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("osascript")
                .args([
                    "-e",
                    "on run argv\ndisplay alert \"NudgeThis\" message (item 1 of argv)\nend run",
                    "--",
                    &message,
                ])
                .status();
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = Command::new("zenity")
                .args(["--error", "--text", &message])
                .status();
        }
        eprintln!("{message}");
        std::process::exit(1);
    }
}
