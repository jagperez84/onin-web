import { useEffect, useState } from "react";
import { Edit3, Palette, Plus, Save, Trash2, Undo2, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import {
  assignProductAttribute,
  listAvailableProductAttributes,
  listProductCharacteristicConfiguration,
  removeProductCharacteristicConfiguration,
  restoreProductCharacteristicConfiguration,
  updateProductAttributeAssignment,
  materializeFamilyAttributeForProduct,
  listProductAttributeScales,
  createProductAttributeScale,
  updateProductAttributeScale,
  markProductAttributeScaleForDeletion,
  listProductAttributeColorExclusions,
  excludeProductAttributeColor,
  includeProductAttributeColor,
  type ProductAttributeRef,
  type ProductCharacteristicConfiguration,
  type ProductAttributeScale,
  type ProductAttributeColorExclusion,
} from "../../services/catalog/productAttributeRepository";
import {
  listAttributeColors,
  type AttributeColor,
} from "../../services/catalog/attributeColorRepository";

type Props = {
  productId: number;
  readOnly: boolean;
  onError: (message: string) => void;
};

export function ProductFamilyCharacteristicsPanel({
  productId,
  readOnly,
  onError,
}: Props) {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProductCharacteristicConfiguration[]>([]);
  const [available, setAvailable] = useState<ProductAttributeRef[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  // Precio y colores de una característica materializada en este artículo (fase 3)
  const [priceModalFor, setPriceModalFor] =
    useState<ProductCharacteristicConfiguration | null>(null);
  const [modalColorOptions, setModalColorOptions] = useState<AttributeColor[]>([]);
  const [modalExclusions, setModalExclusions] = useState<
    ProductAttributeColorExclusion[]
  >([]);
  const [modalScaled, setModalScaled] = useState(false);
  const [modalPvp, setModalPvp] = useState("");
  const [modalScales, setModalScales] = useState<ProductAttributeScale[]>([]);
  const [modalScaleForm, setModalScaleForm] = useState<{
    editing: number | null;
    dimension_1: string;
    dimension_2: string;
    price: string;
  } | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) =>
        onError(
          e instanceof Error
            ? e.message
            : "No se pudo obtener la empresa activa.",
        ),
      );
  }, [onError]);
  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, productId]);
  useEffect(() => {
    if (readOnly) {
      setSelected(null);
      setRequired(false);
    }
  }, [readOnly]);
  async function load(cid = companyId!) {
    try {
      const [effective, availableAttributes] = await Promise.all([
        listProductCharacteristicConfiguration(productId),
        listAvailableProductAttributes(cid, productId),
      ]);
      setRows(effective);
      setAvailable(availableAttributes);
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar las características del artículo.",
      );
    }
  }
  async function add() {
    if (readOnly || !selected) return;
    setSaving(true);
    try {
      await assignProductAttribute(productId, selected, required, rows.length);
      setSelected(null);
      setRequired(false);
      await load();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "No se pudo añadir la característica.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggleRequired(row: ProductCharacteristicConfiguration) {
    if (readOnly || row.excluded) return;
    try {
      if (row.source === "family")
        await assignProductAttribute(
          productId,
          row.attribute_id,
          !row.required,
          row.sort_order,
        );
      else
        await updateProductAttributeAssignment(row.assignment_id, {
          required: !row.required,
        });
      await load();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudo actualizar la característica.",
      );
    }
  }
  async function remove(row: ProductCharacteristicConfiguration) {
    if (readOnly) return;
    const action =
      row.source === "family"
        ? "excluirla de este artículo"
        : "quitarla del artículo";
    if (
      !(await confirmDialog({
        title: `¿Quieres ${action}?`,
        message: "La definición de la familia no se modificará.",
        danger: true,
      }))
    )
      return;
    try {
      await removeProductCharacteristicConfiguration(row);
      await load();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudo modificar la característica.",
      );
    }
  }
  async function restore(row: ProductCharacteristicConfiguration) {
    if (readOnly) return;
    try {
      await restoreProductCharacteristicConfiguration(row);
      await load();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudo recuperar la característica.",
      );
    }
  }
  async function openPriceModalFor(row: ProductCharacteristicConfiguration) {
    setModalError("");
    let target = row;
    if (row.source === "family") {
      setModalBusy(true);
      try {
        await materializeFamilyAttributeForProduct(productId, row.attribute_id);
        await load();
        const refreshed = await listProductCharacteristicConfiguration(productId);
        const found = refreshed.find((r) => r.attribute_id === row.attribute_id);
        if (!found) throw new Error("No se pudo personalizar la característica.");
        target = found;
      } catch (e) {
        setModalError(
          e instanceof Error ? e.message : "No se pudo personalizar la característica.",
        );
        setModalBusy(false);
        return;
      }
      setModalBusy(false);
    }
    setPriceModalFor(target);
    setModalScaled(target.scaled);
    setModalPvp(target.pvp == null ? "" : String(target.pvp));
    setModalScaleForm(null);
    try {
      const [colors, exclusions, scales] = await Promise.all([
        listAttributeColors(target.attribute_id),
        listProductAttributeColorExclusions(target.assignment_id),
        listProductAttributeScales(target.assignment_id),
      ]);
      setModalColorOptions(colors);
      setModalExclusions(exclusions);
      setModalScales(scales);
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "No se pudo cargar la información.",
      );
    }
  }

  function closePriceModal() {
    setPriceModalFor(null);
    setModalColorOptions([]);
    setModalExclusions([]);
    setModalScales([]);
    setModalScaleForm(null);
    setModalError("");
  }

  async function toggleModalColor(colorId: number) {
    if (!priceModalFor) return;
    const existing = modalExclusions.find((x) => x.color_id === colorId);
    setModalBusy(true);
    setModalError("");
    try {
      if (existing) await includeProductAttributeColor(existing.id);
      else await excludeProductAttributeColor(priceModalFor.assignment_id, colorId);
      setModalExclusions(await listProductAttributeColorExclusions(priceModalFor.assignment_id));
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "No se pudo actualizar el color.");
    } finally {
      setModalBusy(false);
    }
  }

  async function toggleModalScaled(next: boolean) {
    if (!priceModalFor) return;
    setModalBusy(true);
    setModalError("");
    try {
      await updateProductAttributeAssignment(priceModalFor.assignment_id, { scaled: next });
      setModalScaled(next);
      await load();
    } catch (e) {
      setModalError(
        e instanceof Error ? e.message : "No se pudo cambiar el tipo de precio.",
      );
    } finally {
      setModalBusy(false);
    }
  }

  async function saveModalPvp() {
    if (!priceModalFor) return;
    const value = modalPvp.trim() === "" ? null : Number(modalPvp);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setModalError("El precio debe ser un número válido.");
      return;
    }
    setModalBusy(true);
    setModalError("");
    try {
      await updateProductAttributeAssignment(priceModalFor.assignment_id, { pvp: value });
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "No se pudo guardar el precio.");
    } finally {
      setModalBusy(false);
    }
  }

  function startModalScale(row?: ProductAttributeScale) {
    setModalScaleForm({
      editing: row?.id ?? 0,
      dimension_1: row ? String(row.dimension_1) : "",
      dimension_2: row?.dimension_2 != null ? String(row.dimension_2) : "",
      price: row ? String(row.price) : "",
    });
  }

  async function saveModalScale() {
    if (!priceModalFor || !modalScaleForm) return;
    const dimension_1 = Number(modalScaleForm.dimension_1);
    const dimension_2 =
      modalScaleForm.dimension_2.trim() === "" ? null : Number(modalScaleForm.dimension_2);
    const price = Number(modalScaleForm.price);
    if (!Number.isFinite(dimension_1) || dimension_1 < 0) {
      setModalError("La dimensión 1 debe ser un número válido.");
      return;
    }
    if (dimension_2 != null && (!Number.isFinite(dimension_2) || dimension_2 < 0)) {
      setModalError("La dimensión 2 debe ser un número válido.");
      return;
    }
    setModalBusy(true);
    setModalError("");
    try {
      if (modalScaleForm.editing === 0) {
        await createProductAttributeScale(priceModalFor.assignment_id, {
          dimension_1,
          dimension_2,
          price,
        });
      } else if (modalScaleForm.editing !== null) {
        await updateProductAttributeScale(modalScaleForm.editing, {
          dimension_1,
          dimension_2,
          price,
        });
      }
      setModalScales(await listProductAttributeScales(priceModalFor.assignment_id));
      setModalScaleForm(null);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "No se pudo guardar el escalado.");
    } finally {
      setModalBusy(false);
    }
  }

  async function removeModalScale(id: number) {
    if (!priceModalFor) return;
    if (!(await confirmDialog({ title: "¿Eliminar este tramo de escalado?", danger: true })))
      return;
    setModalBusy(true);
    try {
      await markProductAttributeScaleForDeletion(id);
      setModalScales(await listProductAttributeScales(priceModalFor.assignment_id));
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "No se pudo eliminar el tramo.");
    } finally {
      setModalBusy(false);
    }
  }

  return (
    <section
      id="producto-caracteristicas"
      className="panel product-profile-anchor"
    >
      <div className="panel-head">
        <div>
          <h2>Características</h2>
          <p>
            Se heredan de la familia. Puedes añadir, excluir y modificar
            características sin cambiar la definición de la familia.
          </p>
        </div>
        <span className="result-count">
          {rows.filter((r) => !r.excluded).length} configuradas
        </span>
      </div>
      {!readOnly && (
        <div className="characteristic-inline-editor">
          <div className="form-grid">
            <label className="wide">
              Añadir característica
              <select
                value={selected ?? ""}
                onChange={(e) =>
                  setSelected(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Seleccionar característica…</option>
                {available.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name} ({a.data_type})
                  </option>
                ))}
              </select>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
              />
              <span>
                <strong>Obligatoria</strong>
                <small>La configuración deberá aportar un valor.</small>
              </span>
            </label>
            <div className="actions">
              <button
                type="button"
                className="primary-button"
                disabled={!selected || saving}
                onClick={add}
              >
                <Plus size={15} />
                {saving ? "Guardando…" : "Añadir"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Código</th>
              <th>Característica</th>
              <th>Tipo</th>
              <th>Origen</th>
              <th>Obligatoria</th>
              <th>Precio / Colores</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className="empty-state">
                    No hay características configuradas. Las de la familia
                    aparecerán aquí automáticamente.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.attribute_id}-${row.source}`}>
                  <td>{row.sort_order + 1}</td>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.data_type}</td>
                  <td>{row.source === "family" ? "Familia" : "Artículo"}</td>
                  <td>
                    {readOnly || row.excluded ? (
                      <span>{row.required ? "Sí" : "No"}</span>
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => toggleRequired(row)}
                      >
                        {row.required ? "Sí" : "No"}
                      </button>
                    )}
                  </td>
                  <td>
                    {row.excluded ? (
                      "—"
                    ) : (
                      <button
                        type="button"
                        className="secondary-button compact"
                        disabled={readOnly || modalBusy}
                        onClick={() => openPriceModalFor(row)}
                        title={
                          row.source === "family"
                            ? "Heredado de la familia — personalizar en este artículo"
                            : "Gestionar colores y precio de esta característica"
                        }
                      >
                        <Palette size={13} />
                        {row.source === "family"
                          ? "Heredado · Personalizar"
                          : row.scaled
                            ? "Escalado"
                            : row.pvp != null
                              ? `${row.pvp.toFixed(2)} €`
                              : "Sin precio"}
                      </button>
                    )}
                  </td>
                  <td>
                    <span
                      className={`status ${row.excluded ? "inactive" : row.active ? "active" : "inactive"}`}
                    >
                      {row.excluded
                        ? "Excluida"
                        : row.active
                          ? "Activa"
                          : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    {!readOnly && row.excluded ? (
                      <button
                        className="icon-action"
                        title="Recuperar característica heredada"
                        onClick={() => restore(row)}
                      >
                        <Undo2 size={15} />
                      </button>
                    ) : (
                      !readOnly && (
                        <button
                          className="icon-action danger"
                          title={
                            row.source === "family"
                              ? "Excluir del artículo"
                              : "Quitar del artículo"
                          }
                          onClick={() => remove(row)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {priceModalFor && (
        <div className="modal-backdrop" onClick={closePriceModal}>
          <div className="modal-card lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Colores y precio: {priceModalFor.name}</h3>
                <p>
                  {priceModalFor.source === "family"
                    ? "Se ha copiado el precio y los colores efectivos de la familia. A partir de ahora evolucionan de forma independiente."
                    : "Precio y colores propios de este artículo."}
                </p>
              </div>
              <button className="close-btn" onClick={closePriceModal} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {modalError && <div className="inline-error">{modalError}</div>}

              <div className="form-section-title">Colores</div>
              {modalColorOptions.length === 0 ? (
                <p className="form-help">
                  Esta característica no tiene colores asociados a nivel de sistema.
                </p>
              ) : (
                <>
                  <div className="check-grid">
                    {modalColorOptions.map((ac) => {
                      const excluded = modalExclusions.some((x) => x.color_id === ac.color_id);
                      return (
                        <label key={ac.id} className="inline-check">
                          <input
                            type="checkbox"
                            checked={!excluded}
                            disabled={modalBusy}
                            onChange={() => toggleModalColor(ac.color_id)}
                          />
                          <span>
                            {ac.color?.code} · {ac.color?.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="form-help">
                    Desmarca los colores que no apliquen a este artículo.
                  </p>
                </>
              )}

              <div className="form-section-title" style={{ marginTop: "18px" }}>
                Precio
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={modalScaled}
                  disabled={modalBusy}
                  onChange={(e) => toggleModalScaled(e.target.checked)}
                />
                <span>Escalado por cantidad</span>
              </label>

              {!modalScaled ? (
                <div className="form-grid" style={{ marginTop: "10px" }}>
                  <label className="wide">
                    PVP
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={modalPvp}
                        onChange={(e) => setModalPvp(e.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={modalBusy}
                        onClick={saveModalPvp}
                      >
                        Guardar
                      </button>
                    </div>
                  </label>
                </div>
              ) : (
                <>
                  <div
                    style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}
                  >
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => startModalScale()}
                    >
                      <Plus size={13} /> Añadir tramo
                    </button>
                  </div>
                  {modalScaleForm && (
                    <div className="form-grid" style={{ marginBottom: "10px" }}>
                      <label>
                        Dimensión 1
                        <input
                          type="number"
                          value={modalScaleForm.dimension_1}
                          onChange={(e) =>
                            setModalScaleForm({ ...modalScaleForm, dimension_1: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Dimensión 2 (opcional)
                        <input
                          type="number"
                          value={modalScaleForm.dimension_2}
                          onChange={(e) =>
                            setModalScaleForm({ ...modalScaleForm, dimension_2: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Precio
                        <input
                          type="number"
                          step="0.01"
                          value={modalScaleForm.price}
                          onChange={(e) =>
                            setModalScaleForm({ ...modalScaleForm, price: e.target.value })
                          }
                        />
                      </label>
                      <div className="actions wide">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setModalScaleForm(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={modalBusy}
                          onClick={saveModalScale}
                        >
                          <Save size={14} /> Guardar tramo
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>Dim. 1</th>
                          <th>Dim. 2</th>
                          <th>Precio</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalScales.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="empty">
                              Sin tramos definidos.
                            </td>
                          </tr>
                        ) : (
                          modalScales.map((s) => (
                            <tr key={s.id}>
                              <td>{s.dimension_1}</td>
                              <td>{s.dimension_2 ?? "—"}</td>
                              <td>{s.price.toFixed(2)} €</td>
                              <td>
                                <div className="item-actions">
                                  <button
                                    className="icon-action"
                                    title="Editar"
                                    onClick={() => startModalScale(s)}
                                  >
                                    <Edit3 size={14} />
                                  </button>
                                  <button
                                    className="icon-action danger"
                                    title="Eliminar"
                                    onClick={() => removeModalScale(s.id)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions-footer">
              <button className="secondary-button" onClick={closePriceModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
