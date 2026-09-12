import { useState } from 'react';
import { Truck, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { registerLineDelivery, type DeliveryNote } from '../../services/sales/deliveryNoteService';

type Props = {
  line: { id: number; lineNo: number; description: string; remaining: number };
  onClose: () => void;
  onDone: (note: DeliveryNote) => void;
};

export function RegisterLineDeliveryModal({ line, onClose, onDone }: Props) {
  const [quantity, setQuantity] = useState(String(line.remaining));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Indica una cantidad mayor que 0.');
      return;
    }
    if (value > line.remaining) {
      setError(`Solo quedan ${line.remaining} unidades pendientes de esta línea.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const note = await registerLineDelivery(line.id, value, notes || undefined);
      onDone(note);
      onClose();
    } catch (e) {
      setError(e instanceof CoreRepositoryError || e instanceof Error ? e.message : 'No se pudo registrar la entrega.');
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
              <Truck size={18} />
            </span>
            <div>
              <h3>Registrar entrega</h3>
              <p>
                Línea {line.lineNo} · {line.description}
              </p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="inline-error">{error}</div>}
          <div className="form-group">
            <label>Cantidad a entregar (de {line.remaining} pendientes)</label>
            <input type="number" min="1" max={line.remaining} step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="form-group">
            <label>
              Notas <span className="label-hint">(opcional)</span>
            </label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones de la entrega…" />
          </div>
        </div>
        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>
            {saving ? 'Registrando…' : 'Registrar entrega'}
          </button>
        </div>
      </div>
    </div>
  );
}
