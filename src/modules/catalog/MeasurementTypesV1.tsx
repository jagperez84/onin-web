import { useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, X } from 'lucide-react';
import { LookupSelect } from '../../components/LookupSelect';
import { getActiveCompanies } from '../../services/core/coreRepository';
import { listUnits, type Unit } from '../../services/catalog/unitRepository';
import { listMeasurementTypes, upsertMeasurementType, type MeasurementDimension, type MeasurementType } from '../../services/catalog/measurementTypeRepository';
import './catalog.css';

const MAX_DIMENSIONS = 5;

const emptyDimension = (n: number): MeasurementDimension => ({
  dimension_number: n,
  code: `DIM${n}`,
  name: `Dimensión ${n}`,
  unit_id: null,
  decimals: 2,
});

const emptyType = (): MeasurementType => ({
  code: '',
  name: '',
  dimension_count: 0,
  result_unit_id: null,
  result_decimals: 2,
  calculation_type: '',
  formula: '',
  active: true,
  dimensions: [],
});

export function MeasurementTypesV1() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rows, setRows] = useState<MeasurementType[]>([]);
  const [form, setForm] = useState<MeasurementType>(emptyType());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const unitOptions = useMemo(() => units.map(u => ({ id: u.id, code: u.code, label: `${u.code} · ${u.name}` })), [units]);
  const unitLabel = (id?: number | null) => units.find(u => u.id === id)?.name ?? 'Sin unidad';
  const unitCode = (id?: number | null) => units.find(u => u.id === id)?.code ?? '';

  useEffect(() => {
    getActiveCompanies()
      .then(async companies => {
        const id = companies[0]?.id ?? null;
        setCompanyId(id);
        if (id) setUnits(await listUnits(id));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración de medidas.'));
  }, []);

  useEffect(() => { if (companyId) void load(); }, [companyId, search]);

  async function load() {
    if (!companyId) return;
    try {
      setRows(await listMeasurementTypes(companyId, search));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los tipos de medida.');
    }
  }

  function startNew() {
    setForm(emptyType());
    setEditing(true);
    setError('');
  }

  function startEdit(row: MeasurementType) {
    setForm({ ...row, dimensions: row.dimensions.map(d => ({ ...d })) });
    setEditing(true);
    setError('');
  }

  function changeCount(count: number) {
    const safeCount = Math.max(0, Math.min(MAX_DIMENSIONS, count));
    setForm(f => ({
      ...f,
      dimension_count: safeCount,
      dimensions: Array.from({ length: safeCount }, (_, i) => f.dimensions[i] ?? emptyDimension(i + 1)),
    }));
  }

  function updateDimension(index: number, patch: Partial<MeasurementDimension>) {
    setForm(f => ({
      ...f,
      dimensions: f.dimensions.map((d, i) => i === index ? { ...d, ...patch } : d),
    }));
  }

  async function save() {
    if (!companyId) {
      setError('No hay una empresa activa disponible.');
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      setError('Código y nombre son obligatorios.');
      return;
    }
    if (form.dimension_count < 0 || form.dimension_count > MAX_DIMENSIONS) {
      setError(`El número de dimensiones debe estar entre 0 y ${MAX_DIMENSIONS}.`);
      return;
    }
    if (form.dimension_count > 0 && form.dimensions.length !== form.dimension_count) {
      setError('La definición de dimensiones no coincide con el número indicado.');
      return;
    }
    if (form.dimension_count > 0 && form.dimensions.some(d => !d.code.trim() || !d.name.trim() || !d.unit_id)) {
      setError('Cada dimensión debe tener código, nombre y unidad.');
      return;
    }
    if (form.dimensions.some(d => !Number.isInteger(d.decimals) || d.decimals < 0 || d.decimals > 6)) {
      setError('Los decimales de las dimensiones deben estar entre 0 y 6.');
      return;
    }
    if (!Number.isInteger(form.result_decimals) || form.result_decimals < 0 || form.result_decimals > 6) {
      setError('Los decimales del resultado deben estar entre 0 y 6.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await upsertMeasurementType(companyId, form);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="module-page catalog-page">
    <div className="page-head">
      <div>
        <div className="eyebrow">VENTAS / CONFIGURACIÓN</div>
        <h1>Tipos de medida</h1>
        <p>Define estructuras dimensionales reutilizables para los artículos. El tipo de medida no determina por sí mismo el comportamiento del artículo.</p>
      </div>
      <button className="primary-button" onClick={startNew}><Plus size={16}/> Nuevo tipo de medida</button>
    </div>

    {error && <div className="inline-error">{error}</div>}

    <div className="catalog-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Tipos de medida</h2>
            <p>Una definición puede reutilizarse en distintas familias y artículos cuando se conecte desde el tipo de control.</p>
          </div>
        </div>
        <div className="catalog-toolbar measurement-search">
          <div className="search-field">
            <Search size={16}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o nombre..." aria-label="Buscar tipos de medida" />
            {search && <button type="button" className="search-clear" onClick={() => setSearch('')} title="Limpiar búsqueda"><X size={14}/></button>}
          </div>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table measurement-table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Dimensiones</th><th>Cálculo</th><th>Resultado</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => <tr key={r.id}>
                <td><strong>{r.code}</strong></td>
                <td>{r.name}</td>
                <td>{r.dimensions.length ? <div className="dimension-summary">{r.dimensions.map(d => <span key={d.dimension_number}>{d.name} <small>{unitCode(d.unit_id)}</small></span>)}</div> : 'Sin dimensiones'}</td>
                <td>{r.calculation_type || '—'}</td>
                <td>{r.result_unit_id ? `${unitCode(r.result_unit_id)} · ${unitLabel(r.result_unit_id)}` : 'Sin unidad'} <small>· {r.result_decimals} dec.</small></td>
                <td><button className="icon-action" title="Editar" onClick={() => startEdit(r)}>Editar</button></td>
              </tr>)}
              {rows.length === 0 && <tr><td colSpan={6}><div className="empty-state">{search ? 'No hay tipos de medida que coincidan con la búsqueda.' : 'No hay tipos de medida definidos.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editing && <aside className="panel catalog-editor">
        <div className="panel-head">
          <div><h2>{form.id ? 'Editar' : 'Nuevo'} tipo de medida</h2><p>Define primero la estructura de las dimensiones y después el resultado.</p></div>
          <button className="icon-action" onClick={() => setEditing(false)} title="Cancelar"><X size={17}/></button>
        </div>

        <div className="form-grid">
          <label>Código *<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} maxLength={30}/></label>
          <label>Nombre *<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={100}/></label>
          <label>Nº dimensiones<select value={form.dimension_count} onChange={e => changeCount(Number(e.target.value))}>{Array.from({ length: MAX_DIMENSIONS + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Decimales resultado<input type="number" min={0} max={6} step={1} value={form.result_decimals} onChange={e => setForm({ ...form, result_decimals: Number(e.target.value) })}/></label>

          {form.dimension_count > 0 && <div className="wide measurement-dimensions">
            <div className="form-section-title">Dimensiones de entrada</div>
            <p className="form-help">Define qué valores necesita el cálculo. El orden de las dimensiones forma parte de la definición.</p>
            {form.dimensions.map((d, i) => <div className="measurement-dimension-row" key={d.dimension_number}>
              <div className="measurement-dimension-number">{i + 1}</div>
              <label>Código<input value={d.code} onChange={e => updateDimension(i, { code: e.target.value })} maxLength={30}/></label>
              <label>Nombre<input value={d.name} onChange={e => updateDimension(i, { name: e.target.value })} maxLength={100}/></label>
              <LookupSelect label="Unidad" required compact options={unitOptions} value={d.unit_id ?? null} onChange={id => updateDimension(i, { unit_id: id })} placeholder="Buscar unidad..." />
              <label>Decimales<input type="number" min={0} max={6} step={1} value={d.decimals} onChange={e => updateDimension(i, { decimals: Number(e.target.value) })}/></label>
            </div>)}
          </div>}

          <div className="wide measurement-calculation">
            <div className="form-section-title">Resultado y cálculo</div>
            <div className="form-grid">
              <LookupSelect label="Unidad resultado" options={unitOptions} value={form.result_unit_id ?? null} onChange={id => setForm({ ...form, result_unit_id: id })} placeholder="Buscar unidad..." />
              <label>Tipo de cálculo<input value={form.calculation_type ?? ''} onChange={e => setForm({ ...form, calculation_type: e.target.value })} placeholder="Identificador del cálculo" maxLength={50}/></label>
              <label className="wide">Fórmula<input value={form.formula ?? ''} onChange={e => setForm({ ...form, formula: e.target.value })} placeholder="Ej. DIM1 * DIM2" maxLength={500}/></label>
            </div>
            <p className="form-help">La fórmula se almacena como definición. La interpretación y ejecución se conectarán al motor de fórmulas en una fase posterior.</p>
          </div>
        </div>

        <div className="editor-actions">
          <button className="secondary-button" onClick={() => setEditing(false)}>Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={save}><Save size={15}/> {saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </aside>}
    </div>
  </div>;
}
