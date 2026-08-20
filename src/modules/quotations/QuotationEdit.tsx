import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Eye, Layers, Pencil, Plus, Search, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageLog } from '../../components/ui/MessageLog';
import { Toast } from '../../components/ui/Toast';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { getProductLineDefinition, type ProductLineDefinition } from '../../services/catalog/productDefinitionRepository';
import { quotationForEdit, quotationOptions, updateQuotation, type QuotationEditData, type QuotationEditLine } from '../../services/sales/quotationEditRepository';
import type { QuotationLineCharacteristicDraft } from '../../services/sales/quotationCreationRepository';
import { type QuotationLineSnapshot } from '../../services/sales/quotationLineCalculationService';
import { QuotationLineConfigurator } from './QuotationLineConfigurator';
import { QuotationLineSnapshotModal } from './QuotationLineSnapshotModal';
import './quotation-create.css';
import './quotation.css';
import './quotation-configurator.css';

const money = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
type Address = { label: string; street: string; postal_code: string; city: string; region: string };
type EditLine = QuotationEditLine & {
  configuration_snapshot?: QuotationLineSnapshot | null;
};
type Option = { id: number; label: string; code?: string; price?: number };

function blankLine(): EditLine {
  return {
    id: 0,
    line_no: 0,
    product_id: null,
    description: '',
    quantity: 1,
    unit_price: 0,
    discount_percent: 0,
    tax_rate_id: null,
    tax_percent: 0,
    line_behavior_id: null,
    line_behavior_snapshot: null,
    product_definition_snapshot: null,
    dimensions: [],
    characteristics: [],
    specific_data: {},
    configuration_snapshot: null,
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function dimensionsFromDefinition(definition: ProductLineDefinition, old: EditLine['dimensions']) {
  const values = new Map(old.map(v => [v.code, v.value]));
  return definition.dimensions.map((d, i) => ({
    code: d.code,
    name: d.name,
    value: values.get(d.code) ?? null,
    unit_id: d.unit_id,
    sort_order: i,
  }));
}

function characteristicsFromDefinition(definition: ProductLineDefinition, old: EditLine['characteristics']) {
  const values = new Map(old.filter(v => v.attribute_id != null).map(v => [Number(v.attribute_id), v]));
  return definition.characteristics.map(c => {
    const v = values.get(c.attribute_id);
    return {
      attribute_id: c.attribute_id,
      attribute_value_id: v?.attribute_value_id ?? null,
      value_text: v?.value_text ?? null,
      value_number: v?.value_number ?? null,
      value_boolean: v?.value_boolean ?? null,
    };
  });
}

export function QuotationEdit() {
  const { id } = useParams();
  const nav = useNavigate();

  const [data, setData] = useState<QuotationEditData | null>(null);
  const [opts, setOpts] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingDefinition, setLoadingDefinition] = useState<number | null>(null);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [commercialId, setCommercialId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [billingId, setBillingId] = useState<number | null>(null);
  const [installationId, setInstallationId] = useState<number | null>(null);

  const [billingAddress, setBillingAddress] = useState<Address>({ label: '', street: '', postal_code: '', city: '', region: '' });
  const [installationAddress, setInstallationAddress] = useState<Address>({ label: '', street: '', postal_code: '', city: '', region: '' });

  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [paymentTermId, setPaymentTermId] = useState<number | null>(null);
  const [taxRateId, setTaxRateId] = useState<number | null>(null);
  const [taxPercent, setTaxPercent] = useState(0);
  const [issueDate, setIssueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [toast, setToast] = useState('');

  // Configurator Modal state
  const [configuratorOpen, setConfiguratorOpen] = useState(false);
  const [configuratorLineIndex, setConfiguratorLineIndex] = useState<number | null>(null);

  // Snapshot Viewer Modal state
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<QuotationLineSnapshot | null>(null);
  const [selectedSnapshotLineNo, setSelectedSnapshotLineNo] = useState<number>(1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [o, q] = await Promise.all([quotationOptions(), quotationForEdit(Number(id))]);
        if (!active) return;
        setOpts(o);
        setData(q);
        setCustomerId(q.customer_id);
        setCommercialId(q.commercial_id);
        setWarehouseId(q.warehouse_id);
        setBillingId(q.billing_address_id);
        setInstallationId(q.installation_address_id);
        setBillingAddress(q.billing_address);
        setInstallationAddress(q.installation_address);
        setPaymentMethodId(q.payment_method_id);
        setPaymentTermId(q.payment_term_id);
        setTaxRateId(q.tax_rate_id);
        setTaxPercent(q.tax_percent);
        setIssueDate(q.issue_date);
        setValidUntil(q.valid_until || '');
        setReference(q.reference);
        setNotes(q.notes);

        // Hydrate configuration_snapshot from specific_data if present
        const hydratedLines: EditLine[] = q.lines.map(l => ({
          ...l,
          configuration_snapshot: (l.specific_data?.configuration_snapshot as QuotationLineSnapshot | undefined) || null,
        }));
        setLines(hydratedLines);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'No se pudo cargar el presupuesto.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (a, l) => {
          const gross = Math.max(0, l.quantity * l.unit_price);
          const discount = Math.max(0, (gross * l.discount_percent) / 100);
          const net = Math.max(0, gross - discount);
          const tax = (net * taxPercent) / 100;
          return {
            discount: a.discount + discount,
            net: a.net + net,
            tax: a.tax + tax,
            total: a.total + net + tax,
          };
        },
        { discount: 0, net: 0, tax: 0, total: 0 }
      ),
    [lines, taxPercent]
  );

  const updateLine = (i: number, patch: Partial<EditLine>) =>
    setLines(xs => xs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const updateDimensionValue = (i: number, d: number, value: number | null) =>
    setLines(xs =>
      xs.map((l, j) => (j === i ? { ...l, dimensions: l.dimensions.map((x, k) => (k === d ? { ...x, value } : x)) } : l))
    );

  const updateCharacteristic = (i: number, c: number, patch: Partial<QuotationLineCharacteristicDraft>) =>
    setLines(xs =>
      xs.map((l, j) =>
        j === i
          ? {
              ...l,
              characteristics: l.characteristics.map((x, k) => (k === c ? { ...x, ...patch } : x)),
            }
          : l
      )
    );

  const selectProduct = async (i: number, pid: number | null) => {
    if (pid === null) {
      updateLine(i, {
        product_id: null,
        description: '',
        unit_price: 0,
        line_behavior_id: null,
        line_behavior_snapshot: null,
        product_definition_snapshot: null,
        dimensions: [],
        characteristics: [],
        configuration_snapshot: null,
      });
      return;
    }
    const p = opts?.products?.find((x: any) => x.id === pid);
    setLoadingDefinition(pid);
    setError('');
    try {
      const definition = await getProductLineDefinition(pid);
      updateLine(i, {
        product_id: pid,
        description: p?.label || p?.code || '',
        unit_price: Number(p?.price ?? 0),
        line_behavior_id: p?.lineBehavior?.id ?? null,
        line_behavior_snapshot: p?.lineBehavior ?? null,
        product_definition_snapshot: clone(definition),
        dimensions: dimensionsFromDefinition(definition, []),
        characteristics: characteristicsFromDefinition(definition, []),
        configuration_snapshot: null,
      });

      // Detect if article has applicable configuration
      const hasConfig = Boolean(
        (definition.dimensions && definition.dimensions.length > 0) ||
        (definition.characteristics && definition.characteristics.length > 0) ||
        definition.measurement_type_id != null ||
        (p?.lineBehavior && (p.lineBehavior.is_configurable || p.lineBehavior.confectionable || p.lineBehavior.recuttable))
      );

      if (hasConfig) {
        setConfiguratorLineIndex(i);
        setConfiguratorOpen(true);
        setToast(`El artículo "${p?.label || p?.code}" tiene configuración aplicable. Abriendo configurador guiado...`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la definición del artículo.');
    } finally {
      setLoadingDefinition(null);
    }
  };

  const openLineConfigurator = (lineIndex: number) => {
    setConfiguratorLineIndex(lineIndex);
    setConfiguratorOpen(true);
  };

  const handleConfiguratorConfirm = (snapshot: QuotationLineSnapshot) => {
    if (configuratorLineIndex === null) return;
    const p = opts?.products?.find((x: any) => x.id === snapshot.article.id);

    const updatedLine: EditLine = {
      ...lines[configuratorLineIndex],
      product_id: snapshot.article.id,
      description:
        snapshot.article.commercial_description ||
        snapshot.article.technical_description ||
        snapshot.article.code,
      quantity: snapshot.quantity,
      unit_price: snapshot.pricing.unit_price,
      discount_percent: snapshot.pricing.discount_percent,
      line_behavior_id: p?.lineBehavior?.id ?? null,
      line_behavior_snapshot: p?.lineBehavior ?? null,
      dimensions: snapshot.dimensions.map((d, di) => ({
        code: d.code,
        name: d.name,
        value: d.value,
        unit_id: d.unit_id,
        sort_order: di,
      })),
      characteristics: snapshot.selected_attributes.map(a => ({
        attribute_id: a.attribute_id,
        attribute_value_id: a.value_id,
        value_text: a.value_text ?? null,
        value_number: a.value_number ?? null,
        value_boolean: a.value_boolean ?? null,
      })),
      specific_data: {
        ...lines[configuratorLineIndex]?.specific_data,
        configuration_snapshot: snapshot,
      },
      configuration_snapshot: snapshot,
    };

    updateLine(configuratorLineIndex, updatedLine);
  };

  const openSnapshotModal = (snapshot: QuotationLineSnapshot, lineNo: number) => {
    setSelectedSnapshot(snapshot);
    setSelectedSnapshotLineNo(lineNo);
    setSnapshotModalOpen(true);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId) {
      setError('Selecciona un cliente.');
      return;
    }
    if (lines.some(l => l.quantity <= 0)) {
      setError('La cantidad debe ser mayor que cero.');
      return;
    }
    setSaving(true);
    try {
      await updateQuotation({
        id: Number(id),
        customer_id: customerId,
        commercial_id: commercialId,
        warehouse_id: warehouseId,
        billing_address_id: billingId,
        installation_address_id: installationId,
        billing_address: billingAddress,
        installation_address: installationAddress,
        payment_method_id: paymentMethodId,
        payment_term_id: paymentTermId,
        tax_rate_id: taxRateId,
        tax_percent: taxPercent,
        issue_date: issueDate,
        valid_until: validUntil || null,
        reference,
        notes,
        lines: lines.map(l => ({
          line_no: l.line_no,
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_percent: l.discount_percent,
          tax_rate_id: l.tax_rate_id,
          tax_percent: l.tax_percent,
          line_behavior_id: l.line_behavior_id,
          line_behavior_snapshot: l.line_behavior_snapshot,
          product_definition_snapshot: l.product_definition_snapshot,
          dimensions: l.dimensions,
          characteristics: l.characteristics,
          specific_data: {
            ...l.specific_data,
            configuration_snapshot: l.configuration_snapshot || l.specific_data?.configuration_snapshot || null,
          },
        })),
      });
      nav(`/ventas/presupuestos/${id}`);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : e instanceof Error ? e.message : 'No se pudo guardar el presupuesto.');
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS / EDITAR</div>
            <h1>Editando presupuesto</h1>
          </div>
        </div>
        <p>Cargando datos…</p>
      </div>
    );
  if (error && !data)
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS</div>
            <h1>Editar presupuesto</h1>
          </div>
        </div>
        <MessageLog error={error} />
      </div>
    );
  if (!data || !opts) return null;

  const currentConfiguratorLine = configuratorLineIndex !== null ? lines[configuratorLineIndex] : null;

  return (
    <div className="module-page quotation-create">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / PRESUPUESTOS / EDITAR</div>
          <h1>{data.code}</h1>
          <p>
            Modifica los datos del documento y las líneas del presupuesto con gestión de snapshots inmutables.
          </p>
        </div>
        <Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>
          <ArrowLeft size={15} />
          Volver al presupuesto
        </Link>
      </div>

      <MessageLog error={error} />

      <form className="detail-grid" onSubmit={save}>
        <section className="panel quotation-header-panel">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>Condiciones comerciales y datos del documento.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="quotation-reference-field">
              Referencia
              <input value={reference} onChange={e => setReference(e.target.value)} />
            </label>
            <label>
              Cliente
              <select
                value={customerId ?? ''}
                onChange={e => setCustomerId(e.target.value ? Number(e.target.value) : null)}
                required
              >
                <option value="">Selecciona cliente</option>
                {opts.customers.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comercial
              <select
                value={commercialId ?? ''}
                onChange={e => setCommercialId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin asignar</option>
                {opts.commercials.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Almacén
              <select
                value={warehouseId ?? ''}
                onChange={e => setWarehouseId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin asignar</option>
                {opts.warehouses.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha de documento
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                required
              />
            </label>
            <label>
              Válido hasta
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
              />
            </label>
            <label>
              Forma de pago
              <select
                value={paymentMethodId ?? ''}
                onChange={e => setPaymentMethodId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin especificar</option>
                {opts.paymentMethods.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condiciones de pago
              <select
                value={paymentTermId ?? ''}
                onChange={e => setPaymentTermId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Sin especificar</option>
                {opts.paymentTerms.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IVA
              <select
                value={taxRateId ?? ''}
                onChange={e => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  const rate = opts.taxRates.find((x: any) => x.id === next);
                  setTaxRateId(next);
                  setTaxPercent(Number(rate?.rate ?? 0));
                }}
              >
                <option value="">Sin IVA</option>
                {opts.taxRates.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.rate}% · {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel quotation-lines-panel">
          <div className="panel-head">
            <div>
              <h2>Líneas del presupuesto</h2>
              <p>Modifica artículo, cantidad, precio, descuento y valores de configuración.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLines(xs => [...xs, blankLine()])}
              >
                <Plus size={15} />
                Línea Rápida
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const newIndex = lines.length;
                  setLines(xs => [...xs, blankLine()]);
                  openLineConfigurator(newIndex);
                }}
              >
                <Layers size={15} />
                Configurar Nueva Línea
              </button>
            </div>
          </div>

          <div className="table-panel quotation-lines-table">
            <table>
              <thead>
                <tr>
                  <th className="col-line-no">#</th>
                  <th className="col-article">Artículo</th>
                  <th className="col-description">Descripción & Configuración</th>
                  <th className="col-quantity">Cantidad</th>
                  <th className="col-price">Precio</th>
                  <th className="col-discount">Dto. %</th>
                  <th className="col-total">Total</th>
                  <th className="col-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const total =
                    Math.max(0, line.quantity * line.unit_price * (1 - line.discount_percent / 100)) *
                    (1 + taxPercent / 100);
                  const snapshot =
                    line.configuration_snapshot ||
                    (line.specific_data?.configuration_snapshot as QuotationLineSnapshot | undefined);
                  const isConfigured = Boolean(snapshot);

                  return (
                    <tr key={`${line.id}-${i}`} className={`quotation-line-row ${isConfigured ? 'line-has-snapshot' : ''}`}>
                      <td className="col-line-no">
                        <span className="line-num-badge">{i + 1}</span>
                      </td>
                      <td className="col-article">
                        <LookupSelect
                          compact
                          options={opts?.products ?? []}
                          value={line.product_id}
                          onChange={pid => {
                            void selectProduct(i, pid);
                          }}
                          placeholder="Buscar artículo…"
                        />
                        {line.product_id && (
                          <div className="line-article-badges">
                            {isConfigured ? (
                              <button
                                type="button"
                                className="line-status-chip configured"
                                onClick={() => openLineConfigurator(i)}
                                title="Artículo configurado. Clic para editar"
                              >
                                <Sparkles size={11} /> Configurado
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="line-status-chip pending"
                                onClick={() => openLineConfigurator(i)}
                                title="Configurar artículo"
                              >
                                <SlidersHorizontal size={11} /> Configurar
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="col-description">
                        <input
                          className="line-text-input"
                          value={line.description}
                          onChange={e => updateLine(i, { description: e.target.value })}
                          placeholder="Descripción del artículo o partida…"
                          required
                        />
                        {snapshot && (
                          <div className="line-config-summary">
                            {snapshot.dimensions && snapshot.dimensions.length > 0 && (
                              <span className="summary-pill dim">
                                📐 {snapshot.dimensions.map(d => `${d.name}: ${d.value ?? 0} ${d.unit_code}`).join(' · ')}
                              </span>
                            )}
                            {snapshot.selected_variant && (
                              <span className="summary-pill variant">
                                🏷️ {snapshot.selected_variant.code || snapshot.selected_variant.description}
                              </span>
                            )}
                            {snapshot.breakdown?.components && snapshot.breakdown.components.length > 0 && (
                              <span className="summary-pill bom">
                                📦 {snapshot.breakdown.components.length} comp.
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="col-quantity">
                        <input
                          className="line-num-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={e => updateLine(i, { quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td className="col-price">
                        <input
                          className="line-num-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={e => updateLine(i, { unit_price: Number(e.target.value) })}
                        />
                      </td>
                      <td className="col-discount">
                        <input
                          className="line-num-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discount_percent}
                          onChange={e => updateLine(i, { discount_percent: Number(e.target.value) })}
                        />
                      </td>
                      <td className="col-total">
                        <strong className="line-total-val">{money(total)}</strong>
                      </td>
                      <td className="col-actions">
                        <div className="line-actions-wrap">
                          {line.product_id && (
                            <button
                              type="button"
                              className={`line-btn-icon ${isConfigured ? 'active' : ''}`}
                              onClick={() => openLineConfigurator(i)}
                              title="Configurador guiado"
                              aria-label="Configurador guiado"
                            >
                              <SlidersHorizontal size={14} />
                            </button>
                          )}
                          {snapshot && (
                            <button
                              type="button"
                              className="line-btn-icon snapshot"
                              onClick={() => openSnapshotModal(snapshot, i + 1)}
                              title="Ver snapshot y despiece congelado"
                              aria-label="Ver snapshot y despiece congelado"
                            >
                              <Eye size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="line-btn-icon delete"
                            disabled={lines.length === 1}
                            aria-label="Eliminar línea"
                            title="Eliminar línea"
                            onClick={() => setLines(xs => xs.filter((_, j) => j !== i))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="quote-totals">
            <span>
              Base imponible <strong>{money(totals.net)}</strong>
            </span>
            <span>
              Descuentos <strong>{money(totals.discount)}</strong>
            </span>
            <span>
              Impuestos ({taxPercent}%) <strong>{money(totals.tax)}</strong>
            </span>
            <span>
              Total <strong>{money(totals.total)}</strong>
            </span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Observaciones</h2>
              <p>Notas internas o información adicional del presupuesto.</p>
            </div>
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} />
        </section>

        <div className="profile-save-bar">
          <Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>
            Cancelar
          </Link>
          <button className="primary-button" type="submit" disabled={saving || loadingDefinition !== null}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      {/* Guided Configurator Modal */}
      {configuratorOpen && (
        <QuotationLineConfigurator
          isOpen={configuratorOpen}
          onClose={() => setConfiguratorOpen(false)}
          onConfirm={handleConfiguratorConfirm}
          initialProductId={currentConfiguratorLine?.product_id ?? null}
          initialSnapshot={
            currentConfiguratorLine?.configuration_snapshot ??
            (currentConfiguratorLine?.specific_data?.configuration_snapshot as QuotationLineSnapshot | null) ??
            null
          }
          initialQuantity={currentConfiguratorLine?.quantity ?? 1}
          initialDiscount={currentConfiguratorLine?.discount_percent ?? 0}
          taxPercent={taxPercent}
          companyId={1}
          warehouseId={warehouseId}
          productsList={opts?.products ?? []}
        />
      )}

      {/* Snapshot Viewer Modal */}
      {snapshotModalOpen && selectedSnapshot && (
        <QuotationLineSnapshotModal
          isOpen={snapshotModalOpen}
          onClose={() => setSnapshotModalOpen(false)}
          snapshot={selectedSnapshot}
          lineNo={selectedSnapshotLineNo}
        />
      )}
      {/* Toast notifications */}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

function LookupSelect({
  label,
  required = false,
  compact = false,
  options = [],
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  required?: boolean;
  compact?: boolean;
  options?: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const safeOptions = options || [];
  const selected = safeOptions.find(x => x.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return safeOptions.slice(0, 12);
    return safeOptions.filter(x => `${x.code ?? ''} ${x.label}`.toLocaleLowerCase().includes(q)).slice(0, 12);
  }, [safeOptions, query]);

  const reposition = () => {
    if (inputRef.current) {
      setRect(inputRef.current.closest('.lookup-control')?.getBoundingClientRect() ?? inputRef.current.getBoundingClientRect());
    }
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const selectItem = (id: number) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className={`lookup-field ${compact ? 'lookup-field-compact' : ''}`}>
      {label && (
        <span className="field-label">
          {label}
          {required ? ' *' : ''}
        </span>
      )}
      <div className="lookup-control">
        <Search size={15} />
        <input
          ref={inputRef}
          required={required && !value}
          value={open ? query : selected?.label ?? ''}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery(selected.label);
          }}
          onChange={e => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (value !== null) onChange(null);

            // Instant exact code match detection
            const exact = safeOptions.find(
              x => x.code && x.code.trim().toLowerCase() === next.trim().toLowerCase()
            );
            if (exact) {
              selectItem(exact.id);
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0) {
                selectItem(filtered[0].id);
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {selected && (
          <button
            type="button"
            className="lookup-clear"
            aria-label="Limpiar selección"
            onClick={() => {
              setQuery('');
              onChange(null);
              setOpen(false);
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open &&
        rect &&
        createPortal(
          <div className="lookup-portal">
            <button
              type="button"
              className="lookup-dismiss"
              aria-label="Cerrar resultados"
              onClick={() => setOpen(false)}
            />
            <div
              className="lookup-results"
              style={{
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 280),
              }}
            >
              {filtered.length === 0 ? (
                <small>No se han encontrado resultados.</small>
              ) : (
                filtered.map(x => (
                  <button
                    type="button"
                    key={x.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectItem(x.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                  >
                    <span>
                      <strong>{x.code ? `${x.code} · ` : ''}</strong>
                      {x.label}
                    </span>
                    {x.price != null && (
                      <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
                        {money(Number(x.price))}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
