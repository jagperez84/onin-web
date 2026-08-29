import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, FileText, MapPin, Plus, Trash2, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import {
  cancelInstallation,
  completeInstallation,
  createInstallationType,
  getInstallationBySalesOrder,
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

type Props = { order: SalesOrder; companyId: number; onClose: () => void; onDone: (installation: Installation) => void };

export function InstallationModal({ order, companyId, onClose, onDone }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [types, setTypes] = useState<InstallationType[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [newTypeText, setNewTypeText] = useState('');
  const [addingType, setAddingType] = useState(false);

  const [installationTypeId, setInstallationTypeId] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [selectedInstallerIds, setSelectedInstallerIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [endTime, setEndTime] = useState('');
  const [actualDuration, setActualDuration] = useState('');
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [existing, typesList, installersList] = await Promise.all([
          getInstallationBySalesOrder(order.id),
          listInstallationTypes(companyId),
          listInstallers(companyId),
        ]);
        if (!active) return;
        setTypes(typesList);
        setInstallers(installersList);
        if (existing) {
          setInstallation(existing);
          setInstallationTypeId(existing.installationTypeId);
          setScheduledDate(existing.scheduledDate || '');
          setStartTime(existing.startTime || '');
          setEstimatedDuration(existing.estimatedDuration || '');
          setSelectedInstallerIds(new Set(existing.installers.map(i => i.id)));
          setNotes(existing.notes || '');
        } else {
          setScheduledDate((order as any).requested_delivery_date || '');
          if (typesList.length === 1) setInstallationTypeId(typesList[0].id);
        }
      } catch (value) {
        if (active) setError(value instanceof Error ? value.message : 'No se pudo cargar el montaje.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [order.id, companyId]);

  const toggleInstaller = (id: number) => {
    setSelectedInstallerIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addType = async () => {
    if (!newTypeText.trim()) return;
    setAddingType(true);
    try {
      const created = await createInstallationType(companyId, newTypeText.trim());
      setTypes(previous => [...previous, created].sort((a, b) => a.description.localeCompare(b.description)));
      setInstallationTypeId(created.id);
      setNewTypeText('');
    } catch (value) {
      setSaveError(value instanceof Error ? value.message : 'No se pudo crear el tipo de montaje.');
    } finally {
      setAddingType(false);
    }
  };

  const selectedInstallers = useMemo(() => installers.filter(i => selectedInstallerIds.has(i.id)), [installers, selectedInstallerIds]);

  const installationAddress = useMemo(() => {
    const o = order as any;
    return [o.installation_address_street, o.installation_address_city, o.installation_address_postal_code, o.installation_address_region].filter(Boolean).join(', ');
  }, [order]);

  const save = async () => {
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
      });
      setInstallation(result);
      onDone(result);
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
      const refreshed = await getInstallationBySalesOrder(order.id);
      if (refreshed) {
        setInstallation(refreshed);
        onDone(refreshed);
      }
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
      onClose();
    } catch (value) {
      setSaveError(value instanceof Error ? value.message : 'No se pudo cancelar la programación.');
    } finally {
      setCancelling(false);
    }
  };

  const isCompleted = installation?.status === 'COMPLETED';

  return (
    <div className="lona-modal-backdrop" role="dialog" aria-modal="true">
      <div className="lona-modal">
        <header className="lona-modal-head">
          <div>
            <span className="lona-eyebrow">MONTAJE / INSTALACIÓN</span>
            <h2>Montaje de {order.code}</h2>
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

        {loading ? (
          <div className="lona-empty">Cargando montaje…</div>
        ) : error ? (
          <div className="lona-error">{error}</div>
        ) : (
          <>
            {isCompleted && (
              <div className="component-consumption-sheet-ready">
                <CheckCircle2 size={16} />
                <span>
                  Montaje completado el {installation?.endTime ? `a las ${installation.endTime}` : ''} · Pedido <strong>Instalado</strong>.
                </span>
              </div>
            )}

            <div className="installation-form">
              <div className="installation-form-row">
                <label>
                  <span>Fecha</span>
                  <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} disabled={isCompleted} />
                </label>
                <label>
                  <span>Hora de inicio</span>
                  <input type="text" placeholder="HH:MM" value={startTime} onChange={e => setStartTime(e.target.value)} disabled={isCompleted} />
                </label>
                <label>
                  <span>Duración estimada</span>
                  <input type="text" placeholder="p. ej. 2h" value={estimatedDuration} onChange={e => setEstimatedDuration(e.target.value)} disabled={isCompleted} />
                </label>
              </div>

              <label className="installation-form-field">
                <span>Tipo de montaje</span>
                <div className="installation-type-row">
                  <select value={installationTypeId ?? ''} onChange={e => setInstallationTypeId(e.target.value ? Number(e.target.value) : null)} disabled={isCompleted}>
                    <option value="">Sin especificar</option>
                    {types.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.description}
                      </option>
                    ))}
                  </select>
                  {!isCompleted && (
                    <>
                      <input type="text" placeholder="Nuevo tipo…" value={newTypeText} onChange={e => setNewTypeText(e.target.value)} />
                      <button type="button" className="secondary-button" disabled={addingType || !newTypeText.trim()} onClick={() => void addType()}>
                        <Plus size={13} />
                      </button>
                    </>
                  )}
                </div>
              </label>

              <label className="installation-form-field">
                <span>Equipo de instalación</span>
                <div className="installation-installers">
                  {installers.length === 0 && <span className="component-consumption-secondary">No hay usuarios disponibles como instaladores.</span>}
                  {installers.map(i => (
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
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} disabled={isCompleted} />
              </label>
            </div>

            {saveError && <div className="lona-error lona-error-inline">{saveError}</div>}

            {!isCompleted && (
              <footer className="lona-modal-actions">
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
                <p>Al cerrar el montaje se exige la hora de fin y la duración real — y el pedido pasará automáticamente a Instalado.</p>
                <div className="installation-form-row">
                  <label>
                    <span>Hora de fin</span>
                    <input type="text" placeholder="HH:MM" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </label>
                  <label>
                    <span>Duración real</span>
                    <input type="text" placeholder="p. ej. 1h30" value={actualDuration} onChange={e => setActualDuration(e.target.value)} />
                  </label>
                </div>
                {completeError && <div className="lona-error lona-error-inline">{completeError}</div>}
                <button type="button" className="primary-button" disabled={completing} onClick={() => void complete()}>
                  <CheckCircle2 size={15} /> {completing ? 'Completando…' : 'Marcar montaje como completado'}
                </button>
              </div>
            )}

            {isCompleted && (
              <footer className="lona-modal-actions">
                <button type="button" className="secondary-button" onClick={() => installation && downloadInstallationSheetPdf(order, installation)}>
                  <FileText size={14} /> Hoja de montaje
                </button>
                <button type="button" className="primary-button" onClick={onClose}>
                  Cerrar
                </button>
              </footer>
            )}
          </>
        )}
      </div>
    </div>
  );
}
