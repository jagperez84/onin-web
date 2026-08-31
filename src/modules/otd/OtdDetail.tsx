import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Edit3,
  Play,
  Ruler,
  Sliders,
  Calculator,
  Layers3,
  Compass,
  Grid,
  WandSparkles,
  CheckCircle2,
  XCircle,
  Package,
} from "lucide-react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { MessageLog } from "../../components/ui/MessageLog";
import {
  listOtdScales,
  type OtdScaleRow,
} from "../../services/otd/otdScaleRepository";
import { listUnits, type Unit } from "../../services/catalog/unitRepository";
import "./otd.css";
import "./otd-detail.css";

interface SelectionOption {
  id?: number;
  code: string;
  label: string;
  value?: string | null;
  sort_order: number;
}

interface Selection {
  id?: number;
  code: string;
  name: string;
  selection_type: "OPTION" | "NUMBER" | "TEXT" | "BOOLEAN";
  required: boolean;
  is_dimension: boolean;
  options: SelectionOption[];
  sort_order: number;
}

interface Variable {
  id?: number;
  code: string;
  name: string;
  expression: string | null;
  data_type: string;
  min_value?: number | null;
  max_value?: number | null;
  sort_order: number;
  active: boolean;
}

interface Component {
  id?: number;
  product_id: number | null;
  characteristic_id: number | null;
  characteristic_expression: string | null;
  code?: string;
  description?: string | null;
  quantity_expression: string;
  component_type: "BASIC" | "IMPROVEMENT";
  price_increment: number;
  price_increment_type: "FIXED" | "PERCENTAGE";
  active: boolean;
  sort_order: number;
  dimension_expressions?: Record<string, string>;
  product?: OninProduct | null;
}

interface Otd {
  id?: number;
  company_id?: number;
  product_id?: number | null;
  work_unit_id?: number | null;
  code: string;
  name: string;
  template_type?: string | null;
  active?: boolean;
}

interface OninProduct {
  id: number;
  code: string;
  commercial_description: string | null;
  technical_description: string | null;
  characteristics: Array<{
    id: number;
    code: string;
    description: string | null;
  }>;
  measurement_type?: {
    id: number;
    name: string;
    dimension_count: number;
    dimensions: Array<{
      id: number;
      code: string;
      name: string;
      unit?: { code: string; name: string };
    }>;
  } | null;
}

type RouteState = { success?: string };

export function OtdDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const messageLogRef = useRef<HTMLDivElement | null>(null);

  const [otd, setOtd] = useState<Otd | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [scales, setScales] = useState<OtdScaleRow[]>([]);
  const [naturalRule, setNaturalRule] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [snapshotWorkUnit, setSnapshotWorkUnit] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(
    (location.state as RouteState | null)?.success ?? "",
  );
  const [activeSection, setActiveSection] = useState("sec-identificacion");

  // Scrollspy active section watcher
  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = [
        "sec-identificacion",
        "sec-entradas",
        "sec-escalado",
        "sec-formulacion",
        "sec-componentes",
      ];
      for (const sId of sectionIds) {
        const el = document.getElementById(sId);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200 && rect.bottom >= 100) {
            setActiveSection(sId);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToSection(sId: string) {
    const el = document.getElementById(sId);
    if (el) {
      const topOffset = 110;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      setActiveSection(sId);
    }
  }

  useEffect(() => {
    if (!supabase || !id) {
      setLoading(false);
      return;
    }
    let active = true;

    (async () => {
      try {
        const oid = Number(id);
        const [o, s, v, c, loadedScales, latestVersion, unitList] =
          await Promise.all([
            supabase.from("otd").select("*").eq("id", oid).single(),
            supabase
              .from("otd_selection")
              .select("*,otd_selection_option(*)")
              .eq("otd_id", oid)
              .order("sort_order"),
            supabase
              .from("otd_variable")
              .select("*")
              .eq("otd_id", oid)
              .order("sort_order"),
            supabase
              .from("otd_component")
              .select("*")
              .eq("otd_id", oid)
              .order("sort_order"),
            listOtdScales(oid),
            supabase
              .from("otd_version")
              .select("snapshot")
              .eq("otd_id", oid)
              .order("version_number", { ascending: false })
              .limit(1)
              .maybeSingle(),
            listUnits().catch(() => [] as Unit[]),
          ]);

        if (o.error) throw o.error;
        if (unitList) setUnits(unitList);
        if (latestVersion.data?.snapshot?.work_unit) {
          setSnapshotWorkUnit(latestVersion.data.snapshot.work_unit);
        }

        const rawComps = (c.data ?? []) as any[];
        const productIds = [
          ...new Set(
            rawComps
              .map((x) => x.product_id)
              .filter((x: any) => Number.isFinite(x)),
          ),
        ];

        let productMap: Record<number, OninProduct> = {};

        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from("product")
            .select(
              `
              id, code, commercial_description, technical_description,
              measurement_type:measurement_type_id (
                id, name, dimension_count,
                dimensions:dimension ( id, code, name, unit:unit_id ( code, name ) )
              ),
              characteristics:product_characteristic ( id, code, description )
            `,
            )
            .in("id", productIds);

          if (prods) {
            for (const p of prods as any[]) {
              productMap[p.id] = {
                id: p.id,
                code: p.code,
                commercial_description: p.commercial_description,
                technical_description: p.technical_description,
                characteristics: p.characteristics ?? [],
                measurement_type: p.measurement_type ?? null,
              };
            }
          }
        }

        if (!active) return;

        setOtd(o.data as Otd);

        // Selections
        if (s.data && s.data.length > 0) {
          setSelections(
            s.data.map((x: any) => ({
              ...x,
              is_dimension: Boolean(x.is_dimension),
              options: x.otd_selection_option ?? [],
            })),
          );
        } else if (latestVersion.data?.snapshot?.selections?.length) {
          setSelections(latestVersion.data.snapshot.selections);
        }

        // Variables
        if (v.data && v.data.length > 0) {
          setVariables((v.data ?? []) as Variable[]);
        } else if (latestVersion.data?.snapshot?.variables?.length) {
          setVariables(latestVersion.data.snapshot.variables);
        }

        // Natural Rule
        if (latestVersion.data?.snapshot?.natural_rule) {
          setNaturalRule(latestVersion.data.snapshot.natural_rule);
        }

        // Scales
        if (loadedScales && loadedScales.length > 0) {
          setScales(
            loadedScales.map((sc, idx) => ({
              id: sc.id || idx + 1,
              otd_id: sc.otd_id || oid,
              dimension_1: sc.dimension_1,
              dimension_2: sc.dimension_2,
              dimension_values: sc.dimension_values || [
                sc.dimension_1,
                ...(sc.dimension_2 != null ? [sc.dimension_2] : []),
              ],
              price: sc.price,
              attribute_values: sc.attribute_values || {},
            })),
          );
        }

        // Components
        const loadedComponents = rawComps.map((x) => ({
          ...x,
          product_id: x.product_id ?? null,
          characteristic_id: x.characteristic_id ?? null,
          characteristic_expression: x.characteristic_expression ?? null,
          component_type:
            x.component_type === "IMPROVEMENT" ? "IMPROVEMENT" : "BASIC",
          price_increment: Number(x.price_increment ?? 0),
          price_increment_type:
            x.price_increment_type === "PERCENTAGE" ? "PERCENTAGE" : "FIXED",
          quantity_expression:
            x.quantity_expression !== undefined &&
            x.quantity_expression !== null
              ? String(x.quantity_expression)
              : "1",
          dimension_expressions:
            x.dimension_expressions &&
            typeof x.dimension_expressions === "object"
              ? x.dimension_expressions
              : {},
          product: x.product_id ? (productMap[x.product_id] ?? null) : null,
        })) as Component[];

        setComponents(loadedComponents);
      } catch (e: any) {
        if (active) setError(e?.message ?? "No se ha podido cargar el OTD.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (success || error) {
      requestAnimationFrame(() => {
        messageLogRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        messageLogRef.current?.focus();
      });
    }
  }, [success, error]);

  useEffect(() => {
    if (location.state)
      navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  if (loading) {
    return (
      <div className="otd-page">
        <div className="otd-empty">Cargando datos del OTD…</div>
      </div>
    );
  }

  if (error || !otd) {
    return (
      <div className="otd-page">
        <MessageLog ref={messageLogRef} error={error || "OTD no encontrado."} />
      </div>
    );
  }

  const templateLabelMap: Record<string, string> = {
    TOLDO: "Toldo",
    PERGOLA: "Pérgola",
    CORTINA: "Cortina / Estor",
  };

  const workUnit =
    units.find((u) => Number(u.id) === Number(otd.work_unit_id)) ||
    snapshotWorkUnit ||
    null;
  const workUnitSymbol = workUnit?.symbol || workUnit?.code || "";

  return (
    <div className="otd-page">
      {/* Header */}
      <div className="otd-head">
        <div>
          <NavLink to="/produccion/otd" className="otd-back">
            <ArrowLeft size={15} /> Volver a OTDs
          </NavLink>
          <div className="eyebrow">PRODUCCIÓN / OTD / #{otd.id}</div>
          <h1>{otd.name}</h1>
          <p>
            {otd.code} ·{" "}
            {templateLabelMap[otd.template_type ?? ""] ||
              otd.template_type ||
              "Configurador genérico"}
          </p>
        </div>
        <div className="otd-head-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => navigate(`/produccion/otd/${otd.id}/probar`)}
          >
            <Play size={15} /> Probar OTD
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate(`/produccion/otd/${otd.id}/editar`)}
          >
            <Edit3 size={15} /> Editar OTD
          </button>
        </div>
      </div>

      <MessageLog ref={messageLogRef} success={success} error={error} />

      {/* Sticky Top Section Navigator (Aligned with Editor) */}
      <div className="otd-editor-layout">
        <div className="otd-top-nav-wrapper">
          <nav
            className="otd-top-navigator"
            aria-label="Navegación de secciones"
          >
            <div className="otd-top-nav-items">
              <button
                type="button"
                className={`otd-top-nav-item ${activeSection === "sec-identificacion" ? "active" : ""}`}
                onClick={() => scrollToSection("sec-identificacion")}
              >
                <Compass size={15} />
                <span>1. Identificación</span>
              </button>
              <button
                type="button"
                className={`otd-top-nav-item ${activeSection === "sec-entradas" ? "active" : ""}`}
                onClick={() => scrollToSection("sec-entradas")}
              >
                <Sliders size={15} />
                <span>2. Entradas oficina</span>
                <span className="nav-badge">{selections.length}</span>
              </button>
              <button
                type="button"
                className={`otd-top-nav-item ${activeSection === "sec-escalado" ? "active" : ""}`}
                onClick={() => scrollToSection("sec-escalado")}
              >
                <Grid size={15} />
                <span>3. Escalado base</span>
                <span className="nav-badge">{scales.length}</span>
              </button>
              <button
                type="button"
                className={`otd-top-nav-item ${activeSection === "sec-formulacion" ? "active" : ""}`}
                onClick={() => scrollToSection("sec-formulacion")}
              >
                <Calculator size={15} />
                <span>4. Variables técnicas</span>
                <span className="nav-badge">{variables.length}</span>
              </button>
              <button
                type="button"
                className={`otd-top-nav-item ${activeSection === "sec-componentes" ? "active" : ""}`}
                onClick={() => scrollToSection("sec-componentes")}
              >
                <Layers3 size={15} />
                <span>5. Componentes</span>
                <span className="nav-badge">{components.length}</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="otd-editor-form-col">
          {/* SECTION 1: Identificación */}
          <section
            id="sec-identificacion"
            className="otd-card otd-section-anchor"
          >
            <div className="otd-card-head">
              <div>
                <h2>1. Identificación</h2>
                <p>Definición y datos maestros del artículo compuesto.</p>
              </div>
              <span
                className={`otd-detail-badge ${otd.active ? "active" : "inactive"}`}
              >
                {otd.active ? (
                  <>
                    <CheckCircle2 size={13} /> Activo
                  </>
                ) : (
                  <>
                    <XCircle size={13} /> Inactivo
                  </>
                )}
              </span>
            </div>
            <div className="otd-grid five">
              <div className="otd-detail-val-box">
                <label>Código</label>
                <div className="val-text">
                  <code>{otd.code}</code>
                </div>
              </div>
              <div className="otd-detail-val-box">
                <label>Nombre del Producto</label>
                <div className="val-text">
                  <strong>{otd.name}</strong>
                </div>
              </div>
              <div className="otd-detail-val-box">
                <label>Unidad de Medida</label>
                <div className="val-text">
                  <strong>
                    {workUnit
                      ? `${workUnit.name || workUnit.code}${workUnit.symbol ? ` (${workUnit.symbol})` : ""}`
                      : "No definida"}
                  </strong>
                </div>
              </div>
              <div className="otd-detail-val-box">
                <label>Tipo de Plantilla</label>
                <div className="val-text">
                  {templateLabelMap[otd.template_type ?? ""] ||
                    otd.template_type ||
                    "Genérico"}
                </div>
              </div>
              <div className="otd-detail-val-box">
                <label>ID en Base de Datos</label>
                <div className="val-text">#{otd.id}</div>
              </div>
            </div>
          </section>

          {/* SECTION 2: Entradas para oficina */}
          <section id="sec-entradas" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>2. Entradas para oficina</h2>
                <p>
                  Parámetros que el usuario de ventas / presupuestos
                  seleccionará al configurar el producto.
                </p>
              </div>
            </div>

            {selections.length === 0 ? (
              <div className="otd-empty">
                No hay entradas de oficina definidas en este OTD.
              </div>
            ) : (
              selections.map((s, si) => (
                <div className="otd-row-card" key={s.id || si}>
                  <div className="otd-row-actions">
                    <span className="row-tag">
                      <strong>
                        {si + 1}. Entrada: {s.code}
                      </strong>
                      {s.is_dimension && (
                        <span className="dimension-badge">
                          DIMENSIÓN ESCALADO
                        </span>
                      )}
                      {s.required && (
                        <span className="nav-badge">Obligatorio</span>
                      )}
                    </span>
                  </div>

                  <div className="otd-grid four">
                    <div className="otd-detail-val-box">
                      <label>Código (variable)</label>
                      <div className="val-text">
                        <code>{s.code}</code>
                      </div>
                    </div>
                    <div className="otd-detail-val-box">
                      <label>Nombre visible</label>
                      <div className="val-text">{s.name || "—"}</div>
                    </div>
                    <div className="otd-detail-val-box">
                      <label>Tipo de entrada</label>
                      <div className="val-text">{s.selection_type}</div>
                    </div>
                    <div className="otd-detail-val-box">
                      <label>Configuración</label>
                      <div className="val-text">
                        {s.required ? "Obligatorio" : "Opcional"}
                        {s.is_dimension ? " · Dimensión" : ""}
                      </div>
                    </div>
                  </div>

                  {s.selection_type === "OPTION" && (
                    <div className="otd-options-subcard">
                      <div className="otd-options-subhead">
                        <strong>
                          Opciones de selección ({s.options.length})
                        </strong>
                      </div>
                      {s.options.length === 0 ? (
                        <div className="otd-empty" style={{ padding: "12px" }}>
                          Sin opciones configuradas.
                        </div>
                      ) : (
                        <table className="otd-options-view-table">
                          <thead>
                            <tr>
                              <th>Nombre visible</th>
                              <th>Valor técnico / numérico</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.options.map((o, oi) => (
                              <tr key={o.id || oi}>
                                <td>
                                  <strong>{o.label || o.code}</strong>
                                </td>
                                <td>
                                  <code>{o.value ?? o.code}</code>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* SECTION 3: Escalado Base del OTD */}
          <section id="sec-escalado" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>3. Matriz de Escalado Base del OTD</h2>
                <p>
                  El OTD tiene su propio escalado que determina el precio base
                  del producto compuesto según dimensiones.
                </p>
              </div>
            </div>

            {scales.length === 0 ? (
              <div className="otd-empty">
                No hay tarifas de escalado base definidas para este OTD.
              </div>
            ) : (
              <div className="otd-scale-table-wrap">
                <table className="otd-scale-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>
                        Dimensión 1
                        {workUnitSymbol ? ` (Hasta ${workUnitSymbol})` : " (Hasta)"}
                      </th>
                      <th>
                        Dimensión 2
                        {workUnitSymbol ? ` (Hasta ${workUnitSymbol})` : " (Hasta)"}
                      </th>
                      <th>Precio Base (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scales.map((sc, sci) => (
                      <tr key={sc.id || sci}>
                        <td>{sci + 1}</td>
                        <td>
                          {Number(sc.dimension_1).toLocaleString("es-ES")}
                          {workUnitSymbol ? ` ${workUnitSymbol}` : ""}
                        </td>
                        <td>
                          {sc.dimension_2 != null
                            ? `${Number(sc.dimension_2).toLocaleString("es-ES")}${workUnitSymbol ? ` ${workUnitSymbol}` : ""}`
                            : "—"}
                        </td>
                        <td>
                          <strong>
                            {Number(sc.price).toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION 4: Formulación y Variables Calculadas */}
          <section id="sec-formulacion" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>4. Formulación y Variables Calculadas</h2>
                <p>
                  Variables técnicas y fórmulas intermedias definidas para el
                  cálculo del producto.
                </p>
              </div>
              <span className="ai-badge">
                <WandSparkles size={14} /> Fórmulas Aritméticas
              </span>
            </div>

            {naturalRule && (
              <div className="otd-detail-formula-banner">
                <strong>Regla o notas de cálculo en lenguaje natural</strong>
                <p>{naturalRule}</p>
              </div>
            )}

            {variables.length === 0 ? (
              <div className="otd-empty">
                No hay variables calculadas definidas en este OTD.
              </div>
            ) : (
              <div className="otd-variables-table-wrap">
                <table className="otd-variables-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre descriptivo</th>
                      <th>Tipo de dato</th>
                      <th>Expresión técnica calculada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((v, vi) => (
                      <tr key={v.id || vi}>
                        <td>
                          <code>{v.code}</code>
                        </td>
                        <td>{v.name || "—"}</td>
                        <td>{v.data_type || "NUMBER"}</td>
                        <td>
                          <code>{v.expression || "—"}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION 5: Componentes del producto */}
          <section id="sec-componentes" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>5. Componentes del producto</h2>
                <p>
                  Artículos reales de ONIN vinculados al OTD que forman el
                  despiece, cálculo de medidas de corte y costes.
                </p>
              </div>
            </div>

            {components.length === 0 ? (
              <div className="otd-empty">
                No hay componentes vinculados al OTD.
              </div>
            ) : (
              components.map((c, ci) => {
                const product = c.product;
                const dimensions = product?.measurement_type?.dimensions ?? [];
                const characteristics = product?.characteristics ?? [];
                const isDynamicChar = Boolean(
                  c.characteristic_expression?.trim(),
                );
                const selectedChar = c.characteristic_id
                  ? characteristics.find((x) => x.id === c.characteristic_id)
                  : null;

                return (
                  <div className="otd-row-card" key={c.id || ci}>
                    <div className="otd-row-actions">
                      <div className="row-tag">
                        <strong>
                          {ci + 1}. Componente:{" "}
                          {product?.code || c.code || "Sin seleccionar"}
                        </strong>
                        <span
                          className={`comp-type-chip ${c.component_type === "IMPROVEMENT" ? "improvement" : "basic"}`}
                        >
                          {c.component_type === "IMPROVEMENT"
                            ? "Mejora con incremento"
                            : "Básico (incluido en base)"}
                        </span>
                      </div>
                    </div>

                    <div className="otd-grid four">
                      {/* Product details */}
                      <div className="otd-detail-val-box">
                        <label>Artículo ONIN</label>
                        <div className="val-text">
                          {product ? (
                            <div>
                              <strong>{product.code}</strong>
                              <div
                                style={{ fontSize: "12px", color: "var(--muted)" }}
                              >
                                {product.commercial_description ||
                                  product.technical_description ||
                                  "Sin descripción"}
                              </div>
                            </div>
                          ) : (
                            c.code || "—"
                          )}
                        </div>
                      </div>

                      {/* Component Type */}
                      <div className="otd-detail-val-box">
                        <label>Tipo de componente</label>
                        <div className="val-text">
                          {c.component_type === "IMPROVEMENT"
                            ? "Mejora (Aplica incremento)"
                            : "Básico (Incluido en base)"}
                        </div>
                      </div>

                      {/* Quantity expression */}
                      <div className="otd-detail-val-box">
                        <label>Cantidad / fórmula</label>
                        <div className="val-text">
                          <code>{c.quantity_expression || "1"}</code>
                        </div>
                      </div>

                      {/* Price increment */}
                      <div className="otd-detail-val-box">
                        <label>Incremento de precio</label>
                        <div className="val-text">
                          {c.component_type === "IMPROVEMENT" ? (
                            c.price_increment_type === "PERCENTAGE" ? (
                              <strong>+{c.price_increment}% sobre base</strong>
                            ) : (
                              <strong>
                                +
                                {Number(c.price_increment).toLocaleString(
                                  "es-ES",
                                  {
                                    style: "currency",
                                    currency: "EUR",
                                  },
                                )}
                              </strong>
                            )
                          ) : (
                            <span style={{ color: "var(--muted)" }}>
                              Incluido en base (€ 0)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Characteristic / Color */}
                    {(characteristics.length > 0 ||
                      isDynamicChar ||
                      c.characteristic_id) && (
                      <div className="otd-detail-char-box">
                        <small>Característica / Color del Componente:</small>
                        {isDynamicChar ? (
                          <span>
                            Dinámica por variable/entrada:{" "}
                            <code>{c.characteristic_expression}</code>
                          </span>
                        ) : selectedChar ? (
                          <span>
                            Fija: <strong>{selectedChar.code}</strong>
                            {selectedChar.description
                              ? ` · ${selectedChar.description}`
                              : ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>
                            Sin característica seleccionada
                          </span>
                        )}
                      </div>
                    )}

                    {/* Cutting / Manufacturing Dimensions */}
                    {dimensions.length > 0 && (
                      <div className="otd-detail-dims-wrap">
                        <div className="otd-detail-dims-title">
                          <Ruler size={14} />
                          <span>
                            Dimensiones del artículo para corte y fabricación:
                          </span>
                        </div>
                        <div className="otd-detail-dims-grid">
                          {dimensions.map((d) => (
                            <div key={d.id} className="otd-detail-dim-item">
                              <label>
                                {d.name}
                                {d.unit?.name || d.unit?.code
                                  ? ` (${d.unit?.name || d.unit?.code})`
                                  : ""}
                              </label>
                              <code>
                                {c.dimension_expressions?.[d.code] || "—"}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
