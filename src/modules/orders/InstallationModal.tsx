import { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, FileText, MapPin, Trash2, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import {
  cancelInstallation,
  completeInstallation,
  listInstallationsBySalesOrder,
  listInstallationTypes,
  listInstallers,
  upsertInstallation,
  type Installation,
  type InstallationType,
  type Installer,
} from '../../services/production/installationService';
import { downloadInstallationSheetPdf } from '../../services/production/installationPdfService';
import './component-consumption.css';
import './lona-confection.css';
import './installation.css';

export type InstallableLine = { id: number; lineNo: number; label: string };

type Props = {
  order: SalesOrder;
  companyId: number;
  /** La instalación a consultar/completar, o null para programar una visita nueva. */
  installation: Installation | null;
  /** Líneas OTD del pedido aún sin cubrir por ninguna instalación activa (solo aplica cuando installation es null). */
  availableLines: InstallableLine[];
  types: InstallationType[];
  installers: Installer[];
  onClose: () => void;
  onDone: (installation: Installation) => void;
  onCancelled?: (installation: Installation) => void;
};

export function InstallationModal({ order, companyId, installation, availableLines, types, installers, onClose, onDone, onCancelled }: Props) {
  const [installationTypeId, setInstallationTypeId] = useState<number | null>(
    installation?.installationTypeId ?? (types.length === 1 ? types[0].id : null),
  );
  const [scheduledDate, setScheduledDate] = useState(installation?.scheduledDate || (order as any).requested_delivery_date || '');
  const [startTime, setStartTime] = useState(installation?.startTime || '');
  const [estimatedDuration, setEstimatedDuration] = useState(installation?.estimatedDuration || '');
  const [selectedInstallerIds, setSelectedInstallerIds] = useState<Set<number>>(new Set((installation?.installers ?? []).map((i) => i.id)));
  const [notes, setNotes] = useState(installation?.notes || '');
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set(installation ? installation.lineIds : availableLines.map((l) => l.id)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [endTime, setEndTime] = useState('');
  const [actualDuration, setActualDuration] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const toggleInstaller = (id: number) => {
    setSelectedInstallerIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleLine = (id: number) => {
    setSelectedLineIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedInstallers = useMemo(() => installers.filter((i) => selectedInstallerIds.has(i.id)), [installers, selectedInstallerIds]);

  const installationAddress = useMemo(() => {
    const o = order as any;
    return [o.installation_address_street, o.installation_address_city, o.installation_address_postal_code, o.installation_address_region].filter(Boolean).join(', ');
  }, [order]);

  const save = async () => {
    if (!installation && selectedLineIds.size === 0) {
      setSaveError('Selecciona al menos una línea a instalar en esta visita.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const result = await upsertInstallation({
        id: installation?.id ?? null,
        companyId,
        salesOrderId: order.id,
        installationTypeId,
        scheduledDate: scheduledDate || null,
        startTime: startTime || null,
        estimatedDuration: estimatedDuration || null,
        installers: selectedInstallers,
        notes: notes || null,
        salesOrderLineIds: installation ? undefined : Array.from(selectedLineIds),
      });
      onDone(result);
      onClose();
    } catch (value) {
      setSaveError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo guardar el montaje.');
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!installation) return;
    setCompleting(true);
    setCompleteError('');
    try {
      await completeInstallation(installation.id, endTime, actualDuration);
      const refreshed = await listInstallationsBySalesOrder(order.id);
      const updated = refreshed.find((i) => i.id === installation.id);
      if (updated) onDone(updated);
    } catch (value) {
      setCompleteError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo completar el montaje.');
    } finally {
      setCompleting(false);
    }
  };

  const cancel = async () => {
    if (!installation) return;
    setCancelling(true);
    try {
      await cancelInstallation(installation.id);
      onCancelled?.(installation);
      onClose();
    } catch (value) {
      setSaveError(value instanceof Error ? value.message : 'No se pudo cancelar la programación.');
    } finally {
      setCancelling(false);
    }
  };

  const isCompleted = installation?.status === 'COMPLETED';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card xl">
        <header className="modal-header">
          <div>
            <span className="lona-eyebrow">MONTAJE / INSTALACIÓN</span>
            <h2>{installation ? `Montaje de ${order.code}` : `Programar visita de montaje · ${order.code}`}</h2>
            <p>Programa la visita de instalación en casa del cliente y, al terminar, regístrala como completada.</p>
          </div>
          <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="installation-address">
          <MapPin size={14} />
          <span>{installationAddress || 'Este pedido no tiene dirección de instalación registrada.'}</span>
        </div>

        <>
          {isCompleted && (
            <div className="component-consumption-sheet-ready">
              <CheckCircle2 size={16} />
              <span>
                Montaje completado el {installation?.endTime ? `a las ${installation.endTime}` : ''} · albarán generado con las líneas de esta visita.
              </span>
            </div>
          )}

          <div className="installation-form">
            <label className="installation-form-field">
              <span>Líneas a instalar en esta visita</span>
              {installation ? (
                <div className="installation-installers">
                  {order.lines
                    ?.filter((l: any) => installation.lineIds.includes(Number(l.id)))
                    .map((l: any) => (
                      <span key={l.id} className="installation-installer-chip selected">
                        #{l.line_no} · {l.description || 'Artículo'}
                      </span>
                    ))}
                </div>
              ) : availableLines.length === 0 ? (
                <span className="component-consumption-secondary">No hay líneas OTD pendientes de montaje en este pedido.</span>
              ) : (
                <div className="installation-installers">
                  {availableLines.map((l) => (
                    <button
                      type="button"
                      key={l.id}
                      className={`installation-installer-chip ${selectedLineIds.has(l.id) ? 'selected' : ''}`}
                      onClick={() => toggleLine(l.id)}
                    >
                      #{l.lineNo} · {l.label}
                    </button>
                  ))}
                </div>
              )}
            </label>

            <div className="installation-form-row">
              <label>
                <span>Fecha</span>
                <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={isCompleted} />
              </label>
              <label>
                <span>Hora de inicio</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={isCompleted} />
              </label>
              <label>
                <span>Duración estimada</span>
                <input type="text" placeholder="p. ej. 2h" value={estimatedDuration} onChange={(e) => setEstimatedDuration(e.target.value)} disabled={isCompleted} />
              </label>
            </div>

            <label className="installation-form-field">
              <span>Tipo de montaje</span>
              <select value={installationTypeId ?? ''} onChange={(e) => setInstallationTypeId(e.target.value ? Number(e.target.value) : null)} disabled={isCompleted}>
                <option value="">Sin especificar</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.description}
                  </option>
                ))}
              </select>
            </label>

            <label className="installation-form-field">
              <span>Equipo de instalación</span>
              <div className="installation-installers">
                {installers.length === 0 && <span className="component-consumption-secondary">No hay usuarios disponibles como instaladores.</span>}
                {installers.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    className={`installation-installer-chip ${selectedInstallerIds.has(i.id) ? 'selected' : ''}`}
                    onClick={() => !isCompleted && toggleInstaller(i.id)}
                    disabled={isCompleted}
                  >
                    {i.name}
                  </button>
                ))}
              </div>
            </label>

            <label className="installation-form-field">
              <span>Observaciones</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isCompleted} />
            </label>
          </div>

          {saveError && <div className="lona-error lona-error-inline">{saveError}</div>}

          {!isCompleted && (
            <footer className="modal-actions-footer">
              {installation && (
                <button type="button" className="secondary-button" disabled={cancelling} onClick={() => void cancel()}>
                  <Trash2 size={14} /> {cancelling ? 'Cancelando…' : 'Cancelar programación'}
                </button>
              )}
              {installation && (
                <button type="button" className="secondary-button" onClick={() => downloadInstallationSheetPdf(order, installation)}>
                  <FileText size={14} /> Hoja de montaje
                </button>
              )}
              <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>
                <CalendarClock size={15} /> {saving ? 'Guardando…' : installation ? 'Actualizar programación' : 'Programar montaje'}
              </button>
            </footer>
          )}

          {installation && installation.status === 'SCHEDULED' && (
            <div className="installation-complete-box">
              <h3>Completar instalación</h3>
              <p>Al cerrar el montaje se exige la hora de fin y la duración real — se generará el albarán con las líneas de esta visita.</p>
              <div className="installation-form-row">
                <label>
                  <span>Hora de fin</span>
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
                <label>
                  <span>Duración real</span>
                  <input type="text" placeholder="p. ej. 1h30" value={actualDuration} onChange={(e) => setActualDuration(e.target.value)} />
                </label>
              </div>
              {completeError && <div className="lona-error lona-error-inline">{completeError}</div>}
              <button type="button" className="primary-button" disabled={completing} onClick={() => void complete()}>
                <CheckCircle2 size={15} /> {completing ? 'Completando…' : 'Marcar montaje como completado'}
              </button>
            </div>
          )}

          {isCompleted && (
            <footer className="modal-actions-footer">
              <button type="button" className="secondary-button" onClick={() => installation && downloadInstallationSheetPdf(order, installation)}>
                <FileText size={14} /> Hoja de montaje
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Cerrar
              </button>
            </footer>
          )}
        </>
      </div>
    </div>
  );
}
