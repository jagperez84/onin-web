import { useEffect, useState } from "react";
import { Edit3, Palette, Plus, RotateCcw, Search, Trash2, Undo2, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import { Toast } from "../../components/ui/Toast";
import {
  searchColorReferenceLibrary,
  listColorFinishes,
  listColorMaster,
  createColorFromReference,
  createCustomColor,
  updateColorMaster,
  markColorForDeletion,
  restoreColorFromDeletion,
  CUSTOM_COLOR_STANDARDS,
  type ColorReferenceItem,
  type ColorFinish,
  type ColorMaster,
  type ColorStandard,
} from "../../services/catalog/colorRepository";
import "./color-master.css";

type StateFilter = "active" | "inactive" | "deleted" | "all";

const STANDARD_LABELS: Record<string, string> = {
  RAL_CLASSIC: "RAL Classic",
  RAL_DESIGN: "RAL Design",
  RAL_EFFECT: "RAL Effect",
  PANTONE: "Pantone",
  NCS: "NCS",
  FABRICANTE: "Fabricante",
  PERSONALIZADO: "Personalizado",
  TEXTIL_CATALOGO: "Catálogo textil",
};

function standardLabel(standard: string | null): string | null {
  if (!standard) return null;
  return STANDARD_LABELS[standard] ?? standard;
}

const DEFAULT_HEX = "#94A3B8";

export function ColorMasterPage() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [colors, setColors] = useState<ColorMaster[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<StateFilter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [creating, setCreating] = useState(false);
  const [editingColor, setEditingColor] = useState<ColorMaster | null>(null);

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."));
  }, []);

  useEffect(() => {
    if (companyId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, state]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      setColors(await listColorMaster(companyId, search, state));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el Maestro de Colores.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(c: ColorMaster) {
    if (
      !(await confirmDialog({
        title: `¿Marcar "${c.name}" para borrado?`,
        message: "No se eliminará físicamente y podrá recuperarse. Si el color está en uso en alguna Característica, seguirá viéndose en los registros existentes.",
        danger: true,
      }))
    )
      return;
    try {
      await markColorForDeletion(c.id);
      setToast(`Color "${c.code}" marcado para borrado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar para borrado.");
    }
  }

  async function handleRestore(c: ColorMaster) {
    try {
      await restoreColorFromDeletion(c.id);
      setToast(`Color "${c.code}" recuperado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recuperar el color.");
    }
  }

  return (
    <div className="module-page catalog-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / ARTÍCULOS</div>
          <h1>Maestro de Colores</h1>
          <p>
            Colores reutilizables por las Características de familias y artículos. Búscalos en la biblioteca RAL o
            crea uno personalizado, de fabricante o de catálogo textil.
          </p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)} disabled={!companyId}>
          <Plus size={16} /> Nuevo color
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="catalog-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Buscar por código, nombre o proveedor…"
          />
        </div>
        <select value={state} onChange={(e) => setState(e.target.value as StateFilter)} aria-label="Estado">
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="deleted">Marcados para borrado</option>
          <option value="all">Todos</option>
        </select>
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={15} /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="loading-block">Cargando Maestro de Colores…</div>
      ) : colors.length === 0 ? (
        <div className="empty-state">
          <Palette size={32} />
          <strong>Sin colores</strong>
          <span>Añade el primero desde la biblioteca RAL o como color personalizado.</span>
        </div>
      ) : (
        <div className="color-master-grid">
          {colors.map((c) => {
            const deleted = !!c.deletedAt;
            return (
              <div className="color-card" key={c.id}>
                <div
                  className={`color-card-swatch ${c.hex ? "" : "no-hex"}`}
                  style={c.hex ? { background: c.hex } : undefined}
                />
                <div className="color-card-body">
                  <div className="color-card-code">{c.code}</div>
                  <div className="color-card-name">{c.name}</div>
                  <div className="color-card-badges">
                    {standardLabel(c.standard) && <span className="color-card-badge">{standardLabel(c.standard)}</span>}
                    {c.finish && <span className="color-card-badge">{c.finish.name}</span>}
                  </div>
                  <div className="color-card-footer">
                    <span className={`status ${deleted ? "inactive" : c.active ? "active" : "inactive"}`}>
                      {deleted ? "Borrado" : c.active ? "Activo" : "Inactivo"}
                    </span>
                    <div className="item-actions">
                      {!deleted && (
                        <button className="icon-action" title="Editar" onClick={() => setEditingColor(c)}>
                          <Edit3 size={14} />
                        </button>
                      )}
                      {deleted ? (
                        <button className="icon-action" title="Recuperar" onClick={() => handleRestore(c)}>
                          <Undo2 size={14} />
                        </button>
                      ) : (
                        <button className="icon-action danger" title="Marcar para borrado" onClick={() => handleDelete(c)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && companyId && (
        <ColorCreateModal
          companyId={companyId}
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setToast(`Color "${c.code}" añadido al Maestro.`);
            void load();
          }}
        />
      )}

      {editingColor && (
        <ColorEditModal
          color={editingColor}
          onClose={() => setEditingColor(null)}
          onSaved={(c) => {
            setEditingColor(null);
            setToast(`Color "${c.code}" actualizado.`);
            void load();
          }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

function ColorCreateModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: number;
  onClose: () => void;
  onCreated: (c: ColorMaster) => void;
}) {
  const [tab, setTab] = useState<"library" | "custom">("library");
  const [finishes, setFinishes] = useState<ColorFinish[]>([]);

  // Camino 1: biblioteca RAL
  const [refQuery, setRefQuery] = useState("");
  const [refResults, setRefResults] = useState<ColorReferenceItem[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [selectedRef, setSelectedRef] = useState<ColorReferenceItem | null>(null);
  const [refFinishId, setRefFinishId] = useState<number | null>(null);
  const [refCode, setRefCode] = useState("");
  const [refName, setRefName] = useState("");
  const [refNameTouched, setRefNameTouched] = useState(false);

  // Camino 2: personalizado
  const [customStandard, setCustomStandard] = useState<ColorStandard>("PERSONALIZADO");
  const [customHex, setCustomHex] = useState(DEFAULT_HEX);
  const [customCode, setCustomCode] = useState("");
  const [customName, setCustomName] = useState("");
  const [customSupplierCode, setCustomSupplierCode] = useState("");
  const [customFinishId, setCustomFinishId] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listColorFinishes()
      .then((rows) => {
        setFinishes(rows);
        const liso = rows.find((f) => f.code === "LISO");
        if (liso) setRefFinishId(liso.id);
      })
      .catch(() => setFinishes([]));
  }, []);

  useEffect(() => {
    if (tab !== "library") return;
    setRefLoading(true);
    const timer = window.setTimeout(() => {
      searchColorReferenceLibrary(refQuery)
        .then((rows) => setRefResults(rows))
        .catch(() => setRefResults([]))
        .finally(() => setRefLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [refQuery, tab]);

  function selectReference(item: ColorReferenceItem) {
    setSelectedRef(item);
    setRefCode(item.code);
    setRefName(item.name);
    setRefNameTouched(false);
  }

  useEffect(() => {
    if (!selectedRef || refNameTouched) return;
    const finish = finishes.find((f) => f.id === refFinishId);
    const suffix = finish && finish.code !== "LISO" ? ` ${finish.name.toLowerCase()}` : "";
    setRefName(`${selectedRef.name}${suffix}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refFinishId]);

  async function confirmFromLibrary() {
    if (!selectedRef) return;
    if (!refCode.trim() || !refName.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createColorFromReference({
        companyId,
        referenceId: selectedRef.id,
        standard: selectedRef.standard as ColorStandard,
        finishId: refFinishId,
        code: refCode,
        name: refName,
        hex: selectedRef.hex,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo añadir el color.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCustom() {
    if (!customCode.trim() || !customName.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createCustomColor({
        companyId,
        code: customCode,
        name: customName,
        hex: customHex,
        standard: customStandard,
        supplierCode: customSupplierCode || null,
        finishId: customFinishId,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el color.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card lg" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <h2>Nuevo color</h2>
            <p>Búscalo en la biblioteca RAL o créalo a mano si no tiene un estándar público.</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="color-master-tabs">
          <button type="button" className={`color-master-tab ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>
            Desde biblioteca RAL
          </button>
          <button type="button" className={`color-master-tab ${tab === "custom" ? "active" : ""}`} onClick={() => setTab("custom")}>
            Personalizado / proveedor
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="inline-error">{error}</div>}

          {tab === "library" ? (
            <>
              <div className="form-group">
                <label>
                  <span>Buscar por código o nombre</span>
                  <input
                    value={refQuery}
                    onChange={(e) => setRefQuery(e.target.value)}
                    placeholder="Ej. 7016 o antracita"
                    autoFocus
                  />
                </label>
              </div>

              <div className="color-ref-results">
                {refLoading ? (
                  <div className="empty-cell">Buscando…</div>
                ) : refResults.length === 0 ? (
                  <div className="empty-cell">{refQuery.trim() ? "Sin resultados." : "Escribe para buscar en RAL Classic."}</div>
                ) : (
                  refResults.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`color-ref-item ${selectedRef?.id === item.id ? "selected" : ""}`}
                      onClick={() => selectReference(item)}
                    >
                      <span className="color-swatch-chip" style={{ background: item.hex }} />
                      <span className="color-ref-item-text">
                        <span className="color-ref-item-code">RAL {item.code}</span>
                        <span className="color-ref-item-name">{item.name}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedRef && (
                <>
                  <div className="color-selected-preview">
                    <span className="color-swatch-chip" style={{ background: selectedRef.hex }} />
                    <span>
                      RAL {selectedRef.code} · {selectedRef.name} · <code>{selectedRef.hex}</code>
                    </span>
                  </div>

                  <div className="form-group">
                    <label>
                      <span>Acabado</span>
                      <select value={refFinishId ?? ""} onChange={(e) => setRefFinishId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Sin acabado especificado</option>
                        {finishes.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="form-group">
                    <label>
                      <span>Código en Onin</span>
                      <input value={refCode} onChange={(e) => setRefCode(e.target.value)} />
                    </label>
                    <label>
                      <span>Nombre en Onin</span>
                      <input
                        value={refName}
                        onChange={(e) => {
                          setRefName(e.target.value);
                          setRefNameTouched(true);
                        }}
                      />
                    </label>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="form-group">
                <label>
                  <span>Color</span>
                  <div className="color-hex-input-row">
                    <input type="color" value={customHex} onChange={(e) => setCustomHex(e.target.value)} />
                    <input
                      type="text"
                      value={customHex}
                      onChange={(e) => setCustomHex(e.target.value)}
                      placeholder="#94A3B8"
                    />
                  </div>
                </label>
              </div>

              <div className="form-group">
                <label>
                  <span>Sistema</span>
                  <select value={customStandard} onChange={(e) => setCustomStandard(e.target.value as ColorStandard)}>
                    {CUSTOM_COLOR_STANDARDS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Código / referencia del proveedor</span>
                  <input
                    value={customSupplierCode}
                    onChange={(e) => setCustomSupplierCode(e.target.value)}
                    placeholder="Ej. Blanco Gaviota, Sauleda 2143…"
                  />
                </label>
              </div>

              <div className="form-group">
                <label>
                  <span>Código en Onin *</span>
                  <input value={customCode} onChange={(e) => setCustomCode(e.target.value)} />
                </label>
                <label>
                  <span>Nombre en Onin *</span>
                  <input value={customName} onChange={(e) => setCustomName(e.target.value)} />
                </label>
              </div>

              <div className="form-group">
                <label>
                  <span>Acabado</span>
                  <select value={customFinishId ?? ""} onChange={(e) => setCustomFinishId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Sin acabado especificado</option>
                    {finishes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          {tab === "library" ? (
            <button type="button" className="primary-button" disabled={!selectedRef || saving} onClick={confirmFromLibrary}>
              {saving ? "Añadiendo…" : "Añadir al Maestro Onin"}
            </button>
          ) : (
            <button type="button" className="primary-button" disabled={saving} onClick={confirmCustom}>
              {saving ? "Guardando…" : "Guardar color"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorEditModal({
  color,
  onClose,
  onSaved,
}: {
  color: ColorMaster;
  onClose: () => void;
  onSaved: (c: ColorMaster) => void;
}) {
  const [finishes, setFinishes] = useState<ColorFinish[]>([]);
  const [code, setCode] = useState(color.code);
  const [name, setName] = useState(color.name);
  const [hex, setHex] = useState(color.hex ?? DEFAULT_HEX);
  const [supplierCode, setSupplierCode] = useState(color.supplierCode ?? "");
  const [finishId, setFinishId] = useState<number | null>(color.finishId);
  const [active, setActive] = useState(color.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listColorFinishes()
      .then(setFinishes)
      .catch(() => setFinishes([]));
  }, []);

  async function save() {
    if (!code.trim() || !name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updateColorMaster(color.id, {
        code,
        name,
        hex: hex || null,
        active,
        finishId,
        supplierCode: supplierCode || null,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el color.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <h2>Editar color</h2>
            {color.baseReference && (
              <p>
                {standardLabel(color.baseReference.standard)} {color.baseReference.code} · {color.baseReference.name}
              </p>
            )}
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="inline-error">{error}</div>}

          <div className="form-group">
            <label>
              <span>Color</span>
              <div className="color-hex-input-row">
                <input type="color" value={hex || DEFAULT_HEX} onChange={(e) => setHex(e.target.value)} />
                <input type="text" value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#94A3B8" />
              </div>
            </label>
          </div>

          <div className="form-group">
            <label>
              <span>Código *</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label>
              <span>Nombre *</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <div className="form-group">
            <label>
              <span>Acabado</span>
              <select value={finishId ?? ""} onChange={(e) => setFinishId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Sin acabado especificado</option>
                {finishes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Código / referencia del proveedor</span>
              <input value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} />
            </label>
          </div>

          <div className="form-group">
            <label>
              <span>Estado</span>
              <select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </label>
          </div>
        </div>

        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary-button" disabled={saving} onClick={save}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
