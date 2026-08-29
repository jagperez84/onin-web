# onin-web

Migración web del ERP de escritorio "Toldos" (Java Swing + Hibernate) para un negocio de fabricación e instalación de toldos y lona. React + TypeScript (Vite) + Supabase/Postgres.

## Reglas de UI (armonización)

La app se auditó y armonizó visualmente en varias fases (ver historial de commits "UI harmonization Fase N"). Estas reglas son el resultado de ese trabajo y se aplican a **todo código nuevo**, no solo al que ya se corrigió:

### Estructura de página
- Cabecera de listado/detalle: `.page-head` (o `.quotation-detail-head` en detalle) con `eyebrow` + `h1` + descripción a la izquierda, acciones a la derecha.
- En pantallas de detalle, el bloque de acciones va **dentro de la cabecera** (`.quotation-actions-toolbar`), nunca suelto en otro punto de la página.
- Botones: siempre `.primary-button` / `.secondary-button` / `.danger-button` (definidos en `src/styles/theme.css`). No crear sistemas de botones propios por módulo (`.btn`, `.primary-btn`, etc.).
- Dentro de un grupo de acciones, el botón secundario/Cancelar va a la izquierda del primario.
- Tablas: `.table-panel > table`, nunca reinventar `th`/`td` a mano por módulo.
- Estado vacío ("sin resultados") en una tarjeta o sección: `.empty-state` con icono + `<strong>` + `<span>`. En una fila de tabla ("cargando…"), usar solo texto plano en el `<td>`, sin envolver en `.empty-state` ni `.loading-block` (ambas son para reemplazar el contenido de una página o panel completo, no una fila).
- Carga de página/panel completo: `.loading-block` con texto simple (p. ej. `Cargando pedido…`).
- Pastilla de estado activo/inactivo: siempre `.status active`/`.status inactive`. No crear variantes locales (`*-status-pill`); estados intermedios tipo "borrado" se colapsan en `inactive`.

### Modales
Sistema único en `theme.css`, no crear otro por módulo (antes había 5 sistemas paralelos casi idénticos: `lona-modal-*`, `sales-order-modal-*`, `otd-modal-*`, `otd-nested-modal-*`, `status-modal-card`/`email-modal-card`/etc.):
- `.modal-backdrop` — overlay fijo a pantalla completa, centra el contenido.
- `.modal-card` — la tarjeta. Ancho por defecto 600px; modificadores `.sm` (460px), `.lg` (860px), `.xl` (~1180px) para diálogos más grandes.
- `.modal-header` — cabecera con borde inferior. El título puede ir suelto (`<h2>`/`<h3>` + `<p>` directamente dentro) o envuelto en `.modal-title-wrap` (con icono via `.modal-icon-badge.primary/warning/success/danger/neutral`) cuando hay un badge de icono junto al título.
- `.close-btn` — botón de cerrar (X) sin borde. Para un botón de cerrar con marco de 34-36px, `.icon-link` (definido en `sales-order.css`, también reutilizable) sigue siendo válido; no forzar uno u otro, pero no inventar un tercero.
- `.modal-body` — contenido con padding y scroll propio si hace falta.
- `.modal-actions-footer` — fila de botones alineada a la derecha, con borde superior. Los formularios dentro de un modal usan `.form-group` (definido en `quotation.css`, ya reutilizable) para label+input.
- Un modal con contenido muy particular (visor de PDF a tamaño fijo, documento imprimible de una sola columna) puede seguir usando su propia clase para la tarjeta en vez de `.modal-card` — pero el backdrop (`.modal-backdrop`) es siempre el mismo.

### Confirmaciones destructivas
Nunca usar `window.confirm()` / `confirm()` nativo — no se puede estilizar y es inconsistente con el resto de la app. Usar `confirmDialog({ title, message?, danger?, confirmLabel?, cancelLabel? })` de `src/components/ui/ConfirmDialog.tsx` (devuelve `Promise<boolean>`, hay que `await`-earlo desde una función `async`). El host (`<ConfirmDialogHost/>`) ya está montado una vez en `App.tsx`; no hay que montarlo de nuevo en cada pantalla. Usar `danger: true` para acciones destructivas (borrar, cancelar) — pinta el icono y el botón de confirmar en rojo.

### Colores de estado (pastillas)
No hardcodear hex para pastillas de estado (presupuesto, pedido, hoja de trabajo, medición, movimiento de stock...). Usar los fondos ya existentes `var(--canvas-stripe)` (neutro), `var(--primary-soft)` (info/en curso), `var(--success-soft)` (éxito/completado), `var(--accent-soft)` (aviso/pendiente), `var(--danger-soft)` (cancelado/rechazado), junto con los tokens de texto/borde dedicados: `--status-info-fg/border`, `--status-success-fg/border`, `--status-warning-fg/border`, `--status-danger-fg/border` (para neutro, `var(--muted)`/`var(--border)`). Para una pastilla simple de estado con estos 5 tonos ya existe la clase reutilizable `.status-pill` (+ `.neutral`/`.success`/`.warning`/`.danger`; sin modificador = info) en `theme.css` — úsala en vez de crear una clase nueva salvo que el diseño ya tenga su propio sistema de pastillas por estado (p. ej. `.quotation-status`), en cuyo caso basta con que sus reglas por estado usen estos mismos tokens en lugar de hex propios.

### Iconos (lucide-react)
- Editar: **`Edit3`** (no `Pencil`).
- Consultar / ver (solo lectura): `Eye`.
- Eliminar / borrar: `Trash2`.
- Añadir / crear: `Plus`.
- Descargar un archivo (PDF u otro): **`Download`**.
- Ver/previsualizar un documento sin descargarlo: `FileText`.
- Imprimir: **`Printer`** — reservado únicamente para un botón que dispare `window.print()` de verdad. Si el botón en realidad genera y descarga un PDF (jsPDF, etc.), es `Download`, no `Printer`, aunque el texto diga "imprimir".
- No dejar imports de iconos sin usar.

### Texto
- Puntos suspensivos: usar siempre el carácter tipográfico `…`, nunca `...` literal (`Cargando…`, `Guardando…`, `Buscando…`).

## Desarrollo

- Antes de dar por terminado un cambio: `npx tsc -b` y `npm run build` deben pasar limpios.
- El CSS se compila en un único bundle global — cualquier clase sin prefijo de módulo (p. ej. `.icon-button`, `.line-cut-status`) es efectivamente global aunque se defina en el CSS de un módulo concreto. Revisar colisiones antes de introducir una clase nueva sin prefijo.
- Migraciones SQL: idempotentes cuando sea razonable (`create or replace`, `drop ... if exists` + `create`, `add column if not exists`), porque el usuario las aplica manualmente desde el editor SQL de Supabase (a veces desde el móvil, donde solo se ejecuta el bloque seleccionado).
