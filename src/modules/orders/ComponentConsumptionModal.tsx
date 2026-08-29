import { useEffect, useState } from 'react';
import { Boxes, ClipboardCheck, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import {
  createAndExecuteComponentConsumption,
  getComponentConsumptionWorkSheetBySalesOrderLine,
  listComponentStockOptions,
  resolveOrderLineComponents,
  type ComponentConsumptionWorkSheet,
  type ComponentNeed,
  type ComponentStockOption,
} from '../../services/production/componentConsumptionService';
import './component-consumption.css';

type Props = {
  line: any;
  companyId: number;
  salesOrderId: number;
  orderWarehouseId?: number | null;
  reference?: string;
  onClose: () => void;
  onDone?: (sheet: ComponentConsumptionWorkSheet) => void;
};

export function ComponentConsumptionModal({ line, companyId, salesOrderId, orderWarehouseId, reference, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [components, setComponents] = useState<ComponentNeed[]>([]);
  const [stockOptions, setStockOptions] = useState<Record<number, ComponentStockOption[]>>({});
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<number, number | null>>({});
  const [sheet, setSheet] = useState<ComponentConsumptionWorkSheet | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setSheet(null);
    (async () => {
      try {
        const existing = await getComponentConsumptionWorkSheetBySalesOrderLine(Number(line.id));
        if (!active) return;
        if (existing) {
          setSheet(existing);
          setLoading(false);
          return;
        }
        const needs = resolveOrderLineComponents(line);
        if (!needs.length) {
          setComponents([]);
          setLoading(false);
          return;
        }
        const optionsByProduct = await Promise.all(
          needs.map(async need => [need.productId, await listComponentStockOptions(companyId, need.productId).catch(() => [])] as const)
        );
        if (!active) return;
        const optionsMap = Object.fromEntries(optionsByProduct) as Record<number, ComponentStockOption[]>;
        setStockOptions(optionsMap);
        const defaults: Record<number, number | null> = {};
        for (const need of needs) {
          const options = optionsMap[need.productId] || [];
          const preferred = orderWarehouseId ? options.find(o => o.warehouseId === orderWarehouseId) : null;
          defaults[need.productId] = preferred?.warehouseId ?? options[0]?.warehouseId ?? null;
        }
        setSelectedWarehouse(defaults);
        setComponents(needs);
      } catch (value) {
        if (active) setError(value instanceof Error ? value.message : 'No se pudieron cargar los componentes.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [companyId, line.id, orderWarehouseId]);

  const confirm = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await createAndExecuteComponentConsumption({
        companyId,
        salesOrderId,
        salesOrderLineId: Number(line.id),
        salesOrderLineNo: Number(line.line_no),
        productId: line.product_id ?? null,
        productCode: line.product_code ?? null,
        productName: line.description ?? null,
        quantity: Number(line.quantity) || 1,
        reference,
        lines: components.map(need => ({
          warehouseId: Number(selectedWarehouse[need.productId]),
          productId: need.productId,
          productCode: need.productCode,
          productName: need.productName,
          unitCode: need.unitCode,
          quantity: need.quantity,
        })),
      });
      setSheet(result);
      onDone?.(result);
    } catch (value) {
      setSubmitError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo descontar los componentes.');
    } finally {
      setSubmitting(false);
    }
  };

  const canConfirm = components.length > 0 && components.every(need => Number.isFinite(selectedWarehouse[need.productId]));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card xl">
        <header className="modal-header">
          <div>
            <span className="lona-eyebrow">FABRICACIÓN / COMPONENTES</span>
            <h2>
              Línea {line.line_no} · {line.description || 'Componentes'}
            </h2>
            <p>Descuento de accesorios y componentes por unidades (soportes, motores, tornillería…) del despiece de esta línea.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="lona-empty">Analizando componentes…</div>
        ) : error ? (
          <div className="lona-error">{error}</div>
        ) : sheet ? (
          <>
            <div className="component-consumption-sheet-ready">
              <ClipboardCheck size={16} />
              <span>
                Hoja de componentes <strong>{sheet.code}</strong> · Stock descontado.
              </span>
            </div>
            <div className="component-consumption-table-wrap">
              <table className="component-consumption-table">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Almacén</th>
                    <th className="numeric">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines.map(l => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.productCode}</strong>
                        <span className="component-consumption-secondary">{l.productName}</span>
                      </td>
                      <td>{l.warehouseCode}</td>
                      <td className="numeric">
                        {l.quantity} {l.unitCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="modal-actions-footer">
              <button type="button" className="primary-button" onClick={onClose}>
                Cerrar
              </button>
            </footer>
          </>
        ) : components.length === 0 ? (
          <>
            <div className="lona-empty">
              <Boxes size={18} /> Esta línea no tiene componentes por unidades en su despiece (o ya están vinculados al perfil/lona).
            </div>
            <footer className="modal-actions-footer">
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
                    <th>Componente</th>
                    <th>Almacén</th>
                    <th className="numeric">Necesidad</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map(need => {
                    const options = stockOptions[need.productId] || [];
                    const selected = selectedWarehouse[need.productId] ?? null;
                    const selectedOption = options.find(o => o.warehouseId === selected) ?? null;
                    const insufficient = selectedOption != null && selectedOption.available < need.quantity;
                    return (
                      <tr key={need.productId}>
                        <td>
                          <strong>{need.productCode}</strong>
                          <span className="component-consumption-secondary">{need.productName}</span>
                        </td>
                        <td>
                          {options.length === 0 ? (
                            <span className="component-consumption-no-stock">Sin existencias</span>
                          ) : (
                            <select
                              value={selected ?? ''}
                              onChange={event =>
                                setSelectedWarehouse(previous => ({ ...previous, [need.productId]: Number(event.target.value) }))
                              }
                            >
                              {options.map(o => (
                                <option key={o.warehouseId} value={o.warehouseId}>
                                  {o.warehouseCode} · {o.available} disp.
                                </option>
                              ))}
                            </select>
                          )}
                          {insufficient && <span className="component-consumption-warning">Stock insuficiente</span>}
                        </td>
                        <td className="numeric">
                          {need.quantity} {need.unitCode}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {submitError && <div className="lona-error lona-error-inline">{submitError}</div>}
            <footer className="modal-actions-footer">
              <button type="button" className="secondary-button" onClick={onClose}>
                Cancelar
              </button>
              <button type="button" className="primary-button" disabled={!canConfirm || submitting} onClick={() => void confirm()}>
                <ClipboardCheck size={15} /> {submitting ? 'Descontando…' : 'Descontar componentes'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
