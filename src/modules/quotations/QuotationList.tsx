import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Plus,
  RotateCcw,
  Search,
  Mail,
  CheckCircle2,
  RefreshCw,
  Eye,
  AlertTriangle,
  ArrowRight,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  listQuotations,
  type QuotationSummary,
  isQuotationExpired,
  getEffectiveStatus,
  renewQuotationValidity,
  updateQuotationStatus,
} from "../../services/sales/quotationRepository";
import { QuotationEmailModal } from "./QuotationEmailModal";
import { QuotationRenewModal } from "./QuotationRenewModal";
import { Toast } from "../../components/ui/Toast";
import "./quotation.css";

function customerName(row: QuotationSummary) {
  return (
    row.customer?.party?.trade_name ||
    row.customer?.party?.legal_name ||
    "Sin cliente"
  );
}

function customerLegalName(row: QuotationSummary) {
  const p = row.customer?.party;
  return p?.trade_name && p.legal_name && p.trade_name !== p.legal_name
    ? p.legal_name
    : "";
}

function commercialName(row: QuotationSummary) {
  return (
    row.commercial?.party?.trade_name ||
    row.commercial?.party?.legal_name ||
    "Sin asignar"
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    SENT: "Enviado",
    ACCEPTED: "Aceptado",
    REJECTED: "Rechazado",
    EXPIRED: "Caducado",
  };
  return labels[status] || status;
}

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function QuotationList() {
  const [rows, setRows] = useState<QuotationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Quick modals from list
  const [emailQuote, setEmailQuote] = useState<QuotationSummary | null>(null);
  const [renewQuote, setRenewQuote] = useState<QuotationSummary | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await listQuotations(search));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar los presupuestos.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Compute effective status for each row
  const enrichedRows = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      effectiveStatus: getEffectiveStatus(r),
    }));
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (statusFilter === "all") return enrichedRows;
    return enrichedRows.filter((r) => r.effectiveStatus === statusFilter);
  }, [enrichedRows, statusFilter]);

  const total = useMemo(() => {
    return visibleRows.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0,
    );
  }, [visibleRows]);

  const counts = useMemo(() => {
    return {
      draft: enrichedRows.filter((r) => r.effectiveStatus === "DRAFT").length,
      sent: enrichedRows.filter((r) => r.effectiveStatus === "SENT").length,
      accepted: enrichedRows.filter((r) => r.effectiveStatus === "ACCEPTED")
        .length,
      rejected: enrichedRows.filter((r) => r.effectiveStatus === "REJECTED")
        .length,
      expired: enrichedRows.filter((r) => r.effectiveStatus === "EXPIRED")
        .length,
    };
  }, [enrichedRows]);

  return (
    <div className="module-page quotation-page">
      {toast && <Toast message={toast} onClose={() => setToast("")} />}

      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / PRESUPUESTOS</div>
          <h1>Presupuestos Comerciales</h1>
          <p>
            Ciclo completo de presupuestos: Borradores, Envíos, Aceptados,
            Albaranes y Renovación de Caducados.
          </p>
        </div>
        <div className="quotation-head-actions">
          <Link className="secondary-button" to="/facturacion/albaranes">
            <Truck size={15} /> Ver Albaranes
          </Link>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void load()}
          >
            <RotateCcw size={15} /> Actualizar
          </button>
          <Link className="primary-button" to="/ventas/presupuestos/nuevo">
            <Plus size={16} /> Nuevo presupuesto
          </Link>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="quotation-list-summary">
        <div className="quotation-summary-card">
          <div>
            <span>Presupuestos Visibles</span>
            <strong>{visibleRows.length}</strong>
            <small>
              {counts.draft} borradores · {counts.sent} enviados ·{" "}
              {counts.accepted} aceptados
            </small>
          </div>
        </div>
        <div className="quotation-summary-card accent">
          <div>
            <span>Importe Visible</span>
            <strong>{money(total)}</strong>
            <small>Suma según filtros actuales</small>
          </div>
        </div>
        <div className="quotation-summary-card">
          <div>
            <span>Caducados pendientes</span>
            <strong className={counts.expired > 0 ? "expired-text" : ""}>
              {counts.expired}
            </strong>
            <small>
              {counts.expired > 0
                ? "Requieren renovar fecha de validez"
                : "Ningún presupuesto vencido"}
            </small>
          </div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, código o referencia…"
            aria-label="Buscar presupuesto"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos los estados ({enrichedRows.length})</option>
          <option value="DRAFT">Borradores ({counts.draft})</option>
          <option value="SENT">Enviados ({counts.sent})</option>
          <option value="ACCEPTED">Aceptados ({counts.accepted})</option>
          <option value="EXPIRED">Caducados ({counts.expired})</option>
          <option value="REJECTED">Rechazados ({counts.rejected})</option>
        </select>

        <span className="result-count">{visibleRows.length} presupuestos</span>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {/* Table */}
      <div className="table-panel quotation-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: "130px" }}>Número</th>
              <th style={{ width: "100px" }}>Fecha</th>
              <th style={{ width: "100px" }}>Validez</th>
              <th>Cliente</th>
              <th>Comercial</th>
              <th style={{ width: "120px" }}>Estado</th>
              <th className="numeric" style={{ width: "120px" }}>
                Importe
              </th>
              <th style={{ width: "100px" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ textAlign: "center", padding: "32px" }}
                >
                  Cargando presupuestos…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <FileText size={32} />
                    <strong>No hay presupuestos que coincidan</strong>
                    <span>
                      Prueba otra búsqueda o cambia el filtro de estado.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => (
                <tr key={r.id} className="clickable-row">
                  <td>
                    <div className="quotation-number">
                      <Link
                        className="primary-link"
                        to={`/ventas/presupuestos/${r.id}`}
                      >
                        {r.code}
                      </Link>
                      <small>Nº {r.id}</small>
                    </div>
                  </td>
                  <td>
                    {new Date(`${r.issue_date}T00:00:00`).toLocaleDateString(
                      "es-ES",
                    )}
                  </td>
                  <td>
                    <span
                      className={
                        r.effectiveStatus === "EXPIRED" ? "expired-text" : ""
                      }
                    >
                      {r.valid_until
                        ? new Date(
                            `${r.valid_until}T00:00:00`,
                          ).toLocaleDateString("es-ES")
                        : "—"}
                    </span>
                  </td>
                  <td>
                    <div className="quotation-customer">
                      <strong>{customerName(r)}</strong>
                      {customerLegalName(r) && (
                        <span>{customerLegalName(r)}</span>
                      )}
                    </div>
                  </td>
                  <td>{commercialName(r)}</td>
                  <td>
                    <span
                      className={`quotation-status ${r.effectiveStatus.toLowerCase()}`}
                    >
                      {statusLabel(r.effectiveStatus)}
                    </span>
                  </td>
                  <td className="numeric">
                    <strong>{money(Number(r.total_amount || 0))}</strong>
                  </td>
                  <td>
                    <div className="row-quick-actions">
                      <Link
                        className="secondary-button compact"
                        to={`/ventas/presupuestos/${r.id}`}
                        title="Ver detalle del presupuesto"
                      >
                        <Eye size={13} />
                      </Link>
                      {r.effectiveStatus === "EXPIRED" && (
                        <button
                          type="button"
                          className="primary-button compact renew-quick-btn"
                          title="Renovar fecha de validez"
                          onClick={() => setRenewQuote(r)}
                        >
                          <RefreshCw size={13} />
                        </button>
                      )}
                      {r.effectiveStatus === "DRAFT" && (
                        <button
                          type="button"
                          className="secondary-button compact"
                          title="Enviar por email"
                          onClick={() => setEmailQuote(r)}
                        >
                          <Mail size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick Email Modal */}
      {emailQuote && (
        <QuotationEmailModal
          isOpen={!!emailQuote}
          onClose={() => setEmailQuote(null)}
          quotation={emailQuote}
          onSentSuccess={() => {
            setToast(
              "Presupuesto enviado por correo. Estado actualizado a Enviado.",
            );
            void load();
          }}
        />
      )}

      {/* Quick Renew Modal */}
      {renewQuote && (
        <QuotationRenewModal
          isOpen={!!renewQuote}
          onClose={() => setRenewQuote(null)}
          quotation={renewQuote}
          onRenewSuccess={() => {
            setToast(
              "Fecha de validez renovada con éxito. Presupuesto en estado Enviado.",
            );
            void load();
          }}
        />
      )}
    </div>
  );
}
