import { useEffect, useState } from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  assignProductAttribute,
  listAvailableProductAttributes,
  listProductCharacteristicConfiguration,
  removeProductCharacteristicConfiguration,
  restoreProductCharacteristicConfiguration,
  updateProductAttributeAssignment,
  type ProductAttributeRef,
  type ProductCharacteristicConfiguration,
} from "../../services/catalog/productAttributeRepository";

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
      !window.confirm(
        `¿Quieres ${action}? La definición de la familia no se modificará.`,
      )
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
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
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
    </section>
  );
}
