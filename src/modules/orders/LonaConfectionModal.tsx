import { useEffect, useMemo, useState } from 'react';
import { Check, FileText, PackageSearch, Ruler, X, ClipboardCheck, Play } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import {
  allocateLonaStockForPieces,
  createLonaConfectionWorkSheet,
  resolveLonaConfectionComponents,
  type LonaConfectionComponent,
  type LonaConfectionResult,
  type LonaConfectionWorkSheet,
  type LonaPieceAllocation,
  type LonaStockCandidate,
} from '../../services/production/lonaConfectionService';
import { executeLonaConfectionWorkSheet } from '../../services/production/lonaConfectionExecutionService';
import { downloadLonaConfectionPdf } from '../../services/production/lonaConfectionPdfService';
import { calculateLonaCut, type LonaCutCalculationResult, type LonaCutType } from '../../services/production/lonaCutCalculationService';
import { LonaCutDiagram } from './LonaCutDiagram';
import { LonaConfectionViewModal } from './LonaConfectionViewModal';
import './lona-confection.css';

type Props = {
  line: any;
  companyId: number;
  salesOrderId: number;
  reference?: string;
  onClose: () => void;
};

type CutParameters = {
  hem: string;
  overlap: string;
};

const DEFAULT_CUT_PARAMETERS: CutParameters = { hem: '3', overlap: '2.7' };
const CUT_TYPES: LonaCutType[] = ['Asimétrico', 'Retal Maxi', 'Retal Mini', 'Degradee', 'Screen', 'Telón'];
const STOCK_DEBOUNCE_MS = 350;

function formatDimension(value: number | null, unit: string | null) {
  return value == null ? '—' : `${value} ${unit || ''}`.trim();
}

function formatDimensions(values: number[], units: string[]) {
  return values.map((value, index) => formatDimension(value, units[index] ?? null)).join(' × ');
}

function parseCutParameter(value: string) {
  return value === '' ? 0 : Number(value.replace(',', '.')) || 0;
}

/**
 * El ancho de paño que usa el reparto en paños (calculateLonaCut) es el ancho real del
 * material que se va a usar, no la línea/salida de la pieza — igual que en Toldos
 * (Existencia.getCantidad2()). Se deriva de una pieza de sondeo (la necesidad completa) para
 * saber qué rollo se usaría, y con eso ya se puede calcular el reparto real en paños.
 */
function computeCutCalculation(
  component: LonaConfectionComponent,
  cutType: LonaCutType,
  hem: number,
  overlap: number,
  probe: LonaStockCandidate | null
): LonaCutCalculationResult | null {
  const width = component.line;
  const height = component.output;
  if (!probe || width == null || height == null || width <= 0 || height <= 0) return null;
  return calculateLonaCut({
    type: cutType,
    line: width,
    output: height,
    selectedWidth: probe.sourceDimensions[0],
    hem,
    overlap,
    stockWidth: probe.sourceDimensions[0],
    stockLength: probe.sourceDimensions[1],
    rotated: probe.rotated,
  });
}

export function LonaConfectionModal({ line, companyId, salesOrderId, reference, onClose }: Props) {
  const [result, setResult] = useState<LonaConfectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cutTypes, setCutTypes] = useState<Record<number, LonaCutType>>({});
  const [cutParameters, setCutParameters] = useState<Record<number, CutParameters>>({});
  const [probeCandidates, setProbeCandidates] = useState<Record<number, LonaStockCandidate | null>>({});
  const [allocations, setAllocations] = useState<Record<number, LonaPieceAllocation[]>>({});
  const [stockLoading, setStockLoading] = useState<Record<number, boolean>>({});
  const [creating, setCreating] = useState<Record<number, boolean>>({});
  const [workSheets, setWorkSheets] = useState<Record<number, LonaConfectionWorkSheet>>({});
  const [createError, setCreateError] = useState<Record<number, string>>({});
  const [executing, setExecuting] = useState<Record<number, boolean>>({});
  const [executionError, setExecutionError] = useState<Record<number, string>>({});
  const [viewSheet, setViewSheet] = useState(false);

  const snapshot = useMemo(
    () => line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null,
    [line]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setCutTypes({});
    setCutParameters({});
    setResult(null);
    setProbeCandidates({});
    setAllocations({});
    setWorkSheets({});
    setCreateError({});
    setExecuting({});
    setExecutionError({});
    setViewSheet(false);

    if (!snapshot) {
      setError('La línea de pedido no tiene un snapshot OTD disponible.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    resolveLonaConfectionComponents({
      companyId,
      orderLineId: Number(line.id),
      orderLineNo: Number(line.line_no),
      reference,
      snapshot,
    })
      .then(value => {
        if (active) {
          setResult(value);
          setCutTypes(
            Object.fromEntries(value.components.map((_, index) => [index, 'Asimétrico'])) as Record<
              number,
              LonaCutType
            >
          );
          setCutParameters(
            Object.fromEntries(
              value.components.map((_, index) => [index, { ...DEFAULT_CUT_PARAMETERS }])
            ) as Record<number, CutParameters>
          );
        }
      })
      .catch(value => {
        if (!active) return;
        setError(
          value instanceof CoreRepositoryError || value instanceof Error
            ? value.message
            : 'No se pudo preparar la confección de lona.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, line.id, line.line_no, reference, snapshot]);

  // Sondea el material disponible, calcula el reparto real en paños/retales para el tipo de
  // corte y parámetros actuales, y asigna una pieza física distinta a cada paño/retal.
  // Con debounce: dobladillo/solape se editan tecla a tecla y no queremos una consulta por tecla.
  useEffect(() => {
    if (!result) return;
    let active = true;
    const timers: number[] = [];

    result.components.forEach((component, index) => {
      if (component.line == null || component.output == null || component.line <= 0 || component.output <= 0)
        return;

      const cutType = cutTypes[index] ?? 'Asimétrico';
      const parameters = cutParameters[index] ?? DEFAULT_CUT_PARAMETERS;
      const hem = parseCutParameter(parameters.hem);
      const overlap = parseCutParameter(parameters.overlap);

      setStockLoading(previous => ({ ...previous, [index]: true }));

      const timer = window.setTimeout(async () => {
        if (!active) return;
        try {
          const probeAllocation = await allocateLonaStockForPieces({
            companyId,
            productId: component.productId,
            characteristicId: component.characteristicId,
            characteristicCode: component.characteristicCode,
            pieces: [{ width: component.line as number, length: component.output as number, label: 'Necesidad' }],
            unit: component.lineUnit,
          });
          if (!active) return;
          const probe = probeAllocation[0]?.candidate ?? null;
          setProbeCandidates(previous => ({ ...previous, [index]: probe }));

          if (!probe) {
            setAllocations(previous => ({ ...previous, [index]: [] }));
            return;
          }

          const calculation = computeCutCalculation(component, cutType, hem, overlap, probe);
          if (!calculation || calculation.status !== 'CALCULATED') {
            setAllocations(previous => ({ ...previous, [index]: [] }));
            return;
          }

          const pieceAllocations = await allocateLonaStockForPieces({
            companyId,
            productId: component.productId,
            characteristicId: component.characteristicId,
            characteristicCode: component.characteristicCode,
            pieces: calculation.pieces.map(piece => ({ width: piece.width, length: piece.length, label: piece.label })),
            unit: component.lineUnit,
          });
          if (active) setAllocations(previous => ({ ...previous, [index]: pieceAllocations }));
        } catch {
          if (active) {
            setProbeCandidates(previous => ({ ...previous, [index]: null }));
            setAllocations(previous => ({ ...previous, [index]: [] }));
          }
        } finally {
          if (active) setStockLoading(previous => ({ ...previous, [index]: false }));
        }
      }, STOCK_DEBOUNCE_MS);
      timers.push(timer);
    });

    return () => {
      active = false;
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [companyId, result, cutTypes, cutParameters]);

  const getCutParameters = (index: number): CutParameters =>
    cutParameters[index] ?? DEFAULT_CUT_PARAMETERS;

  const updateCutParameter = (index: number, key: keyof CutParameters, value: string) => {
    const current = getCutParameters(index);
    setCutParameters(previous => ({ ...previous, [index]: { ...current, [key]: value } }));
  };

  const createSheet = async (index: number) => {
    const component = result?.components[index];
    const pieceAllocations = allocations[index] || [];

    if (!component || !pieceAllocations.length || pieceAllocations.some(allocation => !allocation.candidate)) return;

    setCreating(previous => ({ ...previous, [index]: true }));
    setCreateError(previous => ({ ...previous, [index]: '' }));

    try {
      const parameters = getCutParameters(index);
      const cutType = cutTypes[index] ?? 'Asimétrico';
      const sheet = await createLonaConfectionWorkSheet({
        companyId,
        salesOrderId,
        salesOrderLineId: Number(line.id),
        salesOrderLineNo: Number(line.line_no),
        component,
        allocations: pieceAllocations,
        reference,
        selectionMode: 'AUTOMATIC',
        selectionReason: `Tipo de corte: ${cutType}. Dobladillo: ${parameters.hem}. Solape: ${parameters.overlap}.`,
      });
      setWorkSheets(previous => ({ ...previous, [index]: sheet }));
    } catch (value) {
      setCreateError(previous => ({
        ...previous,
        [index]: value instanceof Error ? value.message : 'No se pudo generar la hoja de confección.',
      }));
    } finally {
      setCreating(previous => ({ ...previous, [index]: false }));
    }
  };

  const executeSheet = async (index: number) => {
    const sheet = workSheets[index];
    if (!sheet) return;

    setExecuting(previous => ({ ...previous, [index]: true }));
    setExecutionError(previous => ({ ...previous, [index]: '' }));

    try {
      await executeLonaConfectionWorkSheet(sheet.id);
      setWorkSheets(previous => ({
        ...previous,
        [index]: { ...sheet, status: 'COMPLETED' },
      }));
    } catch (value) {
      setExecutionError(previous => ({
        ...previous,
        [index]: value instanceof Error ? value.message : 'No se pudo ejecutar el corte de lona.',
      }));
    } finally {
      setExecuting(previous => ({ ...previous, [index]: false }));
    }
  };

  const handleDownloadPdf = () => {
    if (!result) return;
    const cutDetails: Record<number, { cutType?: string; hem?: string; overlap?: string }> = {};
    result.components.forEach((_, index) => {
      const params = getCutParameters(index);
      cutDetails[index] = {
        cutType: cutTypes[index] || 'Asimétrico',
        hem: params.hem,
        overlap: params.overlap,
      };
    });
    downloadLonaConfectionPdf(result, cutDetails);
  };

  return (
    <>
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal-card xl">
          <header className="modal-header">
            <div>
              <span className="lona-eyebrow">FABRICACIÓN / CONFECCIÓN DE LONA</span>
              <h2>
                Línea {line.line_no} · {line.description || 'Confección'}
              </h2>
              <p>
                Cálculo de confección desde OTD con filtrado estricto de características y parámetros de corte editables.
              </p>
            </div>
            <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </header>

          {loading ? (
            <div className="lona-empty">Analizando componentes del OTD…</div>
          ) : error ? (
            <div className="lona-error">{error}</div>
          ) : result ? (
            <>
              <div className="lona-summary">
                <div>
                  <span>Pedido</span>
                  <strong>{result.reference || '—'}</strong>
                </div>
                <div>
                  <span>OTD</span>
                  <strong>{result.otdCode || '—'}</strong>
                </div>
                <div>
                  <span>Componentes confeccionables</span>
                  <strong>{result.components.length}</strong>
                </div>
              </div>

              <div className="lona-content">
                {result.components.map((component, index) => {
                  const parameters = getCutParameters(index);
                  const width = component.line;
                  const height = component.output;
                  const lineLabel = component.lineDimensionCode || 'Línea';
                  const outputLabel = component.outputDimensionCode || 'Salida';
                  const probe = probeCandidates[index] ?? null;
                  const pieceAllocations = allocations[index] || [];
                  const materialLoading = Boolean(stockLoading[index]);
                  const sheet = workSheets[index];
                  const isCreating = Boolean(creating[index]);
                  const isExecuting = Boolean(executing[index]);
                  const cutType = cutTypes[index] ?? 'Asimétrico';
                  const hem = parseCutParameter(parameters.hem);
                  const overlap = parseCutParameter(parameters.overlap);
                  const cutCalculation = computeCutCalculation(component, cutType, hem, overlap, probe);
                  const allAllocated = pieceAllocations.length > 0 && pieceAllocations.every(allocation => allocation.candidate);
                  const missingCount = pieceAllocations.filter(allocation => !allocation.candidate).length;

                  return (
                    <section className="lona-cut-card" key={`${component.productId}-${index}`}>
                      <div className="lona-cut-info">
                        <div className="lona-cut-title">
                          <div>
                            <strong>{component.productCode}</strong>
                            <span>{component.productName}</span>
                          </div>
                          <span className="lona-chip">CONFECCIONABLE</span>
                        </div>

                        <div className="lona-cut-type">
                          <label>
                            <span>Tipo de corte</span>
                            <select
                              value={cutType}
                              onChange={event =>
                                setCutTypes(previous => ({
                                  ...previous,
                                  [index]: event.target.value as LonaCutType,
                                }))
                              }
                            >
                              {CUT_TYPES.map(type => (
                                <option key={type} value={type}>
                                  {type}
                                  {type === 'Telón' ? ' · pendiente' : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          {cutCalculation?.status === 'PENDING' && (
                            <span className="lona-cut-type-warning">
                              Este tipo de corte aún no tiene cálculo definido en el legacy.
                            </span>
                          )}
                        </div>

                        <div className="lona-data-grid">
                          <div>
                            <span>Cantidad</span>
                            <strong>{component.quantity}</strong>
                          </div>
                          <div>
                            <span>{lineLabel}</span>
                            <strong>{formatDimension(width, component.lineUnit)}</strong>
                          </div>
                          <div>
                            <span>{outputLabel}</span>
                            <strong>{formatDimension(height, component.outputUnit)}</strong>
                          </div>
                          <div>
                            <span>Característica</span>
                            <strong>{component.characteristicName || 'Sin característica'}</strong>
                          </div>
                        </div>

                        <div className="lona-parameters-row">
                          <label className="lona-param-field">
                            <span>Dobladillo</span>
                            <div className="lona-input-unit">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={parameters.hem}
                                onChange={event =>
                                  updateCutParameter(index, 'hem', event.target.value)
                                }
                              />
                              <em>{component.lineUnit || 'cm'}</em>
                            </div>
                          </label>
                          <label className="lona-param-field">
                            <span>Solape</span>
                            <div className="lona-input-unit">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={parameters.overlap}
                                onChange={event =>
                                  updateCutParameter(index, 'overlap', event.target.value)
                                }
                              />
                              <em>{component.lineUnit || 'cm'}</em>
                            </div>
                          </label>
                        </div>

                        <div className={`lona-material ${allAllocated ? 'ready' : ''}`}>
                          <div className="lona-material-head">
                            <div>
                              <span>Material compatible</span>
                              <strong>
                                {materialLoading
                                  ? 'Buscando material compatible…'
                                  : pieceAllocations.length === 0
                                  ? 'Sin material compatible'
                                  : allAllocated
                                  ? `${pieceAllocations.length} pieza${pieceAllocations.length === 1 ? '' : 's'} asignadas`
                                  : `Faltan ${missingCount} de ${pieceAllocations.length} piezas`}
                              </strong>
                            </div>
                            {allAllocated && (
                              <span className="lona-material-badge">
                                <Check size={12} /> Exacto
                              </span>
                            )}
                          </div>
                          {pieceAllocations.length > 0 ? (
                            <div className="lona-material-pieces">
                              {pieceAllocations.map((allocation, pieceIndex) => (
                                <div
                                  key={`${allocation.label}-${pieceIndex}`}
                                  className={`lona-material-piece ${allocation.candidate ? 'ok' : 'missing'}`}
                                >
                                  <PackageSearch size={13} />
                                  <span>{allocation.label}</span>
                                  <strong>
                                    {allocation.candidate
                                      ? `${allocation.candidate.warehouseCode} · ${formatDimensions(
                                          allocation.candidate.sourceDimensions,
                                          allocation.candidate.sourceDimensionUnits
                                        )}${allocation.candidate.rotated ? ' · girado' : ''}`
                                      : 'Sin material disponible'}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          ) : (
                            !materialLoading && (
                              <span className="lona-material-empty">
                                No hay una existencia dimensional con la característica requerida (
                                {component.characteristicName || 'Sin característica'}) que cubra estas medidas.
                              </span>
                            )
                          )}
                        </div>

                        {createError[index] && (
                          <div className="lona-error lona-error-inline">{createError[index]}</div>
                        )}
                        {executionError[index] && (
                          <div className="lona-error lona-error-inline">{executionError[index]}</div>
                        )}

                        {sheet ? (
                          <div className="lona-sheet-ready">
                            <div>
                              <ClipboardCheck size={15} />
                              <span>
                                Hoja de confección <strong>{sheet.code}</strong>
                              </span>
                            </div>
                            <small>
                              {sheet.status === 'COMPLETED'
                                ? 'Corte ejecutado y stock actualizado.'
                                : 'La hoja conserva la propuesta y el material seleccionado. El stock todavía no se consume.'}
                            </small>
                            <div className="lona-sheet-actions">
                              {sheet.status === 'ISSUED' && (
                                <button
                                  type="button"
                                  className="lona-create-sheet"
                                  disabled={isExecuting}
                                  onClick={() => void executeSheet(index)}
                                >
                                  <Play size={14} />
                                  {isExecuting ? 'Ejecutando corte…' : 'Ejecutar corte de lona'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="lona-create-sheet lona-view-sheet"
                                onClick={() => setViewSheet(true)}
                              >
                                <FileText size={14} /> Ver hoja de confección
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="lona-create-sheet"
                            disabled={!allAllocated || isCreating || cutCalculation?.status === 'PENDING'}
                            onClick={() => void createSheet(index)}
                          >
                            <ClipboardCheck size={15} />
                            {isCreating ? 'Generando hoja…' : 'Generar hoja de confección'}
                          </button>
                        )}
                      </div>

                      <div className="lona-diagram-wrap">
                        <div className="lona-diagram-label">
                          <Ruler size={13} />{' '}
                          {probe ? 'Propuesta de aprovechamiento' : 'Vista previa dimensional'}
                        </div>
                        {width && height && Number.isFinite(width) && Number.isFinite(height) ? (
                          probe ? (
                            <LonaCutDiagram
                              calculation={cutCalculation}
                              stockDimensions={probe.sourceDimensions}
                              stockUnits={probe.sourceDimensionUnits}
                              cutLine={width}
                              cutOutput={height}
                              unit={component.lineUnit || component.outputUnit || null}
                            />
                          ) : (
                            <div className="lona-diagram-stage">
                              <div className="lona-diagram-piece">
                                <span>{formatDimension(width, component.lineUnit)}</span>
                                <b>{formatDimension(height, component.outputUnit)}</b>
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="lona-diagram-empty">
                            Se necesitan dos dimensiones válidas para representar el corte.
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <footer className="modal-actions-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleDownloadPdf}
                >
                  <FileText size={15} /> Generar informe de corte
                </button>
                <button type="button" className="primary-button" onClick={onClose}>
                  Cerrar
                </button>
              </footer>
            </>
          ) : null}
        </div>
      </div>
      {viewSheet && (
        <LonaConfectionViewModal line={line} reference={reference} onClose={() => setViewSheet(false)} />
      )}
    </>
  );
}
