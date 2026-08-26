import { useEffect, useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { getLonaConfectionWorkSheetBySalesOrderLine, type LonaConfectionWorkSheet } from '../../services/production/lonaConfectionQueryService';
import './lona-confection.css';

type Props = { line:any; reference?:string; onClose:()=>void };

function formatDimensions(values:number[], units:string[]) {
  return values.map((value,index)=>`${value} ${units[index]||''}`.trim()).join(' × ');
}

export function LonaConfectionViewModal({line,reference,onClose}:Props){
  const [sheet,setSheet]=useState<LonaConfectionWorkSheet|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    getLonaConfectionWorkSheetBySalesOrderLine(Number(line.id))
      .then(value=>{if(active)setSheet(value)})
      .catch(value=>{if(active)setError(value instanceof CoreRepositoryError||value instanceof Error?value.message:'No se pudo cargar la hoja de confección.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[line.id]);

  return <div className="lona-modal-backdrop" role="dialog" aria-modal="true">
    <div className="lona-modal">
      <header className="lona-modal-head">
        <div>
          <span className="lona-eyebrow">FABRICACIÓN / CONFECCIÓN DE LONA</span>
          <h2>Confección realizada · Línea {line.line_no}</h2>
          <p>{reference||line.description||'Consulta de la hoja de confección'}</p>
        </div>
        <button type="button" className="lona-close" onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
      </header>

      {loading?<div className="lona-empty">Cargando hoja de confección…</div>:error?<div className="lona-error">{error}</div>:!sheet?<div className="lona-empty">No se ha encontrado la hoja de confección.</div>:<>
        <div className="lona-summary">
          <div><span>Hoja</span><strong>{sheet.code}</strong></div>
          <div><span>Estado</span><strong>{sheet.status==='COMPLETED'?'Ejecutada':'Emitida'}</strong></div>
          <div><span>Cantidad</span><strong>{sheet.quantity}</strong></div>
        </div>

        <div className="lona-content">
          <section className="lona-cut-card">
            <div className="lona-cut-info">
              <div className="lona-cut-title">
                <div><strong>{sheet.productCode||'—'}</strong><span>{sheet.productName||'Confección de lona'}</span></div>
                <span className="lona-chip">CONFECCIONADA</span>
              </div>

              <div className="lona-data-grid">
                <div><span>Dimensiones requeridas</span><strong>{formatDimensions(sheet.requiredDimensions,sheet.requiredDimensionUnits)}</strong></div>
                <div><span>Característica</span><strong>{sheet.characteristicName||'Sin característica'}</strong></div>
                <div><span>Selección</span><strong>{sheet.selectionMode==='MANUAL'?'Manual':'Automática'}</strong></div>
                <div><span>Unidad</span><strong>{sheet.unitSymbol||sheet.requiredDimensionUnits[0]||'—'}</strong></div>
              </div>

              {sheet.selectionReason&&<div className="lona-material ready">
                <div className="lona-material-head"><div><span>Decisión de material</span><strong>Material utilizado</strong></div><span className="lona-material-badge"><ClipboardCheck size={12}/> Confirmada</span></div>
                <div className="lona-material-detail"><span>{sheet.selectionReason}</span><strong>{sheet.lines.length} selección{sheet.lines.length===1?'':'es'}</strong></div>
              </div>}

              <div className="lona-sheet-ready">
                <div><ClipboardCheck size={15}/><span>Hoja de confección <strong>{sheet.code}</strong></span></div>
                <small>{sheet.status==='COMPLETED'?'Confección ejecutada y stock actualizado.':'Hoja emitida. El stock todavía no se ha consumido.'}</small>
              </div>
            </div>

            <div className="lona-diagram-wrap">
              <div className="lona-diagram-label"><ClipboardCheck size={13}/> Material y cortes registrados</div>
              <div className="lona-view-lines">
                {sheet.lines.map(item=><div className="lona-material ready" key={item.id}>
                  <div className="lona-material-head"><div><span>Material</span><strong>{item.warehouseCode||item.warehouseName||'—'}</strong></div></div>
                  <div className="lona-material-detail"><span>Origen: {formatDimensions(item.sourceDimensions,item.sourceDimensionUnits)}</span><strong>Corte: {formatDimensions(item.cutDimensions,item.cutDimensionUnits)}</strong></div>
                  <div className="lona-material-detail"><span>Resto: {item.remainderDimensions.length?formatDimensions(item.remainderDimensions,item.remainderDimensionUnits):'Descarte'}</span><strong>{item.quantity} ud.</strong></div>
                </div>)}
              </div>
            </div>
          </section>
        </div>

        <footer className="lona-modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>Cerrar</button>
        </footer>
      </>}
    </div>
  </div>;
}
