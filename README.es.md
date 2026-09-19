# DevReview Agent

**Señala tu interfaz. Dile a tu agente qué quieres cambiar.**

Alt + clic derecho sobre un elemento abre una solicitud. Cada tarea tiene una conversación,
respuestas del agente, diff, validaciones e historial de versiones. El agente trabaja en un
worktree separado; tú revisas y aplicas los cambios a tu rama sin commit ni push automáticos.

**Frontend: TypeScript estricto. Backend, CLI y ejecución de agentes: Rust.**
El ejecutable incluye los recursos web compilados. Node se utiliza para compilar el frontend
y ejecutar las pruebas del proyecto; DevReview no lo necesita para funcionar después de compilarse.
Tu aplicación o el agente elegido pueden tener sus propios requisitos, incluido Node.

[English](README.md) · [Migración](docs/migration.es.md) · [Agentes](docs/agents.md) · [Roadmap validado](docs/roadmap-review.es.md)

## Compilar y probar sin cuenta de agente

Requisitos de desarrollo: Git, Node.js 24.15+ y Rust estable con compilador C.

```bash
git clone https://github.com/gerardoyxy/devreview-agent.git
cd devreview-agent
npm ci
npm run build
./target/debug/devreview demo
```

En Windows, usa `target\debug\devreview.exe demo`. La demo crea un repositorio temporal,
usa un agente Rust con cambios CSS predefinidos y no llama a modelos. Abre el enlace de
Playground de la terminal, reporta el botón, conversa y revisa el diff de `button.css`.
La página de captura no es una vista previa de ese archivo. Ctrl+C detiene y limpia la demo.
Puedes elegir otro puerto con `demo --port 7441`.

## Apariencia personalizable

El botón **Appearance**, disponible en dashboard y modal, permite:

- Elegir modo claro, oscuro o sistema y editar sus dos paletas por separado.
- Cambiar 18 colores semánticos: fondos, texto, bordes, acento, estados y fondo del modal.
- Elegir fuentes independientes para texto, títulos y código, por nombre o subiendo WOFF/WOFF2.
- Ajustar tamaño del texto y redondeo, previsualizar, cancelar, guardar o restaurar valores iniciales.
- Importar/exportar un tema JSON, incluidas las fuentes subidas, y recibir avisos de contraste.

Los temas se guardan por repositorio en SQLite y se sincronizan por SSE entre clientes.
Los estilos del overlay se limitan a su Shadow DOM; no cambian tu aplicación. Las fuentes
se cargan localmente, sin servicios externos. Hasta tres fuentes, máximo conjunto de 1 MiB.
Una fuente escrita por nombre debe estar instalada; si no, se usa su alternativa.

La revisión visual usa las pautas aplicables de [Taste Skill](https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill),
conservando el flujo de una herramienta de desarrollo. [Decisiones visuales](docs/design.es.md).

## Conectar una aplicación

1. Compila el ejecutable. Para distribución propia, usa `cargo build --release --locked` después del build del frontend.
2. Desde la raíz del repositorio de tu aplicación, ejecuta `/ruta/absoluta/devreview init`.
3. Revisa `devreview.toml`, registra agentes instalados y autenticados, configura validaciones y confirma los archivos en Git.
4. Inicia tu aplicación y, en otra terminal, `/ruta/absoluta/devreview start`.
5. Abre el dashboard que imprime la terminal e integra el overlay solo en desarrollo, como indica el [README inglés](README.md).

Si vienes de la alpha anterior, sigue la [guía de migración](docs/migration.es.md). No se ejecuta
`devreview.config.mjs`: sus valores pasan a TOML. La primera apertura de SQLite anterior crea
un respaldo mediante la API de SQLite antes de migrar, conservando tareas, mensajes y versiones.

## Comunicación con agentes

Puedes registrar Codex, agentes compatibles con el subconjunto local ACP v1 o adaptadores JSONL.
Cada tarea conserva el agente elegido. **Copy context** permite copiar la solicitud a cualquier
agente que acepte texto, sin automatización. Un CLI arbitrario o API remota necesita un adaptador.

El chat de DevReview pertenece a esa tarea; no se conecta a conversaciones externas ya abiertas.
ACP todavía no incluye permisos interactivos, imágenes ni reanudación nativa de sesiones.
Las pruebas usan agentes simulados; no certifican a todos los proveedores.

## Límites actuales

La migración del runtime a Rust está completa en esta rama, pero el producto sigue siendo una
alpha. Las capturas, identidad estable de elementos, Undo, integración con frameworks y
verificación visual después del hot reload siguen en el roadmap. Las tareas nuevas parten
siempre de HEAD confirmado. Los worktrees no sustituyen un sandbox del agente.

[Seguridad](SECURITY.md) · [Arquitectura](docs/architecture.md) · [API](docs/api.md) · Licencia MIT.
