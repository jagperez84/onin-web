import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CreditCard, Edit3, Eye, Plus, Save, Search, Undo2 } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  createPaymentMethod,
  getPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  type PaymentMethod,
  type PaymentMethodForm,
  type PaymentMethodStatus,
} from "../../services/sales/paymentMethodRepository";
import "./payment-conditions.css";

const emptyForm = (): PaymentMethodForm => ({ code: "", name: "", active: true });

export function PaymentMethodList() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<PaymentMethod[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PaymentMethodStatus>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((c) => setCompanyId(c[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la empresa."));
  }, []);

  async function load() {
    if (companyId === null) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listPaymentMethods(companyId, search, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las formas de pago.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status]);

  return (
    <div className="module-page payment-conditions-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>Formas de pago</h1>
          <p>Catálogo de formas de pago disponibles para presupuestos y pedidos.</p>
        </div>
        <button className="primary-button" onClick={() => navigate("/configuracion/formas-pago/nuevo")}>
          <Plus size={16} />
          Nueva forma de pago
        </button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder="Buscar por código o nombre…"
            autoFocus
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as PaymentMethodStatus)}>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </select>
        <button className="secondary-button" onClick={() => void load()}>
          Buscar
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <CreditCard size={28} />
                    <strong>No hay formas de pago</strong>
                    <span>Prueba con otra búsqueda o crea una nueva.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/configuracion/formas-pago/${m.id}`}>{m.code || "—"}</Link>
                  </td>
                  <td>{m.name}</td>
                  <td>
                    <span className={`status ${m.active ? "active" : "inactive"}`}>{m.active ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td className="actions-col">
                    <Link className="icon-button" title="Consultar" to={`/configuracion/formas-pago/${m.id}`}>
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// React Router reuses the same component instance when only the :id param
// changes across sibling routes ("/nuevo" vs "/:id") since both render this
// same component type at the same tree position — it does not remount on
// its own. Without forcing a remount, state like `editing` could survive a
// create→redirect-to-detail transition and leave the form in an
// inconsistent state. Keying by id guarantees a fresh mount every time.
export function PaymentMethodDetail() {
  const { id } = useParams();
  return <PaymentMethodDetailInner key={id ?? "new"} />;
}

function PaymentMethodDetailInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "nuevo";
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [data, setData] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState<PaymentMethodForm>(emptyForm());
  const [editing, setEditing] = useState(isNew);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((c) => setCompanyId(c[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la empresa."));
  }, []);

  useEffect(() => {
    if (isNew || companyId === null) {
      setLoading(false);
      return;
    }
    if (!id || !/^[0-9]+$/.test(id)) {
      setLoading(false);
      setError("Identificador no válido.");
      return;
    }
    getPaymentMethod(companyId, Number(id))
      .then((m) => {
        setData(m);
        setForm({ code: m.code, name: m.name, active: m.active });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la forma de pago."))
      .finally(() => setLoading(false));
  }, [companyId, id, isNew]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (companyId === null) return;
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const newId = await createPaymentMethod(companyId, form);
        navigate(`/configuracion/formas-pago/${newId}`, { replace: true });
      } else {
        if (!id) return;
        await updatePaymentMethod(companyId, Number(id), form);
        setData(await getPaymentMethod(companyId, Number(id)));
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-block">Cargando forma de pago…</div>;

  return (
    <div className="module-page payment-conditions-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>{isNew ? "Nueva forma de pago" : data?.name || "Forma de pago"}</h1>
          <p>{isNew ? "Alta de una nueva forma de pago." : editing ? "Edición de la forma de pago." : "Consulta de la forma de pago."}</p>
        </div>
        <div className="page-actions">
          <button className="secondary-button" onClick={() => navigate("/configuracion/formas-pago")}>
            <ArrowLeft size={16} />
            Volver
          </button>
          {!isNew && !editing && (
            <button className="primary-button" onClick={() => setEditing(true)}>
              <Edit3 size={16} />
              Editar
            </button>
          )}
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          <label>
            <span>Código</span>
            <input
              className={!editing ? "readonly-field" : ""}
              value={form.code ?? ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
              maxLength={30}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              className={!editing ? "readonly-field" : ""}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
              required
              maxLength={120}
            />
          </label>
          <label>
            <span>Estado</span>
            <select
              className={!editing ? "readonly-field" : ""}
              value={form.active ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
              disabled={!editing}
            >
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </label>
        </div>
        <div className="form-footer">
          <div />
          <div className="page-actions">
            {editing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  isNew
                    ? navigate("/configuracion/formas-pago")
                    : (setEditing(false), data && setForm({ code: data.code, name: data.name, active: data.active }))
                }
              >
                <Undo2 size={15} />
                Cancelar
              </button>
            )}
            {editing && (
              <button type="submit" className="primary-button" disabled={saving}>
                <Save size={15} />
                Guardar
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
