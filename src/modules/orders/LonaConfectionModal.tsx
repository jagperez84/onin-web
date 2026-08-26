import { useEffect, useMemo, useState } from 'react';
import { FileText, Ruler, Scissors, X } from 'lucide-react';
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

export function LonaConfectionModal({ line, companyId, reference, onClose }: Props) {
  const [result, setResult] = useState<LonaConfectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const snapshot = useMemo(() => {
    return line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null;
  }, [line]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
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

  return (
    <div className="lona-modal-backdrop" role="dialog" aria-modal="true">
      <div className="lona-modal">
        <header className="lona-modal-head">
          <div>
            <span className="lona-eyebrow">FABRICACIÓN / CONFECCIÓN DE LONA</span>
            <h2>Línea {line.line_no} · {line.description || 'Confección'}</h2>
            <p>El proceso parte del OTD y recupera únicamente los componentes confeccionables.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        {loading ? (
          <div className="lona-empty">Analizando componentes del OTD…</div>
        ) : error ? (
          <div className="lona-error">{error}</div>
        ) : result ? (
          <>
            <div className="lona-summary">
              <div><span>Pedido</span><strong>{reference || '—'}</strong></div>
              <div><span>OTD</span><strong>{result.otdCode || '—'}</strong></div>
              <div><span>Componentes confeccionables</span><strong>{result.components.length}</strong></div>
            </div>

            <div className="lona-content">
              {result.components.map((component, index) => {
                const width = component.line;
                const height = component.output;
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
                      <div className="lona-data-grid">
                        <div><span>Cantidad</span><strong>{component.quantity}</strong></div>
                        <div><span>Línea</span><strong>{width ?? '—'} {component.lineUnit || ''}</strong></div>
                        <div><span>Salida</span><strong>{height ?? '—'} {component.outputUnit || ''}</strong></div>
                        <div><span>Característica</span><strong>{component.characteristicName || '—'}</strong></div>
                      </div>
                      <div className="lona-pending-note"><Scissors size={14} /> Selección de material, ancho, tipo de corte, dobladillo y solape se incorporarán al cálculo específico de confección.</div>
                    </div>
                    <div className="lona-diagram-wrap">
                      <div className="lona-diagram-label"><Ruler size={13} /> Vista previa dimensional</div>
                      {width && height ? (
                        <div className="lona-diagram-stage">
                          <div className="lona-diagram-piece" style={{ width: visualWidth, height: visualHeight }}>
                            <span>{width} {component.lineUnit || ''}</span>
                            <b>{height} {component.outputUnit || ''}</b>
                          </div>
                        </div>
                      ) : (
                        <div className="lona-diagram-empty">No hay dos dimensiones resueltas para representar el corte.</div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <footer className="lona-modal-actions">
              <button type="button" className="secondary-button" onClick={() => downloadLonaConfectionPdf(result)}><FileText size={15} /> Generar informe de corte</button>
              <button type="button" className="primary-button" onClick={onClose}>Cerrar</button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
