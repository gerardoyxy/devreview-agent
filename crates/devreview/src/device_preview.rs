//! An owned Chromium window. No connection to a user's existing browser or profile.
use crate::error::check;
use anyhow::{Context, Result, bail, ensure};
use futures_util::{SinkExt, StreamExt};
use process_wrap::tokio::*;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{net::TcpStream, sync::Mutex};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream,
    tungstenite::{Message, protocol::WebSocketConfig},
};
use tokio_util::sync::CancellationToken;

pub fn profiles() -> Value {
    json!([
        {"id":"phone-small","label":"Small phone","width":360,"height":800,"dpr":3,"mobile":true,"touch":true},
        {"id":"phone","label":"Phone","width":390,"height":844,"dpr":3,"mobile":true,"touch":true},
        {"id":"phone-large","label":"Large phone","width":430,"height":932,"dpr":3,"mobile":true,"touch":true},
        {"id":"tablet","label":"Tablet","width":768,"height":1024,"dpr":2,"mobile":true,"touch":true},
        {"id":"desktop","label":"Desktop","width":1440,"height":900,"dpr":1,"mobile":false,"touch":false}
    ])
}

fn settings(id: &str, orientation: &str) -> Result<Value> {
    check(
        matches!(orientation, "portrait" | "landscape"),
        400,
        "Choose portrait or landscape",
    )?;
    let mut profile = profiles()
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == id)
        .cloned()
        .context("Unknown device profile");
    check(profile.is_ok(), 400, "Choose a listed device profile")?;
    let profile = profile.as_mut().unwrap();
    if id != "desktop" && orientation == "landscape" {
        let width = profile["width"].clone();
        profile["width"] = profile["height"].clone();
        profile["height"] = width;
    }
    profile["orientation"] = if id == "desktop" {
        "landscape"
    } else {
        orientation
    }
    .into();
    Ok(profile.clone())
}

fn executable() -> Option<(PathBuf, String)> {
    if let Some(path) = std::env::var_os("NUDGETHIS_BROWSER_PATH") {
        let path = PathBuf::from(path);
        return (path.is_absolute() && path.is_file())
            .then_some((path, "Configured Chromium browser".into()));
    }
    let mut candidates: Vec<(PathBuf, &str)> = vec![];
    if cfg!(target_os = "macos") {
        candidates.extend([
            (
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".into(),
                "Google Chrome",
            ),
            (
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge".into(),
                "Microsoft Edge",
            ),
            (
                "/Applications/Chromium.app/Contents/MacOS/Chromium".into(),
                "Chromium",
            ),
        ]);
    } else if cfg!(windows) {
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Some(base) = std::env::var_os(variable) {
                for (suffix, label) in [
                    ("Google/Chrome/Application/chrome.exe", "Google Chrome"),
                    ("Microsoft/Edge/Application/msedge.exe", "Microsoft Edge"),
                ] {
                    candidates.push((PathBuf::from(&base).join(suffix), label));
                }
            }
        }
    } else {
        for (path, label) in [
            ("/usr/bin/google-chrome", "Google Chrome"),
            ("/usr/bin/google-chrome-stable", "Google Chrome"),
            ("/usr/bin/chromium", "Chromium"),
            ("/usr/bin/chromium-browser", "Chromium"),
            ("/usr/bin/microsoft-edge", "Microsoft Edge"),
        ] {
            candidates.push((path.into(), label));
        }
    }
    candidates
        .into_iter()
        .find(|(path, _)| path.is_file())
        .map(|(path, label)| (path, label.into()))
}

pub fn availability() -> Value {
    let found = executable();
    json!({"available":found.is_some(),"browser":found.map(|(_, label)|label),"profiles":profiles(),
        "note":"Opens a separate Chrome, Edge or Chromium window with a temporary profile. Set NUDGETHIS_BROWSER_PATH to an absolute executable path if detection fails. This emulates Chromium, not Safari or a physical device."})
}

struct Cdp {
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    sequence: u64,
    target_session: Option<String>,
}
impl Cdp {
    async fn call(&mut self, method: &str, params: Value, page: bool) -> Result<Value> {
        self.sequence += 1;
        let id = self.sequence;
        let mut request = json!({"id":id,"method":method,"params":params});
        if page {
            request["sessionId"] = self
                .target_session
                .as_ref()
                .context("No browser tab")?
                .clone()
                .into();
        }
        tokio::time::timeout(Duration::from_secs(3), async {
            self.socket
                .send(Message::Text(request.to_string().into()))
                .await?;
            while let Some(message) = self.socket.next().await {
                match message? {
                    Message::Text(text) => {
                        let value: Value = serde_json::from_str(&text)?;
                        if value["id"] == id {
                            ensure!(value.get("error").is_none(), "Browser rejected {method}");
                            return Ok(value["result"].clone());
                        }
                    }
                    Message::Close(_) => bail!("Browser window closed"),
                    _ => {}
                }
            }
            bail!("Browser connection closed")
        })
        .await
        .context("Browser did not respond")?
    }
}

struct Session {
    child: Box<dyn ChildWrapper>,
    directory: PathBuf,
    cdp: Option<Cdp>,
    target: String,
    info: Value,
    version: String,
}
impl Session {
    async fn stop(&mut self) -> bool {
        self.cdp.take();
        let _ = self.child.start_kill();
        if matches!(
            tokio::time::timeout(Duration::from_secs(2), self.child.wait()).await,
            Ok(Ok(_))
        ) {
            // Only our random, private, freshly created directory is eligible for removal.
            if std::fs::remove_dir_all(&self.directory).is_ok() {
                return true;
            }
        }
        eprintln!(
            "Device browser cleanup incomplete. Confirm the browser is stopped before removing {}",
            self.directory.display()
        );
        false
    }
    async fn call(&mut self, method: &str, params: Value, page: bool) -> Result<Value> {
        self.cdp
            .as_mut()
            .context("Browser is not connected")?
            .call(method, params, page)
            .await
    }
    async fn connect(&mut self) -> Result<()> {
        let endpoint = loop {
            ensure!(
                self.child.try_wait()?.is_none(),
                "Browser exited during startup"
            );
            if let Ok(text) = std::fs::read_to_string(self.directory.join("DevToolsActivePort")) {
                let mut lines = text.lines();
                let port: u16 = lines.next().unwrap_or("").parse()?;
                let path = lines.next().unwrap_or("");
                ensure!(
                    port > 0
                        && path.starts_with("/devtools/browser/")
                        && path
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || "/-".contains(c)),
                    "Invalid browser endpoint"
                );
                break format!("ws://127.0.0.1:{port}{path}");
            }
            tokio::time::sleep(Duration::from_millis(40)).await;
        };
        let config = WebSocketConfig::default()
            .max_message_size(Some(1_048_576))
            .max_frame_size(Some(1_048_576));
        let (socket, _) =
            tokio_tungstenite::connect_async_with_config(endpoint, Some(config), false).await?;
        self.cdp = Some(Cdp {
            socket,
            sequence: 0,
            target_session: None,
        });
        let version = self.call("Browser.getVersion", json!({}), false).await?;
        self.version = version["product"]
            .as_str()
            .context("Missing browser version")?
            .into();
        let targets = self.call("Target.getTargets", json!({}), false).await?;
        self.target = targets["targetInfos"]
            .as_array()
            .context("Missing browser targets")?
            .iter()
            .find(|target| target["type"] == "page" && target["url"] == "about:blank")
            .and_then(|target| target["targetId"].as_str())
            .context("Missing review window")?
            .into();
        let attached = self
            .call(
                "Target.attachToTarget",
                json!({"targetId":self.target,"flatten":true}),
                false,
            )
            .await?;
        self.cdp.as_mut().unwrap().target_session = Some(
            attached["sessionId"]
                .as_str()
                .context("Cannot attach to review window")?
                .into(),
        );
        Ok(())
    }
    async fn configure(&mut self, url: &str, profile: Value) -> Result<Value> {
        // An interrupted configuration must never certify the preceding preview.
        self.info = Value::Null;
        let mobile = profile["mobile"] == true;
        let landscape = profile["orientation"] == "landscape";
        self.call("Emulation.setDeviceMetricsOverride", json!({"width":profile["width"],"height":profile["height"],"deviceScaleFactor":profile["dpr"],"mobile":mobile,"screenWidth":profile["width"],"screenHeight":profile["height"],"screenOrientation":{"type":if landscape {"landscapePrimary"}else{"portraitPrimary"},"angle":if landscape {90}else{0}}}), true).await?;
        self.call(
            "Emulation.setTouchEmulationEnabled",
            json!({"enabled":mobile,"maxTouchPoints":if mobile {5}else{1}}),
            true,
        )
        .await?;
        self.call(
            "Emulation.setEmitTouchEventsForMouse",
            json!({"enabled":mobile,"configuration":if mobile {"mobile"}else{"desktop"}}),
            true,
        )
        .await?;
        let chrome_version = self.version.split('/').next_back().unwrap_or("0");
        let ua = if mobile {
            format!(
                "Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{chrome_version} {}Safari/537.36",
                if profile["id"] == "tablet" {
                    ""
                } else {
                    "Mobile "
                }
            )
        } else {
            // Clearing the override restores native UA *and* client hints.
            String::new()
        };
        let mut override_ua = json!({"userAgent":ua,"platform":if mobile {"Linux armv8l"}else{""}});
        if mobile {
            override_ua["userAgentMetadata"] = json!({"brands":[{"brand":"Chromium","version":chrome_version.split('.').next().unwrap_or("0")}],"fullVersionList":[{"brand":"Chromium","version":chrome_version}],"platform":"Android","platformVersion":"13.0.0","architecture":"arm","model":"","mobile":profile["id"] != "tablet"});
        }
        self.call("Emulation.setUserAgentOverride", override_ua, true)
            .await?;
        let navigation = self.call("Page.navigate", json!({"url":url}), true).await?;
        ensure!(
            navigation.get("errorText").is_none(),
            "The route could not be opened"
        );
        self.call("Page.bringToFront", json!({}), true).await?;
        self.info = json!({"id":random_id(),"url":url,"profile":profile,"browserVersion":self.version,"openedAt":crate::store::now()});
        Ok(self.info.clone())
    }
    async fn evidence(&mut self, id: &str, url: &str, viewport: &str) -> Result<Value> {
        check(
            self.info["id"] == id && self.info["url"] == url,
            409,
            "Open this route in the device browser again before marking it reviewed",
        )?;
        check(
            (viewport == "mobile") == (self.info["profile"]["mobile"] == true),
            409,
            "The device browser is showing a different viewport",
        )?;
        let frame = self.call("Page.getFrameTree", json!({}), true).await?;
        let frame = &frame["frameTree"]["frame"];
        let actual_url = stripped_url(frame["url"].as_str().unwrap_or(""));
        check(
            actual_url.as_deref() == Some(url),
            409,
            "The device browser navigated elsewhere. Reopen the requested route, then review it",
        )?;
        let result = self.call("Runtime.evaluate", json!({"expression":"JSON.stringify({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,touchPoints:navigator.maxTouchPoints,coarsePointer:matchMedia('(pointer: coarse)').matches,orientation:screen.orientation.type,readyState:document.readyState})","returnByValue":true}), true).await?;
        let observed: Value = serde_json::from_str(
            result["result"]["value"]
                .as_str()
                .context("Cannot read viewport metrics")?,
        )?;
        check(
            observed["readyState"] == "complete",
            409,
            "The page is still loading. Review it after loading finishes",
        )?;
        let mut evidence = self.info.clone();
        evidence["observed"] = observed;
        evidence["checkedAt"] = crate::store::now().into();
        Ok(evidence)
    }
}

fn stripped_url(text: &str) -> Option<String> {
    let mut url = url::Url::parse(text).ok()?;
    url.set_query(None);
    url.set_fragment(None);
    Some(url.into())
}
fn random_id() -> String {
    format!("{:032x}", rand::random::<u128>())
}

#[derive(Default)]
pub struct DevicePreview {
    session: Mutex<Option<Session>>,
}
impl DevicePreview {
    pub async fn status(&self) -> Value {
        let mut guard = self.session.lock().await;
        if let Some(session) = guard.as_mut() {
            let alive = session.child.try_wait().is_ok_and(|value| value.is_none())
                && session
                    .call(
                        "Target.getTargetInfo",
                        json!({"targetId":session.target}),
                        false,
                    )
                    .await
                    .is_ok();
            if !alive {
                session.stop().await;
                *guard = None;
            }
        }
        let mut result = availability();
        result["session"] = guard
            .as_ref()
            .map(|session| session.info.clone())
            .unwrap_or(Value::Null);
        result
    }
    pub async fn open(
        &self,
        state: &Path,
        url: &str,
        id: &str,
        orientation: &str,
        stop: &CancellationToken,
    ) -> Result<Value> {
        let profile = settings(id, orientation)?;
        let mut guard = self.session.lock().await;
        check(!stop.is_cancelled(), 503, "Server is stopping")?;
        if guard.as_mut().is_some_and(|session| {
            !session
                .child
                .try_wait()
                .is_ok_and(|status| status.is_none())
        }) {
            guard.as_mut().unwrap().stop().await;
            *guard = None;
        }
        if guard.is_none() {
            let found = executable();
            check(
                found.is_some(),
                409,
                "Chrome, Edge or Chromium was not found. Install one or set NUDGETHIS_BROWSER_PATH, then restart NudgeThis. The embedded preview is still available",
            )?;
            let (executable, _) = found.unwrap();
            let directory = state.join(format!("browser-{}", random_id()));
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(false);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&directory)?;
            let mut command = CommandWrap::with_new(executable, |command| {
                command
                    .arg(format!("--user-data-dir={}", directory.display()))
                    .args([
                        "--remote-debugging-port=0",
                        "--remote-debugging-address=127.0.0.1",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--disable-sync",
                        "--disable-background-networking",
                        "--new-window",
                    ])
                    .arg("about:blank")
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());
                if std::env::var("NUDGETHIS_BROWSER_HEADLESS").as_deref() == Ok("1") {
                    command.arg("--headless=new");
                }
            });
            command.wrap(KillOnDrop);
            #[cfg(unix)]
            command.wrap(ProcessGroup::leader());
            #[cfg(windows)]
            command.wrap(JobObject);
            let child = match command.spawn() {
                Ok(child) => child,
                Err(error) => {
                    let _ = std::fs::remove_dir_all(&directory);
                    return Err(error.into());
                }
            };
            *guard = Some(Session {
                child,
                directory,
                cdp: None,
                target: String::new(),
                info: Value::Null,
                version: String::new(),
            });
        }
        let session = guard.as_mut().unwrap();
        let work = async {
            if session.cdp.is_none() {
                session.connect().await?;
            }
            session.configure(url, profile).await
        };
        let result = tokio::select! {
            result = tokio::time::timeout(Duration::from_secs(10), work) => result.context("Browser startup timed out").and_then(|value|value),
            _ = stop.cancelled() => Err(anyhow::anyhow!("Server is stopping")),
        };
        if let Err(error) = &result {
            eprintln!("Device preview: {error:#}");
            session.stop().await;
            *guard = None;
            check(
                false,
                409,
                "The device browser could not open this route. Check that your local app and a supported Chromium browser are running, then try again. On Linux, a graphical session is needed",
            )?;
        }
        result
    }
    pub async fn evidence(&self, id: &str, url: &str, viewport: &str) -> Result<Value> {
        let mut guard = self.session.lock().await;
        check(
            guard.is_some(),
            409,
            "The device browser is closed. Open this route again before marking it reviewed",
        )?;
        let result = guard.as_mut().unwrap().evidence(id, url, viewport).await;
        if result
            .as_ref()
            .is_err_and(|error| error.downcast_ref::<crate::error::Error>().is_none())
        {
            check(
                false,
                409,
                "The device browser is unavailable. Reopen the route and review it again",
            )?;
        }
        result
    }
    pub async fn close(&self) -> Result<()> {
        let mut guard = self.session.lock().await;
        let cleaned = if let Some(session) = guard.as_mut() {
            session.stop().await
        } else {
            true
        };
        *guard = None;
        check(
            cleaned,
            409,
            "Device browser cleanup was incomplete. Confirm the browser has stopped before removing its .devreview/browser-* directory; the server log identifies it",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profiles_rotate_and_desktop_restores_non_touch_metrics() {
        let phone = settings("phone", "landscape").unwrap();
        assert_eq!(phone["width"], 844);
        assert_eq!(phone["height"], 390);
        assert_eq!(phone["dpr"], 3);
        assert_eq!(phone["touch"], true);
        let desktop = settings("desktop", "portrait").unwrap();
        assert_eq!(desktop["width"], 1440);
        assert_eq!(desktop["mobile"], false);
        assert_eq!(desktop["touch"], false);
        assert_eq!(desktop["orientation"], "landscape");
        assert!(settings("iphone-safari", "portrait").is_err());
        assert!(settings("phone", "unknown").is_err());
        assert_eq!(
            stripped_url("http://localhost:3000/login?secret=x#private"),
            Some("http://localhost:3000/login".into())
        );
    }
}
