import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Files,
  Percent,
  ReceiptText,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import {
  getCustomerCommercialSummary,
  type CustomerCommercialSummary,
  type CustomerDocumentRow,
  type CustomerDocumentType,
} from "../../services/sales/customerDocumentsRepository";
import "../quotations/quotation.css";
import "../orders/sales-order.css";
import "./customer-detail.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString("es-ES");

const TYPE_LABEL: Record<CustomerDocumentType, string> = {
  quotation: "Presupuesto",
  sales_order: "Pedido",
  delivery_note: "Albarán",
  invoice: "Factura",
};
const TYPE_ICON: Record<CustomerDocumentType, React.ReactNode> = {
  quotation: <FileText size={14} />,
  sales_order: <ShoppingCart size={14} />,
  delivery_note: <Truck size={14} />,
  invoice: <ReceiptText size={14} />,
};

type DocumentGroup = {
  key: string;
  order: CustomerDocumentRow | null;
  quotation: CustomerDocumentRow | null;
  deliveryNotes: CustomerDocumentRow[];
  invoices: CustomerDocumentRow[];
  date: string;
};

export function CustomerDocumentsSection({
  id = "documentos",
  customerId,
}: {
  id?: string;
  customerId: number;
}) {
  const [summary, setSummary] = useState<CustomerCommercialSummary | null>(null);
  const [typeFilter, setTypeFilter] = useState<CustomerDocumentType | "ALL">("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getCustomerCommercialSummary(customerId)
      .then((s) => {
        if (active) setSummary(s);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudieron cargar los documentos del cliente.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  const filteredDocuments = useMemo(() => {
    if (!summary) return [];
    if (typeFilter === "ALL") return summary.documents;
    return summary.documents.filter((d) => d.type === typeFilter);
  }, [summary, typeFilter]);

  // Agrupados por pedido: cada pedido reúne el presupuesto del que viene y
  // los albaranes/facturas que genera, para no ver todos los documentos
  // sueltos. Los presupuestos que nunca llegaron a pedido se quedan solos.
  const groups = useMemo<DocumentGroup[]>(() => {
    if (!summary) return [];
    const orders = summary.documents.filter((d) => d.type === "sales_order");
    const quotationById = new Map(summary.documents.filter((d) => d.type === "quotation").map((q) => [q.id, q]));
    const convertedQuotationIds = new Set(orders.map((o) => o.quotationId).filter((v): v is number => v != null));

    const orderGroups: DocumentGroup[] = orders.map((order) => ({
      key: `order-${order.id}`,
      order,
      quotation: order.quotationId != null ? quotationById.get(order.quotationId) ?? null : null,
      deliveryNotes: summary.documents.filter((d) => d.type === "delivery_note" && d.salesOrderId === order.id),
      invoices: summary.documents.filter((d) => d.type === "invoice" && d.salesOrderId === order.id),
      date: order.date,
    }));

    const standaloneGroups: DocumentGroup[] = summary.documents
      .filter((d) => d.type === "quotation" && !convertedQuotationIds.has(d.id as number))
      .map((q) => ({ key: `quotation-${q.id}`, order: null, quotation: q, deliveryNotes: [], invoices: [], date: q.date }));

    return [...orderGroups, ...standaloneGroups].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [summary]);

  function toggleGroup(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading)
    return (
      <section id={id} className="panel customer-detail-anchor">
        <div className="loading-block">Cargando documentos del cliente…</div>
      </section>
    );

  return (
    <>
      <section id={id} className="panel customer-detail-anchor">
        <div className="panel-head">
          <div>
            <h2>Documentos</h2>
            <p>Presupuestos, pedidos, albaranes y facturas de este cliente.</p>
          </div>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {summary && (
          <>
            <div className="quotation-kpi-grid">
              <div className="quotation-kpi">
                <div className="quotation-kpi-icon">
                  <FileText size={18} />
                </div>
                <div>
                  <span>Presupuestos</span>
                  <strong>{summary.stats.quotationsCount}</strong>
                  <small>
                    {money(summary.stats.quotationsTotalAmount)} · {summary.stats.quotationsAcceptanceRate}% aceptados
                  </small>
                </div>
              </div>
              <div className="quotation-kpi">
                <div className="quotation-kpi-icon">
                  <ShoppingCart size={18} />
                </div>
                <div>
                  <span>Pedidos</span>
                  <strong>{summary.stats.ordersCount}</strong>
                  <small>{money(summary.stats.ordersTotalAmount)} en total</small>
                </div>
              </div>
              <div className="quotation-kpi">
                <div className="quotation-kpi-icon">
                  <Percent size={18} />
                </div>
                <div>
                  <span>Ticket medio</span>
                  <strong>{money(summary.stats.averageOrderAmount)}</strong>
                  <small>Importe medio por pedido</small>
                </div>
              </div>
              <div className="quotation-kpi">
                <div className="quotation-kpi-icon">
                  <ReceiptText size={18} />
                </div>
                <div>
                  <span>Facturado</span>
                  <strong>{money(summary.stats.invoicesTotalAmount)}</strong>
                  <small>{summary.stats.invoicesCount} factura{summary.stats.invoicesCount === 1 ? "" : "s"} emitidas</small>
                </div>
              </div>
              <div
                className={`quotation-kpi ${summary.stats.pendingCollectionsAmount > 0 ? "quotation-kpi-warning" : ""}`}
              >
                <div className="quotation-kpi-icon">
                  <Wallet size={18} />
                </div>
                <div>
                  <span>Pendiente de cobro</span>
                  <strong>{money(summary.stats.pendingCollectionsAmount)}</strong>
                  <small>
                    {summary.stats.overdueCollectionsCount > 0
                      ? `${summary.stats.overdueCollectionsCount} vencido${summary.stats.overdueCollectionsCount === 1 ? "" : "s"}`
                      : "Sin vencidos"}
                  </small>
                </div>
              </div>
              <div className="quotation-kpi">
                <div className="quotation-kpi-icon">
                  <Files size={18} />
                </div>
                <div>
                  <span>Última actividad</span>
                  <strong>
                    {summary.stats.lastActivityDate ? date(summary.stats.lastActivityDate) : "—"}
                  </strong>
                  <small>Documento más reciente</small>
                </div>
              </div>
            </div>

            <div className="toolbar" style={{ marginTop: "18px" }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as CustomerDocumentType | "ALL")}
                aria-label="Filtrar por tipo de documento"
              >
                <option value="ALL">Todos los documentos</option>
                <option value="quotation">Presupuestos</option>
                <option value="sales_order">Pedidos</option>
                <option value="delivery_note">Albaranes</option>
                <option value="invoice">Facturas</option>
              </select>
            </div>
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Código</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="numeric">Importe</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {typeFilter !== "ALL" ? (
                    filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No hay documentos para este filtro.</td>
                      </tr>
                    ) : (
                      filteredDocuments.map((d) => <DocumentRow key={`${d.type}-${d.id}`} doc={d} />)
                    )
                  ) : groups.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No hay documentos para este filtro.</td>
                    </tr>
                  ) : (
                    groups.map((g) => {
                      const children = [
                        ...(g.quotation ? [g.quotation] : []),
                        ...g.deliveryNotes,
                        ...g.invoices,
                      ];
                      const anchor = g.order ?? g.quotation!;
                      const isExpanded = expanded.has(g.key);
                      return (
                        <Fragment key={g.key}>
                          <tr className={children.length ? "customer-doc-group-row" : undefined}>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                {children.length > 0 && (
                                  <button
                                    type="button"
                                    className="customer-doc-tree-toggle"
                                    onClick={() => toggleGroup(g.key)}
                                    aria-label={isExpanded ? "Contraer" : "Expandir"}
                                  >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                )}
                                {TYPE_ICON[anchor.type]} {TYPE_LABEL[anchor.type]}
                              </span>
                            </td>
                            <td>
                              <Link to={anchor.link}>{anchor.code}</Link>
                            </td>
                            <td>{date(anchor.date)}</td>
                            <td>{anchor.statusLabel}</td>
                            <td className="numeric">{money(anchor.amount)}</td>
                            <td>
                              <Link className="icon-button" title="Consultar" to={anchor.link}>
                                <Eye size={15} />
                              </Link>
                            </td>
                          </tr>
                          {isExpanded &&
                            children.map((child) => <DocumentRow key={`${child.type}-${child.id}`} doc={child} indented />)}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section id="cobros-pendientes" className="panel customer-detail-anchor">
        <div className="panel-head">
          <div>
            <h2>Cobros pendientes</h2>
            <p>Plazos de factura aún sin cobrar de este cliente; en rojo, los vencidos.</p>
          </div>
        </div>
        {summary && (
          <div className="table-panel sales-order-table-card">
            <table>
              <thead>
                <tr>
                  <th>Vencimiento</th>
                  <th>Factura</th>
                  <th>Plazo</th>
                  <th className="numeric">Importe</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary.pendingCollections.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No hay cobros pendientes.</td>
                  </tr>
                ) : (
                  summary.pendingCollections.map((c) => (
                    <tr key={c.id} className={c.urgency ? `sales-order-row-${c.urgency}` : ""}>
                      <td className={c.urgency ? `sales-order-delivery-date ${c.urgency}` : "sales-order-delivery-date"}>
                        {c.urgency === "overdue" && <AlertTriangle size={13} style={{ marginRight: "4px", verticalAlign: "-2px" }} />}
                        {date(c.dueDate)}
                      </td>
                      <td>
                        <Link to={`/facturacion/facturas/${c.invoiceId}`}>{c.invoiceCode}</Link>
                      </td>
                      <td>Plazo {c.sequence}</td>
                      <td className="numeric">{money(c.amount)}</td>
                      <td>
                        <Link className="icon-button" title="Consultar factura" to={`/facturacion/facturas/${c.invoiceId}`}>
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function DocumentRow({ doc, indented = false }: { doc: CustomerDocumentRow; indented?: boolean }) {
  return (
    <tr className={indented ? "customer-doc-child-row" : undefined}>
      <td>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {indented && <span className="customer-doc-tree-branch" aria-hidden="true" />}
          {TYPE_ICON[doc.type]} {TYPE_LABEL[doc.type]}
        </span>
      </td>
      <td>
        <Link to={doc.link}>{doc.code}</Link>
      </td>
      <td>{date(doc.date)}</td>
      <td>{doc.statusLabel}</td>
      <td className="numeric">{money(doc.amount)}</td>
      <td>
        <Link className="icon-button" title="Consultar" to={doc.link}>
          <Eye size={15} />
        </Link>
      </td>
    </tr>
  );
}
