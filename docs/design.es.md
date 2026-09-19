# Apariencia y criterio visual

La dirección azul «Reference desk» fue elegida para la landing y la aplicación.
Se aplicó [Impeccable](https://github.com/pbakaus/impeccable): azul ultramarino,
superficies claras frías, tinta azul oscuro, tipografía Archivo y bordes finos.
El sistema completo está en [DESIGN.md](../DESIGN.md).

La landing demuestra el flujo con un navegador y una conversación conectados. En la
aplicación, la misma identidad se adapta a una cola compacta, diálogos de revisión y
editores de contexto/apariencia. El dashboard y el overlay comparten Conversation,
Changes, History y Context used. La marca visible es NudgeThis; los comandos, contratos
e integración NudgeThis conservan su compatibilidad.

Archivo se sirve localmente: 400/700 en los módulos de aplicación y 400/700/900 en la
landing, con licencia OFL. Las fuentes de la aplicación están incluidas como bytes en
el bundle y se registran con FontFace; no requieren solicitudes externas. La aplicación
usa azul como valor inicial editable y respeta los temas que ya se habían guardado.

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
registran con nombres propios de NudgeThis, sin sustituir familias de la aplicación huésped.
La interfaz respeta reduced-motion y usa controles nativos y foco visible.
