import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  assignProductAttribute,
  listAvailableProductAttributes,
  listProductAttributeAssignments,
  removeProductAttributeAssignment,
  updateProductAttributeAssignment,
  type ProductAttributeAssignment,
  type ProductAttributeRef,
} from "../../services/catalog/productAttributeRepository";
type Props = {
  productId: number;
  readOnly: boolean;
  onError: (message: string) => void;
};
export function ProductAttributesPanel({
  productId,
  readOnly,
  onError,
}: Props) {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProductAttributeAssignment[]>([]);
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
  async function load(cid = companyId!) {
    try {
      const [r, a] = await Promise.all([
        listProductAttributeAssignments(productId),
        listAvailableProductAttributes(cid, productId),
      ]);
      setRows(r);
      setAvailable(a);
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los atributos del artículo.",
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
        e instanceof Error ? e.message : "No se pudo asignar el atributo.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function toggle(row: ProductAttributeAssignment) {
    if (readOnly) return;
    try {
      await updateProductAttributeAssignment(row.assignment_id, {
        required: !row.required,
      });
      await load();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "No se pudo actualizar el atributo.",
      );
    }
  }
  async function remove(row: ProductAttributeAssignment) {
    if (readOnly) return;
    if (
      !window.confirm(
        `¿Quitar el atributo ${row.code} del artículo? El atributo del catálogo no se eliminará.`,
      )
    )
      return;
    try {
      await removeProductAttributeAssignment(row.assignment_id);
      await load();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "No se pudo quitar el atributo.",
      );
    }
  }
  return (
    <section id="producto-atributos" className="panel product-profile-anchor">
      <div className="panel-head">
        <div>
          <h2>Atributos configurables</h2>
          <p>
            Define qué atributos del catálogo estarán disponibles al configurar
            este artículo. No modifica el catálogo de atributos.
          </p>
        </div>
        <span className="result-count">{rows.length} asignados</span>
      </div>
      {!readOnly && (
        <div className="characteristic-inline-editor">
          <div className="form-grid">
            <label className="wide">
              Atributo
              <select
                value={selected ?? ""}
                onChange={(e) =>
                  setSelected(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Seleccionar atributo…</option>
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
                <strong>Obligatorio</strong>
                <small>
                  La configuración del artículo deberá aportar un valor.
                </small>
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
                {saving ? "Guardando…" : "Asignar atributo"}
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
              <th>Atributo</th>
              <th>Tipo</th>
              <th>Obligatorio</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    No hay atributos configurables asignados a este artículo.
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.assignment_id}>
                  <td>{r.sort_order + 1}</td>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.data_type}</td>
                  <td>
                    {readOnly ? (
                      "—"
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => toggle(r)}
                      >
                        {r.required ? "Sí" : "No"}
                      </button>
                    )}
                  </td>
                  <td>
                    <span
                      className={`status ${r.active ? "active" : "inactive"}`}
                    >
                      {r.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    {!readOnly && (
                      <button
                        type="button"
                        className="icon-action danger"
                        title="Quitar atributo"
                        onClick={() => remove(r)}
                      >
                        <Trash2 size={15} />
                      </button>
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
