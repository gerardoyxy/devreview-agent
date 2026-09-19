# Visual Agent QA — Product Roadmap & Ideas

> **Core idea:** Stop describing UI changes to coding agents. Point at the UI instead.

Herramienta open source que convierte el navegador en una interfaz visual para comunicarse con agentes de código como Codex, Claude Code, Cursor u otros.

El usuario puede seleccionar visualmente elementos de una aplicación, describir cambios en lenguaje natural y enviar al agente el contexto necesario para encontrar y modificar el código correspondiente.

El objetivo no es solamente hacer QA.

El objetivo es crear una **visual feedback layer entre una aplicación y los coding agents**.

## 1. Core Product Loop

```text
SEE → SELECT → DESCRIBE → UNDERSTAND CONTEXT → AGENT EDITS CODE → HOT RELOAD → VERIFY → CONTINUE CONVERSATION
```

Prioridad absoluta: reducir la distancia entre **"I don't like this"** y **"it's fixed"**.

## 2. Element Selection

- Hover con outline, tag HTML, componente aproximado y dimensiones.
- Click para seleccionar.
- Navegación parent/child/siblings.
- Identidad robusta del elemento para sobrevivir hot reloads.

## 3. Multi-select

Seleccionar varios elementos y pedir cambios conjuntos:

```text
Make these cards consistent.
Use the same padding, border radius, heading size and button alignment.
```

## 4. Area Selection

Seleccionar una región visual completa y enviar screenshot, DOM, componentes, posición y dimensiones al agente.

## 5. Visual Prompt Bubble

Flujo principal:

```text
click → type → enter
```

Burbuja contextual pequeña en vez de obligar al usuario a abandonar el navegador.

## 6. Persistent Conversations per Element

Cada elemento mantiene su propio thread de conversación y cambios anteriores.

## 7. Visual History Bubbles

Indicadores sobre elementos modificados con acceso al historial de prompts y cambios.

## 8. Page Feedback Overview

Agrupar feedback por página y estado: pendiente, resuelto, aplicado, revertido.

## 9. Fix All

Acumular múltiples observaciones y permitir que el agente las procese conjuntamente.

## 10. Instant Mode vs Review Mode

**Instant Mode:** select → prompt → edit → hot reload.

**Review Mode:** select → leave feedback → continue reviewing → submit review → developer/agent resolves.

## 11. Agent-Agnostic Architecture

```text
Browser
  ↓
Visual Context Engine
  ↓
Agent Adapter
  ↓
Codex / Claude Code / Cursor / Copilot / OpenCode / Custom Agent
```

Crear una interfaz estándar para adapters.

## 12. Copy Context

Generar contexto portable para pegar en cualquier agente:

```text
URL: http://localhost:3000/checkout
Element: button.checkout-submit
Component: CheckoutButton
Source: src/components/checkout/CheckoutButton.tsx
Request: Make this button full width on mobile.
```

## 13. Smart Source Detection

Resolver:

```text
DOM element → framework component → source file → relevant line/styles
```

Soportar progresivamente React, Vue, Svelte, CSS Modules, Tailwind, styled-components, etc.

## 14. Framework Integrations

Prioridad inicial:

- React
- Next.js
- Vite

Después:

- Vue / Nuxt
- Svelte / SvelteKit
- Astro
- Remix

## 15. Context Engine

Enviar contexto estructurado y mínimo, no HTML/proyecto completo indiscriminadamente.

## 16. Screenshot Context

Adjuntar screenshot completo y crop del elemento cuando el contexto visual sea relevante.

## 17. Before / After

Capturar visualmente el estado anterior y posterior a cada cambio.

## 18. Undo

Cada edición del agente debe ser reversible.

## 19. Diff Viewer

Mostrar exactamente qué archivos y líneas modificó el agente, con Accept / Undo / Open file / Continue editing.

## 20. Git Awareness

Detectar branch, working tree, archivos afectados y diff de la sesión.

## 21. Session History

Guardar prompts, elementos, screenshots, diffs, archivos y resultados de cada sesión.

## 22. Page Sessions

Agrupar issues y cambios por ruta/página.

## 23. Severity & Feedback Types

Tipos posibles: Bug, Improvement, Suggestion; Visual, Copy, Layout, Responsive, Accessibility, Behavior, Performance.

## 24. Responsive QA

Capturar viewport y permitir feedback específico para desktop/tablet/mobile.

## 25. Console Context

Adjuntar errores relevantes de consola cuando el problema pueda ser funcional.

## 26. Network Context

Adjuntar requests/responses relevantes, status codes y errores cuando sea necesario.

## 27. Automatic Bug Context

Ante una excepción, ofrecer enviar stack trace + console + network + page + component + recent interaction al agente.

## 28. Accessibility Mode

Detectar problemas básicos como aria-label, alt, accessible name, heading hierarchy y contraste.

## 29. Visual Consistency Detection

Comparar padding, radius, typography, colores y alineación entre elementos seleccionados.

## 30. Natural Language Selection

Ejemplos:

```text
Select all pricing cards.
Select every primary button on this page.
```

## 31. Global Project Instructions

Reglas persistentes del proyecto como:

- Use Tailwind only.
- Don't introduce new dependencies.
- Follow existing design tokens.
- Never use inline styles.

## 32. Design System Awareness

Detectar design tokens, Tailwind config, CSS variables y component libraries para reutilizar el sistema existente.

## 33. Component Awareness

Advertir si modificar un componente compartido afectará otras páginas y ofrecer cambio global o local.

## 34. Impact Analysis

Mostrar dónde se utiliza un componente antes de cambios globales.

## 35. Agent Plan Preview

Mostrar únicamente un plan operativo breve antes de cambios complejos.

## 36. Verification

Tras modificar:

- build
- TypeScript
- tests relevantes
- render
- existencia del elemento

## 37. Auto Verification

Comparar intención solicitada contra cambios observables después del hot reload.

## 38. Visual Regression

Detectar cambios visuales inesperados fuera de la zona seleccionada.

## 39. Comments Without Agent

Permitir feedback visual puro entre designer/QA/PM/developer incluso sin ejecutar AI.

## 40. Shareable Review Sessions

Crear sesiones de review que puedan exportarse o compartirse.

## 41. Team Mode

Roles potenciales: Developer, Designer, QA, PM, Reviewer.

## 42. Issue Export

Exportar feedback a GitHub Issues, Linear, Jira, Markdown o JSON.

## 43. GitHub Integration

Posibles acciones: crear issue, branch, commit, PR y adjuntar before/after.

## 44. PR Visual Review

Relacionar cambios visuales con pull requests y permitir review visual contextual.

## 45. Prompt Templates

Atajos como:

- Fix spacing
- Align this
- Make responsive
- Match this component
- Fix accessibility
- Make consistent
- Improve copy

## 46. Keyboard Shortcuts

Ejemplo:

```text
V       Toggle Visual Agent
Esc     Cancel
Shift   Multi-select
Enter   Send
Cmd+Z   Undo
C       Copy context
```

## 47. Command Palette

Acciones rápidas: Fix selected, Copy context, Select parent, Undo, Show history, Open source.

## 48. Open Source File

Abrir el archivo correcto en VS Code, Cursor, Zed, etc., idealmente en la línea correspondiente.

## 49. Element Metadata

Mostrar DOM, component, source, parent, dimensions, viewport y última modificación.

## 50. Selection Persistence & Element Identity

Reencontrar el elemento después del hot reload usando componente, source, texto, role, parent, DOM path y posición.

## 51. Context Budget

Priorizar:

```text
Selected component
→ Parent component
→ Related styles
→ Design system
→ Relevant page
→ Extra files only if needed
```

## 52. Agent Routing

En el futuro, usar distintos agentes/modelos según el tipo y complejidad de tarea.

## 53. Parallel Fixes

Procesar issues independientes en paralelo y combinar cambios de forma segura.

## 54. Project Memory

Guardar reglas y decisiones explícitas del proyecto para adjuntarlas al contexto del agente.

## 55. Design Comparison

Comparar la implementación contra screenshot, referencia o frame de diseño y detectar diferencias.

## 56. Make This Look Like That

Seleccionar A y B y pedir que A adopte spacing, typography, border, radius, color o layout de B.

## 57. QA Agent

`Run Visual QA` para detectar potenciales problemas de overflow, layout, consistency, accessibility, console y responsive.

## 58. Autonomous QA

Recorrer múltiples rutas y generar un reporte de posibles issues.

## 59. User Flow QA

Definir y revisar flows completos como Signup → Onboarding → Dashboard.

## 60. State Testing

Revisar estados Loading, Empty, Error, Success, Disabled, Logged out y Logged in.

## 61. Visual Timeline & Session Replay

Mostrar cronología de selecciones, prompts, cambios, undo y evolución visual.

## 62. Generate Demo

Generar automáticamente un pequeño before → selection → prompt → change → after para compartir.

## 63. Share Change

Crear artefactos before/after + prompt + result para GitHub, X, Discord, Slack o PRs.

## 64. Plugin Architecture

Permitir plugins/adapters para agentes, frameworks e integraciones externas.

## 65. MCP Support

Exponer capacidades como:

```text
visual.getSelectedElement()
visual.getScreenshot()
visual.getPageContext()
visual.getFeedback()
visual.getIssues()
visual.verifyChange()
```

## 66. CLI & Zero-config Goal

Objetivo ideal:

```bash
npx visual-agent
```

y comenzar a usarlo con configuración mínima.

## 67. Docker Support

Docker, Docker Compose y Dev Containers deben ser first-class citizens: detectar host/container, ports, project root y source mounts.

## 68. Security & Permissions

Por defecto localhost-only. Modos:

- Ask before every change
- Auto-apply UI changes
- Read-only review

Limitar claramente qué directorios puede modificar el agente.

## 69. Dangerous Change Detection

Pedir confirmación extra si una tarea visual deriva en cambios de database, auth, env vars, dependencies o infraestructura.

## 70. Privacy

Priorizar arquitectura local-first cuando sea posible. Documentar claramente qué datos recibe cada agente/modelo.

## 71. Performance

Overlay rápido, observers mínimos, sin layout thrashing y captura/context extraction lazy.

## 72. Framework Independence

Base universal sobre DOM; integraciones específicas añaden contexto avanzado.

# MVP Roadmap

## MVP 0.1

- Element hover
- Element selection
- Multi-select
- Prompt bubble
- DOM context
- Screenshot context
- Codex integration
- Apply change
- Hot reload detection
- Conversation history
- Undo
- Copy context

## MVP 0.2

- Source file detection
- React component detection
- Better element identity
- Persistent selection after reload
- Diff viewer
- Page issue list
- Review mode
- Fix all

## MVP 0.3

- Claude Code / additional adapters
- Git awareness
- Session history
- Before/after
- Responsive QA
- Console context
- Network context

## V1

- Stable plugin architecture
- React / Next / Vite
- Multiple coding agents
- MCP
- Review sessions
- GitHub integration
- QA reports
- Visual regression
- Team-ready export

## Future

- Autonomous visual QA
- Figma/design comparison
- Team collaboration
- PR visual reviews
- User-flow QA
- Automatic issue detection
- Design-system intelligence
- Agent routing
- Parallel fixes
- Cloud collaboration

# What NOT to Build Initially

Evitar convertirse demasiado pronto en:

- Jira replacement
- Linear replacement
- Figma replacement
- BrowserStack replacement
- Playwright replacement
- full IDE
- general coding agent
- project management platform

El wedge debe permanecer simple:

> **Point at UI → tell agent what to change.**

# North Star UX

```text
Click → Type → Enter → Done
```

El producto debe sentirse más rápido que cambiar al coding agent y explicarle manualmente el contexto.

# Product Metrics

Principal:

```text
Time from visual issue noticed → verified fix
```

Objetivo aspiracional para cambios simples: menos de 30 segundos.

Secundarias:

- Time to first successful change
- Agent success rate
- Undo rate
- Average feedback-to-fix time
- Interactions per session
- Issues resolved per session
- Percentage requiring manual context

# Distribution / Viral Loop

```text
User uses tool
→ Gets impressive result
→ Tool creates before/after
→ User shares
→ Developer sees workflow
→ Installs project
→ Creates another result
```

`Generate Demo`, `Share Change` y `Before / After` también son mecanismos de distribución.

# README Hero

```text
# [Product Name]

Stop describing UI changes to coding agents.

Point at your UI instead.

[DEMO GIF]

Click any element.
Describe the change.
Your coding agent handles the rest.
```

Después:

```bash
npx product-name
```

# Positioning

Evitar empezar con:

> AI-powered QA platform.

Preferir:

> **Point at your UI. Tell your coding agent what to change.**

Alternativa:

> **Stop describing UI bugs to coding agents.**

Descripción técnica:

> **An open-source visual feedback layer for AI coding agents.**

# Demo Strategy

## Demo 1 — Single Element

```text
localhost → click button → "make this full width" → agent edits → hot reload → done
```

Ideal: 8–15 segundos.

## Demo 2 — Multi-select

```text
select 3 cards → "make these consistent" → agent edits → cards normalize
```

## Demo 3 — Persistent Conversation

```text
select card → "remove border" → done
select again → "actually add a subtle shadow" → done
```

## Demo 4 — QA Mode

```text
review page → mark issues → Fix All → agent processes → review changes
```

# Long-term Product Thesis

Hoy:

```text
Human → Text prompt → Agent → Code
```

Para frontend:

```text
Human
→ Visual selection
→ DOM
→ Component
→ Source
→ Screenshot
→ Natural language
→ Agent
```

La herramienta puede ser la capa que transforma intención visual en contexto útil para coding agents.

# Product Principle

> **Don't make the human explain context the computer can already observe.**

Si el sistema puede saber qué elemento señalaste, dónde está, qué componente lo genera, qué archivo lo contiene, cómo se ve, qué estilos tiene, qué errores produjo y qué cambios anteriores hiciste, el usuario no debería explicarlo manualmente.

# Ultimate Vision

```text
Visual Prompting
→ Visual Editing
→ Visual Debugging
→ Visual QA
→ Collaborative Review
→ Agentic QA
```

El producto empieza resolviendo:

> "Estoy viendo algo que quiero cambiar y no quiero ir al chat a explicarle al agente dónde está."

Y puede evolucionar hacia:

> **The visual interface between software and coding agents.**

# The Rule

Cada feature nueva debería responder:

> **¿Reduce la cantidad de contexto que el humano tiene que explicarle manualmente al agente?**

La experiencia central debe permanecer:

```text
SEE IT
↓
POINT AT IT
↓
SAY WHAT YOU WANT
↓
DONE
```
