import { useEffect, useMemo, useState } from 'react';
import { HardHat, Edit3, Plus, Trash2, Undo2, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
import {
  createInstallationCrew,
  listInstallationCrews,
  markInstallationCrewForDeletion,
  restoreInstallationCrew,
  updateInstallationCrew,
  type InstallationCrew,
} from '../../services/production/installationCrewService';
import { listFieldStaff, resolveCurrentCompanyId, type Installer } from '../../services/production/installationService';
import '../map/map-view.css';
import '../orders/installation.css';

const CREW_COLOR_PRESETS = ['#3f6f8f', '#5c7a74', '#8a6d3b', '#a34a4a', '#6b5b95', '#4a8f5c', '#c07a2c', '#4a6fa5'];

type StatusFilter = 'active' | 'inactive' | 'all';

function CrewFormModal({
  initial,
  fieldStaff,
  onClose,
  onSaved,
}: {
  initial: InstallationCrew | null;
  fieldStaff: Installer[];
  onClose: () => void;
  onSaved: (crew: InstallationCrew) => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || CREW_COLOR_PRESETS[0]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set(initial?.memberIds ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleMember(id: number) {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!name.trim()) {
      setError('Indica un nombre para la cuadrilla.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = initial
        ? await updateInstallationCrew(initial.id, { name, color, memberIds: Array.from(memberIds) })
        : await createInstallationCrew({ name, color, memberIds: Array.from(memberIds) });
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo guardar la cuadrilla.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon-badge primary">
              <HardHat size={18} />
            </span>
            <div>
              <h3>{initial ? 'Editar cuadrilla' : 'Nueva cuadrilla'}</h3>
              <p>Agrupa instaladores para planificar sus visitas de montaje.</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="inline-error">{error}</div>}
          <div className="form-group">
            <label>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Equipo 1…" autoFocus />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div className="zone-color-picker">
              {CREW_COLOR_PRESETS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`zone-color-swatch ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="zone-color-custom" title="Color personalizado" />
            </div>
          </div>
          <div className="form-group">
            <label>Miembros</label>
            {fieldStaff.length === 0 ? (
              <span className="component-consumption-secondary">No hay instaladores ni medidores activos.</span>
            ) : (
              <div className="installation-installers">
                {fieldStaff.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    className={`installation-installer-chip ${memberIds.has(s.id) ? 'selected' : ''}`}
                    onClick={() => toggleMember(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstallationCrews() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [crews, setCrews] = useState<InstallationCrew[]>([]);
  const [fieldStaff, setFieldStaff] = useState<Installer[]>([]);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formCrew, setFormCrew] = useState<InstallationCrew | null | undefined>(undefined);

  useEffect(() => {
    resolveCurrentCompanyId()
      .then(setCompanyId)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo determinar la empresa.'));
  }, []);

  async function load(cid: number) {
    try {
      setLoading(true);
      setError('');
      const [crewsResult, staffResult] = await Promise.all([listInstallationCrews(status), listFieldStaff(cid)]);
      setCrews(crewsResult);
      setFieldStaff(staffResult);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudieron cargar las cuadrillas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId != null) void load(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status]);

  const staffByid = useMemo(() => new Map(fieldStaff.map((s) => [s.id, s.name])), [fieldStaff]);

  async function remove(crew: InstallationCrew) {
    const ok = await confirmDialog({
      title: 'Marcar cuadrilla para borrado',
      message: `"${crew.name}" dejará de estar disponible para programar nuevos montajes. Los montajes ya asignados a ella no se ven afectados.`,
      danger: true,
      confirmLabel: 'Marcar para borrado',
    });
    if (!ok || companyId == null) return;
    await markInstallationCrewForDeletion(crew.id);
    await load(companyId);
  }

  async function restore(crew: InstallationCrew) {
    if (companyId == null) return;
    await restoreInstallationCrew(crew.id);
    await load(companyId);
  }

  return (
    <div className="module-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">GESTIÓN / CUADRILLAS</div>
          <h1>Cuadrillas</h1>
          <p>Equipos de instalación estables para planificar visitas de montaje.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setFormCrew(null)}>
          <Plus size={16} /> Nueva cuadrilla
        </button>
      </div>

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="active">Activas</option>
          <option value="inactive">Marcadas para borrado</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Nombre</th>
              <th>Miembros</th>
              <th>Estado</th>
              <th className="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Cargando cuadrillas…</td>
              </tr>
            ) : crews.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <HardHat size={28} />
                    <strong>Sin cuadrillas</strong>
                    <span>Crea la primera para empezar a planificar montajes por equipo.</span>
                  </div>
                </td>
              </tr>
            ) : (
              crews.map((crew) => (
                <tr key={crew.id}>
                  <td>
                    <span className="zone-dot" style={{ background: crew.color, display: 'inline-block' }} />
                  </td>
                  <td>{crew.name}</td>
                  <td>{crew.memberIds.length ? crew.memberIds.map((id) => staffByid.get(id) || `#${id}`).join(', ') : '—'}</td>
                  <td>
                    <span className={`status ${crew.active ? 'active' : 'inactive'}`}>{crew.active ? 'Activa' : 'Marcada para borrado'}</span>
                  </td>
                  <td className="actions-col">
                    {crew.active ? (
                      <>
                        <button type="button" className="icon-link" title="Editar" onClick={() => setFormCrew(crew)}>
                          <Edit3 size={15} />
                        </button>
                        <button type="button" className="icon-link" title="Marcar para borrado" onClick={() => void remove(crew)}>
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <button type="button" className="icon-link" title="Recuperar" onClick={() => void restore(crew)}>
                        <Undo2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formCrew !== undefined && (
        <CrewFormModal
          initial={formCrew}
          fieldStaff={fieldStaff}
          onClose={() => setFormCrew(undefined)}
          onSaved={() => companyId != null && void load(companyId)}
        />
      )}
    </div>
  );
}
