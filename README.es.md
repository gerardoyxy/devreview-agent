# DevReview Agent

**Convierte lo que detectas al revisar localhost en una tarea de agente que puedes revisar y aplicar.**

Mantén pulsada **Alt** y haz clic derecho en un elemento, describe el cambio y sigue
revisando. El agente trabaja en un worktree separado. DevReview ejecuta las
validaciones configuradas y muestra el diff. Tú decides cuándo aplicarlo.

Cada cambio tiene su propia conversación en una ventana dentro de tu aplicación:

- **Conversation:** solicitudes, respuestas del agente y ajustes posteriores.
- **Changes:** archivos, diff actual y resultados de validación.
- **History:** versiones anteriores del cambio y registro de actividad.

Puedes cerrar la ventana y volver desde el botón DevReview o la etiqueta del
elemento. El historial queda guardado localmente, incluso después de reiniciar.
Durante una ejecución puedes preparar tu respuesta; se envía cuando termina ese
turno. Los ajustes conservan el trabajo anterior y vuelven a validarlo. Si ya
aplicaste un cambio, guarda un commit antes de continuar esa conversación.

El chat se comunica con el agente de Codex CLI de esa tarea. No se conecta a una
conversación abierta de Codex App.

## Prueba local

Necesitas Node.js 24.15 o posterior y Git:

```bash
git clone https://github.com/gerardoyxy/devreview-agent.git
cd devreview-agent
npm run demo
```

Abre los enlaces de la terminal. Reporta el botón **Add teammate** solicitando
alineación a la derecha en escritorio y ancho completo en móvil. Revisa el diff y
pulsa **Apply**. Puedes enviar un segundo mensaje para probar el ajuste predefinido
de las esquinas del botón. La demo usa cambios CSS predefinidos, un repositorio temporal y
ninguna llamada a modelos. Ctrl+C la detiene y elimina su repositorio temporal.

Para corregir tu propia aplicación, instala y autentica Codex CLI, ejecuta
`init` y `start` desde la raíz de su repositorio e integra el overlay únicamente
en desarrollo. Las instrucciones completas están en el [README principal](README.md).

## Estado de esta versión

Es una **alpha**, todavía sin publicación en npm. Incluye cola persistente en
SQLite, eventos en vivo, worktrees aislados, adaptador Codex, validación configurable,
revisión del diff y acciones para aplicar, rechazar, reintentar o cancelar.

Las tareas parten de HEAD confirmado: guarda tus cambios en un commit o en stash
antes de reportar. Aplicar modifica los archivos sin crear un commit ni hacer push.
Un conflicto conserva el trabajo para inspección. Reintentar elimina el worktree
anterior de esa tarea y vuelve a partir de HEAD.

Las capturas de pantalla, integración con frameworks y validación visual quedan
para versiones posteriores. Consulta [seguridad](SECURITY.md) y [arquitectura](docs/architecture.md).

Licencia MIT.
