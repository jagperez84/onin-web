import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Ruler,
  Sliders,
  ExternalLink,
  RotateCcw,
  Layers,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Hash,
} from "lucide-react";
import {
  loadMasterProductConfiguration,
  type MasterProductConfiguration,
} from "../../services/catalog/productConfigurationService";
import "./product.css";
import "./product-fixes.css";

type Props = {
  productId: number;
  onError?: (msg: string) => void;
};

export function ProductInheritedMeasurementPanel({ productId, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<MasterProductConfiguration | null>(null);

  const loadData = useCallback(async () => {
    if (!productId || isNaN(productId)) return;
    setLoading(true);
    try {
      const data = await loadMasterProductConfiguration(productId);
      setConfig(data);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Error al cargar dimensiones heredadas.";
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [productId, onError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const measurementType = config?.measurementType;
  const dimensions = config?.dimensions || [];
  const family = config?.family;
  const product = config?.product;
  const unitsMap = config?.unitsMap;

  // Resolving result unit
  const resultUnit =
    measurementType?.result_unit_id && unitsMap
      ? unitsMap.get(measurementType.result_unit_id)
      : null;

  const isDirect = Boolean(product?.measurement_type_id);
  const isInheritedFromFamily = Boolean(!isDirect && family?.measurement_type_id);

  const unitLabel = (unitId?: number | null) => {
    if (!unitId || !unitsMap) return "Sin unidad";
    const u = unitsMap.get(unitId);
    if (!u) return `Unidad ${unitId}`;
    return u.name && u.name !== u.code ? `${u.code} · ${u.name}` : u.code;
  };

  return (
    <section
      id="producto-dimensiones"
      className="panel product-profile-anchor product-inherited-measurement-panel"
    >
      <div className="panel-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Ruler size={18} className="text-primary" />
            <h2 style={{ margin: 0 }}>Dimensiones heredadas</h2>
          </div>
          <p>
            Estructura dimensional y variables heredadas desde Tipo de Medida
            asociadas al artículo o su familia.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {measurementType && (
            <>
              {isDirect ? (
                <span className="tag-badge primary" title="Asignación directa">
                  <Sliders size={12} style={{ marginRight: "4px" }} />
                  Asignado al artículo
                </span>
              ) : isInheritedFromFamily ? (
                <span
                  className="tag-badge info"
                  title={`Heredado de la familia ${family?.code} · ${family?.name}`}
                >
                  <Layers size={12} style={{ marginRight: "4px" }} />
                  Heredado de Familia: {family?.code}
                </span>
              ) : null}

              <span
                className={`status ${measurementType.active ? "active" : "inactive"}`}
                style={{ fontSize: "11px", padding: "3px 8px" }}
              >
                {measurementType.active ? "Tipo Activo" : "Tipo Inactivo"}
              </span>
            </>
          )}

          <Link
            to="/configuracion/tipos-medida"
            className="secondary-button compact"
            title="Ir a gestión de Tipos de Medida"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
          >
            <Sliders size={13} /> Tipos de medida <ExternalLink size={12} />
          </Link>

          <button
            type="button"
            className="secondary-button compact"
            onClick={() => void loadData()}
            title="Recargar configuración de medidas"
            disabled={loading}
            style={{ padding: "6px 8px" }}
          >
            <RotateCcw size={13} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-notice" style={{ padding: "24px" }}>
          <p>Cargando información dimensional…</p>
        </div>
      ) : !measurementType ? (
        <div
          className="empty-notice"
          style={{
            padding: "24px",
            background: "var(--canvas-stripe, #fbfaf8)",
            borderRadius: "8px",
            border: "1px dashed var(--border, #d8d1c3)",
            textAlign: "center",
          }}
        >
          <AlertCircle
            size={32}
            style={{ margin: "0 auto 10px", color: "var(--muted)" }}
          />
          <h3 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: 600 }}>
            Sin Tipo de Medida asociado
          </h3>
          <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: "13px" }}>
            Este artículo no tiene un tipo de medida asignado directamente ni heredado de su
            familia {family ? `(${family.code} · ${family.name})` : ""}.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            <Link to="/configuracion/tipos-medida" className="secondary-button compact">
              <Sliders size={14} /> Consultar catálogo de tipos de medida
            </Link>
          </div>
        </div>
      ) : (
        <div className="product-measurement-content" style={{ display: "grid", gap: "16px" }}>
          {/* Tarjetas informativas de cabecera */}
          <div className="commercial-summary" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <span>TIPO DE MEDIDA</span>
              <strong title={measurementType.name}>
                {measurementType.code} · {measurementType.name}
              </strong>
            </div>

            <div>
              <span>Nº DE DIMENSIONES</span>
              <strong>
                {measurementType.dimension_count || dimensions.length}{" "}
                {(measurementType.dimension_count || dimensions.length) === 1
                  ? "dimensión"
                  : "dimensiones"}
              </strong>
            </div>

            <div>
              <span>CÁLCULO / FÓRMULA</span>
              <strong>
                {measurementType.formula ? (
                  <code style={{ fontSize: "12px", color: "var(--primary)" }}>
                    fx: {measurementType.formula}
                  </code>
                ) : (
                  measurementType.calculation_type || "Estándar"
                )}
              </strong>
            </div>

            <div>
              <span>UNIDAD DE RESULTADO</span>
              <strong>
                {resultUnit
                  ? `${resultUnit.code} · ${resultUnit.name}`
                  : "Sin unidad de resultado"}{" "}
                <small style={{ color: "var(--muted)", fontWeight: "normal" }}>
                  ({measurementType.result_decimals ?? 2} dec.)
                </small>
              </strong>
            </div>
          </div>

          {/* Caja con la estructura exacta de Dimensiones de entrada */}
          <div
            className="panel"
            style={{
              padding: "16px",
              background: "var(--surface, #ffffff)",
              border: "1px solid var(--border, #d8d1c3)",
              borderRadius: "8px",
            }}
          >
            <div style={{ marginBottom: "12px" }}>
              <h3
                style={{
                  margin: "0 0 4px",
                  fontSize: "13px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text, #1f2937)",
                }}
              >
                DIMENSIONES DE ENTRADA ({dimensions.length})
              </h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                Las variables {dimensions.map((d) => d.code).join(", ")} se introducen en las
                líneas de presupuesto y alimentan la fórmula de cálculo del artículo.
              </p>
            </div>

            {dimensions.length === 0 ? (
              <div
                style={{
                  padding: "14px",
                  background: "var(--canvas-stripe)",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "var(--muted)",
                }}
              >
                No hay variables dimensionales configuradas (artículo de 0 dimensiones / unidad
                simple).
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  className="catalog-table"
                  style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}
                >
                  <thead>
                    <tr style={{ background: "var(--canvas-stripe)", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px", width: "45px", fontWeight: 700 }}>#</th>
                      <th style={{ padding: "8px 12px", width: "160px", fontWeight: 700 }}>
                        Variable
                      </th>
                      <th style={{ padding: "8px 12px", minWidth: "180px", fontWeight: 700 }}>
                        Etiqueta / Nombre
                      </th>
                      <th style={{ padding: "8px 12px", minWidth: "180px", fontWeight: 700 }}>
                        Unidad
                      </th>
                      <th style={{ padding: "8px 12px", width: "100px", fontWeight: 700 }}>
                        Decimales
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimensions.map((dim, idx) => (
                      <tr
                        key={dim.id ?? idx}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              background: "var(--canvas-stripe, #f1f5f9)",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {dim.dimension_number || idx + 1}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              background: "var(--canvas-stripe, #f1f5f9)",
                              border: "1px solid var(--border, #e2e8f0)",
                              borderRadius: "6px",
                              fontFamily: "var(--font-mono, monospace)",
                              fontWeight: 700,
                              fontSize: "13px",
                              color: "var(--text, #0f172a)",
                            }}
                          >
                            {dim.code}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                          {dim.name || "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              background: "#ffffff",
                              border: "1px solid var(--border, #d8d1c3)",
                              borderRadius: "6px",
                              color: "var(--text, #334155)",
                              fontSize: "12px",
                            }}
                          >
                            {unitLabel(dim.unit_id)}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              background: "var(--canvas-stripe, #f1f5f9)",
                              borderRadius: "4px",
                              fontSize: "12px",
                              fontWeight: 600,
                            }}
                          >
                            {dim.decimals ?? 2}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
