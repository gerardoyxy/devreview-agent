use crate::{
    core::{Core, validate_input},
    error::{ApiError, check},
    store::summary,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{Method, StatusCode, header},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use subtle::ConstantTimeEq;

#[derive(Clone)]
pub struct App {
    pub core: Arc<Core>,
    pub port: u16,
}
const ASSETS: &[(&str, &str, &[u8])] = &[
    (
        "/favicon.svg",
        "image/svg+xml",
        include_bytes!("../../../assets/brand/nudgethis-icon.svg"),
    ),
    (
        "/",
        "text/html",
        include_bytes!("../../../packages/server/public/index.html"),
    ),
    (
        "/app.js",
        "text/javascript",
        include_bytes!("../../../dist/browser/app.js"),
    ),
    (
        "/style.css",
        "text/css",
        include_bytes!("../../../packages/server/public/style.css"),
    ),
    (
        "/overlay.js",
        "text/javascript",
        include_bytes!("../../../dist/browser/overlay.js"),
    ),
    (
        "/review.js",
        "text/javascript",
        include_bytes!("../../../dist/browser/review.js"),
    ),
    (
        "/playground",
        "text/html",
        include_bytes!("../../../apps/playground/index.html"),
    ),
    (
        "/playground.js",
        "text/javascript",
        include_bytes!("../../../dist/browser/playground.js"),
    ),
];
pub async fn serve(core: Arc<Core>, listener: tokio::net::TcpListener) -> anyhow::Result<()> {
    let port = listener.local_addr()?.port();
    let app = App {
        core: core.clone(),
        port,
    };
    core.start();
    let shutdown = core.stop.clone();
    axum::serve(listener, Router::new().fallback(handler).with_state(app))
        .with_graceful_shutdown(async move { shutdown.cancelled().await })
        .await?;
    core.close().await;
    Ok(())
}
async fn handler(State(app): State<App>, req: Request) -> Response {
    let origin = req.headers().get(header::ORIGIN).cloned();
    let origin_allowed = origin
        .as_ref()
        .and_then(|o| o.to_str().ok())
        .is_some_and(|o| allowed_origin(&app, o));
    let mut response = match route(&app, req).await {
        Ok(r) => r,
        Err(e) => e.into_response(),
    };
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
    headers.insert("Referrer-Policy", "no-referrer".parse().unwrap());
    let frame_origins = app.core.config.server.allowed_origins.join(" ");
    headers.insert("Content-Security-Policy",format!("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' blob:; connect-src 'self'; img-src 'self' data:; frame-src 'self' {frame_origins}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'").parse().unwrap());
    if origin_allowed {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin.unwrap());
        headers.insert(header::VARY, "Origin".parse().unwrap());
    }
    response
}
fn allowed_origin(app: &App, origin: &str) -> bool {
    app.core
        .config
        .server
        .allowed_origins
        .iter()
        .any(|o| o == origin)
        || origin == format!("http://127.0.0.1:{}", app.port)
        || origin == format!("http://localhost:{}", app.port)
}
async fn body(req: Request, limit: usize) -> Result<Value, ApiError> {
    check(
        req.headers()
            .get(header::CONTENT_TYPE)
            .and_then(|s| s.to_str().ok())
            .is_some_and(|s| s.split(';').next() == Some("application/json")),
        415,
        "Use application/json",
    )?;
    let bytes = to_bytes(req.into_body(), limit).await;
    check(bytes.is_ok(), 413, "Request payload exceeds size limit")?;
    let data = serde_json::from_slice(&bytes.unwrap());
    check(data.is_ok(), 400, "Invalid JSON")?;
    Ok(data?)
}
fn json(value: Value) -> Response {
    Json(value).into_response()
}
async fn route(app: &App, req: Request) -> Result<Response, ApiError> {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");
    check(
        host == format!("127.0.0.1:{}", app.port) || host == format!("localhost:{}", app.port),
        403,
        "Unrecognized Host",
    )?;
    if let Some(origin) = req.headers().get(header::ORIGIN) {
        check(
            origin.to_str().is_ok_and(|o| allowed_origin(app, o)),
            403,
            "Origin is not allowed",
        )?;
    }
    let method = req.method().clone();
    let path = req.uri().path().to_owned();
    if method == Method::OPTIONS {
        return Ok((
            StatusCode::NO_CONTENT,
            [
                (
                    header::ACCESS_CONTROL_ALLOW_METHODS,
                    "GET, POST, DELETE, OPTIONS",
                ),
                (
                    header::ACCESS_CONTROL_ALLOW_HEADERS,
                    "Authorization, Content-Type",
                ),
            ],
        )
            .into_response());
    }
    if method == Method::GET
        && let Some((_, mime, bytes)) = ASSETS.iter().find(|(p, _, _)| *p == path)
    {
        return Ok(Response::builder()
            .header(header::CONTENT_TYPE, format!("{mime}; charset=utf-8"))
            .body(Body::from(*bytes))
            .unwrap());
    }
    let provided = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .unwrap_or("");
    check(
        bool::from(provided.as_bytes().ct_eq(app.core.token.as_bytes())),
        401,
        "Local token required",
    )?;
    let core = &app.core;
    if path == "/api/device-preview" && method == Method::GET {
        return Ok(json(core.device_preview.status().await));
    }
    if path == "/api/device-preview" && method == Method::POST {
        let data = body(req, 4096).await?;
        if data["action"] == "close" {
            core.device_preview.close().await?;
            return Ok(json(core.device_preview.status().await));
        }
        check(
            data["action"] == "open",
            400,
            "Unknown device preview action",
        )?;
        let origin = crate::route_review::origin(data["origin"].as_str().unwrap_or(""))?;
        check(
            allowed_origin(app, &origin),
            403,
            "Add the project's exact origin to server.allowedOrigins and restart",
        )?;
        let route = data["path"].as_str().unwrap_or("");
        check(
            crate::route_review::concrete_path(route),
            400,
            "Choose a concrete route without a query or fragment",
        )?;
        let url = url::Url::parse(&format!("{origin}{route}"))?;
        check(
            url.origin().ascii_serialization() == origin,
            400,
            "Route must belong to the selected origin",
        )?;
        let session = core
            .device_preview
            .open(
                &core.repository.root.join(".nudgethis"),
                url.as_str(),
                data["profile"].as_str().unwrap_or(""),
                data["orientation"].as_str().unwrap_or(""),
                &core.stop,
            )
            .await?;
        let mut result = crate::device_preview::availability();
        result["session"] = session;
        return Ok(json(result));
    }
    if path == "/api/route-review" && method == Method::GET {
        return Ok(json(core.store.route_review()?));
    }
    if path == "/api/route-review" && method == Method::POST {
        let data = body(req, 32768).await?;
        let revision = data["revision"].as_u64();
        check(revision.is_some(), 400, "Include the route review revision")?;
        let value = if data["action"] == "scan" {
            let origin = crate::route_review::origin(data["origin"].as_str().unwrap_or(""))?;
            check(
                allowed_origin(app, &origin),
                403,
                "Add the project's exact origin to server.allowedOrigins in nudgethis.toml and restart",
            )?;
            crate::route_review::scan(&core.repository, &data).await?
        } else {
            let report = core.store.route_review()?;
            check(
                report["revision"] == revision.unwrap(),
                409,
                "Route review changed in another window. Reopen it before saving",
            )?;
            if data["action"] == "review"
                && data["status"] == "reviewed"
                && data["method"] == "device"
            {
                let route = report["routes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|route| route["id"] == data["id"]);
                check(
                    route.is_some_and(|route| route["needsUrl"] == false),
                    409,
                    "Resolve this route before reviewing it",
                )?;
                let url = url::Url::parse(&format!(
                    "{}{}",
                    report["origin"].as_str().unwrap_or(""),
                    route.unwrap()["path"].as_str().unwrap_or("")
                ))?;
                let evidence = core
                    .device_preview
                    .evidence(
                        data["sessionId"].as_str().unwrap_or(""),
                        url.as_str(),
                        data["viewport"].as_str().unwrap_or(""),
                    )
                    .await?;
                crate::route_review::change_with_device(&report, &data, Some(evidence))?
            } else {
                check(
                    data["method"].is_null()
                        || matches!(data["method"].as_str(), Some("embedded" | "device")),
                    400,
                    "Unknown review method",
                )?;
                crate::route_review::change(&report, &data)?
            }
        };
        return Ok(json(
            core.store.save_route_review(value, revision.unwrap())?,
        ));
    }
    if path == "/api/diagnostics" && method == Method::GET {
        return Ok(json(crate::project::doctor(
            &core.repository.root,
            &core.config,
        )?));
    }
    if path == "/api/events" && method == Method::GET {
        let mut rx = core.store.events.subscribe();
        let stop = core.stop.clone();
        let stream = async_stream::stream! {
            yield Ok::<Event,std::convert::Infallible>(Event::default().event("connected").data("{}"));
            loop { tokio::select! {
                _=stop.cancelled()=>break,
                event=rx.recv()=>match event {
                    Ok((kind,value))=>yield Ok(Event::default().event(kind).data(value.to_string())),
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_))=>break, // reconnect and refetch
                    Err(_)=>break,
                }
            } }
        };
        return Ok(Sse::new(stream)
            .keep_alive(
                KeepAlive::new()
                    .interval(Duration::from_secs(15))
                    .text("heartbeat"),
            )
            .into_response());
    }
    if path == "/api/status" && method == Method::GET {
        let agents:Vec<_>=core.config.agents.iter().map(|a|json!({"id":a.id,"label":if a.label.is_empty(){&a.id}else{&a.label},"transport":a.transport,"capabilities":{"automatic":true,"streaming":true,"resume":false,"images":false}})).collect();
        return Ok(json(
            json!({"repository":core.repository.inspect().await?,"agent":core.config.default_agent,"agents":agents,"executionEnabled":core.config.execution_enabled(),"setupCommands":core.config.setup.commands,"validationCommands":core.config.validation.commands,"workers":core.config.workers.max_concurrent,"playgroundUrl":null,"runtime":"rust"}),
        ));
    }
    if path == "/api/shutdown" && method == Method::POST {
        let _ = body(req, 32768).await?;
        core.stop.cancel();
        return Ok(json(json!({"stopping":true})));
    }
    if path == "/api/project-context" {
        if method == Method::GET {
            return Ok(json(core.store.project_context()?));
        }
        if method == Method::POST {
            let value = body(req, 262_144).await?;
            return Ok(json(core.store.save_project_context(&value)?));
        }
    }
    if path == "/api/my-style" {
        if method == Method::GET {
            return Ok(json(core.store.my_style()?));
        }
        if method == Method::POST {
            return Ok(json(core.store.save_my_style(&body(req, 65_536).await?)?));
        }
    }
    if path == "/api/selection-controls" {
        if method == Method::GET {
            return Ok(json(core.store.selection_controls()?));
        }
        if method == Method::POST {
            return Ok(json(
                core.store.save_selection_controls(body(req, 4096).await?)?,
            ));
        }
    }
    if path == "/api/appearance" {
        if method == Method::GET {
            return Ok(json(core.store.preference()?));
        }
        if method == Method::POST {
            let value = body(req, 2_097_152).await?;
            crate::appearance::validate(&value)?;
            core.store.save_preference(&value)?;
            return Ok(json(value));
        }
    }
    if path == "/api/tasks" {
        if method == Method::GET {
            return Ok(json(core.store.list()?.into_iter().map(summary).collect()));
        }
        if method == Method::POST {
            return Ok((
                StatusCode::ACCEPTED,
                Json(
                    core.submit(validate_input(body(req, 32768).await?)?)
                        .await?,
                ),
            )
                .into_response());
        }
    }
    let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
    if parts.len() >= 3 && parts[0] == "api" && parts[1] == "tasks" {
        let id = parts[2];
        crate::store::task_number(id)?;
        if parts.len() == 3 {
            if method == Method::GET {
                return Ok(json(core.store.details(id)?));
            }
            if method == Method::DELETE {
                return Ok(json(core.action(id, "delete", None).await?));
            }
        }
        if parts.len() == 5 && parts[3] == "revisions" && method == Method::GET {
            let attempt = parts[4].parse::<u64>();
            check(attempt.is_ok(), 400, "Invalid revision")?;
            return Ok(json(core.store.revision(id, attempt?)?));
        }
        if parts.len() == 4 && method == Method::POST {
            let data = body(req, 32768).await?;
            check(
                data.get("attempt")
                    .is_none_or(|a| a.as_u64().is_some_and(|n| n > 0)),
                400,
                "Invalid attempt",
            )?;
            let attempt = data["attempt"].as_u64();
            if parts[3] == "draft" {
                return Ok(json(core.edit_draft(id, data, attempt).await?));
            }
            if parts[3] == "messages" {
                return Ok((
                    StatusCode::ACCEPTED,
                    Json(
                        core.message(
                            id,
                            data["content"].as_str().unwrap_or(""),
                            attempt,
                            data.get("contextIds"),
                        )
                        .await?,
                    ),
                )
                    .into_response());
            }
            return Ok(json(core.action(id, parts[3], attempt).await?));
        }
    }
    check(false, 404, "Not found")?;
    unreachable!()
}
