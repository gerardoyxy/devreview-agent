#[tokio::main]
async fn main() {
    devreview_agent_runtime::run_stdio().await;
}
