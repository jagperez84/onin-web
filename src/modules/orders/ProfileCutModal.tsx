import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Hammer,
  PackageSearch,
  Printer,
  FlaskConical,
  ArrowRight,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import { listProfileStockPieces, type ProfileStockPiece } from '../../services/warehouse/stockRepository';
import {
  executeManualProfileCutWithWorkSheet,
  getWorkSheetsBySalesOrderLine,
  type WorkSheet
} from '../../services/production/workSheetService';
import { downloadWorkSheetPdf, downloadBatchWorkSheetsPdf } from '../../services/production/workSheetPdfService';
import { loadMasterProductConfiguration } from '../../services/catalog/productConfigurationService';
import { deriveProfileCutNeeds, findWorkSheetForNeed, type CutNeed } from '../../services/catalog/profileCutNeeds';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './sales-order.css';
import './sales-order-cut.css';

export type { CutNeed };

type StockPiece = ProfileStockPiece & { selected: boolean; selectedQuantity: number };

type BatchProposal = {
  need: CutNeed;
  pieces: StockPiece[];
  remnant: number;
  reason: string;
};

export function ProfileCutModal({
  line,
  companyId,
  salesOrderId,
  reference,
  onClose
}: {
  line: any;
  companyId: number;
  salesOrderId: number;
  reference?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'mode' | 'manual' | 'review' | 'simulation' | 'completed'>('mode');
  const [mode, setMode] = useState<'manual' | 'automatic' | 'simulation'>('automatic');
  const [batchMode, setBatchMode] = useState<boolean>(true);
  const [activeNeedIndex, setActiveNeedIndex] = useState<number>(0);

  // Stock selection state per profile need (index -> StockPiece[])
  const [manualSelections, setManualSelections] = useState<Record<number, StockPiece[]>>({});
  const [batchProposals, setBatchProposals] = useState<BatchProposal[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingLoading, setExistingLoading] = useState(true);
  const [existingWorkSheets, setExistingWorkSheets] = useState<WorkSheet[]>([]);
  const [stockError, setStockError] = useState('');
  const [cutError, setCutError] = useState('');
  const [unitMap, setUnitMap] = useState<Record<number, string>>({});

  const needs: CutNeed[] = deriveProfileCutNeeds(line);

  const activeNeed = needs[activeNeedIndex] || needs[0];

  // Match worksheet for a given need
  const getSheetForNeed = (need: CutNeed, sheets: WorkSheet[]): WorkSheet | null => findWorkSheetForNeed(need, sheets);

  // Resolve units for all needs
  useEffect(() => {
    let active = true;
    needs.forEach((need, idx) => {
      if (!need.profileId) {
        if (need.unit) setUnitMap(prev => ({ ...prev, [idx]: need.unit }));
        return;
      }
      loadMasterProductConfiguration(need.profileId, companyId)
        .then(conf => {
          if (!active || !conf) return;
          const targetDim =
            conf.dimensions?.find((d: any) => /long|largo|length/i.test(String(d.name || d.code))) ||
            conf.dimensions?.[0];
          const dimUnitId = targetDim?.unit_id || conf.measurementType?.result_unit_id;
          const dimUnitObj = dimUnitId ? conf.unitsMap.get(dimUnitId) : null;
          const uStr = dimUnitObj?.code || dimUnitObj?.name || '';
          if (uStr) {
            setUnitMap(prev => ({ ...prev, [idx]: uStr }));
          } else if (need.unit) {
            setUnitMap(prev => ({ ...prev, [idx]: need.unit }));
          }
        })
        .catch(() => {
          if (active && need.unit) setUnitMap(prev => ({ ...prev, [idx]: need.unit }));
        });
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  const getUnit = (idx: number) => unitMap[idx] || needs[idx]?.unit || '';
  const u = (val: number | string, idx = activeNeedIndex) => {
    const un = getUnit(idx);
    return un ? `${val} ${un}` : `${val}`;
  };

  const uSheet = (val: number | string, sheet?: WorkSheet | null) => {
    const sheetUnit = sheet?.unit_symbol || sheet?.unit_code || getUnit(activeNeedIndex);
    return sheetUnit ? `${val} ${sheetUnit}` : `${val}`;
  };

  // Load existing worksheets for this sales order line
  useEffect(() => {
    let active = true;
    setExistingLoading(true);
    getWorkSheetsBySalesOrderLine(Number(line.id))
      .then(sheets => {
        if (!active) return;
        setExistingWorkSheets(sheets);
        const allDone = needs.every(n => Boolean(getSheetForNeed(n, sheets)));
        if (allDone) {
          setStep('completed');
        } else {
          const firstPendingIdx = needs.findIndex(n => !getSheetForNeed(n, sheets));
          if (firstPendingIdx !== -1) {
            setActiveNeedIndex(firstPendingIdx);
          }
        }
      })
      .catch(() => {
        if (active) setExistingWorkSheets([]);
      })
      .finally(() => {
        if (active) setExistingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [line.id]);

  // Load stock pieces for a need
  const loadStockForNeed = async (need: CutNeed, needIdx: number) => {
    if (!need.profileId || !need.length) return [];
    const rows = await listProfileStockPieces({
      companyId,
      productId: need.profileId,
      productCode: need.profile,
      characteristicId: need.characteristicId,
      characteristicCode: need.characteristicCode,
      requiredLength: need.length
    });
    const pieces: StockPiece[] = rows.map(row => ({ ...row, selected: false, selectedQuantity: 0 }));
    setManualSelections(prev => ({ ...prev, [needIdx]: pieces }));
    return pieces;
  };

  // Load manual stock on entering step 2
  useEffect(() => {
    if (existingLoading || step !== 'manual' || !activeNeed.length) return;
    if (!manualSelections[activeNeedIndex]) {
      setStockLoading(true);
      loadStockForNeed(activeNeed, activeNeedIndex)
        .catch(err => setStockError(err instanceof Error ? err.message : 'Error al cargar stock.'))
        .finally(() => setStockLoading(false));
    }
  }, [step, activeNeedIndex, existingLoading]);

  // Automatic calculation (single or batch)
  const calculateAutomaticProposal = async (isBatch: boolean) => {
    setStockLoading(true);
    setStockError('');
    setCutError('');
    try {
      const targets = isBatch
        ? needs.map((n, idx) => ({ need: n, idx })).filter(({ need }) => !getSheetForNeed(need, existingWorkSheets))
        : [{ need: activeNeed, idx: activeNeedIndex }];

      const proposals: BatchProposal[] = [];

      for (const { need, idx } of targets) {
        if (!need.profileId || !need.length) {
          throw new Error(`El perfil ${need.profile} no tiene una longitud de corte válida.`);
        }
        const rows = await listProfileStockPieces({
          companyId,
          productId: need.profileId,
          productCode: need.profile,
          characteristicId: need.characteristicId,
          characteristicCode: need.characteristicCode,
          requiredLength: need.length
        });
        const pieces = rows
          .map(row => ({ ...row, selected: false, selectedQuantity: 0 }))
          .sort((a, b) => a.length - b.length || a.warehouseId - b.warehouseId);

        let remaining = need.quantity;
        const chosen: StockPiece[] = [];
        for (const piece of pieces) {
          if (remaining <= 0) break;
          const take = Math.min(piece.quantity, remaining);
          if (take > 0) {
            chosen.push({ ...piece, selected: true, selectedQuantity: take });
            remaining -= take;
          }
        }

        if (remaining > 0) {
          throw new Error(
            `Stock insuficiente para ${need.profile} (${need.characteristic}): Faltan ${remaining} pieza(s) de ${need.length} ${getUnit(idx)}.`
          );
        }

        const remnant = chosen.reduce((sum, p) => sum + (p.length - need.length) * p.selectedQuantity, 0);
        const reason = `Optimización automática: se selecciona la menor longitud compatible disponible. Material: ${chosen
          .map(p => `${p.selectedQuantity} × ${p.length} ${getUnit(idx)}`)
          .join(', ')}. Remanente: ${remnant} ${getUnit(idx)}.`;

        proposals.push({ need, pieces: chosen, remnant, reason });
      }

      setBatchProposals(proposals);
      setStep('review');
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'No se pudo calcular la propuesta automática.');
    } finally {
      setStockLoading(false);
    }
  };

  // Execution: Cuts all proposals in batch (or single)
  const executeBatchCut = async () => {
    if (batchProposals.length === 0) return;
    setSaving(true);
    setCutError('');
    try {
      const createdSheets: WorkSheet[] = [];

      for (const prop of batchProposals) {
        const need = prop.need;
        const reason = mode === 'automatic' ? prop.reason : 'Selección manual realizada por el usuario.';
        const selectedPieces = prop.pieces.filter(p => p.selectedQuantity > 0);

        const created = await executeManualProfileCutWithWorkSheet({
          companyId,
          salesOrderId,
          salesOrderLineId: Number(line.id),
          salesOrderLineNo: need.lineNo,
          productId: need.profileId!,
          productCode: need.profile,
          productName: need.profileName,
          characteristicId: selectedPieces[0]?.characteristicId ?? need.characteristicId ?? null,
          characteristicCode: need.characteristicCode ?? selectedPieces[0]?.characteristicCode ?? null,
          characteristicName: need.characteristic,
          requiredLength: need.length,
          quantity: need.quantity,
          selections: selectedPieces.map(piece => ({
            warehouseId: piece.warehouseId,
            dimensionValues: [piece.length],
            quantity: piece.selectedQuantity
          })),
          reference: reference || `Corte línea ${need.lineNo} · ${need.profile}`,
          notes: `Cortar ${need.quantity} pieza(s) de ${need.length} ${need.unit}. ${reason}`,
          selectionMode: mode === 'automatic' ? 'AUTOMATIC' : 'MANUAL',
          selectionReason: reason,
          unitSymbol: getUnit(need.componentIndex) || undefined
        });

        createdSheets.push(created);
      }

      setExistingWorkSheets(prev => [...createdSheets, ...prev]);
      setStep('completed');
    } catch (err) {
      setCutError(err instanceof CoreRepositoryError || err instanceof Error ? err.message : 'Error al ejecutar corte.');
    } finally {
      setSaving(false);
    }
  };

  // Manual piece selection toggles
  const currentPieces = manualSelections[activeNeedIndex] || [];
  const groupedManual = currentPieces.reduce<Record<string, StockPiece[]>>((acc, piece) => {
    const key = `${piece.length}`;
    (acc[key] ??= []).push(piece);
    return acc;
  }, {});

  const pieceKey = (piece: StockPiece) =>
    `${piece.warehouseId}-${piece.length}-${piece.characteristicId ?? piece.characteristicCode ?? 'default'}`;

  const toggleManualPiece = (id: string) => {
    setManualSelections(prev => {
      const list = prev[activeNeedIndex] || [];
      const updated = list.map(piece => {
        if (pieceKey(piece) !== id) return piece;
        const nextSelected = !piece.selected;
        return {
          ...piece,
          selected: nextSelected,
          selectedQuantity: nextSelected ? (piece.selectedQuantity > 0 ? piece.selectedQuantity : 1) : 0
        };
      });
      return { ...prev, [activeNeedIndex]: updated };
    });
  };

  const changeManualQuantity = (id: string, value: number) => {
    setManualSelections(prev => {
      const list = prev[activeNeedIndex] || [];
      const updated = list.map(piece => {
        if (pieceKey(piece) !== id) return piece;
        const bounded = Math.min(Math.max(0, value), piece.quantity);
        return {
          ...piece,
          selected: bounded > 0,
          selectedQuantity: bounded
        };
      });
      return { ...prev, [activeNeedIndex]: updated };
    });
  };

  const selectedForActive = (manualSelections[activeNeedIndex] || []).filter(p => p.selectedQuantity > 0);
  const selectedCountForActive = selectedForActive.reduce((sum, p) => sum + p.selectedQuantity, 0);
  const activeManualValid = selectedCountForActive === activeNeed.quantity;

  const prepareManualReview = () => {
    if (batchMode && needs.length > 1) {
      // Check if all pending needs have valid manual selections
      const pendingNeeds = needs.map((n, idx) => ({ n, idx })).filter(({ n }) => !getSheetForNeed(n, existingWorkSheets));
      const allValid = pendingNeeds.every(({ n, idx }) => {
        const sel = (manualSelections[idx] || []).filter(p => p.selectedQuantity > 0);
        return sel.reduce((sum, p) => sum + p.selectedQuantity, 0) === n.quantity;
      });

      if (!allValid) {
        setStockError('Por favor, selecciona las piezas necesarias para todos los perfiles del lote.');
        return;
      }

      const proposals: BatchProposal[] = pendingNeeds.map(({ n, idx }) => {
        const chosen = (manualSelections[idx] || []).filter(p => p.selectedQuantity > 0);
        const remnant = chosen.reduce((sum, p) => sum + (p.length - n.length) * p.selectedQuantity, 0);
        return {
          need: n,
          pieces: chosen,
          remnant,
          reason: 'Selección manual en lote realizada por el usuario.'
        };
      });

      setBatchProposals(proposals);
      setStep('review');
    } else {
      if (!activeManualValid) return;
      const remnant = selectedForActive.reduce((sum, p) => sum + (p.length - activeNeed.length) * p.selectedQuantity, 0);
      setBatchProposals([
        {
          need: activeNeed,
          pieces: selectedForActive,
          remnant,
          reason: 'Selección manual realizada por el usuario.'
        }
      ]);
      setStep('review');
    }
  };

  const totalCutCount = existingWorkSheets.length;
  const pendingCount = needs.filter(n => !getSheetForNeed(n, existingWorkSheets)).length;

  return (
    <div className="sales-order-modal-backdrop">
      <div className="sales-order-modal" role="dialog" aria-modal="true">
        <div className="sales-order-modal-head">
          <div>
            <div className="eyebrow">FABRICACIÓN / CORTE DE PERFILES</div>
            <h2>
              {step === 'completed'
                ? 'Corte completado'
                : step === 'simulation'
                ? 'Simulación de corte'
                : 'Corte de perfil'}
            </h2>
            <p>
              Línea {line.line_no} · {needs.length} perfil{needs.length > 1 ? 'es' : ''} a cortar
              {batchMode && needs.length > 1 ? ' (Procesamiento en lote)' : ''}
            </p>
          </div>
          <button className="icon-link" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        {/* Perfiles de la línea Selector Tabs */}
        {needs.length > 1 && (
          <div className="profile-cut-tabs-container">
            <div className="profile-cut-tabs-header">
              <span>Perfiles a cortar en esta línea ({needs.length})</span>
              <strong>
                {totalCutCount} de {needs.length} cortados
              </strong>
            </div>
            <div className="profile-cut-tabs">
              {needs.map((n, idx) => {
                const sheet = getSheetForNeed(n, existingWorkSheets);
                const isSelected = idx === activeNeedIndex;
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`profile-cut-tab ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setActiveNeedIndex(idx);
                      if (step === 'completed' && !sheet) {
                        setStep('mode');
                      }
                    }}
                  >
                    <div className="profile-cut-tab-head">
                      <strong title={n.profileName}>{n.profile}</strong>
                      <span className="profile-cut-tab-index">Perfil {idx + 1}</span>
                    </div>
                    <div className="profile-cut-tab-meta">
                      <span>
                        {n.quantity} × {u(n.length, idx)}
                      </span>
                      {sheet ? (
                        <span className="profile-cut-badge done">
                          <CheckCircle2 size={11} /> {sheet.code}
                        </span>
                      ) : (
                        <span className="profile-cut-badge pending">Pendiente</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {existingLoading ? (
          <div className="sales-order-cut-body">
            <div className="empty-cell">Comprobando cortes realizados de la línea…</div>
          </div>
        ) : step === 'completed' ? (
          <div className="sales-order-cut-body">
            <div className="sales-order-cut-summary">
              <div>
                <span>Estado general</span>
                <strong>
                  {pendingCount === 0 ? 'Corte completado' : `Parcial (${totalCutCount}/${needs.length})`}
                </strong>
              </div>
              <div>
                <span>Hojas generadas</span>
                <strong>{existingWorkSheets.length}</strong>
              </div>
              <div>
                <span>Línea de pedido</span>
                <strong>Línea {line.line_no}</strong>
              </div>
            </div>

            <div className="sales-order-review-box">
              <h3>Informe consolidado de corte de la línea</h3>
              {existingWorkSheets.map(ws => (
                <div className="sales-order-review-row completed-sheet-row" key={ws.id}>
                  <div>
                    <strong style={{ color: 'var(--primary)', display: 'block', fontSize: '13.5px' }}>
                      {ws.code} · {ws.product_code} ({ws.characteristic_name || 'Sin característica'})
                    </strong>
                    <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Necesidad: {ws.quantity} ud. × {uSheet(ws.required_length, ws)}
                    </span>
                    <div style={{ fontSize: '11.5px', marginTop: '4px' }}>
                      {ws.lines.map(l => (
                        <span key={l.id} style={{ display: 'inline-block', marginRight: '10px' }}>
                          • {l.warehouse_code}: {l.source_dimension_values.join('×')} → corte{' '}
                          {l.cut_dimension_values.join('×')} (resto:{' '}
                          {l.remainder_dimension_values.length ? l.remainder_dimension_values.join('×') : '0'})
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="profile-cut-badge done" style={{ fontSize: '11px', padding: '4px 8px' }}>
                    <CheckCircle2 size={12} /> Cortado
                  </span>
                </div>
              ))}
            </div>

            {pendingCount > 0 && (
              <div className="next-profile-banner">
                <div>
                  <strong>Quedan {pendingCount} perfiles pendientes en esta línea</strong>
                  <p>Puedes continuar con el corte del siguiente perfil.</p>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const nextPending = needs.findIndex(n => !getSheetForNeed(n, existingWorkSheets));
                    if (nextPending !== -1) setActiveNeedIndex(nextPending);
                    setStep('mode');
                  }}
                >
                  Cortar perfil pendiente <ArrowRight size={15} />
                </button>
              </div>
            )}

            <div className="sales-order-modal-actions">
              {existingWorkSheets.length > 0 && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadBatchWorkSheetsPdf(existingWorkSheets, reference)}
                >
                  <Printer size={15} /> Descargar informe de corte (PDF)
                </button>
              )}
              <button className="primary-button" onClick={onClose}>
                Finalizar
              </button>
            </div>
          </div>
        ) : step === 'simulation' ? (
          <div className="sales-order-cut-body">
            <div className="sales-order-cut-note simulation-banner">
              <strong>SIMULACIÓN DE CORTE</strong> · No se modifica el stock, no se genera hoja de corte y el pedido
              no cambia de estado.
            </div>
            <div className="sales-order-review-box">
              <h3>Resultado previsto del lote ({batchProposals.length} perfiles)</h3>
              {batchProposals.map((prop, idx) => (
                <div key={idx} style={{ marginBottom: '14px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '6px', color: 'var(--text)' }}>
                    Perfil {idx + 1}: {prop.need.profile} ({prop.need.characteristic}) · {prop.need.quantity} ×{' '}
                    {u(prop.need.length, prop.need.componentIndex)}
                  </div>
                  {prop.pieces.map((piece, pIdx) => (
                    <div
                      className="sales-order-review-row"
                      key={`${piece.warehouseId}-${piece.length}-${pIdx}`}
                    >
                      <span>
                        {piece.warehouseCode} · pieza de {u(piece.length, prop.need.componentIndex)}
                      </span>
                      <strong>
                        {piece.selectedQuantity} ud. → corte {u(prop.need.length, prop.need.componentIndex)} · resto{' '}
                        {u(Math.max(0, piece.length - prop.need.length), prop.need.componentIndex)}
                      </strong>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="sales-order-modal-actions">
              <button className="secondary-button" onClick={() => setStep('mode')}>
                Atrás
              </button>
              <button className="primary-button" onClick={onClose}>
                Cerrar simulación
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="sales-order-cut-steps">
              <span className={step === 'mode' ? 'active' : ''}>1. Método</span>
              <span className={step === 'manual' ? 'active' : ''}>2. Material</span>
              <span className={step === 'review' ? 'active' : ''}>3. Revisar</span>
              <span className={(step as string) === 'completed' ? 'active' : ''}>4. Hoja</span>
            </div>

            {step === 'mode' && (
              <div className="sales-order-cut-body">
                {needs.length > 1 && (
                  <div className="batch-scope-selector">
                    <button
                      type="button"
                      className={`batch-scope-btn ${batchMode ? 'selected' : ''}`}
                      onClick={() => setBatchMode(true)}
                    >
                      <Layers size={16} />
                      <div>
                        <strong>Cortar todos los perfiles en lote ({needs.length})</strong>
                        <span>Procesa y corta todos los perfiles de la línea de una vez.</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className={`batch-scope-btn ${!batchMode ? 'selected' : ''}`}
                      onClick={() => setBatchMode(false)}
                    >
                      <Hammer size={16} />
                      <div>
                        <strong>Cortar solo {activeNeed.profile} (individual)</strong>
                        <span>Procesa únicamente el perfil seleccionado.</span>
                      </div>
                    </button>
                  </div>
                )}

                {batchMode && needs.length > 1 ? (
                  <div className="batch-profiles-overview">
                    <div className="batch-profiles-overview-title">
                      <Sparkles size={14} /> Resumen del lote de perfiles ({needs.length}):
                    </div>
                    <div className="batch-profiles-list">
                      {needs.map((n, idx) => (
                        <div className="batch-profile-item" key={n.id}>
                          <strong>
                            Perfil {idx + 1}: {n.profile}
                          </strong>
                          <span>
                            {n.quantity} × {u(n.length, idx)}
                          </span>
                          <small>{n.characteristic}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="sales-order-cut-summary">
                    <div>
                      <span>Necesidad</span>
                      <strong>
                        {activeNeed.quantity} × {activeNeed.length ? u(activeNeed.length) : 'Longitud pendiente'}
                      </strong>
                    </div>
                    <div>
                      <span>Perfil ({activeNeedIndex + 1}/{needs.length})</span>
                      <strong>{activeNeed.profile}</strong>
                    </div>
                    <div>
                      <span>Característica</span>
                      <strong>{activeNeed.characteristic}</strong>
                    </div>
                  </div>
                )}

                <h3>
                  {batchMode && needs.length > 1
                    ? '¿Cómo quieres determinar el material para el lote?'
                    : `¿Cómo quieres determinar el material para ${activeNeed.profile}?`}
                </h3>

                <div className="sales-order-mode-grid">
                  <button
                    type="button"
                    className={mode === 'automatic' ? 'selected' : ''}
                    onClick={() => setMode('automatic')}
                  >
                    <CheckCircle2 size={20} />
                    <strong>Optimización automática {batchMode && needs.length > 1 ? 'del lote' : ''}</strong>
                    <span>
                      Onin seleccionará las piezas de almacén óptimas minimizando los remanentes para{' '}
                      {batchMode && needs.length > 1 ? 'todos los perfiles' : 'este perfil'}.
                    </span>
                  </button>
                  <button
                    type="button"
                    className={mode === 'manual' ? 'selected' : ''}
                    onClick={() => setMode('manual')}
                  >
                    <PackageSearch size={20} />
                    <strong>Selección manual</strong>
                    <span>Selecciona manualmente las piezas o retales de stock que quieres utilizar.</span>
                  </button>
                  <button
                    type="button"
                    className={mode === 'simulation' ? 'selected' : ''}
                    onClick={() => setMode('simulation')}
                  >
                    <FlaskConical size={20} />
                    <strong>Simulación de corte</strong>
                    <span>Comprueba el resultado sin descontar stock ni generar documento.</span>
                  </button>
                </div>

                {stockError && <div className="inline-error">{stockError}</div>}

                <div className="sales-order-modal-actions">
                  <button className="secondary-button" onClick={onClose}>
                    Cancelar
                  </button>
                  <button
                    className="primary-button"
                    disabled={stockLoading}
                    onClick={() => {
                      if (mode === 'automatic' || mode === 'simulation') {
                        void calculateAutomaticProposal(batchMode && needs.length > 1);
                      } else {
                        setStep('manual');
                      }
                    }}
                  >
                    {stockLoading ? 'Calculando propuesta…' : 'Continuar'}
                  </button>
                </div>
              </div>
            )}

            {step === 'manual' && (
              <div className="sales-order-cut-body">
                {needs.length > 1 && (
                  <div className="sales-order-cut-note">
                    <Info size={15} /> Selecciona el material para cada perfil pendiente de la línea:
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      {needs.map((n, idx) => {
                        const sel = (manualSelections[idx] || []).filter(p => p.selectedQuantity > 0);
                        const qty = sel.reduce((sum, p) => sum + p.selectedQuantity, 0);
                        const isReady = qty === n.quantity;
                        return (
                          <button
                            key={n.id}
                            type="button"
                            className={`secondary-button ${idx === activeNeedIndex ? 'active-manual-tab' : ''}`}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11.5px',
                              borderColor: isReady ? '#10b981' : undefined
                            }}
                            onClick={() => setActiveNeedIndex(idx)}
                          >
                            {isReady ? '✓ ' : ''}Perfil {idx + 1}: {n.profile} ({qty}/{n.quantity})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="sales-order-cut-summary">
                  <div>
                    <span>Perfil actual</span>
                    <strong>{activeNeed.profile}</strong>
                  </div>
                  <div>
                    <span>Necesidad</span>
                    <strong>
                      {activeNeed.quantity} × {u(activeNeed.length, activeNeedIndex)}
                    </strong>
                  </div>
                  <div>
                    <span>Seleccionadas</span>
                    <strong>
                      {selectedCountForActive} / {activeNeed.quantity}
                    </strong>
                  </div>
                </div>

                {stockError && <div className="inline-error">{stockError}</div>}

                {stockLoading ? (
                  <div className="empty-cell">Consultando stock compatible…</div>
                ) : Object.keys(groupedManual).length === 0 ? (
                  <div className="sales-order-cut-note">
                    No hay piezas o restos disponibles en stock que puedan proporcionar la longitud requerida (
                    {u(activeNeed.length, activeNeedIndex)}).
                  </div>
                ) : (
                  <div className="sales-order-stock-groups">
                    {Object.entries(groupedManual).map(([measure, rows]) => (
                      <div className="sales-order-stock-group" key={measure}>
                        <div className="sales-order-stock-group-head">
                          <div>
                            <strong>{u(measure, activeNeedIndex)}</strong>
                            <span>{rows.length} ubicaciones</span>
                          </div>
                          <span>Disponible: {rows.reduce((sum, row) => sum + row.quantity, 0)} ud.</span>
                        </div>
                        <div className="sales-order-stock-list">
                          {rows.map(piece => {
                            const id = pieceKey(piece);
                            return (
                              <div
                                className={`sales-order-stock-piece ${piece.selected ? 'selected' : ''}`}
                                key={id}
                                onClick={() => toggleManualPiece(id)}
                              >
                                <input
                                  type="checkbox"
                                  checked={piece.selected}
                                  onChange={() => toggleManualPiece(id)}
                                  onClick={e => e.stopPropagation()}
                                />
                                <span>
                                  <strong>{piece.warehouseCode}</strong>
                                  <small>{piece.warehouseName}</small>
                                </span>
                                <span>
                                  <strong>{u(piece.length, activeNeedIndex)}</strong>
                                  <small>{piece.characteristicName || piece.characteristicCode || 'Sin característica'}</small>
                                </span>
                                <span className="stock-piece-quantity" onClick={e => e.stopPropagation()}>
                                  <span className="stock-piece-quantity-label">Unidades</span>
                                  <span className="stock-piece-quantity-control">
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        changeManualQuantity(id, piece.selectedQuantity - 1);
                                      }}
                                    >
                                      −
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      max={piece.quantity}
                                      value={piece.selectedQuantity}
                                      onChange={e => changeManualQuantity(id, Number(e.target.value) || 0)}
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        changeManualQuantity(id, piece.selectedQuantity + 1);
                                      }}
                                    >
                                      +
                                    </button>
                                    <em>ud.</em>
                                  </span>
                                  <small>Disponible: {piece.quantity}</small>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="sales-order-modal-actions">
                  <button className="secondary-button" onClick={() => setStep('mode')}>
                    Atrás
                  </button>
                  <button className="primary-button" onClick={prepareManualReview}>
                    Revisar corte {batchMode && needs.length > 1 ? 'del lote' : ''}
                  </button>
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="sales-order-cut-body">
                {mode === 'automatic' && (
                  <div className="sales-order-cut-note">
                    <strong>Optimización automática</strong> · Se ha seleccionado la combinación con menor remanente
                    total para {batchProposals.length} perfil{batchProposals.length > 1 ? 'es' : ''}.
                  </div>
                )}

                {cutError && <div className="inline-error">{cutError}</div>}

                <div className="sales-order-review-box">
                  <h3>
                    Propuesta de corte {batchProposals.length > 1 ? `en lote (${batchProposals.length} perfiles)` : ''}
                  </h3>
                  {batchProposals.map((prop, idx) => (
                    <div
                      key={idx}
                      style={{
                        paddingBottom: idx < batchProposals.length - 1 ? '14px' : '0',
                        marginBottom: idx < batchProposals.length - 1 ? '14px' : '0',
                        borderBottom: idx < batchProposals.length - 1 ? '1px dashed var(--border)' : 'none'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: 'var(--primary)',
                          marginBottom: '6px'
                        }}
                      >
                        <span>
                          Perfil {idx + 1}: {prop.need.profile} ({prop.need.characteristic})
                        </span>
                        <span>
                          Necesidad: {prop.need.quantity} × {u(prop.need.length, prop.need.componentIndex)}
                        </span>
                      </div>
                      {prop.pieces.map((piece, pIdx) => (
                        <div
                          className="sales-order-review-row"
                          key={`${piece.warehouseId}-${piece.length}-${pIdx}`}
                        >
                          <span>
                            {piece.warehouseCode} ({piece.warehouseName}) · pieza de{' '}
                            {u(piece.length, prop.need.componentIndex)}
                          </span>
                          <strong>
                            {piece.selectedQuantity} ud. → cortar {u(prop.need.length, prop.need.componentIndex)} ·
                            resto{' '}
                            {u(
                              Math.max(0, piece.length - prop.need.length),
                              prop.need.componentIndex
                            )}
                          </strong>
                        </div>
                      ))}
                      <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>
                        Remanente previsto perfil: {u(prop.remnant, prop.need.componentIndex)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sales-order-cut-note">
                  <Hammer size={15} /> Al realizar el corte se consumirá el stock seleccionado y se generarán{' '}
                  {batchProposals.length} hoja{batchProposals.length > 1 ? 's' : ''} de corte con los remanentes.
                </div>

                <div className="sales-order-modal-actions">
                  <button className="secondary-button" onClick={() => setStep('mode')} disabled={saving}>
                    Modificar
                  </button>
                  {mode === 'simulation' ? (
                    <button className="primary-button" onClick={() => setStep('simulation')}>
                      Ver simulación
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={saving || batchProposals.length === 0}
                      onClick={executeBatchCut}
                    >
                      {saving
                        ? 'Realizando corte…'
                        : `Realizar corte de todos los perfiles (${batchProposals.length})`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
