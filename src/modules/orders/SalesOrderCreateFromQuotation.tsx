import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, FileText, Save } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createSalesOrderFromQuotation,
  getQuotationConversionStatus,
  getQuotationForSalesOrderDraft,
  listSalesOrdersByQuotationId,
  updateSalesOrder,
  type QuotationLineConversion,
  type SalesOrder,
  type SalesOrderDraft,
} from '../../services/sales/salesOrderService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './sales-order.css';

const money = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const date = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('es-ES') : '—');

export function SalesOrderCreateFromQuotation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const quotationId = Number(params.get('quotationId'));
  const [data, setData] = useState<SalesOrderDraft | null>(null);
  const [conversion, setConversion] = useState<Record<number, QuotationLineConversion>>({});
  const [existingOrders, setExistingOrders] = useState<SalesOrder[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [deliveryDate, setDeliveryDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!quotationId) throw new CoreRepositoryError('No se ha indicado el presupuesto de origen.');
        const [draft, conversionStatus, orders] = await Promise.all([
          getQuotationForSalesOrderDraft(quotationId),
          getQuotationConversionStatus(quotationId),
          listSalesOrdersByQuotationId(quotationId),
        ]);
        if (!active) return;
        const byLine = Object.fromEntries(conversionStatus.map((c) => [c.quotation_line_id, c]));
        setData(draft);
        setConversion(byLine);
        setExistingOrders(orders);
        setReference(draft.reference || '');
        setNotes(draft.notes || '');
        const initialSelected: Record<number, boolean> = {};
        const initialQty: Record<number, string> = {};
        for (const line of draft.lines) {
          const remaining = byLine[line.id]?.remaining_quantity ?? Number(line.quantity);
          initialSelected[line.id] = remaining > 0;
          initialQty[line.id] = remaining > 0 ? String(remaining) : '0';
        }
        setSelected(initialSelected);
        setQuantities(initialQty);
      } catch (e) {
        if (active) setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo preparar el pedido.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [quotationId]);

  const remainingFor = (lineId: number, fallback: number) => conversion[lineId]?.remaining_quantity ?? fallback;

  const selectedLines = useMemo(() => {
    if (!data) return [];
    return data.lines
      .filter((line: any) => selected[line.id] && Number(quantities[line.id] || 0) > 0)
      .map((line: any) => {
        const qty = Math.min(Number(quantities[line.id] || 0), remainingFor(line.id, Number(line.quantity)));
        const ratio = qty / Number(line.quantity || 1);
        return { line, qty, ratio };
      });
  }, [data, selected, quantities, conversion]);

  const totals = useMemo(
    () =>
      selectedLines.reduce(
        (acc, { line, ratio }) => ({
          net: acc.net + Number(line.net_amount || 0) * ratio,
          tax: acc.tax + Number(line.tax_amount || 0) * ratio,
          total: acc.total + Number(line.total_amount || 0) * ratio,
        }),
        { net: 0, tax: 0, total: 0 },
      ),
    [selectedLines],
  );

  const fullyConverted = data
    ? data.lines.length > 0 && data.lines.every((line: any) => remainingFor(line.id, Number(line.quantity)) <= 0)
    : false;

  async function save() {
    if (!data || saving || selectedLines.length === 0) return;
    try {
      setSaving(true);
      setError('');
      const order = await createSalesOrderFromQuotation(
        data.id,
        selectedLines.map(({ line, qty }) => ({ quotationLineId: line.id, quantity: qty })),
      );
      await updateSalesOrder(order.id, { requested_delivery_date: deliveryDate || null, reference, notes });
      navigate(`/ventas/pedidos/${order.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo guardar el pedido.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-block">Preparando pedido…</div>;
  if (error && !data) return <div className="module-page"><div className="inline-error">{error}</div></div>;
  if (!data) return null;

  if (fullyConverted) {
    return (
      <div className="module-page sales-order-page">
        <div className="sales-order-head">
          <div>
            <div className="eyebrow">VENTAS / PEDIDOS</div>
            <div className="sales-order-nav">
              <Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>
                <ArrowLeft size={15} /> Volver al presupuesto
              </Link>
            </div>
            <h1>Presupuesto ya convertido</h1>
            <p>Todas las líneas de {data.code} ya se han incluido en un pedido. No queda cantidad pendiente por convertir.</p>
          </div>
        </div>
        {existingOrders.length > 0 && (
          <section className="sales-order-card">
            <div className="sales-order-card-head">
              <div>
                <div className="eyebrow">PEDIDOS GENERADOS</div>
                <h2>
                  {existingOrders.length} {existingOrders.length === 1 ? 'pedido' : 'pedidos'}
                </h2>
              </div>
            </div>
            <div className="card-table sales-order-lines">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {existingOrders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.code}</strong></td>
                      <td>{date(o.issue_date)}</td>
                      <td>{o.status}</td>
                      <td>{money(Number(o.total_amount || 0))}</td>
                      <td className="sales-order-list-action">
                        <Link className="icon-link" to={`/ventas/pedidos/${o.id}`} title="Ver pedido">
                          <FileText size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="module-page sales-order-page">
      <div className="sales-order-head">
        <div>
          <div className="eyebrow">VENTAS / PEDIDOS</div>
          <div className="sales-order-nav">
            <Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>
              <ArrowLeft size={15} /> Volver al presupuesto
            </Link>
            <span>Presupuesto / <strong>{data.code}</strong></span>
          </div>
          <h1>Revisar pedido</h1>
          <p>Selecciona qué líneas y qué cantidad de cada una se incluyen en este pedido.</p>
        </div>
        <div className="sales-order-review-badge"><Check size={15} /> Pendiente de confirmación</div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {existingOrders.length > 0 && (
        <div className="inline-error" style={{ background: 'var(--primary-soft)', color: 'var(--status-info-fg)', borderColor: 'var(--status-info-border)' }}>
          Este presupuesto ya tiene {existingOrders.length} {existingOrders.length === 1 ? 'pedido creado' : 'pedidos creados'} ({existingOrders.map((o) => o.code).join(', ')}). Las líneas ya convertidas aparecen bloqueadas abajo.
        </div>
      )}

      <div className="sales-order-grid">
        <section className="sales-order-card">
          <div className="sales-order-card-head"><div><div className="eyebrow">CLIENTE</div><h2>{data.customer_name || '—'}</h2></div></div>
          <div className="sales-order-detail-grid">
            <div><span>Contacto</span><strong>{data.contact_name || '—'}</strong></div>
            <div><span>Email</span><strong>{data.contact_email || '—'}</strong></div>
            <div><span>Teléfono</span><strong>{data.contact_phone || '—'}</strong></div>
          </div>
        </section>
        <section className="sales-order-card">
          <div className="sales-order-card-head">
            <div><div className="eyebrow">DOCUMENTO ORIGEN</div><h2>{data.code}</h2></div>
            <Link className="icon-link" to={`/ventas/presupuestos/${data.id}`} title="Ver presupuesto"><FileText size={17} /></Link>
          </div>
          <div className="sales-order-detail-grid">
            <div><span>Fecha presupuesto</span><strong>{date(data.issue_date)}</strong></div>
            <div><span>Medición</span><strong>{data.measurement_id ? <Link to={`/gestion/mediciones/${data.measurement_id}`}>#{data.measurement_id}</Link> : '—'}</strong></div>
            <div><span>Estado</span><strong>Aceptado</strong></div>
          </div>
        </section>
      </div>

      <section className="sales-order-card">
        <div className="sales-order-card-head"><div><div className="eyebrow">DATOS DEL PEDIDO</div><h2>Información operativa</h2></div></div>
        <div className="sales-order-form-grid">
          <label><span>Fecha de entrega solicitada</span><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></label>
          <label><span>Referencia</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referencia del cliente o del pedido" /></label>
          <label className="full"><span>Observaciones</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observaciones para el pedido" /></label>
        </div>
      </section>

      <section className="sales-order-card">
        <div className="sales-order-card-head"><div><div className="eyebrow">LÍNEAS DEL PRESUPUESTO</div><h2>{data.lines.length} {data.lines.length === 1 ? 'línea' : 'líneas'}</h2></div></div>
        <div className="card-table sales-order-lines">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>#</th>
                <th>Artículo / descripción</th>
                <th>Cant. presupuesto</th>
                <th>Cant. a pedido</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line: any) => {
                const remaining = remainingFor(line.id, Number(line.quantity));
                const converted = conversion[line.id]?.converted_quantity ?? 0;
                const unavailable = remaining <= 0;
                const isSelected = Boolean(selected[line.id]) && !unavailable;
                const qty = Number(quantities[line.id] || 0);
                const ratio = isSelected ? Math.min(qty, remaining) / Number(line.quantity || 1) : 0;
                return (
                  <tr key={line.id} className={unavailable ? 'row-deleted' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={unavailable}
                        onChange={(e) => setSelected((s) => ({ ...s, [line.id]: e.target.checked }))}
                      />
                    </td>
                    <td>{line.line_no}</td>
                    <td>
                      <strong>{line.description || line.product?.commercial_description || line.product?.code || '—'}</strong>
                      {line.product?.code && <div className="muted">{line.product.code}</div>}
                      {converted > 0 && (
                        <div className="muted">Ya convertido: {converted} / {Number(line.quantity)}</div>
                      )}
                    </td>
                    <td>{Number(line.quantity)}</td>
                    <td>
                      {unavailable ? (
                        <span className="muted">Sin cantidad disponible</span>
                      ) : (
                        <input
                          type="number"
                          min="0.0001"
                          max={remaining}
                          step="any"
                          value={quantities[line.id] ?? ''}
                          disabled={!isSelected}
                          onChange={(e) => setQuantities((q) => ({ ...q, [line.id]: e.target.value }))}
                          style={{ width: 90 }}
                        />
                      )}
                    </td>
                    <td>{money(Number(line.unit_price || 0))}</td>
                    <td>{money(Number(line.total_amount || 0) * ratio)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sales-order-totals">
          <div><span>Base imponible</span><strong>{money(totals.net)}</strong></div>
          <div><span>Impuestos</span><strong>{money(totals.tax)}</strong></div>
          <div className="grand-total"><span>Total pedido</span><strong>{money(totals.total)}</strong></div>
        </div>
      </section>

      <div className="sales-order-footer-actions">
        <Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>Cancelar</Link>
        <button className="primary-button" type="button" onClick={() => void save()} disabled={saving || selectedLines.length === 0}>
          <Save size={15} />{saving ? 'Guardando…' : 'Guardar pedido'}
        </button>
      </div>
    </div>
  );
}
