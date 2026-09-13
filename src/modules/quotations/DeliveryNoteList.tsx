import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Truck, Search, RotateCcw, Eye } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { listDeliveryNotes, getDeliveryNoteById, type DeliveryNote, type DeliveryNoteSortField } from "../../services/sales/deliveryNoteService";
import { SalesOrderDeliveryNoteModal } from "../orders/SalesOrderDeliveryNoteModal";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import "./quotation.css";
import "../orders/sales-order.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function DeliveryNoteList() {
  const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<DeliveryNoteSortField>("issue_date");
  const [ascending, setAscending] = useState(false);
  const [selectedNote, setSelectedNote] = useState<DeliveryNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();

  async function load() {
    setLoading(true);
    setError("");
    try {
      setNotes(await listDeliveryNotes(sortBy, ascending));
    } catch (e) {
      setError(e instanceof CoreRepositoryError || e instanceof Error ? e.message : "No se pudieron cargar los albaranes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, ascending]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    getDeliveryNoteById(Number(openId))
      .then((note) => {
        if (note) setSelectedNote(note);
      })
      .catch(() => {});
  }, [searchParams]);

  function closeModal() {
    setSelectedNote(null);
    if (searchParams.has("open")) {
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  }

  const filtered = notes.filter((n) => {
    if (statusFilter !== "ALL" && n.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      n.code.toLowerCase().includes(term) ||
      n.sales_order_code.toLowerCase().includes(term) ||
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
          <p>Documentos de expedición y entrega generados desde pedidos fabricados (e instalaciones completadas).</p>
        </div>
        <div className="quotation-head-actions">
          <button className="secondary-button" type="button" onClick={() => void load()}>
            <RotateCcw size={15} /> Actualizar
          </button>
          <Link className="primary-button" to="/ventas/pedidos">
            <Truck size={15} /> Ir a Pedidos
          </Link>
        </div>
      </div>

      {error && <div className="inline-error">{error}</div>}

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
            <strong>{money(filtered.reduce((s, n) => s + (n.total_amount || 0), 0))}</strong>
            <small>Total según filtros</small>
          </div>
        </div>
        <div className="quotation-summary-card">
          <div>
            <span>Filtrando por</span>
            <strong>{statusFilter === "ALL" ? "Todos los estados" : statusFilter}</strong>
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
            placeholder="Buscar por albarán, pedido, cliente…"
            aria-label="Buscar albaranes"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar por estado">
          <option value="ALL">Todos los estados</option>
          <option value="PREPARED">Preparado</option>
          <option value="SHIPPED">Enviado</option>
          <option value="DELIVERED">Entregado</option>
        </select>
        <div className="sales-order-sort">
          <label htmlFor="delivery-note-sort-field">Ordenar por</label>
          <select id="delivery-note-sort-field" value={sortBy} onChange={(e) => setSortBy(e.target.value as DeliveryNoteSortField)}>
            <option value="issue_date">Fecha de emisión</option>
            <option value="delivery_date">Fecha de entrega</option>
          </select>
          <button type="button" className="icon-link" onClick={() => setAscending((a) => !a)} title={ascending ? "Orden ascendente" : "Orden descendente"} aria-label={ascending ? "Orden ascendente" : "Orden descendente"}>
            {ascending ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
        <span className="result-count">{filtered.length} albaranes</span>
      </div>

      <div className="table-panel quotation-table">
        <table>
          <thead>
            <tr>
              <th>Albarán</th>
              <th>Fecha</th>
              <th>Pedido Origen</th>
              <th>Cliente</th>
              <th>Dirección de Entrega</th>
              <th>Transporte</th>
              <th className="numeric">Importe</th>
              <th style={{ width: "80px" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>Cargando…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <Truck size={32} />
                    <strong>No hay albaranes generados</strong>
                    <span>
                      Los albaranes se generan desde un pedido fabricado (o desde su montaje al completarse).
                    </span>
                    <Link to="/ventas/pedidos" className="primary-button" style={{ marginTop: "12px" }}>
                      Ver Pedidos
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((n) => (
                <tr key={n.id} className="clickable-row">
                  <td>
                    <div className="quotation-number">
                      <strong style={{ color: "var(--primary)", fontFamily: "var(--font-mono)" }}>{n.code}</strong>
                      <small>
                        {n.lines.length} {n.lines.length === 1 ? "artículo" : "artículos"}
                      </small>
                    </div>
                  </td>
                  <td>{new Date(`${n.issue_date}T00:00:00`).toLocaleDateString("es-ES")}</td>
                  <td>
                    <Link to={`/ventas/pedidos/${n.sales_order_id}`} className="primary-link">
                      {n.sales_order_code}
                    </Link>
                  </td>
                  <td>
                    <div className="quotation-customer">
                      <strong>{n.customer_name}</strong>
                      {n.customer_legal_name && n.customer_legal_name !== n.customer_name && <span>{n.customer_legal_name}</span>}
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
                      title="Consultar Documento Albarán"
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
        <SalesOrderDeliveryNoteModal
          note={selectedNote}
          onClose={closeModal}
          onStatusChange={(updated) => {
            setSelectedNote(updated);
            setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
          }}
        />
      )}
    </div>
  );
}
