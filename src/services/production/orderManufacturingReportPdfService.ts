import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkSheet } from './workSheetService';
import type { LonaConfectionWorkSheet } from './lonaConfectionService';
import type { ComponentConsumptionWorkSheet } from './componentConsumptionService';

const fmtDate = (value: string) => new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export type OrderManufacturingReportLine = {
  id: number;
  lineNo: number;
  description: string | null;
  otdCode: string | null;
};

function ensureSpace(pdf: jsPDF, y: number, needed = 20): number {
  if (y > 297 - needed) {
    pdf.addPage();
    return 20;
  }
  return y;
}

/** Cabecera de línea/OTD: agrupa todo lo que hace falta para fabricar esa línea. */
function lineHeader(pdf: jsPDF, y: number, line: OrderManufacturingReportLine, width: number): number {
  y = ensureSpace(pdf, y, 16);
  pdf.setFillColor(45, 55, 72);
  pdf.rect(14, y, width - 28, 9, 'F');
  pdf.setFontSize(10.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(`LÍNEA ${line.lineNo}${line.otdCode ? ` · OTD ${line.otdCode}` : ''}`, 18, y + 6);
  if (line.description) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(line.description, width - 18, y + 6, { align: 'right' });
  }
  return y + 13;
}

function subHeader(pdf: jsPDF, y: number, title: string, count: number): number {
  y = ensureSpace(pdf, y, 12);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(80, 90, 110);
  pdf.text(`${title} (${count})`, 18, y);
  return y + 5;
}

function notesBlock(pdf: jsPDF, y: number, notes: string[], width: number): number {
  const unique = [...new Set(notes.map(n => n.trim()).filter(Boolean))];
  if (!unique.length) return y;
  y = ensureSpace(pdf, y, 14);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(110, 110, 110);
  const wrapped = pdf.splitTextToSize(`Observaciones: ${unique.join(' · ')}`, width - 36) as string[];
  pdf.text(wrapped, 18, y);
  return y + wrapped.length * 3.6 + 5;
}

const TABLE_STYLES = { fontSize: 7.5, cellPadding: 2.2, textColor: [40, 40, 40] as [number, number, number], lineColor: [220, 220, 220] as [number, number, number], lineWidth: 0.1 };
const TABLE_HEAD_STYLES = { fillColor: [110, 120, 140] as [number, number, number], textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, fontSize: 7.5 };
const TABLE_ALT_ROW_STYLES = { fillColor: [248, 249, 250] as [number, number, number] };

/** Genera y descarga el informe de fabricación consolidado de un pedido completo, con toda la
 *  información necesaria para el taller: cortes de perfil, confecciones de lona y componentes,
 *  agrupados por línea/OTD (todo lo que hace falta para fabricar esa línea concreta, junto). */
export function downloadOrderManufacturingReportPdf(input: {
  orderCode: string;
  reference?: string | null;
  customerName?: string | null;
  lines: OrderManufacturingReportLine[];
  cutSheets: WorkSheet[];
  lonaSheets: LonaConfectionWorkSheet[];
  componentSheets: ComponentConsumptionWorkSheet[];
}) {
  const { orderCode, reference, customerName, lines, cutSheets, lonaSheets, componentSheets } = input;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();

  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text('ONIN · PRODUCCIÓN / TALLER', 14, 15);
  pdf.setFontSize(8);
  pdf.text('INFORME DE FABRICACIÓN DEL PEDIDO', width - 14, 15, { align: 'right' });

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(20, 20, 20);
  pdf.text(`INFORME DE FABRICACIÓN · ${orderCode}`, 14, 25);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(70, 70, 70);
  pdf.text(`Cliente: ${customerName || '—'}`, 14, 34);
  pdf.text(`Referencia: ${reference || '—'}`, 14, 40);
  pdf.text(`Fecha: ${fmtDate(new Date().toISOString())}`, width - 14, 34, { align: 'right' });
  const totalDocs = cutSheets.length + lonaSheets.length + componentSheets.length;
  pdf.text(`Documentos: ${totalDocs}`, width - 14, 40, { align: 'right' });

  pdf.setDrawColor(210, 210, 210);
  pdf.line(14, 45, width - 14, 45);

  let y = 53;

  const linesWithContent = lines
    .filter(
      line =>
        cutSheets.some(ws => ws.sales_order_line_id === line.id) ||
        lonaSheets.some(sheet => sheet.orderLineId === line.id) ||
        componentSheets.some(sheet => sheet.salesOrderLineId === line.id)
    )
    .sort((a, b) => a.lineNo - b.lineNo);

  if (!linesWithContent.length) {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(140, 140, 140);
    pdf.text('No hay documentos de fabricación generados para este pedido.', 14, y);
  }

  linesWithContent.forEach(line => {
    y = lineHeader(pdf, y, line, width);

    const lineCutSheets = cutSheets.filter(ws => ws.sales_order_line_id === line.id);
    if (lineCutSheets.length) {
      y = subHeader(pdf, y, 'Corte de perfil', lineCutSheets.length);
      const rows: any[] = [];
      lineCutSheets.forEach(ws => {
        const unit = ws.unit_symbol || ws.unit_code || 'cm';
        const label = `${ws.product_code || 'Perfil'}${ws.characteristic_name ? ` (${ws.characteristic_name})` : ''}`;
        if (ws.lines.length) {
          ws.lines.forEach(l => {
            rows.push([
              label,
              `${ws.quantity} ud. × ${ws.required_length} ${unit}`,
              l.warehouse_code || '—',
              l.source_dimension_values.join(' × '),
              l.cut_dimension_values.join(' × '),
              l.remainder_dimension_values.length ? l.remainder_dimension_values.join(' × ') : '—',
              ws.code,
            ]);
          });
        } else {
          rows.push([label, `${ws.quantity} ud. × ${ws.required_length} ${unit}`, '—', '—', '—', '—', ws.code]);
        }
      });
      autoTable(pdf, {
        startY: y,
        head: [['Perfil', 'Necesidad', 'Almacén', 'Pieza origen', 'Corte', 'Resto', 'Hoja']],
        body: rows,
        styles: TABLE_STYLES,
        headStyles: TABLE_HEAD_STYLES,
        alternateRowStyles: TABLE_ALT_ROW_STYLES,
        margin: { left: 18, right: 14 },
      });
      y = ((pdf as any).lastAutoTable?.finalY || y) + 3;
      y = notesBlock(
        pdf,
        y,
        lineCutSheets.flatMap(ws => [ws.notes, ws.selection_reason].filter((v): v is string => Boolean(v))),
        width
      );
    }

    const lineLonaSheets = lonaSheets.filter(sheet => sheet.orderLineId === line.id);
    if (lineLonaSheets.length) {
      y = subHeader(pdf, y, 'Confección de lona', lineLonaSheets.length);
      const rows: any[] = [];
      lineLonaSheets.forEach(sheet => {
        const unit = sheet.unitSymbol || '';
        const label = `${sheet.productCode || 'Lona'}${sheet.characteristicName ? ` (${sheet.characteristicName})` : ''}`;
        const need = sheet.requiredDimensions.length ? sheet.requiredDimensions.map((v, i) => `${v} ${sheet.requiredDimensionUnits[i] || unit}`).join(' × ') : '—';
        if (sheet.lines.length) {
          sheet.lines.forEach(l => {
            rows.push([
              label,
              `${sheet.quantity} ud. · ${need}`,
              l.warehouseCode || '—',
              l.sourceDimensions.join(' × '),
              l.cutDimensions.join(' × '),
              l.remainderDimensions.length ? l.remainderDimensions.join(' × ') : '—',
              sheet.code,
            ]);
          });
        } else {
          rows.push([label, `${sheet.quantity} ud. · ${need}`, '—', '—', '—', '—', sheet.code]);
        }
      });
      autoTable(pdf, {
        startY: y,
        head: [['Lona', 'Necesidad', 'Almacén', 'Pieza origen', 'Corte', 'Resto', 'Hoja']],
        body: rows,
        styles: TABLE_STYLES,
        headStyles: TABLE_HEAD_STYLES,
        alternateRowStyles: TABLE_ALT_ROW_STYLES,
        margin: { left: 18, right: 14 },
      });
      y = ((pdf as any).lastAutoTable?.finalY || y) + 3;
      y = notesBlock(
        pdf,
        y,
        lineLonaSheets.flatMap(sheet => [sheet.selectionReason].filter((v): v is string => Boolean(v))),
        width
      );
    }

    const lineComponentSheets = componentSheets.filter(sheet => sheet.salesOrderLineId === line.id);
    if (lineComponentSheets.length) {
      y = subHeader(pdf, y, 'Componentes', lineComponentSheets.length);
      const rows: any[] = [];
      lineComponentSheets.forEach(sheet => {
        sheet.lines.forEach(l => {
          rows.push([`${l.productCode || '—'}\n${l.productName || ''}`, l.warehouseCode || '—', `${l.quantity} ${l.unitCode || ''}`, sheet.code]);
        });
      });
      autoTable(pdf, {
        startY: y,
        head: [['Componente', 'Almacén', 'Cantidad', 'Hoja']],
        body: rows,
        styles: TABLE_STYLES,
        headStyles: TABLE_HEAD_STYLES,
        alternateRowStyles: TABLE_ALT_ROW_STYLES,
        margin: { left: 18, right: 14 },
      });
      y = ((pdf as any).lastAutoTable?.finalY || y) + 3;
      y = notesBlock(
        pdf,
        y,
        lineComponentSheets.flatMap(sheet => [sheet.notes].filter((v): v is string => Boolean(v))),
        width
      );
    }

    y += 6;
  });

  const pageCount = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text('Informe de fabricación generado por ONIN.', 14, 290);
    pdf.text(`Página ${i} de ${pageCount}`, width - 14, 290, { align: 'right' });
  }

  pdf.save(`INFORME-FABRICACION-${orderCode.replace(/\//g, '-')}.pdf`);
}
