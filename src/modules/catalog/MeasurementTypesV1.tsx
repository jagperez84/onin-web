import { useEffect, useMemo, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Copy,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { LookupSelect } from "../../components/LookupSelect";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import { listUnits, type Unit } from "../../services/catalog/unitRepository";
import {
  listMeasurementTypes,
  upsertMeasurementType,
  type MeasurementDimension,
  type MeasurementType,
} from "../../services/catalog/measurementTypeRepository";
import "./catalog.css";
import "./MeasurementTypesV1.css";

const MAX_DIMENSIONS = 5;

const emptyDimension = (
  n: number,
  unitId: number | null = null,
): MeasurementDimension => ({
  dimension_number: n,
  code: `DIM${n}`,
  name:
    n === 1
      ? "Ancho"
      : n === 2
        ? "Alto"
        : n === 3
          ? "Profundidad"
          : `Dimensión ${n}`,
  unit_id: unitId,
  decimals: 2,
});

const emptyType = (): MeasurementType => ({
  code: "",
  name: "",
  dimension_count: 0,
  result_unit_id: null,
  result_decimals: 2,
  calculation_type: "",
  formula: "",
  active: true,
  dimensions: [],
});

function sameForm(a: MeasurementType, b: MeasurementType) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function MeasurementTypesV1() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rows, setRows] = useState<MeasurementType[]>([]);
  const [form, setForm] = useState<MeasurementType>(emptyType());
  const [originalForm, setOriginalForm] =
    useState<MeasurementType>(emptyType());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const dirty = editing && !sameForm(form, originalForm);
  const unitOptions = useMemo(
    () =>
      units.map((u) => ({
        id: u.id,
        code: u.code,
        label: `${u.code} · ${u.name}`,
      })),
    [units],
  );
  const unitLabel = (id?: number | null) =>
    units.find((u) => u.id === id)?.name ?? "Sin unidad";
  const unitCode = (id?: number | null) =>
    units.find((u) => u.id === id)?.code ?? "";

  useEffect(() => {
    getActiveCompanies()
      .then(async (companies) => {
        const id = companies[0]?.id ?? null;
        setCompanyId(id);
        if (id) {
          const loadedUnits = await listUnits(id);
          setUnits(loadedUnits);
        }
      })
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo cargar la configuración de medidas.",
        ),
      );
  }, []);

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, search]);

  async function load() {
    if (!companyId) return;
    try {
      setRows(await listMeasurementTypes(companyId, search));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los tipos de medida.",
      );
    }
  }

  function openEditor(next: MeasurementType) {
    const copy = {
      ...next,
      dimensions: next.dimensions.map((d) => ({ ...d })),
    };
    setForm(copy);
    setOriginalForm({
      ...copy,
      dimensions: copy.dimensions.map((d) => ({ ...d })),
    });
    setEditing(true);
    setError("");
    setSuccessMessage("");
  }

  function startNew() {
    const defaultUnit =
      units.find(
        (u) => u.code.toLowerCase() === "mm" || u.code.toLowerCase() === "m",
      )?.id ??
      units[0]?.id ??
      null;
    const blank = emptyType();
    blank.dimensions = [
      emptyDimension(1, defaultUnit),
      emptyDimension(2, defaultUnit),
    ];
    openEditor(blank);
  }

  function startEdit(row: MeasurementType) {
    openEditor(row);
  }

  function duplicateRow(row: MeasurementType) {
    const duplicated: MeasurementType = {
      ...row,
      id: undefined,
      code: `${row.code}_COPIA`.slice(0, 30),
      name: `${row.name} (Copia)`,
      dimensions: row.dimensions.map((d, i) => ({
        ...d,
        id: undefined,
        measurement_type_id: undefined,
        dimension_number: i + 1,
      })),
    };
    openEditor(duplicated);
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await confirmDialog({
        title: "¿Descartar los cambios sin guardar?",
        message: "Hay cambios sin guardar en el tipo de medida.",
        danger: true,
      }))
    )
      return;
    setEditing(false);
    setError("");
  }

  function changeCount(count: number) {
    const safeCount = Math.max(0, Math.min(MAX_DIMENSIONS, count));
    const defaultUnit = form.dimensions[0]?.unit_id ?? units[0]?.id ?? null;
    setForm((f) => ({
      ...f,
      dimension_count: safeCount,
      dimensions: Array.from(
        { length: safeCount },
        (_, i) => f.dimensions[i] ?? emptyDimension(i + 1, defaultUnit),
      ),
    }));
  }

  function applyPreset(preset: "1d" | "2d" | "3d") {
    const mmUnit =
      units.find((u) => u.code.toLowerCase() === "mm")?.id ??
      units[0]?.id ??
      null;
    const mUnit =
      units.find((u) => u.code.toLowerCase() === "m")?.id ??
      units[0]?.id ??
      null;
    const m2Unit =
      units.find((u) => u.code.toLowerCase() === "m2")?.id ??
      units[0]?.id ??
      null;
    const m3Unit =
      units.find((u) => u.code.toLowerCase() === "m3")?.id ??
      units[0]?.id ??
      null;

    if (preset === "1d") {
      setForm((f) => ({
        ...f,
        dimension_count: 1,
        calculation_type: "LONGITUD",
        result_unit_id: mUnit,
        result_decimals: 2,
        formula: "DIM1 / 1000",
        dimensions: [
          {
            dimension_number: 1,
            code: "DIM1",
            name: "Longitud",
            unit_id: mmUnit,
            decimals: 2,
          },
        ],
      }));
    } else if (preset === "2d") {
      setForm((f) => ({
        ...f,
        dimension_count: 2,
        calculation_type: "SUPERFICIE",
        result_unit_id: m2Unit,
        result_decimals: 2,
        formula: "DIM1 * DIM2 / 1000000",
        dimensions: [
          {
            dimension_number: 1,
            code: "DIM1",
            name: "Ancho",
            unit_id: mmUnit,
            decimals: 2,
          },
          {
            dimension_number: 2,
            code: "DIM2",
            name: "Alto",
            unit_id: mmUnit,
            decimals: 2,
          },
        ],
      }));
    } else if (preset === "3d") {
      setForm((f) => ({
        ...f,
        dimension_count: 3,
        calculation_type: "VOLUMEN",
        result_unit_id: m3Unit,
        result_decimals: 3,
        formula: "DIM1 * DIM2 * DIM3 / 1000000000",
        dimensions: [
          {
            dimension_number: 1,
            code: "DIM1",
            name: "Ancho",
            unit_id: mmUnit,
            decimals: 2,
          },
          {
            dimension_number: 2,
            code: "DIM2",
            name: "Alto",
            unit_id: mmUnit,
            decimals: 2,
          },
          {
            dimension_number: 3,
            code: "DIM3",
            name: "Profundidad",
            unit_id: mmUnit,
            decimals: 2,
          },
        ],
      }));
    }
  }

  function updateDimension(
    index: number,
    patch: Partial<MeasurementDimension>,
  ) {
    setForm((f) => ({
      ...f,
      dimensions: f.dimensions.map((d, i) =>
        i === index ? { ...d, ...patch } : d,
      ),
    }));
  }

  function insertIntoFormula(token: string) {
    setForm((f) => {
      const currentFormula = f.formula ?? "";
      const spacer =
        currentFormula.length > 0 &&
        !currentFormula.endsWith(" ") &&
        !token.startsWith(" ")
          ? " "
          : "";
      return {
        ...f,
        formula: `${currentFormula}${spacer}${token} `,
      };
    });
  }

  async function save() {
    if (!companyId) {
      setError("No hay una empresa activa disponible.");
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    if (form.dimension_count < 0 || form.dimension_count > MAX_DIMENSIONS) {
      setError(
        `El número de dimensiones debe estar entre 0 y ${MAX_DIMENSIONS}.`,
      );
      return;
    }
    if (
      form.dimension_count > 0 &&
      form.dimensions.length !== form.dimension_count
    ) {
      setError(
        "La definición de dimensiones no coincide con el número indicado.",
      );
      return;
    }
    if (
      form.dimension_count > 0 &&
      form.dimensions.some(
        (d) => !d.code.trim() || !d.name.trim() || !d.unit_id,
      )
    ) {
      setError("Completa código, nombre y unidad en todas las dimensiones.");
      return;
    }
    if (
      form.dimensions.some(
        (d) =>
          !Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 6,
      )
    ) {
      setError("Los decimales de las dimensiones deben estar entre 0 y 6.");
      return;
    }
    if (
      !Number.isInteger(form.result_decimals) ||
      form.result_decimals < 0 ||
      form.result_decimals > 6
    ) {
      setError("Los decimales del resultado deben estar entre 0 y 6.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      await upsertMeasurementType(companyId, form);
      setEditing(false);
      setSuccessMessage("Tipo de medida guardado correctamente.");
      await load();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(
        message.includes("measurement_type_company_code_uk") ||
          message.includes("duplicate key")
          ? "Ya existe un tipo de medida con ese código."
          : message || "No se pudo guardar el tipo de medida.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="module-page catalog-page measurement-types-page"
      id="measurement-types-container"
    >
      <div
        className="page-head measurement-header-bar"
        id="measurement-types-head"
      >
        <div>
          <div className="eyebrow">VENTAS / CONFIGURACIÓN</div>
          <h1>Tipos de medida</h1>
          <p>
            Estructuras dimensionales, variables y fórmulas de cálculo
            reutilizables por artículos y presupuestos.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="primary-button"
            id="btn-new-measurement-type"
            onClick={startNew}
          >
            <Plus size={16} /> Nuevo tipo de medida
          </button>
        </div>
      </div>

      {error && (
        <div
          className="inline-error"
          role="alert"
          style={{ marginBottom: "16px" }}
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          className="auth-warning"
          style={{
            background: "var(--success-soft)",
            borderColor: "var(--success)",
            color: "#276749",
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} /> {successMessage}
        </div>
      )}

      <div
        className={`catalog-layout ${editing ? "has-editor" : ""}`}
        id="measurement-types-layout"
      >
        {/* Main table container spanning the screen */}
        <section
          className="panel"
          id="measurement-types-table-panel"
          style={{ width: "100%" }}
        >
          <div className="panel-head">
            <div>
              <h2>Catálogo de tipos de medida</h2>
              <p>
                Gestiona dimensiones, unidades de entrada y fórmulas de
                conversión a unidades de resultado.
              </p>
            </div>
            <span className="measurement-stats-badge">
              {rows.length}{" "}
              {rows.length === 1 ? "tipo configurado" : "tipos configurados"}
            </span>
          </div>

          <div className="measurement-toolbar">
            <div className="measurement-search-wrap">
              <div className="search-field" style={{ width: "100%" }}>
                <Search size={16} />
                <input
                  id="search-measurement-types"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, nombre o tipo de cálculo..."
                  aria-label="Buscar tipos de medida"
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear"
                    onClick={() => setSearch("")}
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <button
              className="secondary-button compact"
              onClick={load}
              title="Recargar lista"
            >
              <RotateCcw size={14} /> Actualizar
            </button>
          </div>

          <div className="catalog-table-wrap">
            <table
              className="catalog-table measurement-table"
              id="measurement-types-table"
            >
              <thead>
                <tr>
                  <th style={{ width: "130px" }}>Código</th>
                  <th style={{ minWidth: "180px" }}>Nombre</th>
                  <th style={{ minWidth: "220px" }}>Dimensiones</th>
                  <th style={{ width: "150px" }}>Cálculo / Fórmula</th>
                  <th style={{ width: "160px" }}>Resultado</th>
                  <th style={{ width: "90px" }}>Estado</th>
                  <th style={{ width: "140px", textAlign: "right" }}>
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isCurrent = editing && form.id === r.id;
                  return (
                    <tr key={r.id} className={isCurrent ? "is-editing" : ""}>
                      <td>
                        <span className="measurement-code-badge">{r.code}</span>
                      </td>
                      <td>
                        <div className="measurement-title-cell">
                          <strong>{r.name}</strong>
                          {r.calculation_type && (
                            <span className="measurement-subtitle">
                              {r.calculation_type}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {r.dimensions.length ? (
                          <div className="dimension-pill-list">
                            {r.dimensions.map((d) => (
                              <span
                                className="dimension-badge"
                                key={d.dimension_number}
                                title={`${d.code}: ${d.name} (${unitCode(d.unit_id)})`}
                              >
                                <span className="dimension-var">{d.code}</span>
                                <span>{d.name}</span>
                                <span className="dimension-unit-tag">
                                  {unitCode(d.unit_id) || "s/u"}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="dim-zero-badge">
                            0 dimensiones (unidad simple)
                          </span>
                        )}
                      </td>
                      <td>
                        {r.calculation_type && (
                          <div className="calc-type-badge">
                            {r.calculation_type}
                          </div>
                        )}
                        {r.formula ? (
                          <div className="formula-code-badge" title={r.formula}>
                            fx: {r.formula}
                          </div>
                        ) : (
                          !r.calculation_type && (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          )
                        )}
                      </td>
                      <td>
                        <div className="result-badge">
                          <span className="result-unit-name">
                            {r.result_unit_id
                              ? `${unitCode(r.result_unit_id)} · ${unitLabel(r.result_unit_id)}`
                              : "Sin unidad"}
                          </span>
                          <span className="result-unit-decimals">
                            {r.result_decimals} decimales
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`status ${r.active ? "active" : "inactive"}`}
                        >
                          {r.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div
                          className="table-actions-cell"
                          style={{ justifyContent: "flex-end" }}
                        >
                          <button
                            className="secondary-button compact"
                            onClick={() => startEdit(r)}
                            title="Editar tipo de medida"
                            aria-label={`Editar ${r.name}`}
                          >
                            <Edit3 size={13} /> Editar
                          </button>
                          <button
                            className="icon-action"
                            style={{ width: "30px", height: "30px" }}
                            onClick={() => duplicateRow(r)}
                            title="Duplicar como nuevo tipo"
                            aria-label={`Duplicar ${r.name}`}
                          >
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        {search
                          ? "No hay tipos de medida que coincidan con la búsqueda."
                          : "No hay tipos de medida definidos."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Editor panel on side / below */}
        {editing && (
          <aside
            className="panel catalog-editor"
            id="measurement-type-editor-panel"
          >
            <div className="panel-head">
              <div>
                <h2>
                  {form.id
                    ? `Editar: ${form.code || form.name}`
                    : "Nuevo tipo de medida"}
                </h2>
                <p>
                  Estructura de entrada dimensional y reglas de cálculo del
                  resultado.
                </p>
              </div>
              <button
                className="icon-action"
                onClick={closeEditor}
                title="Cerrar editor"
                aria-label="Cerrar editor"
              >
                <X size={17} />
              </button>
            </div>

            <div className="form-grid">
              <label>
                Código *
                <input
                  value={form.code}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  maxLength={30}
                  placeholder="Ej. MED_SUPERFICIE"
                  autoFocus
                />
              </label>
              <label>
                Nombre descriptivo *
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={100}
                  placeholder="Ej. Medida Superficie (m²)"
                />
              </label>

              <label>
                Nº de dimensiones
                <select
                  value={form.dimension_count}
                  onChange={(e) => changeCount(Number(e.target.value))}
                >
                  {Array.from({ length: MAX_DIMENSIONS + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n === 0
                        ? "0 dimensiones (fijo)"
                        : `${n} ${n === 1 ? "dimensión" : "dimensiones"}`}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Estado
                <select
                  value={form.active ? "1" : "0"}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.value === "1" })
                  }
                >
                  <option value="1">Activo</option>
                  <option value="0">Inactivo</option>
                </select>
              </label>

              {/* Dimensions Section */}
              {form.dimension_count > 0 && (
                <div className="wide editor-card-section">
                  <div className="editor-section-header">
                    <div className="editor-section-title">
                      Dimensiones de entrada ({form.dimension_count})
                    </div>
                    <div className="dimension-presets">
                      <button
                        type="button"
                        className="preset-chip-btn"
                        onClick={() => applyPreset("1d")}
                        title="Plantilla 1D: Longitud (mm)"
                      >
                        <Sparkles size={11} /> Preset 1D
                      </button>
                      <button
                        type="button"
                        className="preset-chip-btn"
                        onClick={() => applyPreset("2d")}
                        title="Plantilla 2D: Ancho × Alto (mm -> m²)"
                      >
                        <Sparkles size={11} /> Preset 2D (m²)
                      </button>
                      <button
                        type="button"
                        className="preset-chip-btn"
                        onClick={() => applyPreset("3d")}
                        title="Plantilla 3D: Ancho × Alto × Fondo (mm -> m³)"
                      >
                        <Sparkles size={11} /> Preset 3D (m³)
                      </button>
                    </div>
                  </div>
                  <p className="form-help">
                    Las variables <code>DIM1</code>, <code>DIM2</code>... se
                    introducen en las líneas de presupuesto y alimentan la
                    fórmula de cálculo.
                  </p>

                  <div style={{ display: "grid", gap: "8px" }}>
                    {form.dimensions.map((d, i) => (
                      <div
                        className="measurement-dimension-row"
                        key={d.dimension_number}
                      >
                        <div className="measurement-dimension-number">
                          {i + 1}
                        </div>
                        <label>
                          Variable
                          <input
                            value={d.code}
                            onChange={(e) =>
                              updateDimension(i, {
                                code: e.target.value.toUpperCase(),
                              })
                            }
                            maxLength={30}
                            placeholder={`DIM${i + 1}`}
                          />
                        </label>
                        <label>
                          Etiqueta
                          <input
                            value={d.name}
                            onChange={(e) =>
                              updateDimension(i, { name: e.target.value })
                            }
                            maxLength={100}
                            placeholder="Ej. Ancho"
                          />
                        </label>
                        <LookupSelect
                          label="Unidad"
                          required
                          compact
                          options={unitOptions}
                          value={d.unit_id ?? null}
                          onChange={(id) => updateDimension(i, { unit_id: id })}
                          placeholder="Unidad..."
                        />
                        <label>
                          Decimales
                          <input
                            type="number"
                            min={0}
                            max={6}
                            step={1}
                            value={d.decimals}
                            onChange={(e) =>
                              updateDimension(i, {
                                decimals: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Calculation and Formula Section */}
              <div className="wide editor-card-section white-bg">
                <div className="editor-section-header">
                  <div
                    className="editor-section-title"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Calculator size={14} /> Resultado y fórmula de cálculo
                  </div>
                </div>

                <div className="form-grid">
                  <LookupSelect
                    label="Unidad resultante"
                    options={unitOptions}
                    value={form.result_unit_id ?? null}
                    onChange={(id) => setForm({ ...form, result_unit_id: id })}
                    placeholder="Buscar unidad resultante (ej. m², m³, kg)..."
                  />
                  <label>
                    Tipo de cálculo
                    <input
                      value={form.calculation_type ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          calculation_type: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Ej. SUPERFICIE, VOLUMEN, LONGITUD"
                      maxLength={50}
                    />
                  </label>
                  <label className="wide">
                    Decimales del resultado
                    <input
                      type="number"
                      min={0}
                      max={6}
                      step={1}
                      value={form.result_decimals}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          result_decimals: Number(e.target.value),
                        })
                      }
                    />
                  </label>

                  <div className="wide">
                    <label>
                      Fórmula aritmética
                      <input
                        value={form.formula ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, formula: e.target.value })
                        }
                        placeholder="Ej. DIM1 * DIM2 / 1000000"
                        maxLength={500}
                        style={{ fontFamily: "var(--font-mono)" }}
                      />
                    </label>

                    {/* Quick formula builder pills */}
                    <div className="formula-builder-bar">
                      <span className="formula-builder-label">Insertar:</span>
                      {form.dimensions
                        .slice(0, form.dimension_count)
                        .map((d) => (
                          <button
                            type="button"
                            key={d.code}
                            className="formula-insert-btn"
                            onClick={() => insertIntoFormula(d.code)}
                            title={`Insertar ${d.code} (${d.name})`}
                          >
                            {d.code}
                          </button>
                        ))}
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("+")}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("-")}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("*")}
                      >
                        *
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("/")}
                      >
                        /
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("(")}
                      >
                        (
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula(")")}
                      >
                        )
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("1000")}
                      >
                        1000
                      </button>
                      <button
                        type="button"
                        className="formula-insert-btn operator"
                        onClick={() => insertIntoFormula("1000000")}
                      >
                        1000000
                      </button>
                    </div>

                    <p className="form-help">
                      Fórmula que calcula la cantidad de resultado a partir de
                      las dimensiones introducidas (p. ej. convertir mm a m²
                      dividiendo por 1.000.000).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="editor-actions">
              <button className="secondary-button" onClick={closeEditor}>
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={saving || !dirty}
                onClick={save}
                id="btn-save-measurement-type"
              >
                <Save size={15} />{" "}
                {saving ? "Guardando…" : "Guardar tipo de medida"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
