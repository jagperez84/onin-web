import jsPDF from 'jspdf';
import type { LonaConfectionComponent, LonaConfectionResult, LonaConfectionWorkSheet } from './lonaConfectionService';
import { getLonaCutGeometry } from './lonaConfectionService';

function formatNumber(value: number | null) { return value == null ? '—' : value.toLocaleString('es-ES', { maximumFractionDigits: 2 }); }

/**
 * Dibuja el corte realmente ejecutado en una línea de hoja de confección: la pieza de
 * material seleccionada (source) y el corte que se le hizo (cut), con su remanente lateral
 * y longitudinal si lo hay. A diferencia de drawCutDiagram (que solo conoce la necesidad
 * nominal antes de elegir material), esto usa las dimensiones reales ya persistidas en
 * production_work_sheet_line, así que es fiel a lo que taller cortó de verdad.
 */
function drawLonaLineDiagram(
  pdf: jsPDF,
  line: LonaConfectionWorkSheet['lines'][number],
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const [stockWidth, stockLength] = line.sourceDimensions;
  const [cutLine, cutOutput] = line.cutDimensions;
  if (!(stockWidth > 0) || !(stockLength > 0) || !(cutLine > 0) || !(cutOutput > 0)) return;

  const direct = stockWidth >= cutLine && stockLength >= cutOutput;
  const rotated = !direct && stockWidth >= cutOutput && stockLength >= cutLine;
  if (!direct && !rotated) return;
  const cutWidth = rotated ? cutOutput : cutLine;
  const cutLength = rotated ? cutLine : cutOutput;

  const scale = Math.min(maxWidth / stockLength, maxHeight / stockWidth);
  const rectW = stockLength * scale;
  const rectH = stockWidth * scale;
  const pieceW = cutLength * scale;
  const pieceH = cutWidth * scale;
  const unit = line.sourceDimensionUnits[0] || line.cutDimensionUnits[0] || '';

  pdf.setDrawColor(90, 90, 90);
  pdf.setFillColor(245, 247, 250);
  pdf.rect(x, y, rectW, rectH, 'FD');

  pdf.setFillColor(219, 234, 254);
  pdf.setDrawColor(37, 99, 235);
  pdf.rect(x, y, pieceW, pieceH, 'FD');

  pdf.setFillColor(254, 242, 232);
  pdf.setDrawColor(217, 119, 6);
  if (rectW > pieceW) pdf.rect(x + pieceW, y, rectW - pieceW, rectH, 'FD');
  if (rectH > pieceH) pdf.rect(x, y + pieceH, pieceW, rectH - pieceH, 'FD');

  pdf.setFontSize(6.5);
  pdf.setTextColor(30, 60, 130);
  pdf.text(`${formatNumber(cutLine)}×${formatNumber(cutOutput)} ${unit}`.trim(), x + 1.5, y + Math.min(pieceH, rectH) - 1.5);
}
function drawCutDiagram(pdf: jsPDF, component: LonaConfectionComponent, x: number, y: number, maxWidth: number, maxHeight: number) { const geometry=getLonaCutGeometry(component); if(!geometry){pdf.setFontSize(8);pdf.text('No hay dos dimensiones resueltas para representar el corte.',x,y+8);return y+16;} const scale=Math.min(maxWidth/geometry.width,maxHeight/geometry.height),width=geometry.width*scale,height=geometry.height*scale,rectX=x+(maxWidth-width)/2,rectY=y+10+(maxHeight-height)/2;pdf.setDrawColor(90,90,90);pdf.setFillColor(245,247,250);pdf.rect(rectX,rectY,width,height,'FD');pdf.setDrawColor(30,30,30);pdf.line(rectX,rectY-4,rectX+width,rectY-4);pdf.line(rectX-4,rectY,rectX-4,rectY+height);pdf.setFontSize(7);pdf.text(`${formatNumber(geometry.width)} ${component.lineUnit??''}`.trim(),rectX+width/2,rectY-7,{align:'center'});pdf.text(`${formatNumber(geometry.height)} ${component.outputUnit??''}`.trim(),rectX-7,rectY+height/2,{angle:90,align:'center'});return Math.max(y+maxHeight+12,rectY+height+18); }

export function downloadLonaConfectionPdf(result:LonaConfectionResult,cutDetails?:Record<number,{cutType?:string;hem?:string;overlap?:string}>) { const pdf=new jsPDF({unit:'mm',format:'a4'}),w=pdf.internal.pageSize.getWidth(),h=pdf.internal.pageSize.getHeight(),m=14;pdf.setFontSize(9);pdf.text('ONIN · PRODUCCIÓN',m,15);pdf.setFontSize(8);pdf.text('DOCUMENTO TÉCNICO · CONFECCIÓN DE LONAS',w-m,15,{align:'right'});pdf.setFontSize(18);pdf.text('INFORME DE CORTE DE LONA',m,25);pdf.setFontSize(10);pdf.text(`Pedido: ${result.reference??'—'}`,m,34);pdf.text(`Línea: ${result.orderLineNo}`,m,40);pdf.text(`OTD: ${result.otdCode??'—'}`,w-m,34,{align:'right'});pdf.line(m,45,w-m,45);let y=54;result.components.forEach((component,index)=>{if(index>0&&y>h-85){pdf.addPage();y=20;}const detail=cutDetails?.[index],cutType=detail?.cutType||'Asimétrico',hem=detail?.hem||'3',overlap=detail?.overlap||'2.7';pdf.setFontSize(12);pdf.text(`${index+1}. ${component.productCode}`,m,y);pdf.setFontSize(9);pdf.text(component.productName,m,y+6);pdf.text(`Cantidad: ${formatNumber(component.quantity)} · Característica: ${component.characteristicName??'Sin característica'}`,m,y+12);pdf.text(`Línea: ${formatNumber(component.line)} ${component.lineUnit??''} · Salida: ${formatNumber(component.output)} ${component.outputUnit??''}`,m,y+18);y=drawCutDiagram(pdf,component,m,y+23,w-m*2,65)+12;pdf.setFontSize(8);pdf.text(`Tipo de corte: ${cutType} · Dobladillo: ${hem} ${component.lineUnit??''} · Solape: ${overlap} ${component.lineUnit??''}`,m,y);y+=19;});pdf.setFontSize(8);pdf.text('Documento técnico generado por ONIN.',m,h-10);pdf.save(`confeccion-lona-linea-${result.orderLineNo}.pdf`); }

export function downloadLonaWorkSheetsPdf(sheets:LonaConfectionWorkSheet[],orderCode:string,reference?:string|null){
  if (!sheets.length) return;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  const m = 14;
  const diagramWidth = 46;
  const diagramHeight = 26;
  const textWidth = w - m * 2 - diagramWidth - 8;

  pdf.setFontSize(9);
  pdf.text('ONIN · PRODUCCIÓN / TALLER', m, 15);
  pdf.setFontSize(17);
  pdf.text('HOJAS DE CONFECCIÓN DE LONA', m, 25);
  pdf.setFontSize(10);
  pdf.text(`Pedido: ${orderCode}`, m, 34);
  pdf.text(`Referencia: ${reference || '—'}`, m, 40);
  pdf.setFillColor(219, 234, 254);
  pdf.setDrawColor(37, 99, 235);
  pdf.rect(w - m - 60, 32, 3, 3, 'FD');
  pdf.setFillColor(254, 242, 232);
  pdf.setDrawColor(217, 119, 6);
  pdf.rect(w - m - 60, 38, 3, 3, 'FD');
  pdf.setFontSize(7);
  pdf.setTextColor(70, 70, 70);
  pdf.text('Corte', w - m - 55, 34.5);
  pdf.text('Resto', w - m - 55, 40.5);
  pdf.line(m, 45, w - m, 45);
  let y = 54;

  sheets.forEach((sheet, index) => {
    if (index > 0 && y > h - 65) { pdf.addPage(); y = 20; }
    pdf.setFontSize(12);
    pdf.text(`${sheet.code} · Línea ${sheet.orderLineId}`, m, y);
    pdf.setFontSize(9);
    pdf.text(`${sheet.productCode || 'Lona'} · ${sheet.productName || ''}`, m, y + 6);
    pdf.text(`Cantidad: ${sheet.quantity} · Característica: ${sheet.characteristicName || 'Sin característica'}`, m, y + 12);
    pdf.text(`Necesidad: ${sheet.requiredDimensions.map((v, i) => `${formatNumber(v)} ${sheet.requiredDimensionUnits[i] || ''}`.trim()).join(' × ')}`, m, y + 18);
    pdf.text(`Estado: ${sheet.status === 'COMPLETED' ? 'Completada' : sheet.status === 'ISSUED' ? 'Emitida' : sheet.status}`, m, y + 24);
    y += 34;

    sheet.lines.forEach(line => {
      const rowHeight = Math.max(diagramHeight, 24) + 6;
      if (y + rowHeight > h - 15) { pdf.addPage(); y = 20; }
      pdf.setFontSize(8);
      pdf.setTextColor(40, 40, 40);
      pdf.text(pdf.splitTextToSize(`Material: ${line.warehouseCode || line.warehouseName || '—'} · Stock: ${line.sourceDimensions.map((v, i) => `${formatNumber(v)} ${line.sourceDimensionUnits[i] || ''}`.trim()).join(' × ')}`, textWidth), m, y);
      pdf.text(pdf.splitTextToSize(`Corte: ${line.cutDimensions.map((v, i) => `${formatNumber(v)} ${line.cutDimensionUnits[i] || ''}`.trim()).join(' × ')} · Resto: ${line.remainderDimensions.length ? line.remainderDimensions.map((v, i) => `${formatNumber(v)} ${line.remainderDimensionUnits[i] || ''}`.trim()).join(' × ') : 'Descarte'}`, textWidth), m, y + 5);
      drawLonaLineDiagram(pdf, line, w - m - diagramWidth, y - 4, diagramWidth, diagramHeight);
      y += rowHeight;
    });
    y += 8;
  });

  pdf.setFontSize(8);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Documento técnico generado por ONIN.', m, h - 10);
  pdf.save(`HOJAS-CONFECCION-${orderCode.replace(/\//g, '-')}.pdf`);
}
