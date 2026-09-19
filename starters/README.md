# Maintained project starters

These files are embedded into the Rust application. Creation renders only the selected
starter into a new folder; it does not download or run a scaffolding command. User text is
escaped for HTML or serialized as JSON. The three starting points are a dependency-free
website, Astro pages, and an interactive React/TypeScript interface. The interface uses
sample in-memory data; authentication, payments and shared storage are not implemented.

Direct dependency versions are fixed in `crates/nudgethis/src/starters.rs`. Dependency
installation is a separate reviewed operation; save the generated lockfile in your project.
The optional development overlay reads a local session token from a URL fragment, never
from a generated source file. No agent is needed to create or preview these projects.
