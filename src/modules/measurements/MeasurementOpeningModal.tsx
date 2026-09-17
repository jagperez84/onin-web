// UI de captura de un "hueco" durante una medición — ver ROADMAP.md y
// supabase/migrations/20260921340000_measurement_openings.sql. Wireado a
// datos reales vía measurementOpeningRepository.ts /
// MeasurementOpeningsSection.tsx.
//
// Pensado para el móvil en campo, no para oficina: pocos pasos, sin
// desglose de precio ni despiece — eso ya existe en el configurador de
// presupuestos y no pertenece aquí. Un hueco puede albergar más de un
// producto (p. ej. dos toldos independientes en el mismo balcón), de ahí
// draft.products en vez de un único otdId/dimensions por hueco.

import { useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Plus,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import "./measurements.css";

export type OpeningDimensionField = {
  code: string;
  name: string;
  unitLabel: string | null;
  unitId: number | null;
  sortOrder: number;
  value: number | null;
};

export type InstallationConditionField = {
  code: string;
  name: string;
  dataType: "BOOLEAN" | "TEXT" | "NUMBER" | "SELECT";
  unitLabel: string | null;
  options?: { code: string; name: string }[];
  value: string | number | boolean | null;
};

export type OpeningOtdOption = { id: number; code: string; name: string; templateType: string | null };

const classificationLabels: Record<string, string> = {
  TOLDO: "Toldo",
  PERGOLA: "Pérgola",
  CORTINA: "Cortina / Estor",
  "": "Genérico",
};

export type OpeningPhotoDraft = {
  path: string;
  previewUrl: string;
};

export type OpeningProductDraft = {
  key: string;
  otdId: number | null;
  dimensions: OpeningDimensionField[];
};

export type MeasurementOpeningDraft = {
  label: string;
  products: OpeningProductDraft[];
  conditions: InstallationConditionField[];
  observations: string;
};

export function newOpeningProductDraft(): OpeningProductDraft {
  return { key: crypto.randomUUID(), otdId: null, dimensions: [] };
}

type ProductRowProps = {
  index: number;
  product: OpeningProductDraft;
  otds: OpeningOtdOption[];
  canRemove: boolean;
  onChange: (next: OpeningProductDraft) => void;
  onRemove: () => void;
};

function ProductRow({ index, product, otds, canRemove, onChange, onRemove }: ProductRowProps) {
  const selectedOtd = otds.find((o) => o.id === product.otdId) ?? null;
  const [classificationFilter, setClassificationFilter] = useState<string>(
    selectedOtd ? selectedOtd.templateType ?? "" : "__all__",
  );
  const classifications = Array.from(new Set(otds.map((o) => o.templateType ?? "")));
  const visibleOtds = classificationFilter === "__all__" ? otds : otds.filter((o) => (o.templateType ?? "") === classificationFilter);

  function setDimensionValue(code: string, value: number | null) {
    onChange({
      ...product,
      dimensions: product.dimensions.map((d) => (d.code === code ? { ...d, value } : d)),
    });
  }

  return (
    <div className="opening-product-card">
      <div className="opening-product-head">
        <strong>Producto {index + 1}</strong>
        {canRemove && (
          <button type="button" className="icon-link" onClick={onRemove} aria-label="Quitar este producto" title="Quitar este producto">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="opening-product-select-row">
        <div className="form-group">
          <label>Clasificación <span className="label-hint">para acotar la lista</span></label>
          <select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)}>
            <option value="__all__">Todas</option>
            {classifications.map((c) => (
              <option key={c} value={c}>{classificationLabels[c] ?? c}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Producto sugerido (OTD) <span className="label-hint">puedes dejarlo sin decidir</span></label>
          <select
            value={product.otdId ?? ""}
            onChange={(e) => onChange({ ...product, otdId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Sin decidir todavía</option>
            {visibleOtds.map((o) => (
              <option key={o.id} value={o.id}>{o.code} · {o.name}</option>
            ))}
          </select>
        </div>
      </div>

      {product.dimensions.length > 0 && (
        <div className="opening-dimension-grid">
          {product.dimensions.map((dim) => (
            <div className="form-group" key={dim.code}>
              <label>
                {dim.name}
                {dim.unitLabel && <span className="label-hint">({dim.unitLabel})</span>}
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                placeholder="0.0"
                value={dim.value ?? ""}
                onChange={(e) => setDimensionValue(dim.code, e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  isOpen: boolean;
  openingNumber: number;
  totalOpenings: number;
  draft: MeasurementOpeningDraft;
  otds: OpeningOtdOption[];
  photos: OpeningPhotoDraft[];
  saving: boolean;
  onChange: (draft: MeasurementOpeningDraft) => void;
  onAddPhoto: () => void;
  onRemovePhoto: (path: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function MeasurementOpeningModal({
  isOpen,
  openingNumber,
  totalOpenings,
  draft,
  otds,
  photos,
  saving,
  onChange,
  onAddPhoto,
  onRemovePhoto,
  onCancel,
  onSave,
}: Props) {
  const [conditionsExpanded, setConditionsExpanded] = useState(false);

  if (!isOpen) return null;

  function setConditionValue(
    code: string,
    value: string | number | boolean | null,
  ) {
    onChange({
      ...draft,
      conditions: draft.conditions.map((c) =>
        c.code === code ? { ...c, value } : c,
      ),
    });
  }

  function updateProduct(index: number, next: OpeningProductDraft) {
    onChange({ ...draft, products: draft.products.map((p, i) => (i === index ? next : p)) });
  }

  function removeProduct(index: number) {
    onChange({ ...draft, products: draft.products.filter((_, i) => i !== index) });
  }

  function addProduct() {
    onChange({ ...draft, products: [...draft.products, newOpeningProductDraft()] });
  }

  async function removePhoto(path: string) {
    if (
      !(await confirmDialog({
        title: "¿Eliminar esta fotografía?",
        danger: true,
      }))
    )
      return;
    onRemovePhoto(path);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card xl">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon-badge primary">
              <Ruler size={18} />
            </span>
            <div>
              <h3>Hueco {openingNumber} de {totalOpenings}</h3>
              <p>Productos, medidas y condiciones de instalación de este punto.</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onCancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Etiqueta del hueco <span className="label-hint">opcional</span></label>
            <input
              type="text"
              placeholder="Ej. Salón, Terraza, Balcón cocina…"
              value={draft.label}
              onChange={(e) => onChange({ ...draft, label: e.target.value })}
            />
          </div>

          <h4 className="opening-section-title">
            Productos de este hueco <span className="label-hint">puede haber más de uno — p. ej. dos toldos</span>
          </h4>
          <div className="opening-product-list">
            {draft.products.map((product, idx) => (
              <ProductRow
                key={product.key}
                index={idx}
                product={product}
                otds={otds}
                canRemove={draft.products.length > 1}
                onChange={(next) => updateProduct(idx, next)}
                onRemove={() => removeProduct(idx)}
              />
            ))}
          </div>
          <button type="button" className="secondary-button opening-add-product-btn" onClick={addProduct}>
            <Plus size={16} /> Añadir otro producto
          </button>

          {draft.conditions.length > 0 && (
            <div className="opening-conditions-block">
              <button
                type="button"
                className="opening-section-toggle"
                onClick={() => setConditionsExpanded((v) => !v)}
              >
                {conditionsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                Condiciones de instalación
                <span className="label-hint">
                  {draft.conditions.filter((c) => c.value !== null && c.value !== "").length}
                  {" "}de {draft.conditions.length} rellenas
                </span>
              </button>

              {conditionsExpanded && (
                <div className="opening-dimension-grid">
                  {draft.conditions.map((cond) => {
                    if (cond.dataType === "BOOLEAN") {
                      return (
                        <label className="checkbox-field" key={cond.code}>
                          <span>{cond.name}</span>
                          <input
                            type="checkbox"
                            checked={cond.value === true}
                            onChange={(e) => setConditionValue(cond.code, e.target.checked)}
                          />
                        </label>
                      );
                    }
                    if (cond.dataType === "SELECT") {
                      return (
                        <div className="form-group" key={cond.code}>
                          <label>{cond.name}</label>
                          <select
                            value={(cond.value as string) ?? ""}
                            onChange={(e) => setConditionValue(cond.code, e.target.value || null)}
                          >
                            <option value="">Sin especificar</option>
                            {(cond.options ?? []).map((opt) => (
                              <option key={opt.code} value={opt.code}>{opt.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    if (cond.dataType === "NUMBER") {
                      return (
                        <div className="form-group" key={cond.code}>
                          <label>
                            {cond.name}
                            {cond.unitLabel && <span className="label-hint">({cond.unitLabel})</span>}
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={(cond.value as number) ?? ""}
                            onChange={(e) =>
                              setConditionValue(
                                cond.code,
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      );
                    }
                    return (
                      <div className="form-group" key={cond.code}>
                        <label>{cond.name}</label>
                        <input
                          type="text"
                          value={(cond.value as string) ?? ""}
                          onChange={(e) => setConditionValue(cond.code, e.target.value || null)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <h4 className="opening-section-title">Fotos de este hueco</h4>
          <div className="measurement-photo-actions">
            <button type="button" className="primary-button" onClick={onAddPhoto}>
              <Camera size={16} /> Tomar foto
            </button>
            <button type="button" className="secondary-button" onClick={onAddPhoto}>
              <ImagePlus size={16} /> Galería
            </button>
          </div>
          {photos.length === 0 ? (
            <div className="empty-state">
              <Camera size={22} />
              <strong>Sin fotos todavía</strong>
              <span>Añade al menos una foto de este hueco.</span>
            </div>
          ) : (
            <div className="measurement-photo-grid">
              {photos.map((photo) => (
                <figure key={photo.path} className="measurement-photo-card">
                  <img src={photo.previewUrl} alt={`Foto del hueco ${openingNumber}`} loading="lazy" />
                  <figcaption>
                    <button type="button" title="Eliminar fotografía" onClick={() => void removePhoto(photo.path)}>
                      <Trash2 size={15} />
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="form-group">
            <label>Observaciones de este hueco <span className="label-hint">opcional</span></label>
            <textarea
              rows={3}
              placeholder="Cualquier detalle que no encaje en los campos anteriores…"
              value={draft.observations}
              onChange={(e) => onChange({ ...draft, observations: e.target.value })}
            />
          </div>
        </div>

        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={onSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar hueco"}
          </button>
        </div>
      </div>
    </div>
  );
}
