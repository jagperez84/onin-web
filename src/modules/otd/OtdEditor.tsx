import React, { useState, useEffect, type FormEvent } from "react";
import { NavLink, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Compass,
  Sliders,
  Calculator,
  Layers3,
  FileCode,
  Ruler,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  listOtdScales,
  type OtdScaleRow,
} from "../../services/otd/otdScaleRepository";
import {
  fetchOninProducts,
  type OninProduct,
} from "../../services/otd/otdCalculationService";
import { listUnits, type Unit } from "../../services/catalog/unitRepository";
import { OtdIdentificationSection } from "./editor/OtdIdentificationSection";
import { OtdSelectionsSection } from "./editor/OtdSelectionsSection";
import { OtdScalesSection } from "./editor/OtdScalesSection";
import { OtdVariablesSection } from "./editor/OtdVariablesSection";
import { OtdComponentsSection } from "./editor/OtdComponentsSection";
import type { Otd, Selection, Variable, Component } from "./editor/types";
import { OtdList } from "./OtdList";
import "./otd.css";

export { OtdList };

export function OtdEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = Boolean(id && id !== "nuevo");

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [otd, setOtd] = useState<Otd>({
    code: "",
    name: "",
    template_type: "TOLDO",
    work_unit_id: null,
    active: true,
  });

  const [units, setUnits] = useState<Unit[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [naturalRule, setNaturalRule] = useState("");
  const [scales, setScales] = useState<OtdScaleRow[]>([]);
  const [products, setProducts] = useState<Record<number, OninProduct>>({});

  // Active section for top navigator highlighting
  const [activeSection, setActiveSection] = useState("sec-identificacion");

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

  // Load Units of measure catalog
  useEffect(() => {
    (async () => {
      try {
        const uList = await listUnits();
        setUnits(uList);
      } catch (err) {
        console.error("Error cargando unidades de medida:", err);
      }
    })();
  }, []);

  // Load existing OTD
  useEffect(() => {
    if (!editing || !supabase) return;
    let cancelled = false;

    (async () => {
      try {
        const oid = Number(id);
        const [o, s, v, c, loadedScales, latestVersion] = await Promise.all([
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
        ]);

        if (cancelled) return;
        if (o.error) throw o.error;
        const snap = latestVersion.data?.snapshot;
        if (o.data) {
          setOtd({
            ...o.data,
            work_unit_id:
              o.data.work_unit_id != null
                ? Number(o.data.work_unit_id)
                : snap?.otd?.work_unit_id != null
                  ? Number(snap.otd.work_unit_id)
                  : null,
          });
        }

        // Selections
        if (s.data && s.data.length > 0) {
          setSelections(
            s.data.map((x: any, idx: number) => {
              const snapSel = snap?.selections?.[idx];
              const resolvedUnitId =
                x.unit_id != null
                  ? Number(x.unit_id)
                  : snapSel?.unit_id != null
                    ? Number(snapSel.unit_id)
                    : null;
              return {
                ...x,
                unit_id: resolvedUnitId,
                is_dimension: Boolean(x.is_dimension ?? snapSel?.is_dimension),
                options: (x.otd_selection_option ?? []).map((opt: any) => ({
                  ...opt,
                  code: opt.code ?? "",
                  label: opt.label ?? opt.code ?? "",
                  value: opt.value != null ? String(opt.value) : (opt.code ?? ""),
                })),
              };
            }),
          );
        } else if (latestVersion.data?.snapshot?.selections?.length) {
          setSelections(latestVersion.data.snapshot.selections);
        }

        // Variables
        if (v.data && v.data.length > 0) {
          setVariables(v.data);
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
        const rawComps =
          c.data && c.data.length > 0
            ? c.data
            : (latestVersion.data?.snapshot?.components ?? []);

        if (rawComps && rawComps.length > 0) {
          const loaded = (rawComps as any[]).map((x, idx) => {
            const snapComp = snap?.components?.[idx];
            return {
              ...x,
              product_id: x.product_id ? Number(x.product_id) : null,
              characteristic_id: x.characteristic_id
                ? Number(x.characteristic_id)
                : null,
              characteristic_expression: x.characteristic_expression ?? null,
              component_type:
                x.component_type === "IMPROVEMENT" ? "IMPROVEMENT" : "BASIC",
              price_increment: Number(x.price_increment ?? 0),
              price_increment_type:
                x.price_increment_type === "PERCENTAGE"
                  ? "PERCENTAGE"
                  : "FIXED",
              unit_id:
                x.unit_id != null
                  ? Number(x.unit_id)
                  : snapComp?.unit_id != null
                    ? Number(snapComp.unit_id)
                    : null,
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
            };
          }) as Component[];
          setComponents(loaded);

          // Fetch full product definitions for all components
          const pids = loaded
            .map((x) => x.product_id)
            .filter((x): x is number => Number.isFinite(x) && x !== null);
          if (pids.length > 0) {
            try {
              const pMap = await fetchOninProducts(pids);
              if (!cancelled) {
                setProducts((prev) => ({ ...prev, ...pMap }));
              }
            } catch (err) {
              console.error("Error cargando artículos de componentes:", err);
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) setMessage(err?.message ?? "Error al cargar OTD.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, editing]);

  async function save(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!supabase) {
      setMessage("Supabase no está disponible.");
      return;
    }
    if (!otd.code || !otd.name) {
      setMessage("El código y el nombre del OTD son obligatorios.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // Resolve company_id from user context
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let company_id = otd.company_id ?? 1;
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (prof?.company_id) company_id = prof.company_id;
      }

      // 1. Save OTD Header
      let oid = otd.id;
      const otdPayload = {
        code: otd.code.toUpperCase().trim(),
        name: otd.name.trim(),
        template_type: otd.template_type ?? "TOLDO",
        work_unit_id: otd.work_unit_id || null,
        active: otd.active ?? true,
        company_id,
      };

      if (!oid || !editing) {
        const { data, error } = await supabase
          .from("otd")
          .insert(otdPayload)
          .select()
          .single();
        if (error) throw error;
        oid = data.id;
      } else {
        const { error } = await supabase
          .from("otd")
          .update(otdPayload)
          .eq("id", oid);
        if (error) throw error;
      }

      // 2. Selections & Options
      await supabase.from("otd_selection").delete().eq("otd_id", oid);
      for (let i = 0; i < selections.length; i++) {
        const s = selections[i];
        if (!s.code) continue;
        const { data: sData, error: sErr } = await supabase
          .from("otd_selection")
          .insert({
            otd_id: oid,
            code: s.code.toUpperCase().trim(),
            name: s.name || s.code,
            selection_type: s.selection_type || "OPTION",
            required: s.required ?? true,
            is_dimension: s.is_dimension ?? false,
            unit_id: s.unit_id || null,
            sort_order: i,
          })
          .select()
          .single();
        if (sErr) throw sErr;

        if (s.selection_type === "OPTION" && s.options?.length) {
          const opts = s.options
            .filter((o) => o.code || o.label)
            .map((o, oi) => ({
              otd_selection_id: sData.id,
              code: (o.code || o.label).toUpperCase().trim().replace(/\s+/g, "_"),
              label: o.label || o.code,
              value: o.value || o.code || null,
              sort_order: oi,
            }));
          if (opts.length > 0) {
            const { error: optErr } = await supabase
              .from("otd_selection_option")
              .insert(opts);
            if (optErr) throw optErr;
          }
        }
      }

      // 3. Variables
      await supabase.from("otd_variable").delete().eq("otd_id", oid);
      const validVars = variables
        .filter((v) => v.code)
        .map((v, i) => ({
          otd_id: oid,
          code: v.code.toUpperCase().trim(),
          name: v.name || v.code,
          expression: v.expression || null,
          data_type: v.data_type || "NUMBER",
          min_value: v.min_value ?? null,
          max_value: v.max_value ?? null,
          sort_order: i,
          active: v.active ?? true,
        }));
      if (validVars.length > 0) {
        const { error: vErr } = await supabase
          .from("otd_variable")
          .insert(validVars);
        if (vErr) throw vErr;
      }

      // 4. Components
      await supabase.from("otd_component").delete().eq("otd_id", oid);
      const comps = components.map((c, i) => ({
        otd_id: oid,
        product_id: c.product_id || null,
        characteristic_id: c.characteristic_id || null,
        characteristic_expression: c.characteristic_expression || null,
        code: c.code || null,
        description: c.description || null,
        quantity_expression: c.quantity_expression || "1",
        component_type: c.component_type || "BASIC",
        price_increment: Number(c.price_increment || 0),
        price_increment_type: c.price_increment_type || "FIXED",
        unit_id: c.unit_id || null,
        active: c.active ?? true,
        sort_order: i,
        dimension_expressions: c.dimension_expressions || {},
      }));
      if (comps.length > 0) {
        const { error: cErr } = await supabase
          .from("otd_component")
          .insert(comps);
        if (cErr) throw cErr;
      }

      // Scales
      try {
        await supabase.from("otd_scale").delete().eq("otd_id", oid);
        if (scales.length > 0) {
          const scaleRowsToInsert = scales.map((sc) => ({
            otd_id: oid,
            dimension_1: Number(sc.dimension_1 || 0),
            dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
            dimension_values: sc.dimension_values || [
              Number(sc.dimension_1 || 0),
              ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
            ],
            price: Number(sc.price || 0),
          }));
          await supabase.from("otd_scale").insert(scaleRowsToInsert);
        }
      } catch {
        // otd_scale table may not be present in all environments
      }

      // Linked product scales if associated with a master product
      const { data: otdRecord } = await supabase
        .from("otd")
        .select("product_id")
        .eq("id", oid)
        .maybeSingle();
      if (otdRecord?.product_id && scales.length > 0) {
        try {
          await supabase
            .from("product_scale")
            .delete()
            .eq("product_id", otdRecord.product_id);
          const pScaleInserts = scales.map((sc) => ({
            product_id: otdRecord.product_id,
            dimension_1: Number(sc.dimension_1 || 0),
            dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
            dimension_values: sc.dimension_values || [
              Number(sc.dimension_1 || 0),
              ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
            ],
            price: Number(sc.price || 0),
          }));
          await supabase.from("product_scale").insert(pScaleInserts);
        } catch {
          // Ignore
        }
      }

      // 5. Version Snapshot
      const { data: allS } = await supabase
        .from("otd_selection")
        .select("*,otd_selection_option(*)")
        .eq("otd_id", oid)
        .order("sort_order");
      const { data: allV } = await supabase
        .from("otd_variable")
        .select("*")
        .eq("otd_id", oid)
        .order("sort_order");
      const { data: allC } = await supabase
        .from("otd_component")
        .select("*")
        .eq("otd_id", oid)
        .order("sort_order");

      const nextVersion =
        ((
          await supabase
            .from("otd_version")
            .select("version_number")
            .eq("otd_id", oid)
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data?.version_number ?? 0) + 1;

      const snapshot = {
        otd: { ...otd, id: oid, company_id },
        selections: allS ?? selections,
        variables: allV ?? validVars,
        components: allC ?? comps,
        scales: scales.map((sc) => ({
          dimension_1: Number(sc.dimension_1 || 0),
          dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
          dimension_values: sc.dimension_values || [
            Number(sc.dimension_1 || 0),
            ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
          ],
          price: Number(sc.price || 0),
        })),
        natural_rule: naturalRule,
      };

      const { error: ve } = await supabase
        .from("otd_version")
        .insert({ otd_id: oid, version_number: nextVersion, snapshot });
      if (ve) throw ve;

      setOtd((x) => ({ ...x, id: oid, company_id }));
      setMessage(`Guardado correctamente. Versión ${nextVersion}.`);
      if (!editing) navigate(`/produccion/otd/${oid}`, { replace: true });
    } catch (err: any) {
      setMessage(err?.message ?? "No se ha podido guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="otd-page">
        <div className="otd-empty">Cargando OTD…</div>
      </div>
    );

  const sectionsNav = [
    {
      id: "sec-identificacion",
      label: "1. Identificación",
      icon: FileCode,
      badge: undefined,
    },
    {
      id: "sec-entradas",
      label: "2. Entradas Oficina",
      icon: Sliders,
      badge: selections.length,
    },
    {
      id: "sec-escalado",
      label: "3. Escalado Base",
      icon: Ruler,
      badge: scales.length,
    },
    {
      id: "sec-formulacion",
      label: "4. Formulación",
      icon: Calculator,
      badge: variables.length,
    },
    {
      id: "sec-componentes",
      label: "5. Componentes",
      icon: Layers3,
      badge: components.length,
    },
  ];

  const currentWorkUnitSymbol =
    units.find((u) => u.id === otd.work_unit_id)?.symbol ||
    units.find((u) => u.id === otd.work_unit_id)?.code ||
    "mm";

  return (
    <div className="otd-page">
      {/* Header */}
      <div className="otd-head">
        <div>
          <NavLink to="/produccion/otd" className="otd-back">
            <ArrowLeft size={15} /> OTD
          </NavLink>
          <div className="eyebrow">EDITOR TÉCNICO</div>
          <h1>{editing ? otd.name || "Editar OTD" : "Nuevo OTD"}</h1>
          <p>
            Configuración técnica del artículo compuesto. Define entradas, matriz
            de escalado base, fórmulas e incrementos de componentes.
          </p>
        </div>

        <div className="otd-head-actions">
          {editing && (
            <NavLink
              to={`/produccion/otd/${otd.id}/configurar`}
              className="secondary-btn"
              title="Abrir vista de cálculo y pruebas para oficina"
            >
              <Compass size={15} /> Abrir Configurador
            </NavLink>
          )}
          <button
            className="primary-btn"
            onClick={() => save()}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? "Guardando…" : "Guardar OTD"}
          </button>
        </div>
      </div>

      {/* Top Sticky Navigator for Maximum Horizontal Space */}
      <div className="otd-top-nav-wrapper">
        <nav
          className="otd-top-navigator"
          aria-label="Navegador de secciones OTD"
        >
          <div className="otd-top-nav-items">
            {sectionsNav.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`otd-top-nav-item ${isActive ? "active" : ""}`}
                  onClick={() => scrollToSection(sec.id)}
                >
                  <Icon size={15} />
                  <span className="nav-label">{sec.label}</span>
                  {sec.badge !== undefined && (
                    <span className="nav-badge">{sec.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Editor Layout (Full Width) */}
      <div className="otd-editor-layout">
        {/* Form Body */}
        <form onSubmit={save} className="otd-editor-form-col">
          {/* SECTION 1: Identificación */}
          <OtdIdentificationSection
            otd={otd}
            units={units}
            onChange={setOtd}
          />

          {/* SECTION 2: Entradas para oficina */}
          <OtdSelectionsSection
            selections={selections}
            otd={otd}
            units={units}
            onChange={setSelections}
          />

          {/* SECTION 3: Escalado Base del OTD */}
          <OtdScalesSection
            scales={scales}
            unitSymbol={currentWorkUnitSymbol}
            onChange={setScales}
          />

          {/* SECTION 4: Formulación */}
          <OtdVariablesSection
            variables={variables}
            selections={selections}
            naturalRule={naturalRule}
            onNaturalRuleChange={setNaturalRule}
            onChange={setVariables}
          />

          {/* SECTION 5: Componentes del producto */}
          <OtdComponentsSection
            components={components}
            products={products}
            otd={otd}
            units={units}
            selections={selections}
            variables={variables}
            onProductsUpdate={(newMap) =>
              setProducts((prev) => ({ ...prev, ...newMap }))
            }
            onChange={setComponents}
          />

          {message && (
            <div
              className={`otd-message ${message.startsWith("Guardado") ? "ok" : "error"}`}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
