import { Fragment, useEffect, useMemo, useState } from 'react';
import { Boxes, CheckCircle2, Factory, FileText, Loader2, Scissors, X } from 'lucide-react';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import { getWorkSheetsBySalesOrderLine, type WorkSheet } from '../../services/production/workSheetService';
import { getLonaConfectionWorkSheetBySalesOrderLine, type LonaConfectionWorkSheet } from '../../services/production/lonaConfectionQueryService';
import { getComponentConsumptionWorkSheetBySalesOrderLine, type ComponentConsumptionWorkSheet } from '../../services/production/componentConsumptionService';
import { downloadOrderManufacturingReportPdf, type OrderManufacturingReportLine } from '../../services/production/orderManufacturingReportPdfService';
import { listProfileStockPieces, type ProfileStockPiece } from '../../services/warehouse/stockRepository';
import { calculateLonaCut, type LonaCutType } from '../../services/production/lonaCutCalculationService';
import { probeLonaStockWidth, type LonaConfectionComponent, type LonaStockRollProbe } from '../../services/production/lonaConfectionService';
import { LonaCutDiagram } from './LonaCutDiagram';
import {
  buildOrderFabricationOverview,
  fabricateWholeOrder,
  type LineFabricationOutcome,
  type OrderFabricationOverview,
  type OrderFabricationPlan,
  type ProfileNeedPreview,
} from '../../services/production/orderFabricationService';
import './component-consumption.css';
import './lona-confection.css';
import './sales-order-cut.css';
import './order-fabrication-control-center.css';

type Props = {
  order: SalesOrder;
  companyId: number;
  onClose: () => void;
  onDone: (data: { cutSheets: Record<number, WorkSheet[]>; lonaSheets: Record<number, LonaConfectionWorkSheet>; componentSheets: Record<number, ComponentConsumptionWorkSheet>; orderManufactured: boolean }) => void;
};

const stepLabel = (status: string) => ({ skipped: 'No aplica', already_done: 'Ya hecho', done: 'Fabricado', error: 'Error' } as Record<string, string>)[status] || status;
const CUT_TYPES: LonaCutType[] = ['Asimétrico', 'Retal Maxi', 'Retal Mini', 'Degradee', 'Screen', 'Telón'];
const DEFAULT_HEM = '3';
const DEFAULT_OVERLAP = '2.7';
const parseCutParam = (value: string) => (value === '' ? 0 : Number(value.replace(',', '.')) || 0);

type PieceRow = ProfileStockPiece & { selected: boolean; selectedQuantity: number };

export function OrderFabricationModal({ order, companyId, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [overview, setOverview] = useState<OrderFabricationOverview | null>(null);

  const [profileMode, setProfileMode] = useState<Record<string, 'AUTOMATIC' | 'MANUAL'>>({});
  const [profilePieces, setProfilePieces] = useState<Record<string, PieceRow[]>>({});
  const [profilePiecesLoading, setProfilePiecesLoading] = useState<Record<string, boolean>>({});

  const [lonaCutType, setLonaCutType] = useState<Record<string, LonaCutType>>({});
  const [lonaHem, setLonaHem] = useState<Record<string, string>>({});
  const [lonaOverlap, setLonaOverlap] = useState<Record<string, string>>({});
  const [lonaProbes, setLonaProbes] = useState<Record<string, LonaStockRollProbe | null>>({});
  const [lonaProbesLoading, setLonaProbesLoading] = useState<Record<string, boolean>>({});

  const [componentWarehouse, setComponentWarehouse] = useState<Record<string, number>>({});

  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<LineFabricationOutcome[] | null>(null);
  const [orderManufactured, setOrderManufactured] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState<{ cutSheets: WorkSheet[]; lonaSheets: LonaConfectionWorkSheet[]; componentSheets: ComponentConsumptionWorkSheet[] } | null>(null);

  const lines = order.lines || [];
  const orderWarehouseId = (order as any).warehouse_id == null ? null : Number((order as any).warehouse_id);
  const reportLines: OrderManufacturingReportLine[] = lines.map((line: any) => {
    const snapshot = line.specific_data?.configuration_snapshot || line.specific_data?.otd_snapshot || null;
    return {
      id: Number(line.id),
      lineNo: Number(line.line_no),
      description: line.description ?? null,
      otdCode: snapshot?.otd_code ? String(snapshot.otd_code) : null,
    };
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    buildOrderFabricationOverview(order, companyId)
      .then(result => {
        if (!active) return;
        setOverview(result);
        setProfileMode(Object.fromEntries(result.profileNeeds.map(n => [n.key, 'AUTOMATIC' as const])));
        const warehouseDefaults: Record<string, number> = {};
        result.componentNeeds.forEach(row => {
          const preferred = orderWarehouseId ? row.options.find(o => o.warehouseId === orderWarehouseId) : null;
          const chosen = preferred ?? row.options[0];
          if (chosen) warehouseDefaults[row.key] = chosen.warehouseId;
        });
        setComponentWarehouse(warehouseDefaults);

        result.lonaLines.forEach(lineEntry => {
          lineEntry.result.components.forEach(component => {
            const key = `${lineEntry.lineId}:${component.index}`;
            setLonaProbesLoading(prev => ({ ...prev, [key]: true }));
            probeLonaStockWidth({
              companyId,
              productId: component.productId,
              characteristicId: component.characteristicId,
              characteristicCode: component.characteristicCode,
            })
              .then(probe => {
                if (active) setLonaProbes(prev => ({ ...prev, [key]: probe }));
              })
              .catch(() => {
                if (active) setLonaProbes(prev => ({ ...prev, [key]: null }));
              })
              .finally(() => {
                if (active) setLonaProbesLoading(prev => ({ ...prev, [key]: false }));
              });
          });
        });
      })
      .catch(err => {
        if (active) setLoadError(err instanceof Error ? err.message : 'No se pudo analizar el pedido.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const setModeFor = (need: ProfileNeedPreview, mode: 'AUTOMATIC' | 'MANUAL') => {
    setProfileMode(prev => ({ ...prev, [need.key]: mode }));
    if (mode === 'MANUAL' && !profilePieces[need.key] && need.profileId && need.length) {
      setProfilePiecesLoading(prev => ({ ...prev, [need.key]: true }));
      listProfileStockPieces({
        companyId,
        productId: need.profileId,
        productCode: need.profile,
        characteristicId: need.characteristicId,
        characteristicCode: need.characteristicCode,
        requiredLength: need.length,
      })
        .then(rows => {
          setProfilePieces(prev => ({ ...prev, [need.key]: rows.map(r => ({ ...r, selected: false, selectedQuantity: 0 })) }));
        })
        .catch(() => setProfilePieces(prev => ({ ...prev, [need.key]: [] })))
        .finally(() => setProfilePiecesLoading(prev => ({ ...prev, [need.key]: false })));
    }
  };

  const togglePiece = (needKey: string, pieceIndex: number) => {
    setProfilePieces(prev => {
      const list = prev[needKey] || [];
      const updated = list.map((piece, i) => {
        if (i !== pieceIndex) return piece;
        const nextSelected = !piece.selected;
        return { ...piece, selected: nextSelected, selectedQuantity: nextSelected ? (piece.selectedQuantity > 0 ? piece.selectedQuantity : 1) : 0 };
      });
      return { ...prev, [needKey]: updated };
    });
  };

  const changePieceQuantity = (needKey: string, pieceIndex: number, value: number) => {
    setProfilePieces(prev => {
      const list = prev[needKey] || [];
      const updated = list.map((piece, i) => {
        if (i !== pieceIndex) return piece;
        const bounded = Math.min(Math.max(0, value), piece.quantity);
        return { ...piece, selected: bounded > 0, selectedQuantity: bounded };
      });
      return { ...prev, [needKey]: updated };
    });
  };

  const computeLonaCalculation = (component: LonaConfectionComponent, key: string) => {
    const probe = lonaProbes[key];
    if (!probe || component.line == null || component.output == null || component.line <= 0 || component.output <= 0) return null;
    const cutType = lonaCutType[key] ?? 'Asimétrico';
    const hem = parseCutParam(lonaHem[key] ?? DEFAULT_HEM);
    const overlap = parseCutParam(lonaOverlap[key] ?? DEFAULT_OVERLAP);
    return calculateLonaCut({
      type: cutType,
      line: component.line,
      output: component.output,
      selectedWidth: probe.sourceDimensions[0],
      hem,
      overlap,
      stockWidth: probe.sourceDimensions[0],
      stockLength: probe.sourceDimensions[1],
      rotated: probe.rotated,
    });
  };

  const profileValidation = useMemo(() => {
    if (!overview) return { valid: true, message: '' };
    for (const need of overview.profileNeeds) {
      if (profileMode[need.key] === 'MANUAL') {
        const selectedQuantity = (profilePieces[need.key] || []).reduce((sum, p) => sum + p.selectedQuantity, 0);
        if (selectedQuantity !== need.quantity) {
          return { valid: false, message: `Selecciona ${need.quantity} pieza(s) para ${need.profile} (línea ${need.lineNo}).` };
        }
      }
    }
    return { valid: true, message: '' };
  }, [overview, profileMode, profilePieces]);

  const totalPending = overview ? overview.profileNeeds.length + overview.lonaLines.reduce((sum, l) => sum + l.result.components.length, 0) + overview.componentNeeds.length : 0;

  const buildPlan = (): OrderFabricationPlan => {
    const plan: OrderFabricationPlan = { profileMode: {}, profileManualSelections: {}, lonaOverrides: {}, componentWarehouse: {} };
    (overview?.profileNeeds || []).forEach(need => {
      const mode = profileMode[need.key] || 'AUTOMATIC';
      plan.profileMode![need.key] = mode;
      if (mode === 'MANUAL') {
        const selected = (profilePieces[need.key] || []).filter(p => p.selectedQuantity > 0);
        plan.profileManualSelections![need.key] = selected.map(p => ({
          warehouseId: p.warehouseId,
          length: p.length,
          quantity: p.selectedQuantity,
          characteristicId: p.characteristicId,
          characteristicCode: p.characteristicCode,
        }));
      }
    });
    (overview?.lonaLines || []).forEach(lineEntry => {
      lineEntry.result.components.forEach(component => {
        const key = `${lineEntry.lineId}:${component.index}`;
        plan.lonaOverrides![key] = {
          cutType: lonaCutType[key] ?? 'Asimétrico',
          hem: parseCutParam(lonaHem[key] ?? DEFAULT_HEM),
          overlap: parseCutParam(lonaOverlap[key] ?? DEFAULT_OVERLAP),
        };
      });
    });
    (overview?.componentNeeds || []).forEach(row => {
      const warehouseId = componentWarehouse[row.key];
      if (warehouseId != null) plan.componentWarehouse![row.key] = warehouseId;
    });
    return plan;
  };

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const plan = buildPlan();
      const { outcomes: result, orderManufactured: manufactured } = await fabricateWholeOrder(order, companyId, plan);
      setOutcomes(result);
      setOrderManufactured(manufactured);

      const cutSheets: Record<number, WorkSheet[]> = {};
      const lonaSheets: Record<number, LonaConfectionWorkSheet> = {};
      const componentSheets: Record<number, ComponentConsumptionWorkSheet> = {};
      await Promise.all(
        lines.map(async (line: any) => {
          const lineId = Number(line.id);
          const [cs, ls, comp] = await Promise.all([
            getWorkSheetsBySalesOrderLine(lineId).catch(() => []),
            getLonaConfectionWorkSheetBySalesOrderLine(lineId).catch(() => null),
            getComponentConsumptionWorkSheetBySalesOrderLine(lineId).catch(() => null),
          ]);
          if (cs.length) cutSheets[lineId] = cs;
          if (ls) lonaSheets[lineId] = ls;
          if (comp) componentSheets[lineId] = comp;
        })
      );
      onDone({ cutSheets, lonaSheets, componentSheets, orderManufactured: manufactured });

      const report = { cutSheets: Object.values(cutSheets).flat(), lonaSheets: Object.values(lonaSheets), componentSheets: Object.values(componentSheets) };
      setReportData(report);
      downloadOrderManufacturingReportPdf({
        orderCode: order.code,
        reference: order.reference,
        customerName: order.customer_name,
        lines: reportLines,
        ...report,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo fabricar el pedido.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card xl">
        <header className="modal-header">
          <div>
            <span className="lona-eyebrow">FABRICACIÓN / CENTRO DE CONTROL</span>
            <h2>Fabricar {order.code}</h2>
            <p>Revisa y ajusta perfiles, lonas y componentes de todas las líneas del pedido antes de fabricar de una sola vez.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="lona-empty">Analizando el pedido…</div>
        ) : loadError ? (
          <div className="lona-error">{loadError}</div>
        ) : outcomes ? (
          <>
            {orderManufactured && (
              <div className="component-consumption-sheet-ready">
                <CheckCircle2 size={16} />
                <span>
                  Pedido <strong>{order.code}</strong> marcado como <strong>Fabricado</strong>.
                </span>
              </div>
            )}
            <div className="component-consumption-table-wrap">
              <table className="component-consumption-table">
                <thead>
                  <tr>
                    <th>Línea</th>
                    <th>Corte de perfil</th>
                    <th>Confección de lona</th>
                    <th>Componentes</th>
                  </tr>
                </thead>
                <tbody>
                  {outcomes.map(o => (
                    <tr key={o.lineId}>
                      <td>
                        <strong>Línea {o.lineNo}</strong>
                        <span className="component-consumption-secondary">{o.productCode || '—'}</span>
                      </td>
                      <td className={o.profile.status === 'error' ? 'component-consumption-no-stock' : ''}>
                        {o.profile.status === 'error' ? o.profile.message : stepLabel(o.profile.status)}
                      </td>
                      <td className={o.lona.status === 'error' ? 'component-consumption-no-stock' : ''}>
                        {o.lona.status === 'error' ? o.lona.message : stepLabel(o.lona.status)}
                      </td>
                      <td className={o.components.status === 'error' ? 'component-consumption-no-stock' : ''}>
                        {o.components.status === 'error' ? o.components.message : stepLabel(o.components.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="modal-actions-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={!reportData}
                onClick={() =>
                  reportData &&
                  downloadOrderManufacturingReportPdf({
                    orderCode: order.code,
                    reference: order.reference,
                    customerName: order.customer_name,
                    lines: reportLines,
                    ...reportData,
                  })
                }
              >
                <FileText size={15} /> Volver a descargar informe
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Cerrar
              </button>
            </footer>
          </>
        ) : overview ? (
          <>
            <div className="modal-body order-fabrication-control-center">
              {overview.profileNeeds.length > 0 && (
                <section className="ofc-section">
                  <h3>
                    <Scissors size={15} /> Perfiles de corte ({overview.profileNeeds.length})
                  </h3>
                  <div className="table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>Línea</th>
                          <th>Perfil</th>
                          <th>Característica</th>
                          <th>Necesidad</th>
                          <th>Modo</th>
                          <th>Selección</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.profileNeeds.map(need => {
                          const mode = profileMode[need.key] || 'AUTOMATIC';
                          const pieces = profilePieces[need.key] || [];
                          const selectedQuantity = pieces.reduce((sum, p) => sum + p.selectedQuantity, 0);
                          return (
                            <Fragment key={need.key}>
                              <tr>
                                <td>Línea {need.lineNo}</td>
                                <td>{need.profile}</td>
                                <td>{need.characteristic}</td>
                                <td>
                                  {need.quantity} × {need.length} {need.unit}
                                </td>
                                <td>
                                  <div className="ofc-mode-toggle">
                                    <button type="button" className={mode === 'AUTOMATIC' ? 'active' : ''} onClick={() => setModeFor(need, 'AUTOMATIC')}>
                                      Automático
                                    </button>
                                    <button type="button" className={mode === 'MANUAL' ? 'active' : ''} onClick={() => setModeFor(need, 'MANUAL')}>
                                      Manual
                                    </button>
                                  </div>
                                </td>
                                <td>{mode === 'AUTOMATIC' ? 'Optimización automática' : `${selectedQuantity} / ${need.quantity} seleccionadas`}</td>
                              </tr>
                              {mode === 'MANUAL' && (
                                <tr className="ofc-manual-row">
                                  <td colSpan={6}>
                                    {profilePiecesLoading[need.key] ? (
                                      <div className="empty-cell">Consultando stock compatible…</div>
                                    ) : pieces.length === 0 ? (
                                      <div className="empty-cell">No hay piezas de stock compatibles con esta necesidad.</div>
                                    ) : (
                                      <div className="ofc-piece-grid">
                                        {pieces.map((piece, pieceIndex) => (
                                          <label key={`${piece.warehouseId}-${piece.length}-${pieceIndex}`} className={`ofc-piece ${piece.selected ? 'selected' : ''}`}>
                                            <span>
                                              <input type="checkbox" checked={piece.selected} onChange={() => togglePiece(need.key, pieceIndex)} />
                                              <strong>{piece.warehouseCode}</strong>
                                            </span>
                                            <span>
                                              <small>
                                                {piece.length} {need.unit}
                                              </small>
                                              <small>Disp. {piece.quantity}</small>
                                            </span>
                                            <span className="ofc-piece-qty">
                                              <input
                                                type="number"
                                                min={0}
                                                max={piece.quantity}
                                                value={piece.selectedQuantity}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => changePieceQuantity(need.key, pieceIndex, Number(e.target.value) || 0)}
                                              />
                                            </span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {overview.lonaLines.length > 0 && (
                <section className="ofc-section">
                  <h3>
                    <Boxes size={15} /> Confección de lona ({overview.lonaLines.reduce((sum, l) => sum + l.result.components.length, 0)})
                  </h3>
                  <div className="table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>Línea</th>
                          <th>Componente</th>
                          <th>Necesidad</th>
                          <th>Tipo de corte</th>
                          <th>Dobladillo</th>
                          <th>Solape</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.lonaLines.flatMap(lineEntry =>
                          lineEntry.result.components.map(component => {
                            const key = `${lineEntry.lineId}:${component.index}`;
                            const probe = lonaProbes[key];
                            const probeLoading = Boolean(lonaProbesLoading[key]);
                            const calculation = computeLonaCalculation(component, key);
                            return (
                              <Fragment key={key}>
                                <tr>
                                  <td>Línea {lineEntry.lineNo}</td>
                                  <td>
                                    <strong>{component.productCode}</strong>
                                    <div className="muted">{component.productName}</div>
                                  </td>
                                  <td>
                                    {component.quantity} · {component.line ?? '—'}
                                    {component.lineUnit ? ` ${component.lineUnit}` : ''} × {component.output ?? '—'}
                                    {component.outputUnit ? ` ${component.outputUnit}` : ''}
                                  </td>
                                  <td>
                                    <select value={lonaCutType[key] ?? 'Asimétrico'} onChange={e => setLonaCutType(prev => ({ ...prev, [key]: e.target.value as LonaCutType }))}>
                                      {CUT_TYPES.map(type => (
                                        <option key={type} value={type}>
                                          {type}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="ofc-narrow-input"
                                      value={lonaHem[key] ?? DEFAULT_HEM}
                                      onChange={e => setLonaHem(prev => ({ ...prev, [key]: e.target.value }))}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      className="ofc-narrow-input"
                                      value={lonaOverlap[key] ?? DEFAULT_OVERLAP}
                                      onChange={e => setLonaOverlap(prev => ({ ...prev, [key]: e.target.value }))}
                                    />
                                  </td>
                                </tr>
                                <tr className="ofc-manual-row">
                                  <td colSpan={6}>
                                    {probeLoading ? (
                                      <div className="empty-cell">Buscando material de lona compatible…</div>
                                    ) : !probe ? (
                                      <div className="empty-cell">Sin material de lona compatible para {component.productCode} ({component.characteristicName || 'sin característica'}).</div>
                                    ) : (
                                      <div className="ofc-lona-diagram">
                                        <LonaCutDiagram
                                          calculation={calculation}
                                          stockDimensions={probe.sourceDimensions}
                                          stockUnits={probe.sourceDimensionUnits}
                                          cutLine={component.line ?? 0}
                                          cutOutput={component.output ?? 0}
                                          unit={component.lineUnit || component.outputUnit || null}
                                        />
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              </Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {overview.componentNeeds.length > 0 && (
                <section className="ofc-section">
                  <h3>
                    <Boxes size={15} /> Componentes ({overview.componentNeeds.length})
                  </h3>
                  <div className="table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>Línea</th>
                          <th>Componente</th>
                          <th>Necesidad</th>
                          <th>Almacén</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.componentNeeds.map(row => {
                          const selected = componentWarehouse[row.key] ?? null;
                          return (
                            <tr key={row.key}>
                              <td>Línea {row.lineNo}</td>
                              <td>
                                <strong>{row.need.productCode}</strong>
                                <div className="muted">{row.need.productName}</div>
                              </td>
                              <td>
                                {row.need.quantity} {row.need.unitCode}
                              </td>
                              <td>
                                {row.options.length === 0 ? (
                                  <span className="component-consumption-no-stock">Sin existencias</span>
                                ) : (
                                  <select value={selected ?? ''} onChange={e => setComponentWarehouse(prev => ({ ...prev, [row.key]: Number(e.target.value) }))}>
                                    {row.options.map(o => (
                                      <option key={o.warehouseId} value={o.warehouseId}>
                                        {o.warehouseCode} · {o.available} disp.
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {totalPending === 0 && (
                <div className="empty-state">
                  <CheckCircle2 size={18} />
                  <strong>Todo ya fabricado</strong>
                  <span>No queda ningún perfil, lona ni componente pendiente en este pedido.</span>
                </div>
              )}
            </div>

            {!profileValidation.valid && <div className="inline-error">{profileValidation.message}</div>}
            {error && <div className="lona-error lona-error-inline">{error}</div>}
            <footer className="modal-actions-footer">
              <button type="button" className="secondary-button" onClick={onClose} disabled={running}>
                Cancelar
              </button>
              <button type="button" className="primary-button" disabled={running || totalPending === 0 || !profileValidation.valid} onClick={() => void run()}>
                {running ? (
                  <>
                    <Loader2 size={15} className="spin" /> Fabricando pedido…
                  </>
                ) : totalPending === 0 ? (
                  <>
                    <CheckCircle2 size={15} /> Todo ya fabricado
                  </>
                ) : (
                  <>
                    <Factory size={15} /> Fabricar pedido completo ({totalPending} pendiente{totalPending === 1 ? '' : 's'})
                  </>
                )}
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
