import { useEffect, useState } from 'react';
import { CheckCircle2, Factory, FileText, Loader2, X } from 'lucide-react';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import { getWorkSheetsBySalesOrderLine, type WorkSheet } from '../../services/production/workSheetService';
import { getLonaConfectionWorkSheetBySalesOrderLine, type LonaConfectionWorkSheet } from '../../services/production/lonaConfectionQueryService';
import { getComponentConsumptionWorkSheetBySalesOrderLine, type ComponentConsumptionWorkSheet } from '../../services/production/componentConsumptionService';
import { downloadOrderManufacturingReportPdf } from '../../services/production/orderManufacturingReportPdfService';
import {
  fabricateWholeOrder,
  getLineRequirements,
  isLineComponentsDone,
  isLineLonaDone,
  isLineProfileDone,
  type LineFabricationOutcome,
} from '../../services/production/orderFabricationService';
import './component-consumption.css';
import './lona-confection.css';

type Props = {
  order: SalesOrder;
  companyId: number;
  onClose: () => void;
  onDone: (data: { cutSheets: Record<number, WorkSheet[]>; lonaSheets: Record<number, LonaConfectionWorkSheet>; componentSheets: Record<number, ComponentConsumptionWorkSheet>; orderManufactured: boolean }) => void;
};

type LinePreview = { lineId: number; lineNo: number; label: string; needsProfile: boolean; profileDone: boolean; needsLona: boolean; lonaDone: boolean; needsComponents: boolean; componentsDone: boolean };

function linePending(p: LinePreview) {
  return (p.needsProfile && !p.profileDone) || (p.needsLona && !p.lonaDone) || (p.needsComponents && !p.componentsDone);
}

const stepLabel = (status: string) => ({ skipped: 'No aplica', already_done: 'Ya hecho', done: 'Fabricado', error: 'Error' } as Record<string, string>)[status] || status;

export function OrderFabricationModal({ order, companyId, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [previews, setPreviews] = useState<LinePreview[]>([]);
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<LineFabricationOutcome[] | null>(null);
  const [orderManufactured, setOrderManufactured] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState<{ cutSheets: WorkSheet[]; lonaSheets: LonaConfectionWorkSheet[]; componentSheets: ComponentConsumptionWorkSheet[] } | null>(null);

  const lines = order.lines || [];

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const built = await Promise.all(
        lines.map(async (line: any) => {
          const requirements = getLineRequirements(line);
          const [profileDone, lonaDone, componentsDone] = await Promise.all([
            requirements.needsProfile ? isLineProfileDone(line) : Promise.resolve(true),
            requirements.needsLona ? isLineLonaDone(line) : Promise.resolve(true),
            requirements.needsComponents ? isLineComponentsDone(line) : Promise.resolve(true),
          ]);
          const preview: LinePreview = {
            lineId: Number(line.id),
            lineNo: Number(line.line_no),
            label: line.description || line.product?.code || `Línea ${line.line_no}`,
            needsProfile: requirements.needsProfile,
            profileDone,
            needsLona: requirements.needsLona,
            lonaDone,
            needsComponents: requirements.needsComponents,
            componentsDone,
          };
          return preview;
        })
      );
      if (active) {
        setPreviews(built);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const pendingCount = previews.filter(linePending).length;

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const { outcomes: result, orderManufactured: manufactured } = await fabricateWholeOrder(order, companyId);
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
            <span className="lona-eyebrow">FABRICACIÓN / PEDIDO COMPLETO</span>
            <h2>
              Fabricar {order.code}
            </h2>
            <p>Corta, confecciona y descuenta componentes de todas las líneas del pedido de una sola vez, y genera el informe de fabricación para el taller.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="lona-empty">Analizando el pedido…</div>
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
        ) : (
          <>
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
                  {previews.map(p => (
                    <tr key={p.lineId}>
                      <td>
                        <strong>Línea {p.lineNo}</strong>
                        <span className="component-consumption-secondary">{p.label}</span>
                      </td>
                      <td>{!p.needsProfile ? '—' : p.profileDone ? 'Hecho' : 'Pendiente'}</td>
                      <td>{!p.needsLona ? '—' : p.lonaDone ? 'Hecho' : 'Pendiente'}</td>
                      <td>{!p.needsComponents ? '—' : p.componentsDone ? 'Hecho' : 'Pendiente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <div className="lona-error lona-error-inline">{error}</div>}
            <footer className="modal-actions-footer">
              <button type="button" className="secondary-button" onClick={onClose} disabled={running}>
                Cancelar
              </button>
              <button type="button" className="primary-button" disabled={running || pendingCount === 0} onClick={() => void run()}>
                {running ? (
                  <>
                    <Loader2 size={15} className="spin" /> Fabricando pedido…
                  </>
                ) : pendingCount === 0 ? (
                  <>
                    <CheckCircle2 size={15} /> Todo ya fabricado
                  </>
                ) : (
                  <>
                    <Factory size={15} /> Fabricar pedido completo ({pendingCount} línea{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'})
                  </>
                )}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
