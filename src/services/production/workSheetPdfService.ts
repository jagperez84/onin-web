import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkSheet } from './workSheetService';

const fmtDate = (value: string) =>
  new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Genera y descarga un único informe consolidado de corte técnico que agrupa todos
 * los perfiles y piezas de la línea de pedido o lote de producción.
 */
export function downloadCutReportPdf(workSheets: WorkSheet[], title?: string) {
  if (!workSheets || workSheets.length === 0) return;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();

  const primarySheet = workSheets[0];
  const orderCode = primarySheet.sales_order_code || 'PED';
  const lineNo = primarySheet.sales_order_line_no ?? '';
  const ref = primarySheet.reference || title || '—';
  const totalProfiles = workSheets.length;
  const totalUnits = workSheets.reduce((sum, ws) => sum + (ws.quantity || 0), 0);

  // Encabezado institucional de taller
  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text('ONIN · PRODUCCIÓN / TALLER', 14, 15);
  pdf.setFontSize(8);
  pdf.text('DOCUMENTO TÉCNICO · INFORME UNIFICADO DE CORTE', width - 14, 15, { align: 'right' });

  pdf.setFontSize(16);
  pdf.setTextColor(20, 20, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('INFORME Y HOJA DE CORTE DE LÍNEA', 14, 24);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  const codesText = workSheets.map(w => w.code).join(', ');
  pdf.text(`Doc: ${codesText}`, width - 14, 24, { align: 'right' });

  pdf.setDrawColor(210, 210, 210);
  pdf.line(14, 28, width - 14, 28);

  // Metadatos consolidados
  pdf.setFontSize(9.5);
  pdf.setTextColor(40, 40, 40);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Pedido:', 14, 35);
  pdf.setFont('helvetica', 'normal');
  pdf.text(orderCode, 32, 35);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Línea:', 75, 35);
  pdf.setFont('helvetica', 'normal');
  pdf.text(String(lineNo || '—'), 88, 35);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Fecha:', width - 65, 35);
  pdf.setFont('helvetica', 'normal');
  pdf.text(fmtDate(primarySheet.issue_date), width - 14, 35, { align: 'right' });

  pdf.setFont('helvetica', 'bold');
  pdf.text('Referencia:', 14, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.text(ref, 35, 42);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Resumen:', width - 75, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${totalProfiles} perfil${totalProfiles > 1 ? 'es' : ''} (${totalUnits} ud. en total)`, width - 14, 42, { align: 'right' });

  pdf.setDrawColor(230, 230, 230);
  pdf.line(14, 47, width - 14, 47);

  // Tabla consolidada de todos los perfiles y cortes
  const tableRows: any[] = [];
  let rowSeq = 1;

  workSheets.forEach((ws) => {
    const unit = ws.unit_symbol || ws.unit_code || 'cm';
    const dims = (values: number[]) =>
      values.length ? `${values.join(' × ')} ${unit}` : '—';

    const charDesc = ws.characteristic_name || ws.characteristic_code;
    const profileLabel = `${ws.product_code || 'Perfil'}${charDesc ? ` (${charDesc})` : ''}\n${ws.product_name || ''}`;
    const needLabel = `${ws.quantity} ud. × ${ws.required_length} ${unit}`;

    if (ws.lines && ws.lines.length > 0) {
      ws.lines.forEach((line) => {
        tableRows.push([
          String(rowSeq++),
          profileLabel,
          needLabel,
          line.warehouse_code || line.warehouse_name || '—',
          dims(line.source_dimension_values),
          dims(line.cut_dimension_values),
          String(line.quantity),
          line.remainder_dimension_values.length ? dims(line.remainder_dimension_values) : 'Descarte',
          line.selection_reason || ws.selection_reason || (ws.selection_mode === 'AUTOMATIC' ? 'Optimización automática' : 'Selección manual')
        ]);
      });
    } else {
      tableRows.push([
        String(rowSeq++),
        profileLabel,
        needLabel,
        '—',
        '—',
        `${ws.required_length} ${unit}`,
        String(ws.quantity),
        '—',
        ws.selection_reason || (ws.selection_mode === 'AUTOMATIC' ? 'Optimización automática' : 'Selección manual')
      ]);
    }
  });

  autoTable(pdf, {
    startY: 52,
    head: [['#', 'Perfil / Característica', 'Necesidad', 'Almacén', 'Pieza Stock', 'Corte', 'Ud.', 'Resto', 'Criterio']],
    body: tableRows,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [40, 40, 40],
      lineColor: [220, 220, 220],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [45, 55, 72],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250]
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 10, halign: 'center' },
      7: { cellWidth: 20 },
      8: { cellWidth: 26 }
    },
    margin: { left: 14, right: 14 }
  });

  const finalY = (pdf as any).lastAutoTable?.finalY || 140;

  // Cuadro de notas e instrucciones de taller
  const boxY = Math.min(finalY + 8, 220);
  pdf.setFillColor(245, 247, 250);
  pdf.roundedRect(14, boxY, width - 28, 26, 2, 2, 'F');
  pdf.setDrawColor(210, 220, 230);
  pdf.roundedRect(14, boxY, width - 28, 26, 2, 2, 'D');

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(45, 55, 72);
  pdf.text('Instrucciones para taller y control de remanentes:', 18, boxY + 6);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(70, 70, 70);
  const notesText = primarySheet.notes ||
    'Realizar los cortes indicados respetando las barras de stock asignadas. Identificar y reetiquetar los restos aprovechables generados para su reincorporación al almacén.';
  pdf.text(pdf.splitTextToSize(notesText, width - 36), 18, boxY + 12);

  // Zona de firmas / validación técnica
  const signY = boxY + 33;
  if (signY < 270) {
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, signY + 10, 75, signY + 10);
    pdf.line(width - 75, signY + 10, width - 14, signY + 10);

    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Operario de taller / Firma', 14, signY + 15);
    pdf.text('Control de Calidad / Fecha', width - 75, signY + 15);
  }

  // Pie de página
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text('Documento técnico de producción consolidado generado por ONIN.', 14, 286);
  pdf.text('Página 1 de 1', width - 14, 286, { align: 'right' });

  const safeOrderCode = orderCode.replace(/\//g, '-');
  const filename = totalProfiles > 1 || lineNo
    ? `INFORME-CORTE-${safeOrderCode}-L${lineNo || '1'}.pdf`
    : `HOJA-CORTE-${primarySheet.code.replace(/\//g, '-')}.pdf`;

  pdf.save(filename);
}

/** Descarga el informe unificado para una hoja individual */
export function downloadWorkSheetPdf(workSheet: WorkSheet) {
  downloadCutReportPdf([workSheet]);
}

/** Descarga el informe consolidado unificado para un lote o múltiples hojas de corte */
export function downloadBatchWorkSheetsPdf(workSheets: WorkSheet[], title?: string) {
  downloadCutReportPdf(workSheets, title);
}
