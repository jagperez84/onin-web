import React, { useState, useEffect, type FormEvent } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Compass,
  WandSparkles,
  Sliders,
  Calculator,
  Layers3,
  Search,
  X,
  FileCode,
  Ruler,
  Grid,
  Sparkles,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { listOtdScales, type OtdScaleRow } from '../../services/otd/otdScaleRepository';
import { FormulaPredictiveInput } from './FormulaPredictiveInput';
import './otd.css';

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
  selection_type: 'OPTION' | 'NUMBER' | 'TEXT' | 'BOOLEAN';
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
  component_type: 'BASIC' | 'IMPROVEMENT';
  price_increment: number;
  price_increment_type: 'FIXED' | 'PERCENTAGE';
  active: boolean;
  sort_order: number;
  dimension_expressions?: Record<string, string>;
}

interface Otd {
  id?: number;
  company_id?: number;
  product_id?: number | null;
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
  characteristics: Array<{ id: number; code: string; description: string | null }>;
  measurement_type?: {
    id: number;
    name: string;
    dimension_count: number;
    dimensions: Array<{ id: number; code: string; name: string; unit?: { code: string; name: string } }>;
  } | null;
}

export function OtdEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editing = Boolean(id && id !== 'nuevo');

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [otd, setOtd] = useState<Otd>({
    code: '',
    name: '',
    template_type: 'TOLDO',
    active: true,
  });

  const [selections, setSelections] = useState<Selection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [naturalRule, setNaturalRule] = useState('');
  const [scales, setScales] = useState<OtdScaleRow[]>([]);
  const [products, setProducts] = useState<Record<number, OninProduct>>({});

  // Product Picker state
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<OninProduct[]>([]);
  const [activeProductComponent, setActiveProductComponent] = useState<number | null>(null);

  // Active section for top navigator highlighting
  const [activeSection, setActiveSection] = useState('sec-identificacion');

  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = [
        'sec-identificacion',
        'sec-entradas',
        'sec-escalado',
        'sec-formulacion',
        'sec-componentes',
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
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function scrollToSection(sId: string) {
    const el = document.getElementById(sId);
    if (el) {
      const topOffset = 110;
      const elementPosition = el.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setActiveSection(sId);
    }
  }

  // Load product catalog details
  async function loadProducts(pids: number[]) {
    if (!supabase || pids.length === 0) return;
    const missing = pids.filter(p => !products[p]);
    if (missing.length === 0) return;

    try {
      const { data: prods } = await supabase
        .from('product')
        .select(`
          id, code, commercial_description, technical_description,
          measurement_type:measurement_type_id (
            id, name, dimension_count,
            dimensions:dimension ( id, code, name, unit:unit_id ( code, name ) )
          ),
          characteristics:product_characteristic ( id, code, description )
        `)
        .in('id', missing);

      if (prods) {
        const map = { ...products };
        for (const p of prods as any[]) {
          map[p.id] = {
            id: p.id,
            code: p.code,
            commercial_description: p.commercial_description,
            technical_description: p.technical_description,
            characteristics: p.characteristics ?? [],
            measurement_type: p.measurement_type ?? null,
          };
        }
        setProducts(map);
      }
    } catch {
      // Ignore
    }
  }

  // Search product catalog
  async function searchProducts(query: string) {
    setProductSearch(query);
    if (!supabase || query.trim().length < 2) {
      setProductResults([]);
      return;
    }

    try {
      const clean = `%${query.trim()}%`;
      const { data } = await supabase
        .from('product')
        .select(`
          id, code, commercial_description, technical_description,
          measurement_type:measurement_type_id (
            id, name, dimension_count,
            dimensions:dimension ( id, code, name, unit:unit_id ( code, name ) )
          ),
          characteristics:product_characteristic ( id, code, description )
        `)
        .or(`code.ilike.${clean},commercial_description.ilike.${clean},technical_description.ilike.${clean}`)
        .limit(15);

      setProductResults(
        (data ?? []).map((p: any) => ({
          id: p.id,
          code: p.code,
          commercial_description: p.commercial_description,
          technical_description: p.technical_description,
          characteristics: p.characteristics ?? [],
          measurement_type: p.measurement_type ?? null,
        }))
      );
    } catch {
      setProductResults([]);
    }
  }

  // Load existing OTD
  useEffect(() => {
    if (!editing || !supabase) return;
    let cancelled = false;

    (async () => {
      try {
        const oid = Number(id);
        const [o, s, v, c, loadedScales, latestVersion] = await Promise.all([
          supabase.from('otd').select('*').eq('id', oid).single(),
          supabase
            .from('otd_selection')
            .select('*,otd_selection_option(*)')
            .eq('otd_id', oid)
            .order('sort_order'),
          supabase.from('otd_variable').select('*').eq('otd_id', oid).order('sort_order'),
          supabase.from('otd_component').select('*').eq('otd_id', oid).order('sort_order'),
          listOtdScales(oid),
          supabase
            .from('otd_version')
            .select('snapshot')
            .eq('otd_id', oid)
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;
        if (o.error) throw o.error;
        if (o.data) setOtd(o.data);

        // Selections
        if (s.data && s.data.length > 0) {
          setSelections(
            s.data.map((x: any) => ({
              ...x,
              is_dimension: Boolean(x.is_dimension),
              options: (x.otd_selection_option ?? []).map((o: any) => ({
                ...o,
                code: o.code ?? '',
                label: o.label ?? o.code ?? '',
                value: o.value != null ? String(o.value) : (o.code ?? ''),
              })),
            }))
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
            }))
          );
        }

        // Components
        const rawComps =
          c.data && c.data.length > 0
            ? c.data
            : latestVersion.data?.snapshot?.components ?? [];

        if (rawComps && rawComps.length > 0) {
          const loaded = (rawComps as any[]).map(x => ({
            ...x,
            product_id: x.product_id ?? null,
            characteristic_id: x.characteristic_id ?? null,
            characteristic_expression: x.characteristic_expression ?? null,
            component_type: x.component_type === 'IMPROVEMENT' ? 'IMPROVEMENT' : 'BASIC',
            price_increment: Number(x.price_increment ?? 0),
            price_increment_type:
              x.price_increment_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
            quantity_expression:
              x.quantity_expression !== undefined && x.quantity_expression !== null
                ? String(x.quantity_expression)
                : '1',
            dimension_expressions:
              x.dimension_expressions && typeof x.dimension_expressions === 'object'
                ? x.dimension_expressions
                : {},
          })) as Component[];
          setComponents(loaded);
          await loadProducts(
            loaded.map(x => x.product_id).filter((x): x is number => Number.isFinite(x))
          );
        }
      } catch (err: any) {
        if (!cancelled) setMessage(err?.message ?? 'Error al cargar OTD.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, editing]);

  // Generators for new rows
  function emptySelection(): Selection {
    return {
      code: '',
      name: '',
      selection_type: 'OPTION',
      required: true,
      is_dimension: false,
      options: [],
      sort_order: selections.length,
    };
  }

  function emptyOption(sel: Selection): SelectionOption {
    return {
      code: '',
      label: '',
      value: '',
      sort_order: sel.options.length,
    };
  }

  function emptyVariable(): Variable {
    return {
      code: '',
      name: '',
      expression: '',
      data_type: 'NUMBER',
      min_value: null,
      max_value: null,
      sort_order: variables.length,
      active: true,
    };
  }

  function emptyComponent(): Component {
    return {
      product_id: null,
      characteristic_id: null,
      characteristic_expression: null,
      code: '',
      description: '',
      quantity_expression: '1',
      component_type: 'BASIC',
      price_increment: 0,
      price_increment_type: 'FIXED',
      active: true,
      sort_order: components.length,
      dimension_expressions: {},
    };
  }

  function updateComponent(index: number, patch: Partial<Component>) {
    setComponents(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function selectProduct(ci: number, p: OninProduct) {
    setProducts(prev => ({ ...prev, [p.id]: p }));
    const defaultDims: Record<string, string> = {};
    for (const d of p.measurement_type?.dimensions ?? []) {
      const matchingInput = selections.find(
        s => s.code.toUpperCase() === d.code.toUpperCase() || s.name.toUpperCase().includes(d.name.toUpperCase())
      );
      defaultDims[d.code] = matchingInput ? matchingInput.code : d.code;
    }

    updateComponent(ci, {
      product_id: p.id,
      code: p.code,
      description: p.commercial_description || p.technical_description || '',
      characteristic_id: p.characteristics[0]?.id ?? null,
      characteristic_expression: null,
      dimension_expressions: defaultDims,
    });
    setActiveProductComponent(null);
    setProductResults([]);
  }

  function clearProduct(ci: number) {
    updateComponent(ci, {
      product_id: null,
      code: '',
      description: '',
      characteristic_id: null,
      characteristic_expression: null,
      dimension_expressions: {},
    });
  }

  function addScaleRow() {
    const last = scales[scales.length - 1];
    const d1 = last ? last.dimension_1 + 500 : 2000;
    const d2 = last && last.dimension_2 != null ? last.dimension_2 : null;
    const p = last ? last.price + 50 : 250;

    setScales(prev => [
      ...prev,
      {
        id: prev.length + 1,
        otd_id: Number(id) || 0,
        dimension_1: d1,
        dimension_2: d2,
        dimension_values: [d1, ...(d2 != null ? [d2] : [])],
        price: p,
        attribute_values: {},
      },
    ]);
  }

  function updateScaleRow(idx: number, patch: Partial<OtdScaleRow>) {
    setScales(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      copy[idx].dimension_values = [
        copy[idx].dimension_1,
        ...(copy[idx].dimension_2 != null ? [copy[idx].dimension_2] : []),
      ];
      return copy;
    });
  }

  function removeScaleRow(idx: number) {
    setScales(prev => prev.filter((_, i) => i !== idx));
  }

  async function companyId() {
    if (!supabase) throw new Error('Supabase no está configurado');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesión no disponible');
    const { data, error } = await supabase
      .from('user_account')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single();
    if (error || !data) throw new Error('No se ha podido determinar la empresa del usuario');
    return Number(data.company_id);
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!supabase) return setMessage('Supabase no está configurado.');
    if (!otd.code.trim() || !otd.name.trim()) return setMessage('Código y nombre son obligatorios.');

    setSaving(true);
    setMessage('');
    try {
      const company_id = otd.company_id || (await companyId().catch(() => 1));
      let oid = otd.id;
      if (!oid) {
        const { data, error } = await supabase
          .from('otd')
          .insert({
            company_id,
            code: otd.code.trim().toUpperCase(),
            name: otd.name.trim(),
            template_type: otd.template_type || null,
            active: otd.active ?? true,
          })
          .select()
          .single();
        if (error) throw error;
        oid = data.id;
      } else {
        const { error } = await supabase
          .from('otd')
          .update({
            code: otd.code.trim().toUpperCase(),
            name: otd.name.trim(),
            template_type: otd.template_type || null,
            active: otd.active ?? true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', oid);
        if (error) throw error;
      }

      // 1. Selections (Inputs)
      await supabase.from('otd_selection').delete().eq('otd_id', oid);
      for (const [si, s] of selections.entries()) {
        const cleanCode = s.code?.trim().toUpperCase() || `ENTRADA_${si + 1}`;
        const { data: sd, error: se } = await supabase
          .from('otd_selection')
          .insert({
            otd_id: oid,
            code: cleanCode,
            name: s.name?.trim() || cleanCode,
            selection_type: s.selection_type || 'OPTION',
            required: Boolean(s.required),
            is_dimension: Boolean(s.is_dimension),
            sort_order: si,
          })
          .select()
          .single();
        if (se) throw se;

        const validOpts = (s.options ?? [])
          .filter(
            o =>
              (o.label && o.label.trim().length > 0) ||
              (o.value !== undefined && o.value !== null && String(o.value).trim().length > 0) ||
              (o.code && o.code.trim().length > 0)
          )
          .map((o, i) => {
            const rawLbl = o.label?.trim() || '';
            const rawVal = o.value !== undefined && o.value !== null ? String(o.value).trim() : '';
            const rawCode = o.code?.trim() || '';

            const finalLabel = rawLbl || rawVal || rawCode || `Opción ${i + 1}`;
            const finalValue = rawVal || rawCode || rawLbl;
            const finalCode = rawCode || finalValue || finalLabel.toUpperCase().replace(/\s+/g, '_');

            return {
              selection_id: sd.id,
              code: finalCode,
              label: finalLabel,
              value: finalValue,
              sort_order: i,
            };
          });

        if (validOpts.length > 0) {
          const { error: oe } = await supabase.from('otd_selection_option').insert(validOpts);
          if (oe) throw oe;
        }
      }

      // 2. Variables (sanitize and save)
      await supabase.from('otd_variable').delete().eq('otd_id', oid);
      const validVars = variables
        .filter(v => v.code && v.code.trim().length > 0)
        .map((v, i) => ({
          otd_id: oid,
          code: v.code.trim().toUpperCase().replace(/\s+/g, '_'),
          name: v.name?.trim() || v.code.trim().toUpperCase(),
          expression: v.expression?.trim() || null,
          data_type: v.data_type || 'NUMBER',
          min_value: v.min_value != null && !isNaN(Number(v.min_value)) ? Number(v.min_value) : null,
          max_value: v.max_value != null && !isNaN(Number(v.max_value)) ? Number(v.max_value) : null,
          sort_order: i,
          active: v.active !== false,
        }));

      if (validVars.length > 0) {
        const { error: ve } = await supabase.from('otd_variable').insert(validVars);
        if (ve) throw ve;
      }

      // 3. Components (preserve expressions & calculations)
      await supabase.from('otd_component').delete().eq('otd_id', oid);
      const comps = components.map((c, i) => ({
        otd_id: oid,
        product_id: c.product_id ? Number(c.product_id) : null,
        characteristic_id: c.characteristic_id ? Number(c.characteristic_id) : null,
        characteristic_expression: c.characteristic_expression?.trim() || null,
        code: c.code?.trim() || (c.product_id ? products[c.product_id]?.code : '') || `COMP_${i + 1}`,
        description: c.description?.trim() || null,
        quantity_expression: c.quantity_expression?.trim() || '1',
        component_type: c.component_type === 'IMPROVEMENT' ? 'IMPROVEMENT' : 'BASIC',
        price_increment: c.component_type === 'IMPROVEMENT' ? Number(c.price_increment || 0) : 0,
        price_increment_type:
          c.component_type === 'IMPROVEMENT' ? c.price_increment_type : 'FIXED',
        active: c.active !== false,
        sort_order: i,
        dimension_expressions: c.dimension_expressions || {},
      }));

      if (comps.length > 0) {
        const { error: ce } = await supabase.from('otd_component').insert(comps);
        if (ce) throw ce;
      }

      // 4. Scales
      try {
        await supabase.from('otd_scale').delete().eq('otd_id', oid);
        if (scales.length > 0) {
          const scaleRowsToInsert = scales.map(sc => ({
            otd_id: oid,
            dimension_1: Number(sc.dimension_1 || 0),
            dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
            dimension_values: sc.dimension_values || [
              Number(sc.dimension_1 || 0),
              ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
            ],
            price: Number(sc.price || 0),
          }));
          await supabase.from('otd_scale').insert(scaleRowsToInsert);
        }
      } catch {
        // otd_scale table may not be present in all environments
      }

      // Linked product scales if associated with a master product
      const { data: otdRecord } = await supabase.from('otd').select('product_id').eq('id', oid).maybeSingle();
      if (otdRecord?.product_id && scales.length > 0) {
        try {
          await supabase.from('product_scale').delete().eq('product_id', otdRecord.product_id);
          const pScaleInserts = scales.map(sc => ({
            product_id: otdRecord.product_id,
            dimension_1: Number(sc.dimension_1 || 0),
            dimension_2: sc.dimension_2 != null ? Number(sc.dimension_2) : null,
            dimension_values: sc.dimension_values || [
              Number(sc.dimension_1 || 0),
              ...(sc.dimension_2 != null ? [Number(sc.dimension_2)] : []),
            ],
            price: Number(sc.price || 0),
          }));
          await supabase.from('product_scale').insert(pScaleInserts);
        } catch {
          // Ignore
        }
      }

      // 5. Version Snapshot
      const { data: allS } = await supabase
        .from('otd_selection')
        .select('*,otd_selection_option(*)')
        .eq('otd_id', oid)
        .order('sort_order');
      const { data: allV } = await supabase
        .from('otd_variable')
        .select('*')
        .eq('otd_id', oid)
        .order('sort_order');
      const { data: allC } = await supabase
        .from('otd_component')
        .select('*')
        .eq('otd_id', oid)
        .order('sort_order');

      const nextVersion =
        ((
          await supabase
            .from('otd_version')
            .select('version_number')
            .eq('otd_id', oid)
            .order('version_number', { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data?.version_number ?? 0) + 1;

      const snapshot = {
        otd: { ...otd, id: oid, company_id },
        selections: allS ?? selections,
        variables: allV ?? validVars,
        components: allC ?? comps,
        scales: scales.map(sc => ({
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
        .from('otd_version')
        .insert({ otd_id: oid, version_number: nextVersion, snapshot });
      if (ve) throw ve;

      setOtd(x => ({ ...x, id: oid, company_id }));
      setMessage(`Guardado correctamente. Versión ${nextVersion}.`);
      if (!editing) navigate(`/produccion/otd/${oid}`, { replace: true });
    } catch (err: any) {
      setMessage(err?.message ?? 'No se ha podido guardar.');
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
    { id: 'sec-identificacion', label: '1. Identificación', icon: FileCode, badge: undefined },
    { id: 'sec-entradas', label: '2. Entradas Oficina', icon: Sliders, badge: selections.length },
    { id: 'sec-escalado', label: '3. Escalado Base', icon: Ruler, badge: scales.length },
    { id: 'sec-formulacion', label: '4. Formulación', icon: Calculator, badge: variables.length },
    { id: 'sec-componentes', label: '5. Componentes', icon: Layers3, badge: components.length },
  ];

  return (
    <div className="otd-page">
      {/* Header */}
      <div className="otd-head">
        <div>
          <NavLink to="/produccion/otd" className="otd-back">
            <ArrowLeft size={15} /> OTD
          </NavLink>
          <div className="eyebrow">EDITOR TÉCNICO</div>
          <h1>{editing ? otd.name || 'Editar OTD' : 'Nuevo OTD'}</h1>
          <p>
            Configuración técnica del artículo compuesto. Define entradas, matriz de escalado base,
            fórmulas e incrementos de componentes.
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
          <button className="primary-btn" onClick={() => save()} disabled={saving}>
            <Save size={16} />
            {saving ? 'Guardando…' : 'Guardar OTD'}
          </button>
        </div>
      </div>

      {/* Top Sticky Navigator for Maximum Horizontal Space */}
      <div className="otd-top-nav-wrapper">
        <nav className="otd-top-navigator" aria-label="Navegador de secciones OTD">
          <div className="otd-top-nav-items">
            {sectionsNav.map(sec => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  className={`otd-top-nav-item ${isActive ? 'active' : ''}`}
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
          <section id="sec-identificacion" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>1. Identificación</h2>
                <p>Definición y datos maestros del artículo compuesto.</p>
              </div>
            </div>
            <div className="otd-grid three">
              <label>
                Código *
                <input value={otd.code} onChange={e => setOtd({ ...otd, code: e.target.value })} />
              </label>
              <label>
                Nombre del Producto *
                <input value={otd.name} onChange={e => setOtd({ ...otd, name: e.target.value })} />
              </label>
              <label>
                Tipo de Plantilla
                <select
                  value={otd.template_type ?? ''}
                  onChange={e => setOtd({ ...otd, template_type: e.target.value })}
                >
                  <option value="TOLDO">Toldo</option>
                  <option value="PERGOLA">Pérgola</option>
                  <option value="CORTINA">Cortina / Estor</option>
                  <option value="">Genérico</option>
                </select>
              </label>
            </div>
          </section>

          {/* SECTION 2: Entradas para oficina */}
          <section id="sec-entradas" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>2. Entradas para oficina</h2>
                <p>
                  Parámetros que el usuario de ventas / presupuestos introducirá. Marca las que son
                  dimensiones para el escalado.
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setSelections(x => [...x, emptySelection()])}
              >
                <Plus size={15} /> Añadir entrada
              </button>
            </div>

            {selections.length === 0 ? (
              <div className="otd-empty">Todavía no hay entradas de oficina definidas.</div>
            ) : (
              selections.map((s, si) => (
                <div className="otd-row-card" key={si}>
                  <div className="otd-row-actions">
                    <span className="row-tag">
                      <strong>
                        {si + 1}. Entrada: {s.code || 'Sin código'}
                      </strong>{' '}
                      {s.is_dimension && <span className="dimension-badge">DIMENSIÓN ESCALADO</span>}
                    </span>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Eliminar entrada"
                      onClick={() => setSelections(x => x.filter((_, i) => i !== si))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="otd-grid four">
                    <label>
                      Código (variable) *
                      <input
                        value={s.code}
                        onChange={e => {
                          const x = [...selections];
                          x[si] = { ...s, code: e.target.value.toUpperCase().replace(/\s+/g, '_') };
                          setSelections(x);
                        }}
                        placeholder="Ej. ANCHO"
                      />
                    </label>
                    <label>
                      Nombre visible
                      <input
                        value={s.name}
                        onChange={e => {
                          const x = [...selections];
                          x[si] = { ...s, name: e.target.value };
                          setSelections(x);
                        }}
                        placeholder="Ej. Ancho (mm)"
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={s.selection_type}
                        onChange={e => {
                          const x = [...selections];
                          x[si] = { ...s, selection_type: e.target.value as Selection['selection_type'] };
                          setSelections(x);
                        }}
                      >
                        <option value="NUMBER">NUMBER (Numérico/Medida)</option>
                        <option value="OPTION">OPTION (Lista desplegable)</option>
                        <option value="TEXT">TEXT (Texto libre)</option>
                        <option value="BOOLEAN">BOOLEAN (Sí/No)</option>
                      </select>
                    </label>
                    <div className="checks-group">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={s.required}
                          onChange={e => {
                            const x = [...selections];
                            x[si] = { ...s, required: e.target.checked };
                            setSelections(x);
                          }}
                        />{' '}
                        Obligatorio
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={s.is_dimension}
                          onChange={e => {
                            const x = [...selections];
                            x[si] = { ...s, is_dimension: e.target.checked };
                            setSelections(x);
                          }}
                        />{' '}
                        Es dimensión
                      </label>
                    </div>
                  </div>

                  {s.selection_type === 'OPTION' && (
                    <div className="otd-options-subcard">
                      <div className="otd-options-subhead">
                        <strong>Opciones de la lista desplegable ({s.options.length})</strong>
                        <button
                          type="button"
                          className="secondary-btn small"
                          onClick={() => {
                            const x = [...selections];
                            x[si].options = [...x[si].options, emptyOption(s)];
                            setSelections(x);
                          }}
                        >
                          <Plus size={13} /> Añadir opción
                        </button>
                      </div>

                      {s.options.length > 0 && (
                        <div className="otd-options-header-row">
                          <span>Nombre visible</span>
                          <span>Valor numérico / técnico</span>
                          <span></span>
                        </div>
                      )}

                      {s.options.map((o, oi) => (
                        <div className="otd-option-row" key={oi}>
                          <input
                            placeholder="Nombre visible (ej. No, Sí, Motor 50Nm, Blanco...)"
                            value={o.label}
                            onChange={e => {
                              const x = [...selections];
                              const newLabel = e.target.value;
                              x[si].options[oi].label = newLabel;
                              if (!x[si].options[oi].value && !x[si].options[oi].code) {
                                x[si].options[oi].code = newLabel.toUpperCase().replace(/\s+/g, '_');
                              }
                              setSelections(x);
                            }}
                          />
                          <input
                            placeholder="Valor numérico (ej. 0, 1, 50, RAL9010...)"
                            value={o.value ?? o.code ?? ''}
                            onChange={e => {
                              const x = [...selections];
                              const newVal = e.target.value;
                              x[si].options[oi].value = newVal;
                              x[si].options[oi].code = newVal || x[si].options[oi].label.toUpperCase().replace(/\s+/g, '_');
                              setSelections(x);
                            }}
                          />
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Eliminar opción"
                            onClick={() => {
                              const x = [...selections];
                              x[si].options = x[si].options.filter((_, i) => i !== oi);
                              setSelections(x);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
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
                  El OTD tiene su propio escalado que determina el precio base del producto compuesto.
                  Si un componente básico no tiene incremento de precio, no modificará este precio base.
                </p>
              </div>
              <div className="scale-head-actions">
                <button type="button" className="secondary-btn" onClick={addScaleRow}>
                  <Plus size={15} /> Añadir Fila
                </button>
              </div>
            </div>

            {/* Scales Table */}
            {scales.length === 0 ? (
              <div className="otd-empty">
                No hay tarifas de escalado base definidas. Pulsa en 'Añadir Fila' para crear las tarifas.
              </div>
            ) : (
              <div className="otd-scale-table-wrap">
                <table className="otd-scale-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Dimensión 1 (Hasta mm)</th>
                      <th>Dimensión 2 (Hasta mm)</th>
                      <th>Precio Base (€)</th>
                      <th style={{ width: '48px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scales.map((sc, sci) => (
                      <tr key={sc.id || sci}>
                        <td>{sci + 1}</td>
                        <td>
                          <input
                            type="number"
                            value={sc.dimension_1}
                            onChange={e =>
                              updateScaleRow(sci, { dimension_1: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={sc.dimension_2 ?? ''}
                            placeholder="Opcional"
                            onChange={e =>
                              updateScaleRow(sci, {
                                dimension_2: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={sc.price}
                            onChange={e =>
                              updateScaleRow(sci, { price: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Eliminar fila de escalado"
                            onClick={() => removeScaleRow(sci)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION 4: Formulación */}
          <section id="sec-formulacion" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>4. Formulación y Variables Calculadas</h2>
                <p>
                  El técnico define las variables y fórmulas intermedias; la oficina no necesita
                  conocerlas.
                </p>
              </div>
              <span className="ai-badge">
                <WandSparkles size={14} /> Fórmulas Aritméticas
              </span>
            </div>

            <label>
              Regla o notas de cálculo en lenguaje natural
              <textarea
                value={naturalRule}
                onChange={e => setNaturalRule(e.target.value)}
                placeholder="Ejemplo: si el ancho supera 4000 mm, añadir un soporte central adicional; la superficie de lona es (ANCHO * SALIDA) / 1000000."
              />
            </label>

            <div className="hint">
              Variables disponibles:{' '}
              {variables
                .filter(v => v.code)
                .map(v => v.code)
                .join(', ') || 'todavía no definidas'}
              .
            </div>

            {variables.map((v, vi) => (
              <div className="otd-rule-line-container" key={vi}>
                <div className="otd-rule-line">
                  <input
                    placeholder="Código (ej. SUPERFICIE)"
                    value={v.code}
                    onChange={e => {
                      const x = [...variables];
                      x[vi] = { ...v, code: e.target.value.toUpperCase().replace(/\s+/g, '_') };
                      setVariables(x);
                    }}
                  />
                  <input
                    placeholder="Nombre descriptivo"
                    value={v.name}
                    onChange={e => {
                      const x = [...variables];
                      x[vi] = { ...v, name: e.target.value };
                      setVariables(x);
                    }}
                  />
                  <div className="wide">
                    <FormulaPredictiveInput
                      value={v.expression ?? ''}
                      onChange={val => {
                        const x = [...variables];
                        x[vi] = { ...v, expression: val };
                        setVariables(x);
                      }}
                      placeholder="Expresión técnica (ej. ANCHO * SALIDA / 1000000)"
                      availableInputs={selections}
                      availableVariables={variables.filter((_, i) => i !== vi)}
                      compact
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Eliminar variable"
                    onClick={() => setVariables(x => x.filter((_, i) => i !== vi))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              className="secondary-btn"
              onClick={() => setVariables(x => [...x, emptyVariable()])}
            >
              <Plus size={15} /> Añadir variable calculada
            </button>
          </section>

          {/* SECTION 5: Componentes del producto */}
          <section id="sec-componentes" className="otd-card otd-section-anchor">
            <div className="otd-card-head">
              <div>
                <h2>5. Componentes del producto</h2>
                <p>
                  Cada componente es un artículo real de ONIN. Si el OTD tiene escalado base, los
                  componentes básicos no aumentan el precio salvo que se definan como Mejoras con
                  incremento de precio.
                </p>
              </div>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setComponents(x => [...x, emptyComponent()])}
              >
                <Plus size={15} /> Añadir artículo
              </button>
            </div>

            {components.length === 0 ? (
              <div className="otd-empty">Todavía no hay artículos vinculados al OTD.</div>
            ) : (
              components.map((c, ci) => {
                const product = c.product_id ? products[c.product_id] : undefined;
                const dimensions = product?.measurement_type?.dimensions ?? [];
                const characteristics = product?.characteristics ?? [];
                const dynamic = Boolean(c.characteristic_expression?.trim());
                return (
                  <div className="otd-row-card" key={c.id || ci}>
                    <div className="otd-row-actions">
                      <div className="row-tag">
                        <strong>
                          {ci + 1}. Componente: {product?.code || c.code || 'Sin seleccionar'}
                        </strong>
                        <span
                          className={`comp-type-chip ${c.component_type === 'IMPROVEMENT' ? 'improvement' : 'basic'}`}
                        >
                          {c.component_type === 'IMPROVEMENT'
                            ? 'Mejora con incremento'
                            : 'Básico (incluido en base)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Eliminar componente"
                        onClick={() => setComponents(x => x.filter((_, i) => i !== ci))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className={`otd-component-grid ${c.component_type === 'IMPROVEMENT' ? 'has-improvement' : ''}`}>
                      {/* Product Selector */}
                      <div className="otd-product-field">
                        <span className="field-label">Artículo ONIN *</span>
                        {product ? (
                          <div className="otd-product-selected">
                            <div>
                              <strong>{product.code}</strong>
                              <span>
                                {product.commercial_description ||
                                  product.technical_description ||
                                  'Sin descripción'}
                              </span>
                              {product.measurement_type && (
                                <small>
                                  Tipo de medida: {product.measurement_type.name} ·{' '}
                                  {product.measurement_type.dimension_count} dimensión(es)
                                </small>
                              )}
                            </div>
                            <div className="prod-select-actions">
                              <button
                                type="button"
                                className="icon-btn"
                                title="Cambiar artículo"
                                onClick={() => {
                                  setActiveProductComponent(ci);
                                  setProductSearch(product.code);
                                  void searchProducts(product.code);
                                }}
                              >
                                <Search size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn danger"
                                title="Quitar artículo"
                                onClick={() => clearProduct(ci)}
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="product-select-empty"
                            onClick={() => {
                              setActiveProductComponent(ci);
                              setProductSearch('');
                              setProductResults([]);
                            }}
                          >
                            <Search size={16} /> Seleccionar artículo de ONIN
                          </button>
                        )}

                        {activeProductComponent === ci && (
                          <div className="otd-product-picker">
                            <div className="otd-product-search">
                              <Search size={15} />
                              <input
                                autoFocus
                                value={productSearch}
                                onChange={e => void searchProducts(e.target.value)}
                                placeholder="Buscar por código o descripción…"
                              />
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => {
                                  setActiveProductComponent(null);
                                  setProductResults([]);
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {productResults.length > 0 ? (
                              <div className="otd-product-results">
                                {productResults.map(p => (
                                  <button
                                    type="button"
                                    key={p.id}
                                    onClick={() => selectProduct(ci, p)}
                                  >
                                    <strong>{p.code}</strong>
                                    <span>
                                      {p.commercial_description ||
                                        p.technical_description ||
                                        'Sin descripción'}
                                    </span>
                                    {p.characteristics.length > 0 && (
                                      <small>
                                        {p.characteristics.length} característica(s) ·{' '}
                                        {p.measurement_type
                                          ? `${p.measurement_type.name} · ${p.measurement_type.dimension_count} dimensión(es)`
                                          : ''}
                                      </small>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : productSearch.length >= 2 ? (
                              <div className="otd-product-no-results">
                                No se han encontrado artículos.
                              </div>
                            ) : (
                              <div className="otd-product-no-results">
                                Escribe al menos 2 caracteres.
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Component Type */}
                      <label>
                        <span className="field-label">Tipo de componente</span>
                        <select
                          value={c.component_type}
                          onChange={e =>
                            updateComponent(ci, {
                              component_type: e.target.value as Component['component_type'],
                            })
                          }
                        >
                          <option value="BASIC">Básico (Incluido en base)</option>
                          <option value="IMPROVEMENT">Mejora (Aplica incremento)</option>
                        </select>
                      </label>

                      {/* Quantity / Formula with Predictive Autocomplete & Collapsible Assistant */}
                      <div className="otd-quantity-formula-col">
                        <FormulaPredictiveInput
                          label="Cantidad / fórmula"
                          required
                          value={c.quantity_expression ?? ''}
                          onChange={val => updateComponent(ci, { quantity_expression: val })}
                          placeholder="Ej. 1, ANCHO / 1000, CEIL(ANCHO / 1500) o SUPERFICIE"
                          availableInputs={selections}
                          availableVariables={variables}
                        />
                      </div>

                      {/* Improvement Pricing */}
                      {c.component_type === 'IMPROVEMENT' && (
                        <>
                          <label>
                            <span className="field-label">Tipo incremento</span>
                            <select
                              value={c.price_increment_type}
                              onChange={e =>
                                updateComponent(ci, {
                                  price_increment_type: e.target
                                    .value as Component['price_increment_type'],
                                })
                              }
                            >
                              <option value="FIXED">Importe fijo (€)</option>
                              <option value="PERCENTAGE">Porcentaje sobre base (%)</option>
                            </select>
                          </label>

                          <label>
                            <span className="field-label">Valor incremento</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={c.price_increment}
                              onChange={e =>
                                updateComponent(ci, {
                                  price_increment: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                            />
                          </label>
                        </>
                      )}
                    </div>

                    {/* Characteristic / Color */}
                    {characteristics.length > 0 && (
                      <div className="otd-characteristic-block">
                        <div className="otd-dimensions-title">
                          <strong>Característica / Color del Componente</strong>
                          <span>Puede ser fija o resolverse dinámicamente desde una entrada/variable.</span>
                        </div>
                        <div className="otd-characteristic-grid">
                          <label>
                            <span className="field-label">Origen de la característica</span>
                            <select
                              value={dynamic ? 'VARIABLE' : 'FIXED'}
                              onChange={e =>
                                e.target.value === 'VARIABLE'
                                  ? updateComponent(ci, { characteristic_id: null })
                                  : updateComponent(ci, { characteristic_expression: null })
                              }
                            >
                              <option value="FIXED">Fija seleccionada</option>
                              <option value="VARIABLE">Variable o Entrada dinámica</option>
                            </select>
                          </label>

                          {dynamic ? (
                            <div className="otd-characteristic-expr-wrap">
                              <FormulaPredictiveInput
                                label="Variable / Entrada"
                                value={c.characteristic_expression ?? ''}
                                onChange={val =>
                                  updateComponent(ci, {
                                    characteristic_expression: val,
                                    characteristic_id: null,
                                  })
                                }
                                placeholder="Ej. LONA o COLOR"
                                availableInputs={selections}
                                availableVariables={variables}
                                compact
                              />
                            </div>
                          ) : (
                            <label>
                              <span className="field-label">Característica</span>
                              <select
                                value={c.characteristic_id ?? ''}
                                onChange={e =>
                                  updateComponent(ci, {
                                    characteristic_id: e.target.value ? Number(e.target.value) : null,
                                    characteristic_expression: null,
                                  })
                                }
                              >
                                <option value="">Seleccionar característica…</option>
                                {characteristics.map(ch => (
                                  <option key={ch.id} value={ch.id}>
                                    {ch.code}
                                    {ch.description ? ` · ${ch.description}` : ''}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Dimensions */}
                    {dimensions.length > 0 && (
                      <div className="otd-dimensions-block">
                        <div className="otd-dimensions-title">
                          <strong>Dimensiones del artículo para corte y fabricación</strong>
                          <span>Expresiones calculadas para el despiece del artículo.</span>
                        </div>
                        <div className="otd-dimensions-grid">
                          {dimensions.map(d => (
                            <div key={d.id} className="otd-dimension-item">
                              <FormulaPredictiveInput
                                label={`${d.name} ${d.unit?.name || d.unit?.code ? `(${d.unit?.name || d.unit?.code})` : ''}`}
                                value={c.dimension_expressions?.[d.code] ?? ''}
                                onChange={val =>
                                  updateComponent(ci, {
                                    dimension_expressions: {
                                      ...c.dimension_expressions,
                                      [d.code]: val,
                                    },
                                  })
                                }
                                placeholder="Ej. ANCHO o SALIDA"
                                availableInputs={selections}
                                availableVariables={variables}
                                compact
                              />
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

          {message && (
            <div className={`otd-message ${message.startsWith('Guardado') ? 'ok' : 'error'}`}>
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export function OtdList() {
  const [rows, setRows] = useState<Otd[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from('otd')
      .select('*')
      .order('name')
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="otd-page">
      <div className="otd-head">
        <div>
          <div className="eyebrow">PRODUCCIÓN</div>
          <h1>OTD (Objetos Técnicos Dinámicos)</h1>
          <p>Configuradores técnicos de productos compuestos con escalado y formulación.</p>
        </div>
        <NavLink to="/produccion/otd/nuevo" className="primary-btn">
          <Plus size={16} /> Nuevo OTD
        </NavLink>
      </div>
      <div className="otd-card">
        {loading ? (
          <div className="otd-empty">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="otd-empty">No hay OTD creados todavía.</div>
        ) : (
          rows.map(r => (
            <NavLink className="otd-list-row" key={r.id} to={`/produccion/otd/${r.id}`}>
              <span>
                <strong>{r.name}</strong> · {r.code}
              </span>
              <span className="otd-pill">{r.template_type ?? 'Genérico'}</span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
