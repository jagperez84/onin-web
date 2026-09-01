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
  X,
  AlertTriangle,
  WandSparkles,
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
import { OtdAssistantModal } from "./editor/OtdAssistantModal";
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
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

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

  function handleCancel() {
    if (editing) {
      setShowCancelModal(true);
    } else {
      navigate("/produccion/otd");
    }
  }

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

      // 2. Non-destructive sync: Selections & Options
      const { data: dbSelections, error: dbSelErr } = await supabase
        .from("otd_selection")
        .select("id, otd_selection_option(id)")
        .eq("otd_id", oid);
      if (dbSelErr) throw dbSelErr;

      const dbSelIds = (dbSelections || []).map((s: any) => Number(s.id));
      const currentSelIds = new Set<number>();

      for (let i = 0; i < selections.length; i++) {
        const s = selections[i];
        if (!s.code || !s.code.trim()) continue;

        const selPayload = {
          otd_id: oid,
          code: s.code.toUpperCase().trim(),
          name: s.name ? s.name.trim() : s.code.toUpperCase().trim(),
          selection_type: s.selection_type || "OPTION",
          required: s.required ?? true,
          is_dimension: s.is_dimension ?? false,
          unit_id: s.unit_id || null,
          sort_order: i,
        };

        let selectionId: number;

        if (s.id && dbSelIds.includes(s.id)) {
          // UPDATE existing selection
          const { error: selUpdErr } = await supabase
            .from("otd_selection")
            .update(selPayload)
            .eq("id", s.id);
          if (selUpdErr) throw selUpdErr;
          selectionId = s.id;
        } else {
          // INSERT new selection
          const { data: newSel, error: selInsErr } = await supabase
            .from("otd_selection")
            .insert(selPayload)
            .select("id")
            .single();
          if (selInsErr) throw selInsErr;
          selectionId = Number(newSel.id);
          s.id = selectionId;
        }

        currentSelIds.add(selectionId);

        // Sync options for this selection
        const dbOptionsForSel =
          (dbSelections || []).find((ds: any) => Number(ds.id) === selectionId)
            ?.otd_selection_option || [];
        const dbOptIds = dbOptionsForSel.map((o: any) => Number(o.id));
        const currentOptIds = new Set<number>();

        if (s.selection_type === "OPTION" && s.options && s.options.length > 0) {
          const validOpts = s.options.filter(
            (o) => (o.code && o.code.trim()) || (o.label && o.label.trim()),
          );
          for (let oi = 0; oi < validOpts.length; oi++) {
            const o = validOpts[oi];
            const optPayload = {
              selection_id: selectionId,
              code: (o.code || o.label).toUpperCase().trim().replace(/\s+/g, "_"),
              label: o.label ? o.label.trim() : (o.code || ""),
              value:
                o.value != null && String(o.value).trim() !== ""
                  ? String(o.value).trim()
                  : (o.code || null),
              sort_order: oi,
            };

            if (o.id && dbOptIds.includes(o.id)) {
              // UPDATE existing option
              const { error: optUpdErr } = await supabase
                .from("otd_selection_option")
                .update(optPayload)
                .eq("id", o.id);
              if (optUpdErr) throw optUpdErr;
              currentOptIds.add(o.id);
            } else {
              // INSERT new option
              const { data: newOpt, error: optInsErr } = await supabase
                .from("otd_selection_option")
                .insert(optPayload)
                .select("id")
                .single();
              if (optInsErr) throw optInsErr;
              o.id = Number(newOpt.id);
              o.selection_id = selectionId;
              o.otd_selection_id = selectionId;
              currentOptIds.add(Number(newOpt.id));
            }
          }
        }

        // Delete options that were in DB for this selection but no longer in the editor
        const optsToDelete = dbOptIds.filter(
          (dbOptId: number) => !currentOptIds.has(dbOptId),
        );
        if (optsToDelete.length > 0) {
          const { error: delOptErr } = await supabase
            .from("otd_selection_option")
            .delete()
            .in("id", optsToDelete);
          if (delOptErr) throw delOptErr;
        }
      }

      // Delete selections that were in DB for this OTD but no longer in the editor
      const selsToDelete = dbSelIds.filter(
        (dbId: number) => !currentSelIds.has(dbId),
      );
      if (selsToDelete.length > 0) {
        // First delete their options
        const { error: delOptsErr } = await supabase
          .from("otd_selection_option")
          .delete()
          .in("selection_id", selsToDelete);
        if (delOptsErr) throw delOptsErr;

        // Then delete the selections
        const { error: delSelsErr } = await supabase
          .from("otd_selection")
          .delete()
          .in("id", selsToDelete);
        if (delSelsErr) throw delSelsErr;
      }

      // 3. Non-destructive sync: Variables
      const { data: dbVariables, error: dbVarErr } = await supabase
        .from("otd_variable")
        .select("id")
        .eq("otd_id", oid);
      if (dbVarErr) throw dbVarErr;

      const dbVarIds = (dbVariables || []).map((v: any) => Number(v.id));
      const currentVarIds = new Set<number>();

      const validVars = variables.filter((v) => v.code && v.code.trim());
      for (let vi = 0; vi < validVars.length; vi++) {
        const v = validVars[vi];
        const varPayload = {
          otd_id: oid,
          code: v.code.toUpperCase().trim(),
          name: v.name ? v.name.trim() : v.code.toUpperCase().trim(),
          expression: v.expression ? v.expression.trim() : null,
          data_type: v.data_type || "NUMBER",
          min_value: v.min_value != null ? Number(v.min_value) : null,
          max_value: v.max_value != null ? Number(v.max_value) : null,
          sort_order: vi,
          active: v.active ?? true,
        };

        if (v.id && dbVarIds.includes(v.id)) {
          // UPDATE existing variable
          const { error: varUpdErr } = await supabase
            .from("otd_variable")
            .update(varPayload)
            .eq("id", v.id);
          if (varUpdErr) throw varUpdErr;
          currentVarIds.add(v.id);
        } else {
          // INSERT new variable
          const { data: newVar, error: varInsErr } = await supabase
            .from("otd_variable")
            .insert(varPayload)
            .select("id")
            .single();
          if (varInsErr) throw varInsErr;
          v.id = Number(newVar.id);
          currentVarIds.add(Number(newVar.id));
        }
      }

      // Delete variables that were in DB but are no longer in the editor
      const varsToDelete = dbVarIds.filter(
        (dbId: number) => !currentVarIds.has(dbId),
      );
      if (varsToDelete.length > 0) {
        const { error: delVarErr } = await supabase
          .from("otd_variable")
          .delete()
          .in("id", varsToDelete);
        if (delVarErr) throw delVarErr;
      }

      // 4. Non-destructive sync: Components
      const { data: dbComponents, error: dbCompErr } = await supabase
        .from("otd_component")
        .select("id")
        .eq("otd_id", oid);
      if (dbCompErr) throw dbCompErr;

      const dbCompIds = (dbComponents || []).map((c: any) => Number(c.id));
      const currentCompIds = new Set<number>();

      for (let ci = 0; ci < components.length; ci++) {
        const c = components[ci];
        const compPayload = {
          otd_id: oid,
          product_id: c.product_id ? Number(c.product_id) : null,
          characteristic_id: c.characteristic_id
            ? Number(c.characteristic_id)
            : null,
          characteristic_expression: c.characteristic_expression
            ? c.characteristic_expression.trim()
            : null,
          code: c.code ? c.code.trim() : null,
          description: c.description ? c.description.trim() : null,
          quantity_expression:
            c.quantity_expression && c.quantity_expression.trim()
              ? c.quantity_expression.trim()
              : "1",
          component_type: c.component_type || "BASIC",
          price_increment: Number(c.price_increment || 0),
          price_increment_type: c.price_increment_type || "FIXED",
          unit_id: c.unit_id ? Number(c.unit_id) : null,
          active: c.active ?? true,
          sort_order: ci,
          dimension_expressions: c.dimension_expressions || {},
        };

        if (c.id && dbCompIds.includes(c.id)) {
          // UPDATE existing component
          const { error: compUpdErr } = await supabase
            .from("otd_component")
            .update(compPayload)
            .eq("id", c.id);
          if (compUpdErr) throw compUpdErr;
          currentCompIds.add(c.id);
        } else {
          // INSERT new component
          const { data: newComp, error: compInsErr } = await supabase
            .from("otd_component")
            .insert(compPayload)
            .select("id")
            .single();
          if (compInsErr) throw compInsErr;
          c.id = Number(newComp.id);
          currentCompIds.add(Number(newComp.id));
        }
      }

      // Delete components that were in DB but are no longer in the editor
      const compsToDelete = dbCompIds.filter(
        (dbId: number) => !currentCompIds.has(dbId),
      );
      if (compsToDelete.length > 0) {
        const { error: delCompErr } = await supabase
          .from("otd_component")
          .delete()
          .in("id", compsToDelete);
        if (delCompErr) throw delCompErr;
      }

      // 5. Scales synchronization
      try {
        const { data: dbScales, error: dbScaleErr } = await supabase
          .from("otd_scale")
          .select("id")
          .eq("otd_id", oid);

        if (!dbScaleErr) {
          const dbScaleIds = (dbScales || []).map((s: any) => Number(s.id));
          const currentScaleIds = new Set<number>();

          for (const sc of scales) {
            const scalePayload = {
              otd_id: oid,
              dimension_1: Number(sc.dimension_1 || 0),
              dimension_2:
                sc.dimension_2 != null ? Number(sc.dimension_2) : null,
              // Always derive from dimension_1/dimension_2 (the fields this
              // editor actually maintains) instead of trusting sc.dimension_values,
              // which never gets updated when a row is edited after creation.
              dimension_values: [
                Number(sc.dimension_1 || 0),
                ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
              ],
              price: Number(sc.price || 0),
            };

            if (sc.id && dbScaleIds.includes(sc.id)) {
              await supabase
                .from("otd_scale")
                .update(scalePayload)
                .eq("id", sc.id);
              currentScaleIds.add(sc.id);
            } else {
              const { data: newScale } = await supabase
                .from("otd_scale")
                .insert(scalePayload)
                .select("id")
                .single();
              if (newScale?.id) {
                sc.id = Number(newScale.id);
                currentScaleIds.add(Number(newScale.id));
              }
            }
          }

          const scalesToDelete = dbScaleIds.filter(
            (sId: number) => !currentScaleIds.has(sId),
          );
          if (scalesToDelete.length > 0) {
            await supabase.from("otd_scale").delete().in("id", scalesToDelete);
          }
        }
      } catch {
        // otd_scale table may not be present in all environments
      }

      // Linked product scales if associated with a master product
      const { data: otdRecord, error: otdRecErr } = await supabase
        .from("otd")
        .select("product_id")
        .eq("id", oid)
        .maybeSingle();
      if (!otdRecErr && otdRecord?.product_id && scales.length > 0) {
        try {
          await supabase
            .from("product_scale")
            .delete()
            .eq("product_id", otdRecord.product_id);
          const pScaleInserts = scales.map((sc) => ({
            product_id: otdRecord.product_id,
            dimension_1: Number(sc.dimension_1 || 0),
            dimension_2:
              sc.dimension_2 != null ? Number(sc.dimension_2) : null,
            dimension_values: [
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

      // 6. Version Snapshot
      const [allSRes, allVRes, allCRes] = await Promise.all([
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
      ]);

      if (allSRes.error) throw allSRes.error;
      if (allVRes.error) throw allVRes.error;
      if (allCRes.error) throw allCRes.error;

      const { data: latestVer, error: verFetchErr } = await supabase
        .from("otd_version")
        .select("version_number")
        .eq("otd_id", oid)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (verFetchErr) throw verFetchErr;

      const nextVersion = (latestVer?.version_number ?? 0) + 1;

      const snapshot = {
        otd: { ...otd, id: oid, company_id },
        selections: allSRes.data ?? selections,
        variables: allVRes.data ?? validVars,
        components: allCRes.data ?? components,
        scales: scales.map((sc) => ({
          dimension_1: Number(sc.dimension_1 || 0),
          dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
          dimension_values: [
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

      // Update in-memory state with freshly synchronized DB records
      if (allSRes.data) {
        setSelections(
          allSRes.data.map((x: any) => ({
            ...x,
            id: Number(x.id),
            unit_id: x.unit_id != null ? Number(x.unit_id) : null,
            is_dimension: Boolean(x.is_dimension),
            options: (x.otd_selection_option ?? [])
              .sort(
                (a: any, b: any) =>
                  (a.sort_order ?? 0) - (b.sort_order ?? 0),
              )
              .map((opt: any) => ({
                id: opt.id ? Number(opt.id) : undefined,
                selection_id: opt.selection_id
                  ? Number(opt.selection_id)
                  : Number(x.id),
                code: opt.code ?? "",
                label: opt.label ?? opt.code ?? "",
                value:
                  opt.value != null ? String(opt.value) : (opt.code ?? ""),
                sort_order: opt.sort_order ?? 0,
              })),
          })),
        );
      }
      if (allVRes.data) {
        setVariables(
          allVRes.data.map((x: any) => ({
            id: Number(x.id),
            code: x.code ?? "",
            name: x.name ?? x.code ?? "",
            expression: x.expression ?? null,
            data_type: x.data_type || "NUMBER",
            min_value: x.min_value != null ? Number(x.min_value) : null,
            max_value: x.max_value != null ? Number(x.max_value) : null,
            sort_order: x.sort_order ?? 0,
            active: x.active ?? true,
          })),
        );
      }
      if (allCRes.data) {
        setComponents(
          allCRes.data.map((x: any) => ({
            id: Number(x.id),
            product_id: x.product_id ? Number(x.product_id) : null,
            characteristic_id: x.characteristic_id
              ? Number(x.characteristic_id)
              : null,
            characteristic_expression: x.characteristic_expression ?? null,
            code: x.code ?? null,
            description: x.description ?? null,
            quantity_expression:
              x.quantity_expression !== undefined &&
              x.quantity_expression !== null
                ? String(x.quantity_expression)
                : "1",
            component_type:
              x.component_type === "IMPROVEMENT" ? "IMPROVEMENT" : "BASIC",
            price_increment: Number(x.price_increment ?? 0),
            price_increment_type:
              x.price_increment_type === "PERCENTAGE"
                ? "PERCENTAGE"
                : "FIXED",
            unit_id: x.unit_id != null ? Number(x.unit_id) : null,
            active: x.active ?? true,
            sort_order: x.sort_order ?? 0,
            dimension_expressions:
              x.dimension_expressions &&
              typeof x.dimension_expressions === "object"
                ? x.dimension_expressions
                : {},
          })),
        );
      }

      setOtd((x) => ({ ...x, id: oid, company_id }));
      setMessage(`Guardado correctamente. Versión ${nextVersion}.`);
      if (!editing) navigate(`/produccion/otd/${oid}`, { replace: true });
    } catch (err: any) {
      console.error("Error guardando OTD:", err);
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
              className="secondary-button"
              title="Abrir vista de cálculo y pruebas para oficina"
            >
              <Compass size={15} /> Abrir Configurador
            </NavLink>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowAssistant(true)}
            disabled={saving}
            title="Asistente IA: proponer entradas, variables y componentes a partir de un prompt"
          >
            <WandSparkles size={15} /> Asistente IA
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleCancel}
            disabled={saving}
            title="Descartar cambios y volver a la lista"
          >
            <X size={15} /> Cancelar
          </button>
          <button
            className="primary-button"
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

      {/* Discard changes confirmation modal */}
      {showCancelModal && (
        <div
          className="otd-confirmation-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowCancelModal(false)}
        >
          <div
            className="otd-confirmation-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="otd-confirmation-header">
              <AlertTriangle size={22} color="#dc2626" />
              <h3>¿Descartar los cambios realizados?</h3>
            </div>
            <p>
              Si sales ahora se descartarán todas las modificaciones sin guardar,
              no se modificará la base de datos y no se creará ninguna versión
              nueva.
            </p>
            <div className="otd-confirmation-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowCancelModal(false)}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="otd-confirmation-danger-btn"
                onClick={() => {
                  setShowCancelModal(false);
                  navigate("/produccion/otd");
                }}
              >
                Descartar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asistente IA para proponer entradas, variables y componentes */}
      {showAssistant && (
        <OtdAssistantModal
          units={units}
          selections={selections}
          variables={variables}
          components={components}
          onClose={() => setShowAssistant(false)}
          onAccept={(result) => {
            if (result.selections.length) {
              setSelections((prev) => [...prev, ...result.selections]);
            }
            if (result.variables.length) {
              setVariables((prev) => [...prev, ...result.variables]);
            }
            if (result.components.length) {
              setComponents((prev) => [...prev, ...result.components]);
            }
          }}
        />
      )}
    </div>
  );
}
