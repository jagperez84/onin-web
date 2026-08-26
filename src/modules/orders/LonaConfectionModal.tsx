import { useEffect, useMemo, useState } from 'react';
import { Check, FileText, Ruler, Scissors, SlidersHorizontal, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { resolveLonaConfectionComponents, type LonaConfectionResult } from '../../services/production/lonaConfectionService';
import { downloadLonaConfectionPdf } from '../../services/production/lonaConfectionPdfService';
import './lona-confection.css';

type Props = {
  line: any;
  companyId: number;
  reference?: string;
  onClose: () => void;
};

type ManualValues = {
  quantity: string;
  line: string;
  output: string;
};

export function LonaConfectionModal({ line, companyId, reference, onClose }: Props) {
  const [result, setResult] = useState<LonaConfectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'visual' | 'manual'>('visual');
  const [manualValues, setManualValues] = useState<Record<number, ManualValues>>({});

  const snapshot = useMemo(() => {
    return line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null;
  }, [line]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setMode('visual');
    setManualValues({});
    if (!snapshot) {
      setError('La línea de pedido no tiene un snapshot OTD disponible.');
      setLoading(false);
      return () => { active = false; };
    }
    resolveLonaConfectionComponents({
      companyId,
      orderLineId: Number(line.id),
      orderLineNo: Number(line.line_no),
      reference,
      snapshot,
    }).then(value => {
      if (active) setResult(value);
    }).catch(value => {
      if (!active) return;
      setError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo preparar la confección de lona.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [companyId, line.id, line.line_no, reference, snapshot]);

  const getManual = (index: number, component: LonaConfectionResult['components'][number]): ManualValues =>
    manualValues[index] ?? {
      quantity: String(component.quantity),
      line: component.line == null ? '' : String(component.line),
      output: component.output == null ? '' : String(component.output),
    };

  const updateManual = (index: number, key: keyof ManualValues, value: string) => {
    const component = result?.components[index];
    if (!component) return;
    const current = getManual(index, component);
    setManualValues(previous => ({ ...previous, [index]: { ...current, [key]: value } }));
  };

  const manualResult = useMemo(() => {
    if (!result) return null;
    return {
      ...result,
      components: result.components.map((component, index) => {
        const values = manualValues[index];
        if (!values) return component;
        return {
          ...component,
          quantity: Number(values.quantity) || 0,
          line: values.line === '' ? null : Number(values.line),
          output: values.output === '' ? null : Number(values.output),
        };
      }),
    } satisfies LonaConfectionResult;
  }, [manualValues, result]);

  const displayResult = mode === 'manual' ? manualResult : result;

  return (
    <div className="lona-modal-backdrop" role="dialog" aria-modal="true">
      <div className="lona-modal">
        <header className="lona-modal-head">
          <div>
            <span className="lona-eyebrow">FABRICACIÓN / CONFECCIÓN DE LONA</span>
            <h2>Línea {line.line_no} · {line.description || 'Confección'}</h2>
            <p>Onin prepara automáticamente la confección a partir del OTD. Usa el modo manual solo cuando necesites intervenir.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        {loading ? (
          <div className="lona-empty">Analizando componentes del OTD…</div>
        ) : error ? (
          <div className="lona-error">{error}</div>
        ) : displayResult ? (
          <>
            <div className="lona-toolbar">
              <div className="lona-mode-switch" role="tablist" aria-label="Modo de confección">
                <button type="button" className={mode === 'visual' ? 'active' : ''} onClick={() => setMode('visual')} role="tab" aria-selected={mode === 'visual'}>
                  <Ruler size={15} /> Visual
                </button>
                <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')} role="tab" aria-selected={mode === 'manual'}>
                  <SlidersHorizontal size={15} /> Manual
                </button>
              </div>
              <div className="lona-auto-status"><Check size={14} /> {mode === 'visual' ? 'Configuración automática' : 'Edición manual'}</div>
            </div>

            <div className="lona-summary">
              <div><span>Pedido</span><strong>{displayResult.reference || '—'}</strong></div>
              <div><span>OTD</span><strong>{displayResult.otdCode || '—'}</strong></div>
              <div><span>Componentes confeccionables</span><strong>{displayResult.components.length}</strong></div>
            </div>

            <div className="lona-content">
              {displayResult.components.map((component, index) => {
                const manual = getManual(index, component);
                const width = mode === 'manual' ? (manual.line === '' ? null : Number(manual.line)) : component.line;
                const height = mode === 'manual' ? (manual.output === '' ? null : Number(manual.output)) : component.output;
                const ratio = width && height ? width / height : 1;
                const visualWidth = ratio >= 1 ? 360 : Math.max(140, 360 * ratio);
                const visualHeight = ratio >= 1 ? Math.max(100, 360 / ratio) : 260;
                return (
                  <section className="lona-cut-card" key={`${component.productId}-${index}`}>
                    <div className="lona-cut-info">
                      <div className="lona-cut-title">
                        <div><strong>{component.productCode}</strong><span>{component.productName}</span></div>
                        <span className="lona-chip">CONFECCIONABLE</span>
                      </div>

                      {mode === 'visual' ? (
                        <div className="lona-data-grid">
                          <div><span>Cantidad</span><strong>{component.quantity}</strong></div>
                          <div><span>Línea</span><strong>{width ?? '—'} {component.lineUnit || ''}</strong></div>
                          <div><span>Salida</span><strong>{height ?? '—'} {component.outputUnit || ''}</strong></div>
                          <div><span>Característica</span><strong>{component.characteristicName || '—'}</strong></div>
                        </div>
                      ) : (
                        <div className="lona-manual-grid">
                          <label><span>Cantidad</span><input inputMode="decimal" value={manual.quantity} onChange={event => updateManual(index, 'quantity', event.target.value)} /></label>
                          <label><span>Línea</span><div className="lona-input-unit"><input inputMode="decimal" value={manual.line} onChange={event => updateManual(index, 'line', event.target.value)} /><em>{component.lineUnit || ''}</em></div></label>
                          <label><span>Salida</span><div className="lona-input-unit"><input inputMode="decimal" value={manual.output} onChange={event => updateManual(index, 'output', event.target.value)} /><em>{component.outputUnit || ''}</em></div></label>
                          <div className="lona-manual-readonly"><span>Característica</span><strong>{component.characteristicName || '—'}</strong></div>
                        </div>
                      )}

                      {mode === 'manual' && (
                        <div className="lona-manual-note"><Scissors size={14} /> Las dimensiones editadas se utilizan para la vista previa y el informe. Las reglas reales de selección de material y consumo se incorporarán al siguiente paso del motor de confección.</div>
                      )}
                    </div>
                    <div className="lona-diagram-wrap">
                      <div className="lona-diagram-label"><Ruler size={13} /> {mode === 'visual' ? 'Vista previa dimensional' : 'Previsualización manual'}</div>
                      {width && height && Number.isFinite(width) && Number.isFinite(height) ? (
                        <div className="lona-diagram-stage">
                          <div className="lona-diagram-piece" style={{ width: visualWidth, height: visualHeight }}>
                            <span>{width} {component.lineUnit || ''}</span>
                            <b>{height} {component.outputUnit || ''}</b>
                          </div>
                        </div>
                      ) : (
                        <div className="lona-diagram-empty">Introduce dos dimensiones válidas para representar el corte.</div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer className="lona-modal-actions">
              <button type="button" className="secondary-button" onClick={() => displayResult && downloadLonaConfectionPdf(displayResult)}><FileText size={15} /> Generar informe de corte</button>
              <button type="button" className="primary-button" onClick={onClose}>{mode === 'manual' ? 'Aplicar y cerrar' : 'Cerrar'}</button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
