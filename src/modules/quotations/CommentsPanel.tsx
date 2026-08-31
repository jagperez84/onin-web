import { useState } from 'react';
import { Eye, EyeOff, MessageSquarePlus, Plus, X } from 'lucide-react';
import './comments-panel.css';

export type CommentItem = { text: string; isPublic: boolean };

/** Añade las "Notas de la partida" del configurador OTD como comentario interno de la línea,
 *  sin duplicar si ya se había añadido el mismo texto en una confirmación anterior. */
export function withOtdNotesComment(comments: CommentItem[], notes?: string | null): CommentItem[] {
  const trimmed = notes?.trim();
  if (!trimmed) return comments;
  if (comments.some(c => c.text === trimmed)) return comments;
  return [...comments, { text: trimmed, isPublic: false }];
}

type Props = {
  comments: CommentItem[];
  onChange?: (comments: CommentItem[]) => void;
  readOnly?: boolean;
  compact?: boolean;
  placeholder?: string;
  emptyLabel?: string;
};

/**
 * Lista de comentarios (cabecera o línea de presupuesto) + alta de uno nuevo con su checkbox
 * "Público". readOnly la deja solo como visor (para el detalle del presupuesto, donde los
 * comentarios ya están persistidos); en Crear/Editar es el propio estado en borrador de la
 * cabecera/línea, y onChange sustituye la lista completa (igual que dimensiones/características).
 */
export function CommentsPanel({ comments, onChange, readOnly = false, compact = false, placeholder, emptyLabel }: Props) {
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftPublic, setDraftPublic] = useState(false);

  const removeAt = (index: number) => {
    if (!onChange) return;
    onChange(comments.filter((_, i) => i !== index));
  };

  const confirmAdd = () => {
    if (!onChange || !draftText.trim()) return;
    onChange([...comments, { text: draftText.trim(), isPublic: draftPublic }]);
    setDraftText('');
    setDraftPublic(false);
    setAdding(false);
  };

  return (
    <div className={`comments-panel ${compact ? 'compact' : ''}`}>
      {comments.length > 0 && (
        <ul className="comments-panel-list">
          {comments.map((c, i) => (
            <li key={i} className={`comments-panel-item ${c.isPublic ? 'public' : 'private'}`}>
              <span className="comments-panel-item-icon" title={c.isPublic ? 'Público: se imprime en el PDF' : 'Interno: no se imprime'}>
                {c.isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
              </span>
              <span className="comments-panel-item-text">{c.text}</span>
              {!readOnly && onChange && (
                <button type="button" className="comments-panel-item-remove" onClick={() => removeAt(i)} aria-label="Eliminar comentario">
                  <X size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {comments.length === 0 && readOnly && <div className="comments-panel-empty">{emptyLabel || 'Sin comentarios.'}</div>}

      {!readOnly && onChange && (
        adding ? (
          <div className="comments-panel-add-form">
            <textarea
              autoFocus
              rows={compact ? 2 : 3}
              value={draftText}
              placeholder={placeholder || 'Escribe un comentario…'}
              onChange={e => setDraftText(e.target.value)}
            />
            <div className="comments-panel-add-actions">
              <label className="comments-panel-public-toggle">
                <input type="checkbox" checked={draftPublic} onChange={e => setDraftPublic(e.target.checked)} />
                Público
              </label>
              <div className="comments-panel-add-buttons">
                <button type="button" className="secondary-button" onClick={() => { setAdding(false); setDraftText(''); setDraftPublic(false); }}>
                  Cancelar
                </button>
                <button type="button" className="primary-button" disabled={!draftText.trim()} onClick={confirmAdd}>
                  <Plus size={13} /> Añadir
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="comments-panel-add-trigger" onClick={() => setAdding(true)}>
            <MessageSquarePlus size={13} /> Añadir comentario
          </button>
        )
      )}
    </div>
  );
}
