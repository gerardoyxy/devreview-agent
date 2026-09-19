# Migración de la alpha Node a Rust

El servidor, HTTP/SSE, cola, SQLite, Git, validaciones, CLI y demo ahora viven en Rust.
El frontend sigue en TypeScript. Compilar requiere Node y Rust; ejecutar el binario ya
compilado requiere Git y los requisitos propios del agente elegido.

## Pasos

1. Detén el servidor anterior y sus tareas. No ejecutes las dos versiones contra el mismo repositorio.
2. En el checkout de NudgeThis: `npm ci`, `npm run build`. El resultado es `target/debug/nudgethis`
   o `target/debug/nudgethis.exe`. Para release, después compila con `cargo build --release --locked`.
3. En la aplicación, ejecuta el nuevo binario con `init`. No sobrescribe `nudgethis.toml` existente.
4. Traslada los valores de `nudgethis.config.mjs` a `nudgethis.toml` y revisa el resultado.
5. Confirma la configuración y `.gitignore`, luego inicia con `nudgethis start`.

La configuración JavaScript **no se evalúa**. Si solo existe el archivo anterior, el servidor
indica cómo migrar en lugar de iniciar con valores supuestos. Si existen ambos, usa TOML.
Funciones, imports y adaptadores JavaScript en memoria no pueden convertirse a datos TOML;
expón esos adaptadores mediante el protocolo stdio y registra su ejecutable.

| Configuración anterior | TOML |
| --- | --- |
| `server.port` | `[server] port` |
| `server.allowedOrigins` | `[server] allowedOrigins` |
| `workers.maxConcurrent` | `[workers] maxConcurrent` |
| `validation.commands`, `timeout` | `[validation] commands`, `timeout` |
| `defaultAgent` | `defaultAgent` antes de cualquier sección |
| `agents: [{...}]` | Una sección `[[agents]]` por agente |
| `agent: {command,model,timeout}` | `[[agents]]` con `id="codex"`, `transport="codex"` y esos valores |
| `NUDGETHIS_RUNTIME` | Ya no se usa: el servidor incorpora la biblioteca Rust |
| `node .../packages/cli/src/index.js start` | `/ruta/al/binario/nudgethis start` |

Ejemplo completo:

```toml
defaultAgent = "codex"

[server]
port = 7331
allowedOrigins = ["http://localhost:5173"]

[workers]
maxConcurrent = 2

[validation]
commands = ["npm ci", "npm test"]
timeout = 120000

[[agents]]
id = "codex"
label = "Codex CLI"
transport = "codex"
command = "codex"
args = []
timeout = 600000
```

En Windows puedes usar rutas TOML literales: `command = 'C:\ruta\agente.exe'`.
Las validaciones se ejecutan con `cmd.exe` en Windows y `sh` en Unix; revisa la sintaxis local.
El ejecutable configurado debe poder lanzarse directamente; wrappers `.cmd` requieren una
configuración apropiada de `cmd.exe` y sus argumentos. No se cambia ninguna sesión de GitHub
ni configuración global de Git.

## Datos existentes

Se conserva `.nudgethis/token` y se abre `.nudgethis/tasks.sqlite`. Si la base anterior tiene
`user_version=0`, se crea `tasks.before-rust-<timestamp>.sqlite` mediante la API de backup de
SQLite, que incluye las páginas confirmadas del WAL. Solo después se migra dentro de una
transacción. Si el respaldo falla, no se ejecuta la migración.

Se preservan IDs, solicitudes, mensajes, auditoría, diffs y versiones disponibles. Tareas
activas interrumpidas quedan fallidas para inspección. Las tareas pendientes conservan su
semántica de cola y pueden empezar al iniciar el nuevo servidor. No se reconstruyen mensajes
que la versión original nunca guardó.

Para volver a la versión anterior, detén primero Rust. Conserva una copia del estado actual
antes de restaurar el respaldo; restaurarlo descarta cambios posteriores a la migración.
No copies una base SQLite mientras haya un servidor usándola ni mezcles sus archivos WAL.

Tras un cierre forzado puede quedar `server.lock`. Comprueba que el proceso anterior y sus
agentes terminaron antes de eliminarlo. No se borra automáticamente un bloqueo ajeno.
