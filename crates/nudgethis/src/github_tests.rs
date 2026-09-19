//! GitHub API fixtures and real local bare-repository transfers. No agents or models.
use super::*;
use crate::{
    application_tests::{Temp, repo},
    config::Config,
};
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
};

const TOKEN: &str = "fixture-token-for-github-application-tests";
struct Remote {
    path: PathBuf,
    private: bool,
    review_required: bool,
    failing: bool,
    proposal: bool,
    merged: bool,
    creates: usize,
    merges: usize,
    proposals: usize,
}
fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(["-c", "core.hooksPath=/dev/null"])
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().into()
}
fn sha(r: &Remote, branch: &str) -> String {
    let output = Command::new("git")
        .args([
            "--git-dir",
            r.path.to_str().unwrap(),
            "rev-parse",
            "--verify",
            &format!("refs/heads/{branch}"),
        ])
        .output()
        .unwrap();
    if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().into()
    } else {
        String::new()
    }
}
fn proposal(r: &Remote) -> Value {
    json!({"number":1,"title":"Improve readability","state":if r.merged{"closed"}else{"open"},"merged":r.merged,"draft":false,"mergeable":true,"mergeable_state":"clean","head":{"sha":sha(r,"feature"),"ref":"feature","repo":{"id":41}},"base":{"sha":sha(r,"main"),"ref":"main","repo":{"id":41}}})
}
async fn handler(State(state): State<Arc<Mutex<Remote>>>, request: Request) -> Response {
    if request
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        != Some(&format!("Bearer {TOKEN}"))
    {
        return (StatusCode::UNAUTHORIZED, Json(json!({}))).into_response();
    }
    let method = request.method().as_str().to_owned();
    let path = request.uri().path().to_owned();
    let bytes = to_bytes(request.into_body(), 16384).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    let mut r = state.lock().unwrap();
    let (status, value) = if path == "/user" {
        (200, json!({"login":"fixture"}))
    } else if path == "/user/repos" {
        r.creates += 1;
        (201, json!({"full_name":"fixture/project"}))
    } else if path == "/repos/fixture/project" {
        (
            200,
            json!({"id":41,"full_name":"fixture/project","private":r.private,"default_branch":"main","permissions":{"push":true},"allow_merge_commit":true,"allow_squash_merge":true,"allow_rebase_merge":false}),
        )
    } else if let Some(branch) = path.strip_prefix("/repos/fixture/project/git/ref/heads/") {
        let head = sha(&r, branch);
        if head.is_empty() {
            (404, json!({}))
        } else {
            (200, json!({"object":{"sha":head}}))
        }
    } else if path == "/repos/fixture/project/pulls" {
        if method == "POST" {
            r.proposal = true;
            r.proposals += 1;
            (201, proposal(&r))
        } else {
            (
                200,
                if r.proposal {
                    json!([proposal(&r)])
                } else {
                    json!([])
                },
            )
        }
    } else if path == "/repos/fixture/project/pulls/1" {
        (200, proposal(&r))
    } else if path.ends_with("/check-runs") {
        (
            200,
            json!({"total_count":1,"check_runs":[{"name":"Application checks","status":"completed","conclusion":if r.failing{"failure"}else{"success"}}]}),
        )
    } else if path.ends_with("/status") {
        (200, json!({"state":"success","total_count":0}))
    } else if path == "/graphql" {
        (
            200,
            json!({"data":{"repository":{"pullRequest":{"reviewDecision":if r.review_required{"REVIEW_REQUIRED"}else{"APPROVED"},"headRefOid":sha(&r,"feature"),"baseRefOid":sha(&r,"main")}}}}),
        )
    } else if path == "/repos/fixture/project/pulls/1/merge" {
        if r.review_required || r.failing || body["sha"] != sha(&r, "feature") {
            (405, json!({"merged":false}))
        } else {
            r.merges += 1;
            let head = sha(&r, "feature");
            let old = sha(&r, "main");
            git(
                r.path.parent().unwrap(),
                &[
                    "--git-dir",
                    r.path.to_str().unwrap(),
                    "update-ref",
                    "refs/heads/main",
                    &head,
                    &old,
                ],
            );
            r.merged = true;
            (200, json!({"merged":true,"sha":head}))
        }
    } else {
        (404, json!({}))
    };
    (StatusCode::from_u16(status).unwrap(), Json(value)).into_response()
}
struct Fixture {
    core: Arc<Core>,
    remote: Arc<Mutex<Remote>>,
    server: tokio::task::JoinHandle<()>,
    _dir: Temp,
    _remote_dir: Temp,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
async fn fixture() -> Fixture {
    let (dir, repository) = repo().await;
    let remote_dir = Temp::new();
    let remote_path = remote_dir.0.join("remote.git");
    git(
        &dir.0,
        &[
            "clone",
            "--bare",
            dir.0.to_str().unwrap(),
            remote_path.to_str().unwrap(),
        ],
    );
    git(&dir.0, &["config", "commit.gpgSign", "false"]);
    git(&dir.0, &["config", "user.name", "GitHub Application Test"]);
    git(&dir.0, &["config", "user.email", "test@example.invalid"]);
    git(&dir.0, &["checkout", "-b", "feature"]);
    dir.write("example.txt", "Reviewed version\n");
    git(&dir.0, &["add", "--", "example.txt"]);
    git(&dir.0, &["commit", "-m", "Improve readability"]);
    let mut config = Config::default();
    config.execution.enabled = false;
    let core = Core::open(&repository.root, config).await.unwrap();
    let state = Arc::new(Mutex::new(Remote {
        path: remote_path.clone(),
        private: true,
        review_required: false,
        failing: false,
        proposal: false,
        merged: false,
        creates: 0,
        merges: 0,
        proposals: 0,
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let router = Router::new().fallback(handler).with_state(state.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    {
        let mut hub = core.github.lock().await;
        hub.transport = Transport::Http(format!("http://{address}"));
        hub.git_url = Some(remote_path.to_str().unwrap().into());
    }
    Fixture {
        core,
        remote: state,
        server,
        _dir: dir,
        _remote_dir: remote_dir,
    }
}
async fn connect(f: &Fixture) {
    f.core
        .github_action(
            json!({"action":"connect","method":"token","username":"fixture","token":TOKEN}),
        )
        .await
        .unwrap();
    f.core
        .github_action(json!({"action":"target","repository":"fixture/project"}))
        .await
        .unwrap();
}
async fn propose(f: &Fixture) {
    let w = f.core.workspace().await.unwrap();
    f.core.github_action(json!({"action":"propose","account":"fixture","targetId":41,"private":true,"base":"main","branch":"feature","head":w["head"],"title":"Improve readability","body":"Review the saved correction."})).await.unwrap();
}

#[tokio::test]
async fn reviewed_publication_and_merge_preserve_local_edits_and_enforce_reviews() {
    let f = fixture().await;
    connect(&f).await;
    let initial = sha(&f.remote.lock().unwrap(), "main");
    let preview = f
        .core
        .github_action(json!({"action":"preview"}))
        .await
        .unwrap();
    assert_eq!(preview["commits"].as_array().unwrap().len(), 1);
    assert_eq!(preview["target"]["private"], true);
    assert!(
        preview["diff"]
            .as_str()
            .unwrap()
            .contains("Reviewed version")
    );
    f._dir.write("example.txt", "Newer unsaved work\n");
    let published = f
        .core
        .github_action(json!({"action":"publish","previewId":preview["id"]}))
        .await
        .unwrap();
    assert_eq!(published["head"], preview["head"]);
    assert_eq!(sha(&f.remote.lock().unwrap(), "main"), initial);
    assert_eq!(sha(&f.remote.lock().unwrap(), "feature"), preview["head"]);
    assert_eq!(
        f.core
            .github_action(json!({"action":"publish","previewId":preview["id"]}))
            .await
            .unwrap(),
        published
    );
    propose(&f).await;
    propose(&f).await;
    assert_eq!(f.remote.lock().unwrap().proposals, 1);
    f.remote.lock().unwrap().review_required = true;
    let merge = f
        .core
        .github_action(json!({"action":"merge-preview","number":1}))
        .await
        .unwrap();
    assert_eq!(merge["canMerge"], false);
    assert!(
        f.core
            .github_action(
                json!({"action":"merge","number":1,"previewId":merge["id"],"method":"merge"})
            )
            .await
            .is_err()
    );
    assert_eq!(f.remote.lock().unwrap().merges, 0);
    {
        let mut r = f.remote.lock().unwrap();
        r.review_required = false;
        r.failing = true;
    }
    assert_eq!(
        f.core
            .github_action(json!({"action":"merge-preview","number":1}))
            .await
            .unwrap()["canMerge"],
        false
    );
    f.remote.lock().unwrap().failing = false;
    let merge = f
        .core
        .github_action(json!({"action":"merge-preview","number":1}))
        .await
        .unwrap();
    assert_eq!(merge["canMerge"], true);
    assert!(
        f.core
            .github_action(
                json!({"action":"merge","number":1,"previewId":merge["id"],"method":"rebase"})
            )
            .await
            .is_err()
    );
    let result = f
        .core
        .github_action(
            json!({"action":"merge","number":1,"previewId":merge["id"],"method":"merge"}),
        )
        .await
        .unwrap();
    assert_eq!(result["merged"], true);
    assert_eq!(sha(&f.remote.lock().unwrap(), "main"), preview["head"]);
    assert_eq!(git(&f._dir.0, &["rev-parse", "main"]), initial);
    assert_eq!(
        std::fs::read_to_string(f._dir.0.join("example.txt")).unwrap(),
        "Newer unsaved work\n"
    );
    assert_eq!(
        f.core
            .github_action(json!({"action":"refresh"}))
            .await
            .unwrap()["proposal"]["merged"],
        true
    );
}

#[tokio::test]
async fn account_destination_visibility_and_head_cannot_change_after_publish_review() {
    let f = fixture().await;
    assert!(f.core.github_action(json!({"action":"connect","method":"token","username":"another-account","token":TOKEN})).await.is_err());
    assert!(f.core.github.lock().await.session.is_none());
    connect(&f).await;
    assert!(
        f.core
            .github_action(json!({"action":"target","repository":"https://evil.invalid/project"}))
            .await
            .is_err()
    );
    let preview = f
        .core
        .github_action(json!({"action":"preview"}))
        .await
        .unwrap();
    f.remote.lock().unwrap().private = false;
    assert!(
        f.core
            .github_action(json!({"action":"publish","previewId":preview["id"]}))
            .await
            .is_err()
    );
    f.remote.lock().unwrap().private = true;
    f._dir.write("example.txt", "Another saved version\n");
    git(&f._dir.0, &["add", "--", "example.txt"]);
    git(&f._dir.0, &["commit", "-m", "Another version"]);
    assert!(
        f.core
            .github_action(json!({"action":"publish","previewId":preview["id"]}))
            .await
            .is_err()
    );
    assert!(sha(&f.remote.lock().unwrap(), "feature").is_empty());
    let status = f.core.github_status().await.unwrap().to_string();
    assert!(!status.contains(TOKEN));
    {
        let db = f.core.store.db.lock().unwrap();
        let mut query = db
            .prepare("SELECT data FROM preferences WHERE key LIKE 'github-%'")
            .unwrap();
        for row in query.query_map([], |r| r.get::<_, String>(0)).unwrap() {
            assert!(!row.unwrap().contains(TOKEN));
        }
    }
    assert!(
        !std::fs::read_to_string(f._dir.0.join(".git/config"))
            .unwrap()
            .contains(TOKEN)
    );
    f.core
        .github_action(json!({"action":"disconnect"}))
        .await
        .unwrap();
    assert!(f.core.github.lock().await.session.is_none());
}

#[tokio::test]
async fn repository_creation_requires_explicit_account_and_visibility() {
    let f = fixture().await;
    connect(&f).await;
    for payload in [
        json!({"action":"create","name":"project","private":true,"account":"fixture"}),
        json!({"action":"create","confirm":true,"name":"project","private":true,"account":"another-account"}),
        json!({"action":"create","confirm":true,"name":"../escape","private":true,"account":"fixture"}),
    ] {
        assert!(f.core.github_action(payload).await.is_err());
    }
    assert_eq!(f.remote.lock().unwrap().creates, 0);
    let target=f.core.github_action(json!({"action":"create","confirm":true,"name":"project","private":true,"account":"fixture"})).await.unwrap();
    assert_eq!(target["fullName"], "fixture/project");
    assert_eq!(f.remote.lock().unwrap().creates, 1);
    assert!(
        sha(&f.remote.lock().unwrap(), "feature").is_empty(),
        "Creating a destination never uploads local commits"
    );
}

#[test]
fn cli_headers_are_parsed_without_exposing_raw_responses() {
    assert_eq!(
        cli_response(
            "HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{\"login\":\"fixture\"}\n"
        )
        .unwrap(),
        (200, json!({"login":"fixture"}))
    );
    assert_eq!(
        cli_response("HTTP/2.0 204 No Content\n\n").unwrap(),
        (204, Value::Null)
    );
    assert_eq!(
        cli_response(
            "HTTP/1.1 403 Forbidden\nContent-Type: application/json\n\n{\"message\":\"denied\"}"
        )
        .unwrap()
        .0,
        403
    );
    for output in [
        "no response",
        "HTTP/2.0 200 OK\n\n{unfinished",
        "unexpected 200\n\n{}",
    ] {
        assert!(cli_response(output).is_err());
    }
    assert_eq!(segment("feature/checkout"), "feature%2Fcheckout");
}

#[tokio::test]
async fn rewritten_destinations_and_changed_remote_history_block_publication() {
    let f = fixture().await;
    connect(&f).await;
    git(
        &f._dir.0,
        &[
            "config",
            "url.https://example.invalid/.insteadOf",
            "https://github.com/",
        ],
    );
    let error = f
        .core
        .github_action(json!({"action":"preview"}))
        .await
        .unwrap_err();
    assert!(error.to_string().contains("rewrites remote URLs"));
    git(
        &f._dir.0,
        &[
            "config",
            "--unset",
            "url.https://example.invalid/.insteadOf",
        ],
    );
    let plan = f
        .core
        .github_action(json!({"action":"preview"}))
        .await
        .unwrap();
    let base = sha(&f.remote.lock().unwrap(), "main");
    let remote = f.remote.lock().unwrap().path.clone();
    git(
        &f._dir.0,
        &[
            "--git-dir",
            remote.to_str().unwrap(),
            "update-ref",
            "refs/heads/feature",
            &base,
        ],
    );
    let error = f
        .core
        .github_action(json!({"action":"publish","previewId":plan["id"]}))
        .await
        .unwrap_err();
    assert!(error.to_string().contains("remote branch changed"));
    assert_eq!(sha(&f.remote.lock().unwrap(), "feature"), base);
    let tree = git(
        &f._dir.0,
        &[
            "--git-dir",
            remote.to_str().unwrap(),
            "rev-parse",
            "main^{tree}",
        ],
    );
    let other = git(
        &f._dir.0,
        &[
            "--git-dir",
            remote.to_str().unwrap(),
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit-tree",
            &tree,
            "-p",
            &base,
            "-m",
            "Remote-only work",
        ],
    );
    git(
        &f._dir.0,
        &[
            "--git-dir",
            remote.to_str().unwrap(),
            "update-ref",
            "refs/heads/feature",
            &other,
        ],
    );
    let error = f
        .core
        .github_action(json!({"action":"preview"}))
        .await
        .unwrap_err();
    assert!(error.to_string().contains("missing locally"));
    assert_eq!(sha(&f.remote.lock().unwrap(), "feature"), other);
    assert!(git(&f._dir.0, &["for-each-ref", "refs/nudgethis/publishing/"]).is_empty());
}
