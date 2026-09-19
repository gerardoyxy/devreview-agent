//! Explicit GitHub publishing. Credentials are session-only; remote mutations require reviewed plans.
use crate::{
    core::Core,
    error::{Error, check},
    process, project,
    store::{Store, now},
    workspace::{self, text},
};
use anyhow::Result;
use base64::{Engine, engine::general_purpose::STANDARD};
use rusqlite::OptionalExtension;
use serde_json::{Value, json};
use std::{collections::HashMap, time::Instant};
use tokio_util::sync::CancellationToken;

const CLEAR_AUTH: &[&str] = &[
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "GH_ENTERPRISE_TOKEN",
    "GITHUB_ENTERPRISE_TOKEN",
    "GH_DEBUG",
    "DEBUG",
];
#[derive(Clone, Default)]
enum Transport {
    #[default]
    Cli,
    #[cfg(test)]
    Http(String),
}
#[derive(Clone)]
struct Session {
    token: String,
    login: String,
    transport: Transport,
    #[cfg(test)]
    git_url: Option<String>,
}
struct Review {
    created: Instant,
    data: Value,
}
#[derive(Default)]
pub struct Hub {
    session: Option<Session>,
    reviews: HashMap<String, Review>,
    #[cfg(test)]
    transport: Transport,
    #[cfg(test)]
    git_url: Option<String>,
}
fn conflict(message: &str) -> anyhow::Error {
    Error {
        status: 409,
        message: message.into(),
    }
    .into()
}
fn cli_response(stdout: &str) -> Result<(u16, Value)> {
    let output = stdout.replace("\r\n", "\n");
    let (headers, body) = output.split_once("\n\n").ok_or_else(|| {
        conflict("GitHub did not return a response. Check your connection and account permissions")
    })?;
    let mut first = headers.lines().next().unwrap_or("").split_whitespace();
    check(
        first.next().is_some_and(|s| s.starts_with("HTTP/")),
        409,
        "Invalid GitHub response",
    )?;
    let status = first
        .next()
        .and_then(|s| s.parse::<u16>().ok())
        .filter(|s| (200..600).contains(s))
        .ok_or_else(|| conflict("Invalid GitHub response"))?;
    let value = if body.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(body).map_err(|_| {
            conflict("GitHub returned an incomplete response. Refresh before retrying")
        })?
    };
    Ok((status, value))
}
fn name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        && !matches!(value, "." | "..")
}
fn full_name(value: &str) -> bool {
    let p: Vec<_> = value.split('/').collect();
    p.len() == 2 && p.iter().all(|v| name(v))
}
fn segment(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}
fn target_summary(value: &Value) -> Result<Value> {
    check(
        full_name(text(value, "full_name")) && value["id"].as_u64().is_some(),
        409,
        "GitHub returned an invalid repository",
    )?;
    check(
        value["permissions"]["push"] == true
            && value["archived"] != true
            && value["disabled"] != true,
        403,
        "This account cannot publish to that repository. Choose another account or repository",
    )?;
    Ok(
        json!({"id":value["id"],"fullName":value["full_name"],"private":value["private"],"defaultBranch":value["default_branch"],"url":format!("https://github.com/{}",text(value,"full_name")),"allowMerge":value["allow_merge_commit"],"allowSquash":value["allow_squash_merge"],"allowRebase":value["allow_rebase_merge"]}),
    )
}
impl Store {
    fn github_value(&self, key: &str) -> Result<Value> {
        let data: Option<String> = self
            .db
            .lock()
            .unwrap()
            .query_row(
                "SELECT data FROM preferences WHERE key=?",
                [format!("github-{key}")],
                |r| r.get(0),
            )
            .optional()?;
        Ok(data
            .map(|s| serde_json::from_str(&s))
            .transpose()?
            .unwrap_or(Value::Null))
    }
    fn github_save(&self, key: &str, value: Value) -> Result<()> {
        self.db.lock().unwrap().execute("INSERT INTO preferences(key,data) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",rusqlite::params![format!("github-{key}"),value.to_string()])?;
        self.emit("github", json!({"changed":true}));
        Ok(())
    }
}
impl Session {
    async fn request(
        &self,
        core: &Core,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<(u16, Value)> {
        match &self.transport {
            Transport::Cli => {
                let mut args = vec![
                    "api".to_owned(),
                    "--hostname".into(),
                    "github.com".into(),
                    "--include".into(),
                    "--method".into(),
                    method.into(),
                    "--header".into(),
                    "Accept: application/vnd.github+json".into(),
                    "--header".into(),
                    "X-GitHub-Api-Version: 2022-11-28".into(),
                    path.into(),
                ];
                let input = body.map(|v| v.to_string()).unwrap_or_default();
                if !input.is_empty() {
                    args.extend(["--input".into(), "-".into()]);
                }
                let result=process::run_scoped("gh",&args,&core.repository.root,input.as_bytes(),30000,&CancellationToken::new(),&[("GH_TOKEN",&self.token),("GH_PROMPT_DISABLED","1"),("GH_PAGER","")],CLEAR_AUTH).await.map_err(|_|conflict("GitHub could not be reached. Check the connection and GitHub CLI, then refresh"))?;
                cli_response(&result.stdout)
            }
            #[cfg(test)]
            Transport::Http(base) => {
                let client = reqwest::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .build()?;
                let mut request = client
                    .request(method.parse()?, format!("{base}{path}"))
                    .bearer_auth(&self.token);
                if let Some(body) = body {
                    request = request.json(&body);
                }
                let response = request.send().await?;
                let status = response.status().as_u16();
                Ok((status, response.json().await?))
            }
        }
    }
    async fn api(
        &self,
        core: &Core,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value> {
        let (status, value) = self.request(core, method, path, body).await?;
        check(
            (200..300).contains(&status),
            if status == 401 || status == 403 {
                403
            } else {
                409
            },
            match status {
                401 => "The GitHub session expired. Connect your account again",
                403 => {
                    "GitHub refused this operation. Check repository access, token permissions, required reviews and rate limits"
                }
                404 => {
                    "GitHub could not find this repository or proposal with the selected account"
                }
                405 => {
                    "GitHub is not ready to merge. Complete its required checks, reviews or merge queue in GitHub"
                }
                409 => "GitHub changed since your review. Refresh before continuing",
                422 => {
                    "GitHub could not accept this request. Check for an existing repository or proposal and refresh"
                }
                _ => "GitHub could not complete the request. Refresh its status before retrying",
            },
        )?;
        Ok(value)
    }
    async fn repository(&self, core: &Core) -> Result<Value> {
        let target = core.store.github_value("target")?;
        check(
            full_name(text(&target, "fullName")),
            409,
            "Choose a GitHub repository first",
        )?;
        let latest = self
            .api(
                core,
                "GET",
                &format!("/repos/{}", text(&target, "fullName")),
                None,
            )
            .await?;
        let latest = target_summary(&latest)?;
        check(
            latest["id"] == target["id"] && latest["fullName"] == target["fullName"],
            409,
            "The GitHub repository was renamed or replaced. Connect it again before publishing",
        )?;
        Ok(latest)
    }
    async fn remote_head(&self, core: &Core, target: &Value, branch: &str) -> Result<String> {
        let (status, value) = self
            .request(
                core,
                "GET",
                &format!(
                    "/repos/{}/git/ref/heads/{}",
                    text(target, "fullName"),
                    segment(branch)
                ),
                None,
            )
            .await?;
        if status == 404 || status == 409 {
            return Ok(String::new());
        }
        check(
            status == 200,
            409,
            "Cannot read the GitHub branch. Check permissions and refresh",
        )?;
        let sha = text(&value["object"], "sha");
        check(
            sha.len() == 40 && sha.bytes().all(|b| b.is_ascii_hexdigit()),
            409,
            "GitHub returned an invalid branch version",
        )?;
        Ok(sha.into())
    }
    async fn transfer(&self, core: &Core, target: &Value, args: &[&str]) -> Result<String> {
        let rewrite = workspace::raw(
            &core.repository,
            &[
                "config",
                "--get-regexp",
                r"^url\..*\.(insteadof|pushinsteadof)$",
            ],
        )
        .await?;
        check(
            rewrite.stdout.trim().is_empty(),
            409,
            "This Git configuration rewrites remote URLs. Publish through your Git client to verify the destination",
        )?;
        let auth = format!(
            "Authorization: Basic {}",
            STANDARD.encode(format!("x-access-token:{}", self.token))
        );
        let url = format!("https://github.com/{}.git", text(target, "fullName"));
        let auth_key = format!("http.{url}.extraHeader");
        #[cfg(test)]
        let url = self.git_url.clone().unwrap_or(url);
        let mut argv = vec![
            "-c".into(),
            "core.hooksPath=/dev/null".into(),
            "-c".into(),
            "credential.helper=".into(),
            "-c".into(),
            "http.followRedirects=false".into(),
            "-c".into(),
            "http.sslVerify=true".into(),
        ];
        for arg in args {
            argv.push(if *arg == "<url>" {
                url.clone()
            } else {
                (*arg).into()
            });
        }
        let result = process::run_scoped(
            "git",
            &argv,
            &core.repository.root,
            b"",
            120000,
            &CancellationToken::new(),
            &[
                ("GIT_TERMINAL_PROMPT", "0"),
                ("GCM_INTERACTIVE", "never"),
                ("GIT_CONFIG_COUNT", "3"),
                ("GIT_CONFIG_KEY_0", "http.extraHeader"),
                ("GIT_CONFIG_VALUE_0", ""),
                ("GIT_CONFIG_KEY_1", &auth_key),
                ("GIT_CONFIG_VALUE_1", ""),
                ("GIT_CONFIG_KEY_2", &auth_key),
                ("GIT_CONFIG_VALUE_2", &auth),
            ],
            &[
                "GIT_CONFIG_PARAMETERS",
                "GIT_CONFIG_COUNT",
                "GIT_ASKPASS",
                "SSH_ASKPASS",
                "GIT_TRACE",
                "GIT_TRACE_CURL",
                "GIT_TRACE_PACKET",
                "GIT_CURL_VERBOSE",
                "GIT_TRACE2",
                "GIT_TRACE2_EVENT",
                "GIT_TRACE2_PERF",
                "GH_TOKEN",
                "GITHUB_TOKEN",
                "GH_DEBUG",
            ],
        )
        .await
        .map_err(|_| {
            conflict("GitHub transfer was interrupted. Refresh the remote status before retrying")
        })?;
        check(
            result.code == 0,
            409,
            "GitHub refused the transfer. Check permissions, branch rules or newer remote changes, then refresh. No force push was attempted",
        )?;
        Ok(result.stdout)
    }
    async fn fetch_branch(
        &self,
        core: &Core,
        target: &Value,
        branch: &str,
        sha: &str,
        id: &str,
    ) -> Result<()> {
        if sha.is_empty() {
            return Ok(());
        }
        crate::versions::no_hooks(&core.repository, &["reference-transaction"]).await?;
        let reference = format!("refs/nudgethis/publishing/{id}");
        let spec = format!("refs/heads/{branch}:{reference}");
        let fetched = self
            .transfer(
                core,
                target,
                &[
                    "fetch",
                    "--no-tags",
                    "--no-recurse-submodules",
                    "--no-write-fetch-head",
                    "<url>",
                    &spec,
                ],
            )
            .await;
        let actual = core
            .repository
            .git(&["rev-parse", &reference], &core.repository.root, "")
            .await;
        core.repository
            .git(&["update-ref", "-d", &reference], &core.repository.root, "")
            .await?;
        fetched?;
        let actual = actual?;
        check(
            actual.trim() == sha,
            409,
            "The GitHub branch changed during review. Refresh and try again",
        )
    }
    async fn proposal(&self, core: &Core, target: &Value, branch: &str) -> Result<Value> {
        let owner = text(target, "fullName").split('/').next().unwrap();
        let path = format!(
            "/repos/{}/pulls?state=all&head={}&base={}&per_page=10",
            text(target, "fullName"),
            segment(&format!("{owner}:{branch}")),
            segment(text(target, "defaultBranch"))
        );
        let list = self.api(core, "GET", &path, None).await?;
        let number = list
            .as_array()
            .into_iter()
            .flatten()
            .find(|p| p["state"] == "open")
            .or_else(|| list.as_array().and_then(|p| p.first()))
            .and_then(|p| p["number"].as_u64());
        if let Some(n) = number {
            self.api(
                core,
                "GET",
                &format!("/repos/{}/pulls/{n}", text(target, "fullName")),
                None,
            )
            .await
        } else {
            Ok(Value::Null)
        }
    }
}
fn proposal_summary(pr: &Value, target: &Value) -> Value {
    if pr.is_null() {
        return Value::Null;
    }
    json!({"number":pr["number"],"title":pr["title"],"state":pr["state"],"merged":pr["merged"],"draft":pr["draft"],"head":pr["head"]["sha"],"branch":pr["head"]["ref"],"base":pr["base"]["ref"],"mergeable":pr["mergeable"],"mergeState":pr["mergeable_state"],"url":format!("https://github.com/{}/pull/{}",text(target,"fullName"),pr["number"])})
}
fn branch_key(target: &Value, branch: &str) -> String {
    format!("branch-{}-{branch}", target["id"])
}
impl Core {
    pub async fn github_status(&self) -> Result<Value> {
        let hub = self.github.lock().await;
        let target = self.store.github_value("target")?;
        let workspace = self.workspace().await?;
        let last = self
            .store
            .github_value(&branch_key(&target, text(&workspace, "branch")))?;
        let mut suggested = String::new();
        if project::executable("git")
            && let Ok(remote) =
                workspace::raw(&self.repository, &["config", "--get", "remote.origin.url"]).await
        {
            let url = remote.stdout.trim();
            let candidate = url
                .strip_prefix("https://github.com/")
                .or_else(|| url.strip_prefix("git@github.com:"))
                .unwrap_or("")
                .trim_end_matches(".git");
            if full_name(candidate) {
                suggested = candidate.into();
            }
        }
        Ok(
            json!({"available":project::executable("gh"),"account":hub.session.as_ref().map(|s|s.login.clone()),"target":target,"last":last,"suggestedTarget":suggested}),
        )
    }
    pub async fn github_action(&self, input: Value) -> Result<Value> {
        let _control = self.control.lock().await;
        let mut hub = self.github.lock().await;
        let action = text(&input, "action");
        if action == "disconnect" {
            hub.session = None;
            hub.reviews.clear();
            self.store.emit("github", json!({"changed":true}));
            return Ok(json!({"disconnected":true}));
        }
        if action == "connect" {
            check(
                name(text(&input, "username")),
                400,
                "Enter the GitHub username you want to connect",
            )?;
            let token = if input["method"] == "token" {
                text(&input, "token").trim().to_owned()
            } else {
                check(
                    input["method"] == "cli",
                    400,
                    "Choose an existing GitHub CLI account or a session token",
                )?;
                let output = process::run_scoped(
                    "gh",
                    &[
                        "auth".into(),
                        "token".into(),
                        "--hostname".into(),
                        "github.com".into(),
                        "--user".into(),
                        text(&input, "username").into(),
                    ],
                    &self.repository.root,
                    b"",
                    15000,
                    &CancellationToken::new(),
                    &[("GH_PROMPT_DISABLED", "1")],
                    CLEAR_AUTH,
                )
                .await
                .map_err(|_| conflict("Install GitHub CLI and sign in, or use a session token"))?;
                check(
                    output.code == 0,
                    403,
                    "That username is not signed in to GitHub CLI. Sign in separately or use a session token",
                )?;
                output.stdout.trim().to_owned()
            };
            check(
                (20..=512).contains(&token.len()) && !token.chars().any(char::is_whitespace),
                400,
                "Enter a valid GitHub token",
            )?;
            let session = Session {
                token,
                login: text(&input, "username").into(),
                transport: {
                    #[cfg(test)]
                    {
                        hub.transport.clone()
                    }
                    #[cfg(not(test))]
                    {
                        Transport::Cli
                    }
                },
                #[cfg(test)]
                git_url: hub.git_url.clone(),
            };
            let user = session.api(self, "GET", "/user", None).await?;
            check(
                text(&user, "login").eq_ignore_ascii_case(&session.login),
                403,
                "The credential belongs to a different GitHub account. Enter the matching username",
            )?;
            let login = text(&user, "login").to_owned();
            hub.session = Some(Session {
                login: login.clone(),
                ..session
            });
            hub.reviews.clear();
            self.store.emit("github", json!({"changed":true}));
            return Ok(json!({"account":login}));
        }
        let session = hub
            .session
            .clone()
            .ok_or_else(|| conflict("Connect a GitHub account for this session first"))?;
        if action == "target" || action == "create" {
            let fullname = if action == "create" {
                check(
                    input["confirm"] == true
                        && name(text(&input, "name"))
                        && input["private"].is_boolean(),
                    400,
                    "Confirm the repository name and whether it will be private or public",
                )?;
                check(
                    input["account"] == session.login,
                    409,
                    "The selected GitHub account changed. Review it again",
                )?;
                let repo=session.api(self,"POST","/user/repos",Some(json!({"name":input["name"],"private":input["private"],"auto_init":false}))).await?;
                text(&repo, "full_name").to_owned()
            } else {
                text(&input, "repository").to_owned()
            };
            check(
                full_name(&fullname),
                400,
                "Use a GitHub repository name such as username/project",
            )?;
            let repo = session
                .api(self, "GET", &format!("/repos/{fullname}"), None)
                .await?;
            let target = target_summary(&repo)?;
            self.store.github_save("target", target.clone())?;
            hub.reviews.clear();
            return Ok(target);
        }
        let target = session.repository(self).await?;
        if matches!(action, "refresh" | "preview" | "merge-preview")
            && self.store.github_value("target")? != target
        {
            self.store.github_save("target", target.clone())?;
        }
        let workspace = self.workspace().await?;
        check(
            workspace["kind"] == "ready",
            409,
            "Save the first version and choose a branch before publishing",
        )?;
        let branch = text(&workspace, "branch");
        let head = text(&workspace, "head");
        if action == "refresh" {
            let remote = session.remote_head(self, &target, branch).await?;
            let proposal = if branch != text(&target, "defaultBranch") {
                session.proposal(self, &target, branch).await?
            } else {
                Value::Null
            };
            let last = json!({"branch":branch,"head":remote,"checkedAt":now(),"proposal":proposal_summary(&proposal,&target)});
            self.store
                .github_save(&branch_key(&target, branch), last.clone())?;
            return Ok(last);
        }
        if action == "preview" {
            crate::versions::no_hooks(&self.repository, &["pre-push", "reference-transaction"])
                .await?;
            let remote = session.remote_head(self, &target, branch).await?;
            check(
                remote != head,
                409,
                "This version is already published. Refresh GitHub status to continue",
            )?;
            let base = if remote.is_empty() {
                session
                    .remote_head(self, &target, text(&target, "defaultBranch"))
                    .await?
            } else {
                remote.clone()
            };
            check(
                !base.is_empty() || branch == text(&target, "defaultBranch"),
                409,
                &format!(
                    "Publish the first version from {} to establish the default branch, then create a working branch",
                    text(&target, "defaultBranch")
                ),
            )?;
            let id = format!("{:032x}", rand::random::<u128>());
            session
                .fetch_branch(
                    self,
                    &target,
                    if remote.is_empty() {
                        text(&target, "defaultBranch")
                    } else {
                        branch
                    },
                    &base,
                    &id,
                )
                .await?;
            if !remote.is_empty() {
                check(
                    workspace::raw(
                        &self.repository,
                        &["merge-base", "--is-ancestor", &remote, head],
                    )
                    .await?
                    .code
                        == 0,
                    409,
                    "GitHub has changes that are missing locally. Update your branch in your Git client; publishing will not overwrite them",
                )?;
            }
            let exclude = format!("^{base}");
            let mut log = vec!["log", "--format=%H%x00%s", "--max-count=101", head];
            if !base.is_empty() {
                log.push(&exclude);
            }
            let raw = self.repository.git(&log, &self.repository.root, "").await?;
            let commits: Vec<_> = raw
                .lines()
                .filter_map(|l| l.split_once('\0'))
                .map(|(sha, title)| json!({"sha":sha,"title":title}))
                .collect();
            check(
                !commits.is_empty() && commits.len() <= 100,
                409,
                "Review between 1 and 100 unpublished commits at a time, or publish through your Git client",
            )?;
            let diff_base = if base.is_empty() {
                self.repository
                    .git(&["mktree"], &self.repository.root, "")
                    .await?
                    .trim()
                    .to_owned()
            } else if remote.is_empty() {
                self.repository.git(&["merge-base",&base,head],&self.repository.root,"").await.map_err(|_|conflict("These repositories have unrelated histories. Choose the matching repository or use your Git client"))?.trim().to_owned()
            } else {
                base
            };
            let diff = self
                .repository
                .git(
                    &[
                        "diff",
                        "--binary",
                        "--no-ext-diff",
                        "--no-textconv",
                        "--no-renames",
                        &diff_base,
                        head,
                        "--",
                    ],
                    &self.repository.root,
                    "",
                )
                .await?;
            let files = self
                .repository
                .git(
                    &[
                        "diff",
                        "--name-only",
                        "-z",
                        "--no-renames",
                        &diff_base,
                        head,
                        "--",
                    ],
                    &self.repository.root,
                    "",
                )
                .await?;
            check(
                diff.len() <= 524288,
                409,
                "This publish diff is too large for the in-app review. Review and publish it in your Git client",
            )?;
            let data = json!({"id":id,"kind":"publish","account":session.login,"target":target,"branch":branch,"head":head,"remoteHead":remote,"commits":commits,"files":files.split('\0').filter(|s|!s.is_empty()).collect::<Vec<_>>(),"diff":diff,"dirty":workspace["dirty"],"updatesMain":branch==text(&target,"defaultBranch"),"expiresInSeconds":600});
            hub.reviews
                .retain(|_, p| p.created.elapsed().as_secs() < 600);
            check(
                hub.reviews.len() < 12,
                409,
                "Too many reviews are open. Wait a few minutes and refresh",
            )?;
            hub.reviews.insert(
                id,
                Review {
                    created: Instant::now(),
                    data: data.clone(),
                },
            );
            return Ok(data);
        }
        if action == "publish" {
            let id = text(&input, "previewId");
            let receipt = self.store.github_value(&format!("receipt-{id}"))?;
            if receipt["status"] == "published" {
                check(
                    receipt["targetId"] == target["id"] && receipt["account"] == session.login,
                    409,
                    "This receipt belongs to another account or repository",
                )?;
                return Ok(receipt);
            }
            let review = hub
                .reviews
                .get(id)
                .ok_or_else(|| conflict("Review the versions to publish again"))?;
            let plan = &review.data;
            check(
                review.created.elapsed().as_secs() < 600
                    && plan["kind"] == "publish"
                    && plan["account"] == session.login
                    && plan["target"] == target
                    && plan["head"] == head
                    && plan["branch"] == branch,
                409,
                "The publish review expired or the account, repository or branch changed. Review again",
            )?;
            let remote = session.remote_head(self, &target, branch).await?;
            // A timed-out push may already have completed. It is safe to acknowledge that exact head.
            let completed =
                remote == head && receipt["status"] == "publishing" && receipt["head"] == head;
            if !completed {
                check(
                    plan["remoteHead"] == remote,
                    409,
                    "The remote branch changed since review. Refresh before publishing",
                )?;
                crate::versions::no_hooks(&self.repository, &["pre-push", "reference-transaction"])
                    .await?;
                self.store.github_save(&format!("receipt-{id}"),json!({"status":"publishing","head":head,"account":session.login,"targetId":target["id"]}))?;
                session
                    .transfer(
                        self,
                        &target,
                        &[
                            "push",
                            "--porcelain",
                            "--no-follow-tags",
                            "--recurse-submodules=no",
                            "<url>",
                            &format!("{head}:refs/heads/{branch}"),
                        ],
                    )
                    .await?;
            }
            let result = json!({"status":"published","head":head,"branch":branch,"account":session.login,"targetId":target["id"],"at":now(),"url":format!("https://github.com/{}/tree/{}",text(&target,"fullName"),segment(branch))});
            self.store
                .github_save(&format!("receipt-{id}"), result.clone())?;
            self.store.github_save(
                &branch_key(&target, branch),
                json!({"branch":branch,"head":head,"checkedAt":now(),"proposal":null}),
            )?;
            return Ok(result);
        }
        if action == "propose" {
            check(
                input["head"] == head
                    && input["branch"] == branch
                    && input["targetId"] == target["id"]
                    && input["account"] == session.login
                    && input["base"] == target["defaultBranch"]
                    && input["private"] == target["private"],
                409,
                "The account, repository or branch changed. Review the proposal again",
            )?;
            check(
                branch != text(&target, "defaultBranch"),
                409,
                "Choose a working branch before proposing changes to the main branch",
            )?;
            check(
                session.remote_head(self, &target, branch).await? == head,
                409,
                "Publish the current version before proposing changes",
            )?;
            let existing = session.proposal(self, &target, branch).await?;
            if existing["state"] == "open" {
                let proposal = proposal_summary(&existing, &target);
                self.store.github_save(
                    &branch_key(&target, branch),
                    json!({"branch":branch,"head":head,"checkedAt":now(),"proposal":proposal}),
                )?;
                return Ok(proposal);
            }
            let title = text(&input, "title").trim();
            let body = text(&input, "body");
            check(
                !title.is_empty()
                    && title.len() <= 240
                    && !title.chars().any(char::is_control)
                    && body.len() <= 8000,
                400,
                "Use a title up to 240 bytes and a description up to 8,000 bytes",
            )?;
            let proposal=session.api(self,"POST",&format!("/repos/{}/pulls",text(&target,"fullName")),Some(json!({"title":title,"body":body,"head":branch,"base":target["defaultBranch"]}))).await?;
            let proposal = proposal_summary(&proposal, &target);
            self.store.github_save(
                &branch_key(&target, branch),
                json!({"branch":branch,"head":head,"checkedAt":now(),"proposal":proposal}),
            )?;
            return Ok(proposal);
        }
        if action == "merge-preview" || action == "merge" {
            let number = input["number"]
                .as_u64()
                .filter(|n| *n > 0)
                .ok_or_else(|| conflict("Choose a proposal to review"))?;
            let mut pr = session
                .api(
                    self,
                    "GET",
                    &format!("/repos/{}/pulls/{number}", text(&target, "fullName")),
                    None,
                )
                .await?;
            check(
                pr["head"]["repo"]["id"] == target["id"]
                    && pr["base"]["repo"]["id"] == target["id"]
                    && pr["head"]["ref"] == branch
                    && pr["base"]["ref"] == target["defaultBranch"]
                    && pr["head"]["sha"] == head,
                409,
                "The proposal does not match this branch and version. Refresh before reviewing",
            )?;
            let proposal = proposal_summary(&pr, &target);
            if pr["merged"] == true {
                self.store.github_save(
                    &branch_key(&target, branch),
                    json!({"branch":branch,"head":head,"checkedAt":now(),"proposal":proposal}),
                )?;
                return Ok(json!({"merged":true,"proposal":proposal}));
            }
            let checks = session
                .api(
                    self,
                    "GET",
                    &format!(
                        "/repos/{}/commits/{head}/check-runs?per_page=100",
                        text(&target, "fullName")
                    ),
                    None,
                )
                .await?;
            let statuses = session
                .api(
                    self,
                    "GET",
                    &format!(
                        "/repos/{}/commits/{head}/status?per_page=100",
                        text(&target, "fullName")
                    ),
                    None,
                )
                .await?;
            let (owner, repository) = text(&target, "fullName").split_once('/').unwrap();
            let review=session.api(self,"POST","/graphql",Some(json!({"query":"query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewDecision headRefOid baseRefOid}}}","variables":{"owner":owner,"name":repository,"number":number}}))).await?;
            let decision = &review["data"]["repository"]["pullRequest"];
            check(
                decision.get("reviewDecision").is_some()
                    && decision["headRefOid"] == head
                    && decision["baseRefOid"] == pr["base"]["sha"],
                409,
                "GitHub review requirements could not be confirmed. Refresh or complete the merge on GitHub",
            )?;
            pr["reviewDecision"] = decision["reviewDecision"].clone();
            let can_merge = merge_ready(&pr, &checks, &statuses);
            if action == "merge-preview" {
                let id = format!("{:032x}", rand::random::<u128>());
                session
                    .fetch_branch(
                        self,
                        &target,
                        text(&target, "defaultBranch"),
                        text(&pr["base"], "sha"),
                        &id,
                    )
                    .await?;
                let ancestor = self
                    .repository
                    .git(
                        &["merge-base", text(&pr["base"], "sha"), head],
                        &self.repository.root,
                        "",
                    )
                    .await?;
                let diff = self
                    .repository
                    .git(
                        &[
                            "diff",
                            "--binary",
                            "--no-ext-diff",
                            "--no-textconv",
                            ancestor.trim(),
                            head,
                            "--",
                        ],
                        &self.repository.root,
                        "",
                    )
                    .await?;
                check(
                    diff.len() <= 524288,
                    409,
                    "Review this large proposal directly on GitHub",
                )?;
                let data = json!({"diff":diff,"reviewDecision":pr["reviewDecision"],"id":id,"kind":"merge","account":session.login,"target":target,"proposal":proposal,"head":head,"baseHead":pr["base"]["sha"],"canMerge":can_merge,"checks":checks["check_runs"].as_array().into_iter().flatten().map(|c|json!({"name":c["name"],"status":c["status"],"conclusion":c["conclusion"]})).collect::<Vec<_>>(),"status":statuses["state"],"expiresInSeconds":600});
                hub.reviews
                    .retain(|_, r| r.created.elapsed().as_secs() < 600);
                check(
                    hub.reviews.len() < 12,
                    409,
                    "Too many reviews are open. Wait a few minutes",
                )?;
                hub.reviews.insert(
                    id,
                    Review {
                        created: Instant::now(),
                        data: data.clone(),
                    },
                );
                return Ok(data);
            }
            let review = hub
                .reviews
                .get(text(&input, "previewId"))
                .ok_or_else(|| conflict("Review this proposal again before merging"))?;
            let plan = &review.data;
            check(
                review.created.elapsed().as_secs() < 600
                    && plan["kind"] == "merge"
                    && plan["account"] == session.login
                    && plan["target"] == target
                    && plan["proposal"]["number"] == number
                    && plan["head"] == head
                    && plan["baseHead"] == pr["base"]["sha"],
                409,
                "The proposal, main branch or account changed. Review again before merging",
            )?;
            check(
                can_merge,
                409,
                "GitHub still requires checks, reviews, conflict resolution or its merge queue. Complete those in GitHub and refresh",
            )?;
            let method = text(&input, "method");
            let allowed = match method {
                "merge" => target["allowMerge"] == true,
                "squash" => target["allowSquash"] == true,
                "rebase" => target["allowRebase"] == true,
                _ => false,
            };
            check(
                allowed,
                400,
                "Choose a merge method allowed by the repository",
            )?;
            let merged = session
                .api(
                    self,
                    "PUT",
                    &format!("/repos/{}/pulls/{number}/merge", text(&target, "fullName")),
                    Some(json!({"sha":head,"merge_method":method})),
                )
                .await?;
            check(
                merged["merged"] == true,
                409,
                "GitHub did not merge this proposal. Refresh its checks and branch rules",
            )?;
            let mut proposal = proposal;
            proposal["merged"] = true.into();
            proposal["state"] = "closed".into();
            self.store.github_save(
                &branch_key(&target, branch),
                json!({"branch":branch,"head":head,"checkedAt":now(),"proposal":proposal}),
            )?;
            return Ok(
                json!({"merged":true,"proposal":proposal,"sha":merged["sha"],"note":"Changes were merged on GitHub. Your local branch is unchanged. Website deployment depends on this repository's configuration."}),
            );
        }
        Err(conflict("Unknown GitHub action"))
    }
}
fn merge_ready(pr: &Value, checks: &Value, statuses: &Value) -> bool {
    pr["state"] == "open"
        && pr.get("reviewDecision").is_some()
        && (pr["reviewDecision"].is_null() || pr["reviewDecision"] == "APPROVED")
        && pr["draft"] != true
        && pr["mergeable"] == true
        && pr["mergeable_state"] == "clean"
        && checks["total_count"].as_u64().is_some_and(|n| n <= 100)
        && checks["check_runs"].as_array().is_some_and(|rows| {
            rows.len() as u64 == checks["total_count"].as_u64().unwrap_or(u64::MAX)
                && rows.iter().all(|c| {
                    c["status"] == "completed"
                        && matches!(text(c, "conclusion"), "success" | "neutral" | "skipped")
                })
        })
        && (statuses["total_count"] == 0 || statuses["state"] == "success")
}

#[cfg(test)]
#[path = "github_tests.rs"]
mod tests;
