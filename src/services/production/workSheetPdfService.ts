import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkSheet } from './workSheetService';

const fmtDate=(value:string)=>new Date(value).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});

/** Documento exclusivamente técnico de taller; no incluye información comercial. */
export function downloadWorkSheetPdf(workSheet:WorkSheet){
 const unit=workSheet.unit_symbol||workSheet.unit_code||'';
 const dims=(values:number[])=>values.length?`${values.join(' × ')}${unit?` ${unit}`:''}`:'—';
 const pdf=new jsPDF({unit:'mm',format:'a4'}); const width=pdf.internal.pageSize.getWidth();
 pdf.setFontSize(9); pdf.text('ONIN · PRODUCCIÓN',14,15); pdf.setFontSize(8); pdf.text('DOCUMENTO TÉCNICO · SIN INFORMACIÓN COMERCIAL',width-14,15,{align:'right'}); pdf.setFontSize(18); pdf.text('HOJA DE CORTE',14,25); pdf.setFontSize(11); pdf.text(workSheet.code,width-14,25,{align:'right'}); pdf.setDrawColor(210,210,210); pdf.line(14,30,width-14,30);
 pdf.setFontSize(10); pdf.text(`Pedido: ${workSheet.sales_order_code||'—'}`,14,39); pdf.text(`Línea: ${workSheet.sales_order_line_no??'—'}`,14,45); pdf.text(`Fecha: ${fmtDate(workSheet.issue_date)}`,width-14,39,{align:'right'}); pdf.text(`Referencia: ${workSheet.reference||'—'}`,width-14,45,{align:'right'});
 pdf.setFontSize(12); pdf.text('Material a cortar',14,57); pdf.setFontSize(10); pdf.text(`${workSheet.product_code||'—'} · ${workSheet.product_name||'Perfil'}`,14,64); pdf.text(`Característica: ${workSheet.characteristic_name||workSheet.characteristic_code||'Sin característica'}`,14,70); pdf.text(`Necesidad: ${workSheet.quantity} ud. × ${workSheet.required_length}${unit?` ${unit}`:''}`,14,76);
 if(workSheet.selection_mode==='AUTOMATIC'){pdf.setFontSize(9);pdf.text('Criterio de selección automática:',14,82);pdf.text(pdf.splitTextToSize(workSheet.selection_reason||'Optimización automática de aprovechamiento.',width-28),14,87);}
 const startY=workSheet.selection_mode==='AUTOMATIC'?98:84;
 autoTable(pdf,{startY,head:[['#','Almacén','Pieza seleccionada','Corte','Ud.','Resto','Criterio de selección']],body:workSheet.lines.map(line=>[line.line_no,line.warehouse_code||line.warehouse_name||'—',dims(line.source_dimension_values),dims(line.cut_dimension_values),line.quantity,line.remainder_dimension_values.length?dims(line.remainder_dimension_values):'Descarte',line.selection_reason||workSheet.selection_reason||(workSheet.selection_mode==='AUTOMATIC'?'Optimización automática':'Selección manual')]),styles:{fontSize:7.5,cellPadding:2.5},headStyles:{fontStyle:'bold'},columnStyles:{6:{cellWidth:48}},margin:{left:14,right:14}});
 const finalY=(pdf as any).lastAutoTable?.finalY||120; pdf.setFontSize(10); pdf.text('Instrucciones de taller',14,finalY+12); pdf.setFontSize(9); const note=workSheet.notes||'Realizar los cortes indicados respetando las piezas de stock seleccionadas.'; pdf.text(pdf.splitTextToSize(note,width-28),14,finalY+19); pdf.setFontSize(8); pdf.text('Documento técnico de producción generado por ONIN.',14,285); pdf.save(`${workSheet.code.replace(/\//g,'-')}.pdf`);
}

