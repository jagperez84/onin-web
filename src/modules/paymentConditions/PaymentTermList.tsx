import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Edit3, Eye, Handshake, Plus, Save, Search, Trash2, Undo2 } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  createPaymentTerm,
  getPaymentTerm,
  listPaymentTerms,
  updatePaymentTerm,
  type PaymentTerm,
  type PaymentTermForm,
  type PaymentTermInstallment,
  type PaymentTermStatus,
} from "../../services/sales/paymentTermRepository";
import "./payment-conditions.css";

const emptyForm = (): PaymentTermForm => ({ code: "", name: "", active: true, installments: [] });
const emptyInstallment = (): PaymentTermInstallment => ({ sequence: 0, percentage: 100, days_offset: 0, description: "" });
const installmentsTotal = (installments: PaymentTermInstallment[]) =>
  installments.reduce((sum, i) => sum + Number(i.percentage || 0), 0);

export function PaymentTermList() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<PaymentTerm[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PaymentTermStatus>("active");
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
      setRows(await listPaymentTerms(companyId, search, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las condiciones de pago.");
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
          <h1>Condiciones de pago</h1>
          <p>Plazos y porcentajes aplicables a presupuestos y pedidos.</p>
        </div>
        <button className="primary-button" onClick={() => navigate("/configuracion/condiciones-pago/nuevo")}>
          <Plus size={16} />
          Nueva condición de pago
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
        <select value={status} onChange={(e) => setStatus(e.target.value as PaymentTermStatus)}>
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
              <th>Plazos</th>
              <th>Estado</th>
              <th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <Handshake size={28} />
                    <strong>No hay condiciones de pago</strong>
                    <span>Prueba con otra búsqueda o crea una nueva.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/configuracion/condiciones-pago/${t.id}`}>{t.code || "—"}</Link>
                  </td>
                  <td>{t.name}</td>
                  <td>
                    {t.installments.length === 0
                      ? "—"
                      : t.installments.map((i) => `${i.percentage}% / ${i.days_offset}d`).join(" · ")}
                  </td>
                  <td>
                    <span className={`status ${t.active ? "active" : "inactive"}`}>{t.active ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td className="actions-col">
                    <Link className="icon-button" title="Consultar" to={`/configuracion/condiciones-pago/${t.id}`}>
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

export function PaymentTermDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "nuevo";
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [data, setData] = useState<PaymentTerm | null>(null);
  const [form, setForm] = useState<PaymentTermForm>(emptyForm());
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
    getPaymentTerm(companyId, Number(id))
      .then((t) => {
        setData(t);
        setForm({ code: t.code, name: t.name, active: t.active, installments: t.installments });
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la condición de pago."))
      .finally(() => setLoading(false));
  }, [companyId, id, isNew]);

  function patchInstallment(index: number, patch: Partial<PaymentTermInstallment>) {
    setForm((f) => ({
      ...f,
      installments: f.installments.map((i, idx) => (idx === index ? { ...i, ...patch } : i)),
    }));
  }
  function removeInstallment(index: number) {
    setForm((f) => ({ ...f, installments: f.installments.filter((_, idx) => idx !== index) }));
  }
  function addInstallment() {
    setForm((f) => ({ ...f, installments: [...f.installments, emptyInstallment()] }));
  }

  const total = installmentsTotal(form.installments);
  const totalMismatch = form.installments.length > 0 && Math.abs(total - 100) > 0.01;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (companyId === null) return;
    if (totalMismatch) {
      setError("Los plazos deben sumar 100% del importe.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const newId = await createPaymentTerm(companyId, form);
        navigate(`/configuracion/condiciones-pago/${newId}`, { replace: true });
      } else {
        if (!id) return;
        await updatePaymentTerm(companyId, Number(id), form);
        setData(await getPaymentTerm(companyId, Number(id)));
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-block">Cargando condición de pago…</div>;

  return (
    <div className="module-page payment-conditions-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>{isNew ? "Nueva condición de pago" : data?.name || "Condición de pago"}</h1>
          <p>{isNew ? "Alta de una nueva condición de pago." : editing ? "Edición de la condición de pago." : "Consulta de la condición de pago."}</p>
        </div>
        <div className="page-actions">
          <button className="secondary-button" onClick={() => navigate("/configuracion/condiciones-pago")}>
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

        <div className="payment-term-installments">
          <div className="payment-term-installments-head">
            <h2>Plazos</h2>
            {editing && (
              <button type="button" className="secondary-button" onClick={addInstallment}>
                <Plus size={14} />
                Añadir plazo
              </button>
            )}
          </div>
          {form.installments.length === 0 ? (
            <p className="muted">Sin plazos definidos — se entiende como pago único sin calendario asociado.</p>
          ) : (
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>% del importe</th>
                    <th>Días desde la fecha</th>
                    <th>Descripción</th>
                    {editing && <th className="actions-col"></th>}
                  </tr>
                </thead>
                <tbody>
                  {form.installments.map((inst, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <input
                          className={!editing ? "readonly-field" : ""}
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={inst.percentage}
                          onChange={(e) => patchInstallment(idx, { percentage: Number(e.target.value) })}
                          disabled={!editing}
                        />
                      </td>
                      <td>
                        <input
                          className={!editing ? "readonly-field" : ""}
                          type="number"
                          min="0"
                          step="1"
                          value={inst.days_offset}
                          onChange={(e) => patchInstallment(idx, { days_offset: Number(e.target.value) })}
                          disabled={!editing}
                        />
                      </td>
                      <td>
                        <input
                          className={!editing ? "readonly-field" : ""}
                          value={inst.description ?? ""}
                          onChange={(e) => patchInstallment(idx, { description: e.target.value })}
                          placeholder="Anticipo, entrega…"
                          disabled={!editing}
                        />
                      </td>
                      {editing && (
                        <td className="actions-col">
                          <button type="button" className="icon-button" title="Eliminar plazo" onClick={() => removeInstallment(idx)}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {form.installments.length > 0 && (
            <p className={`payment-term-total ${totalMismatch ? "mismatch" : ""}`}>
              Total: {total.toFixed(2)}% {totalMismatch && "— debe sumar 100%"}
            </p>
          )}
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
                    ? navigate("/configuracion/condiciones-pago")
                    : (setEditing(false),
                      data && setForm({ code: data.code, name: data.name, active: data.active, installments: data.installments }))
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
