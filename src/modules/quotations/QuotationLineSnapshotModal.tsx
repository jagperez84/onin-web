import React, { useState } from 'react';
import {
  FileText,
  Layers,
  Scissors,
  Warehouse,
  X,
  CheckCircle2,
  DollarSign,
  Ruler,
  Calendar,
} from 'lucide-react';
import type { QuotationLineSnapshot } from '../../services/sales/quotationLineCalculationService';
import { formatEuro } from '../../services/catalog/productPricingService';
import './quotation-configurator.css';

export type QuotationLineSnapshotModalProps = {
  isOpen: boolean;
  onClose: () => void;
  snapshot: QuotationLineSnapshot | null;
  lineNo?: number;
};

export function QuotationLineSnapshotModal({
  isOpen,
  onClose,
  snapshot,
  lineNo = 1,
}: QuotationLineSnapshotModalProps) {
  const [activeTab, setActiveTab] = useState<'pricing' | 'bom' | 'cuts' | 'stock'>('pricing');

  if (!isOpen || !snapshot) return null;

  const article = snapshot.article;
  const pricing = snapshot.pricing;
  const breakdown = snapshot.breakdown;
  const cuts = snapshot.cuts;
  const stock = snapshot.stock_preview;

  return (
    <div className="configurator-overlay" role="dialog" aria-modal="true">
      <div className="configurator-modal" style={{ width: 'min(900px, 94vw)' }}>
        {/* Header */}
        <div className="configurator-header">
          <div className="configurator-header-info">
            <span className="configurator-eyebrow">
              Snapshot de Configuración Inmutable · Línea {lineNo}
            </span>
            <h2>{article.code} · {article.commercial_description || article.technical_description || 'Artículo'}</h2>
          </div>
          <button
            type="button"
            className="configurator-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Snapshot Metadata Bar */}
        <div style={{ background: '#f8fafc', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#64748b' }}>
          <div>
            <strong>Creado:</strong> {new Date(snapshot.created_at).toLocaleString('es-ES')}
          </div>
          <div>
            <strong>Versión Snapshot:</strong> {snapshot.snapshot_version}
          </div>
          <div>
            <span className="tag-badge success">
              <CheckCircle2 size={12} /> Configuración Congelada
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="sub-tabs-bar" style={{ padding: '0 24px', margin: '14px 0 0' }}>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`}
            onClick={() => setActiveTab('pricing')}
          >
            <DollarSign size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Desglose Económico
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === 'bom' ? 'active' : ''}`}
            onClick={() => setActiveTab('bom')}
          >
            <Layers size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Despiece BOM ({breakdown?.components.length || 0})
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === 'cuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('cuts')}
          >
            <Scissors size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Cortes y Mermas ({(cuts?.canvas_cuts.length || 0) + (cuts?.profile_cuts.length || 0)})
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
          >
            <Warehouse size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Stock al Presupuestar
          </button>
        </div>

        {/* Modal Body */}
        <div className="configurator-body">
          {/* General Config Overview */}
          <div className="configurator-card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '12px' }}>
              <div>
                <strong style={{ color: '#475569' }}>Dimensiones:</strong>
                <div>
                  {snapshot.dimensions.map(d => `${d.name}: ${d.value ?? 0} ${d.unit_code}`).join(' × ') || 'Sin dimensiones'}
                </div>
              </div>
              <div>
                <strong style={{ color: '#475569' }}>Variante / Color:</strong>
                <div>{snapshot.selected_variant?.description || snapshot.selected_variant?.code || 'Estándar'}</div>
              </div>
              <div>
                <strong style={{ color: '#475569' }}>Características:</strong>
                <div>
                  {snapshot.selected_attributes.map(a => `${a.name}: ${a.value_label}`).join(', ') || 'Sin atributos adicionales'}
                </div>
              </div>
              <div>
                <strong style={{ color: '#475569' }}>Cantidad & Dto:</strong>
                <div>
                  {snapshot.quantity} {article.base_unit_code} · {pricing.discount_percent}% Dto.
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: Pricing */}
          {activeTab === 'pricing' && (
            <div className="pricing-breakdown-card">
              <table className="pricing-steps-table">
                <tbody>
                  {pricing.explainable_steps.map((step, idx) => (
                    <tr key={idx} className={step.highlight ? 'highlight-row' : undefined}>
                      <td>
                        {step.label}
                        {step.badge && <span className="pricing-badge">{step.badge}</span>}
                        {step.description && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {step.description}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {step.formatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: BOM */}
          {activeTab === 'bom' && (
            <div>
              {breakdown && breakdown.components.length > 0 ? (
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>Fórmula</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Precio Unit.</th>
                      <th>Coste Unit.</th>
                      <th>Total PVP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.components.map(comp => (
                      <tr key={comp.id}>
                        <td>
                          <strong>{comp.code}</strong>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{comp.description}</div>
                        </td>
                        <td>
                          <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>
                            {comp.quantity_expression}
                          </code>
                        </td>
                        <td>{comp.quantity}</td>
                        <td>{comp.unit_code}</td>
                        <td>{formatEuro(comp.unit_price)}</td>
                        <td>{formatEuro(comp.unit_cost)}</td>
                        <td>
                          <strong>{comp.add_pvp ? formatEuro(comp.total_price) : 'Incluido'}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#64748b', fontSize: '13px' }}>Sin despiece en snapshot.</p>
              )}
            </div>
          )}

          {/* TAB 3: Cuts */}
          {activeTab === 'cuts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {cuts?.canvas_cuts && cuts.canvas_cuts.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0f172a' }}>Cortes de Lona / Tejido</h4>
                  <table className="config-data-table">
                    <thead>
                      <tr>
                        <th>Pieza</th>
                        <th>Color</th>
                        <th>Corte Total</th>
                        <th>Paños</th>
                        <th>Superficie</th>
                        <th>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuts.canvas_cuts.map(c => (
                        <tr key={c.id}>
                          <td><strong>{c.name}</strong></td>
                          <td>{c.fabric_color}</td>
                          <td><strong>{c.cut_width} m × {c.cut_height} m</strong></td>
                          <td>{c.cloth_strips_count}</td>
                          <td>{c.total_area_m2} m²</td>
                          <td style={{ fontSize: '11px', color: '#64748b' }}>{c.confection_notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cuts?.profile_cuts && cuts.profile_cuts.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#0f172a' }}>Cortes de Perfiles</h4>
                  <table className="config-data-table">
                    <thead>
                      <tr>
                        <th>Perfil</th>
                        <th>Longitud</th>
                        <th>Piezas</th>
                        <th>Barras</th>
                        <th>Resto / Merma</th>
                        <th>Aprovechable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuts.profile_cuts.map(p => (
                        <tr key={p.id}>
                          <td><strong>{p.profile_code}</strong> · {p.profile_name}</td>
                          <td><strong>{p.cut_length} {p.unit}</strong></td>
                          <td>{p.quantity_pieces}</td>
                          <td>{p.bars_required}</td>
                          <td>{p.waste_scrap_total} mm</td>
                          <td>
                            {p.is_reusable_remainder ? (
                              <span className="tag-badge success">Aprovechable</span>
                            ) : (
                              <span className="tag-badge warning">Merma</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Stock */}
          {activeTab === 'stock' && (
            <div>
              {stock ? (
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Almacén</th>
                      <th>Stock Registrado</th>
                      <th>Reservado</th>
                      <th>Disponible</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>{stock.mainProduct.productCode}</strong></td>
                      <td>{stock.warehouseName}</td>
                      <td>{stock.mainProduct.inStock}</td>
                      <td>{stock.mainProduct.reserved}</td>
                      <td><strong>{stock.mainProduct.available}</strong></td>
                      <td>
                        <span className={`tag-badge ${stock.mainProduct.hasSufficientStock ? 'success' : 'danger'}`}>
                          {stock.mainProduct.hasSufficientStock ? 'Disponible' : 'Falta Stock'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#64748b', fontSize: '13px' }}>Sin seguimiento de stock en este snapshot.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="configurator-footer">
          <div className="configurator-footer-summary">
            <div>
              <span>Precio Unitario: </span>
              <strong>{formatEuro(pricing.unit_price)}</strong>
            </div>
            <div>
              <span>Total Línea: </span>
              <strong style={{ color: '#0284c7' }}>{formatEuro(pricing.total_amount)}</strong>
            </div>
          </div>
          <button type="button" className="primary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
