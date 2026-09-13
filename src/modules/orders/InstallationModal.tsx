import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, MapPin, Plus, Trash2, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import type { InstallationCrew } from '../../services/production/installationCrewService';
import {
  addInstallationSession,
  cancelInstallation,
  completeInstallation,
  getInstallation,
  INSTALLATION_STATUS_LABEL as STATUS_LABEL,
  INSTALLATION_STATUS_TONE as STATUS_TONE,
  listInstallationTypes,
  listInstallers,
  reportInstallationIncident,
  resolveInstallationIncident,
  upsertInstallation,
  type IncidentSeverity,
  type Installation,
  type InstallationType,
  type Installer,
} from '../../services/production/installationService';
import { downloadInstallationSheetPdf } from '../../services/production/installationPdfService';
import './component-consumption.css';
import './lona-confection.css';
import './installation.css';

export type InstallableLine = { id: number; lineNo: number; label: string };

const SEVERITY_LABEL: Record<IncidentSeverity, string> = { LOW: 'Leve', MEDIUM: 'Moderada', HIGH: 'Grave' };
const SEVERITY_PILL: Record<IncidentSeverity, string> = { LOW: '', MEDIUM: 'warning', HIGH: 'danger' };

type Props = {
  order: SalesOrder;
  companyId: number;
  /** La instalación a consultar/completar, o null para programar una visita nueva. */
  installation: Installation | null;
  /** Líneas OTD del pedido aún sin cubrir por ninguna instalación activa (solo aplica cuando installation es null). */
  availableLines: InstallableLine[];
  types: InstallationType[];
  installers: Installer[];
  crews: InstallationCrew[];
  onClose: () => void;
  onDone: (installation: Installation) => void;
  onCancelled?: (installation: Installation) => void;
};

export function InstallationModal({ order, companyId, installation: initialInstallation, availableLines, types, installers, crews, onClose, onDone, onCancelled }: Props) {
  const [installation, setInstallation] = useState(initialInstallation);
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [sessionStart, setSessionStart] = useState('');
  const [sessionEnd, setSessionEnd] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [savingSession, setSavingSession] = useState(false);
  const [sessionError, setSessionError] = useState('');

  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('MEDIUM');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [savingIncident, setSavingIncident] = useState(false);
  const [incidentError, setIncidentError] = useState('');
  const [resolvingIncidentId, setResolvingIncidentId] = useState<number | null>(null);

  async function refreshInstallation() {
    if (!installation) return;
    const refreshed = await getInstallation(installation.id);
    if (refreshed) {
      setInstallation(refreshed);
      onDone(refreshed);
    }
  }

  async function submitSession() {
    if (!installation) return;
    setSavingSession(true);
    setSessionError('');
    try {
      await addInstallationSession({ installationId: installation.id, sessionDate, startTime: sessionStart || null, endTime: sessionEnd || null, notes: sessionNotes || null });
      setSessionStart('');
      setSessionEnd('');
      setSessionNotes('');
      await refreshInstallation();
    } catch (value) {
      setSessionError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo registrar la jornada.');
    } finally {
      setSavingSession(false);
    }
  }

  async function submitIncident() {
    if (!installation) return;
    if (!incidentDescription.trim()) {
      setIncidentError('Describe qué ha pasado.');
      return;
    }
    setSavingIncident(true);
    setIncidentError('');
    try {
      await reportInstallationIncident({ installationId: installation.id, severity: incidentSeverity, description: incidentDescription.trim() });
      setIncidentDescription('');
      setIncidentSeverity('MEDIUM');
      await refreshInstallation();
    } catch (value) {
      setIncidentError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo registrar la incidencia.');
    } finally {
      setSavingIncident(false);
    }
  }

  async function resolveIncident(incidentId: number) {
    setResolvingIncidentId(incidentId);
    try {
      await resolveInstallationIncident(incidentId);
      await refreshInstallation();
    } catch (value) {
      setIncidentError(value instanceof CoreRepositoryError || value instanceof Error ? value.message : 'No se pudo resolver la incidencia.');
    } finally {
      setResolvingIncidentId(null);
    }
  }

  const [installationTypeId, setInstallationTypeId] = useState<number | null>(
    installation?.installationTypeId ?? (types.length === 1 ? types[0].id : null),
  );
  const [scheduledDate, setScheduledDate] = useState(installation?.scheduledDate || (order as any).requested_delivery_date || '');
  const [startTime, setStartTime] = useState(installation?.startTime || '');
  const [estimatedDuration, setEstimatedDuration] = useState(installation?.estimatedDuration || '');
  const [crewId, setCrewId] = useState<number | null>(installation?.crewId ?? null);
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
  const pickCrew = (id: number | null) => {
    setCrewId(id);
    const crew = id == null ? null : crews.find((c) => c.id === id);
    if (crew) setSelectedInstallerIds(new Set(crew.memberIds));
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
      const wasNew = !installation;
      const result = await upsertInstallation({
        id: installation?.id ?? null,
        companyId,
        salesOrderId: order.id,
        installationTypeId,
        scheduledDate: scheduledDate || null,
        startTime: startTime || null,
        estimatedDuration: estimatedDuration || null,
        crewId,
        installers: selectedInstallers,
        notes: notes || null,
        salesOrderLineIds: installation ? undefined : Array.from(selectedLineIds),
      });
      onDone(result);
      if (wasNew) {
        // Se queda abierto en modo gestión: así se puede añadir ya la primera
        // jornada de trabajo sin tener que cerrar y volver a abrir "Gestionar".
        setInstallation(result);
      } else {
        onClose();
      }
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
      await refreshInstallation();
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
  const canWorkOn = installation && ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED'].includes(installation.status);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card xl">
        <header className="modal-header">
          <div>
            <span className="lona-eyebrow">MONTAJE / INSTALACIÓN</span>
            <h2>
              {installation ? `Montaje de ${order.code}` : `Programar visita de montaje · ${order.code}`}
              {installation && (
                <span className={`status-pill ${STATUS_TONE[installation.status]}`} style={{ marginLeft: 10 }}>
                  {STATUS_LABEL[installation.status]}
                </span>
              )}
            </h2>
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

            {crews.length > 0 && (
              <label className="installation-form-field">
                <span>Cuadrilla</span>
                <select value={crewId ?? ''} onChange={(e) => pickCrew(e.target.value ? Number(e.target.value) : null)} disabled={isCompleted}>
                  <option value="">Sin cuadrilla asignada</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

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

          {installation && (
            <div className="installation-section">
              <h3>Jornadas de trabajo</h3>
              {installation.sessions.length === 0 ? (
                <p className="installation-entry-notes">Un montaje grande puede necesitar varias visitas — registra aquí cada jornada.</p>
              ) : (
                <div className="installation-entry-list">
                  {installation.sessions.map((s) => (
                    <div key={s.id} className="installation-entry">
                      <div className="installation-entry-head">
                        <strong>{s.sessionDate}</strong>
                        <span>{s.startTime || '—'} - {s.endTime || '—'}</span>
                      </div>
                      {s.notes && <span className="installation-entry-notes">{s.notes}</span>}
                    </div>
                  ))}
                </div>
              )}
              {canWorkOn && (
                <>
                  <div className="installation-form-row">
                    <label>
                      <span>Fecha</span>
                      <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
                    </label>
                    <label>
                      <span>Hora inicio</span>
                      <input type="time" value={sessionStart} onChange={(e) => setSessionStart(e.target.value)} />
                    </label>
                    <label>
                      <span>Hora fin</span>
                      <input type="time" value={sessionEnd} onChange={(e) => setSessionEnd(e.target.value)} />
                    </label>
                  </div>
                  <div className="installation-form-field">
                    <span>Notas de la jornada</span>
                    <textarea rows={2} value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
                  </div>
                  {sessionError && <div className="lona-error lona-error-inline">{sessionError}</div>}
                  <button type="button" className="secondary-button" disabled={savingSession} onClick={() => void submitSession()}>
                    <Plus size={14} /> {savingSession ? 'Guardando…' : 'Añadir jornada'}
                  </button>
                </>
              )}
            </div>
          )}

          {installation && (
            <div className="installation-section">
              <h3>Incidencias</h3>
              {installation.incidents.length === 0 ? (
                <p className="installation-entry-notes">Nada que reportar por ahora.</p>
              ) : (
                <div className="installation-entry-list">
                  {installation.incidents.map((i) => (
                    <div key={i.id} className="installation-entry">
                      <div className="installation-entry-head">
                        <strong>
                          <span className={`status-pill ${SEVERITY_PILL[i.severity]}`} style={{ marginRight: 8 }}>
                            {SEVERITY_LABEL[i.severity]}
                          </span>
                          {i.description}
                        </strong>
                        {i.status === 'OPEN' ? (
                          canWorkOn && (
                            <button type="button" className="secondary-button" disabled={resolvingIncidentId === i.id} onClick={() => void resolveIncident(i.id)}>
                              {resolvingIncidentId === i.id ? 'Resolviendo…' : 'Resolver'}
                            </button>
                          )
                        ) : (
                          <span className="status-pill success">Resuelta</span>
                        )}
                      </div>
                      {i.resolutionNotes && <span className="installation-entry-notes">{i.resolutionNotes}</span>}
                    </div>
                  ))}
                </div>
              )}
              {canWorkOn && (
                <>
                  <div className="installation-form-row">
                    <label>
                      <span>Gravedad</span>
                      <select value={incidentSeverity} onChange={(e) => setIncidentSeverity(e.target.value as IncidentSeverity)}>
                        <option value="LOW">Leve</option>
                        <option value="MEDIUM">Moderada</option>
                        <option value="HIGH">Grave (bloquea el montaje)</option>
                      </select>
                    </label>
                  </div>
                  <div className="installation-form-field">
                    <span>Qué ha pasado</span>
                    <textarea rows={2} value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} />
                  </div>
                  {incidentError && <div className="lona-error lona-error-inline">{incidentError}</div>}
                  <button type="button" className="secondary-button" disabled={savingIncident} onClick={() => void submitIncident()}>
                    <AlertTriangle size={14} /> {savingIncident ? 'Guardando…' : 'Reportar incidencia'}
                  </button>
                </>
              )}
            </div>
          )}

          {canWorkOn && (
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
