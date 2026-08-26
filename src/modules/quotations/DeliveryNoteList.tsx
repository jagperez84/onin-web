import { useEffect, useState } from "react";
import {
  Truck,
  Search,
  RotateCcw,
  FileText,
  Printer,
  CheckCircle,
  Clock,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  listDeliveryNotes,
  type DeliveryNote,
} from "../../services/sales/deliveryNoteService";
import { QuotationDeliveryNoteModal } from "./QuotationDeliveryNoteModal";
import "./quotation.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function DeliveryNoteList() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);

  function load() {
    setNotes(listDeliveryNotes());
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = notes.filter((n) => {
    if (statusFilter !== "ALL" && n.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      n.code.toLowerCase().includes(term) ||
      n.quotation_code.toLowerCase().includes(term) ||
      n.customer_name.toLowerCase().includes(term) ||
      (n.carrier && n.carrier.toLowerCase().includes(term))
    );
  });

  return (
    <div className="module-page quotation-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">FACTURACIÓN / EXPEDICIÓN</div>
          <h1>Albaranes de Entrega</h1>
          <p>
            Documentos de expedición y entrega generados a partir de
            presupuestos aceptados.
          </p>
        </div>
        <div className="quotation-head-actions">
          <button className="secondary-button" type="button" onClick={load}>
            <RotateCcw size={15} /> Actualizar
          </button>
          <Link className="primary-button" to="/ventas/presupuestos">
            <FileText size={15} /> Ir a Presupuestos
          </Link>
        </div>
      </div>

      <div className="quotation-list-summary">
        <div className="quotation-summary-card">
          <div>
            <span>Total Albaranes</span>
            <strong>{notes.length}</strong>
            <small>Documentos registrados</small>
          </div>
        </div>
        <div className="quotation-summary-card accent">
          <div>
            <span>Importe en Expedición</span>
            <strong>
              {money(filtered.reduce((s, n) => s + (n.total_amount || 0), 0))}
            </strong>
            <small>Total según filtros</small>
          </div>
        </div>
        <div className="quotation-summary-card">
          <div>
            <span>Filtrando por</span>
            <strong>
              {statusFilter === "ALL" ? "Todos los estados" : statusFilter}
            </strong>
            <small>{filtered.length} visibles</small>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por albarán, presupuesto, cliente..."
            aria-label="Buscar albaranes"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="ALL">Todos los estados</option>
          <option value="PREPARED">Preparado</option>
          <option value="SHIPPED">Enviado</option>
          <option value="DELIVERED">Entregado</option>
        </select>
        <span className="result-count">{filtered.length} albaranes</span>
      </div>

      <div className="table-panel quotation-table">
        <table>
          <thead>
            <tr>
              <th>Albarán</th>
              <th>Fecha</th>
              <th>Presupuesto Origen</th>
              <th>Cliente</th>
              <th>Dirección de Entrega</th>
              <th>Transporte</th>
              <th className="numeric">Importe</th>
              <th style={{ width: "80px" }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <Truck size={32} />
                    <strong>No hay albaranes generados</strong>
                    <span>
                      Los albaranes se crean directamente desde los presupuestos
                      en estado <strong>Aceptado</strong>.
                    </span>
                    <Link
                      to="/ventas/presupuestos"
                      className="primary-button"
                      style={{ marginTop: "12px" }}
                    >
                      Ver Presupuestos
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((n) => (
                <tr key={n.id} className="clickable-row">
                  <td>
                    <div className="quotation-number">
                      <strong
                        style={{
                          color: "var(--primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {n.code}
                      </strong>
                      <small>
                        {n.lines.length}{" "}
                        {n.lines.length === 1 ? "artículo" : "artículos"}
                      </small>
                    </div>
                  </td>
                  <td>
                    {new Date(`${n.issue_date}T00:00:00`).toLocaleDateString(
                      "es-ES",
                    )}
                  </td>
                  <td>
                    <Link
                      to={`/ventas/presupuestos/${n.quotation_id}`}
                      className="primary-link"
                    >
                      {n.quotation_code}
                    </Link>
                  </td>
                  <td>
                    <div className="quotation-customer">
                      <strong>{n.customer_name}</strong>
                      {n.customer_legal_name &&
                        n.customer_legal_name !== n.customer_name && (
                          <span>{n.customer_legal_name}</span>
                        )}
                    </div>
                  </td>
                  <td>
                    <small>{n.delivery_address}</small>
                  </td>
                  <td>
                    <small>{n.carrier || "Propio"}</small>
                  </td>
                  <td className="numeric">
                    <strong>{money(n.total_amount)}</strong>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => setSelectedNote(n)}
                      title="Ver Documento Albarán"
                    >
                      <Eye size={14} /> Ver
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedNote && (
        <QuotationDeliveryNoteModal
          isOpen={!!selectedNote}
          onClose={() => setSelectedNote(null)}
          quotation={{
            id: selectedNote.quotation_id,
            code: selectedNote.quotation_code,
            total_amount: selectedNote.total_amount,
            notes: selectedNote.notes,
            customer: {
              party: {
                trade_name: selectedNote.customer_name,
                legal_name: selectedNote.customer_legal_name,
              },
            },
            lines: selectedNote.lines,
          }}
        />
      )}
    </div>
  );
}
