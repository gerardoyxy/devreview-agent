# Apariencia y criterio visual

Lectura del diseño: herramienta de revisión para desarrolladores, sobria, legible y configurable.
Diales adaptados: `DESIGN_VARIANCE=3`, `MOTION_INTENSITY=2`, `VISUAL_DENSITY=6`.

Se aplicó [Taste Skill](https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill),
incorporada en `.agents/skills/taste-skill/SKILL.md` con su licencia MIT. Su alcance original
excluye dashboards y flujos de producto; por eso se adaptaron principios de contraste,
tipografía, consistencia, estados reales y revisión responsive, sin adoptar una estructura
de landing page ni cambiar TypeScript/Shadow DOM por un framework.

Se conservaron la identidad verde, la navegación por cola, las métricas reales, el selector
de agente y las pestañas Conversation/Changes/History. La revisión mejora legibilidad,
contraste y consistencia de superficies. El acento verde es un valor inicial editable.

## Contrato de apariencia v1

- 18 roles de color en cada paleta: page, surface, elevated, text, muted, border, accent,
  onAccent, accentSoft, success, successSoft, danger, dangerSoft, warning, warningSoft,
  info, infoSoft y backdrop. Valores `#RRGGBB`.
- `mode`: light, dark o system. Modo sistema sigue cambios del sistema operativo.
- `fonts`: body, heading y mono. Familia local con fallbacks o fuente WOFF/WOFF2 subida.
- `fontSize`: 12 a 20 px. `radius`: 0 a 24 px, conservando círculos funcionales.
- Hasta tres fuentes subidas, 1 MiB combinado. Se guardan con el tema en SQLite y se
  incluyen en la exportación; no hay servicios externos de fuentes.

El editor previsualiza sin persistir hasta Save. Cancel/Escape descartan la previsualización.
Los errores de red permanecen visibles y el borrador se conserva. Importar valida formato y
fuentes antes de previsualizar. Reset restaura los valores iniciales como borrador.

Los avisos de contraste comparan texto/superficie, texto secundario/superficie, texto/acento
y texto/página, usando 4.5:1 como referencia para texto normal. No certifican todas las
combinaciones posibles de un tema personalizado. Las elecciones del usuario tienen prioridad.

Los estilos del overlay se limitan a su contenedor y Shadow DOM. Las fuentes subidas se
registran con nombres propios de DevReview, sin sustituir familias de la aplicación huésped.
La interfaz respeta reduced-motion y usa controles nativos y foco visible.
