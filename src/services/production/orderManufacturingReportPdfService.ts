import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkSheet } from './workSheetService';
import type { LonaConfectionWorkSheet } from './lonaConfectionService';
import type { ComponentConsumptionWorkSheet } from './componentConsumptionService';

const fmtDate = (value: string) => new Date(value).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

function sectionTitle(pdf: jsPDF, y: number, title: string, count: number, width: number): number {
  if (y > 260) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFillColor(45, 55, 72);
  pdf.rect(14, y, width - 28, 8, 'F');
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(title, 18, y + 5.5);
  pdf.setFontSize(8.5);
  pdf.text(`${count} documento${count === 1 ? '' : 's'}`, width - 18, y + 5.5, { align: 'right' });
  return y + 12;
}

function emptySection(pdf: jsPDF, y: number, message: string): number {
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'italic');
  pdf.setTextColor(140, 140, 140);
  pdf.text(message, 18, y);
  return y + 10;
}

/** Genera y descarga el informe de fabricación consolidado de un pedido completo, con toda la
 *  información necesaria para el taller: cortes de perfil, confecciones de lona y componentes. */
export function downloadOrderManufacturingReportPdf(input: {
  orderCode: string;
  reference?: string | null;
  customerName?: string | null;
  cutSheets: WorkSheet[];
  lonaSheets: LonaConfectionWorkSheet[];
  componentSheets: ComponentConsumptionWorkSheet[];
}) {
  const { orderCode, reference, customerName, cutSheets, lonaSheets, componentSheets } = input;
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

  // Cortes de perfil
  y = sectionTitle(pdf, y, 'CORTE DE PERFILES', cutSheets.length, width);
  if (cutSheets.length === 0) {
    y = emptySection(pdf, y, 'No hay perfiles que cortar en este pedido.');
  } else {
    const rows: any[] = [];
    cutSheets.forEach(ws => {
      const unit = ws.unit_symbol || ws.unit_code || 'cm';
      const label = `${ws.product_code || 'Perfil'}${ws.characteristic_name ? ` (${ws.characteristic_name})` : ''}`;
      if (ws.lines.length) {
        ws.lines.forEach(line => {
          rows.push([
            String(ws.sales_order_line_no ?? '—'),
            label,
            `${ws.quantity} ud. × ${ws.required_length} ${unit}`,
            line.warehouse_code || '—',
            line.source_dimension_values.join(' × '),
            line.cut_dimension_values.join(' × '),
            line.remainder_dimension_values.length ? line.remainder_dimension_values.join(' × ') : '—',
            ws.code,
          ]);
        });
      } else {
        rows.push([String(ws.sales_order_line_no ?? '—'), label, `${ws.quantity} ud. × ${ws.required_length} ${unit}`, '—', '—', '—', '—', ws.code]);
      }
    });
    autoTable(pdf, {
      startY: y,
      head: [['Línea', 'Perfil', 'Necesidad', 'Almacén', 'Pieza origen', 'Corte', 'Resto', 'Hoja']],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: { fillColor: [80, 90, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    });
    y = ((pdf as any).lastAutoTable?.finalY || y) + 12;
  }

  // Confección de lona
  y = sectionTitle(pdf, y, 'CONFECCIÓN DE LONA', lonaSheets.length, width);
  if (lonaSheets.length === 0) {
    y = emptySection(pdf, y, 'No hay lonas que confeccionar en este pedido.');
  } else {
    const rows: any[] = [];
    lonaSheets.forEach(sheet => {
      const unit = sheet.unitSymbol || '';
      const label = `${sheet.productCode || 'Lona'}${sheet.characteristicName ? ` (${sheet.characteristicName})` : ''}`;
      const need = sheet.requiredDimensions.length ? sheet.requiredDimensions.map((v, i) => `${v} ${sheet.requiredDimensionUnits[i] || unit}`).join(' × ') : '—';
      if (sheet.lines.length) {
        sheet.lines.forEach(line => {
          rows.push([
            String(sheet.orderLineId),
            label,
            `${sheet.quantity} ud. · ${need}`,
            line.warehouseCode || '—',
            line.sourceDimensions.join(' × '),
            line.cutDimensions.join(' × '),
            line.remainderDimensions.length ? line.remainderDimensions.join(' × ') : '—',
            sheet.code,
          ]);
        });
      } else {
        rows.push([String(sheet.orderLineId), label, `${sheet.quantity} ud. · ${need}`, '—', '—', '—', '—', sheet.code]);
      }
    });
    autoTable(pdf, {
      startY: y,
      head: [['Línea', 'Lona', 'Necesidad', 'Almacén', 'Pieza origen', 'Corte', 'Resto', 'Hoja']],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: { fillColor: [80, 90, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    });
    y = ((pdf as any).lastAutoTable?.finalY || y) + 12;
  }

  // Componentes
  y = sectionTitle(pdf, y, 'COMPONENTES (SOPORTES, MOTORES, TORNILLERÍA…)', componentSheets.length, width);
  if (componentSheets.length === 0) {
    y = emptySection(pdf, y, 'No hay componentes por unidades que descontar en este pedido.');
  } else {
    const rows: any[] = [];
    componentSheets.forEach(sheet => {
      sheet.lines.forEach(line => {
        rows.push([
          String(sheet.salesOrderLineNo ?? '—'),
          `${line.productCode || '—'}\n${line.productName || ''}`,
          line.warehouseCode || '—',
          `${line.quantity} ${line.unitCode || ''}`,
          sheet.code,
        ]);
      });
    });
    autoTable(pdf, {
      startY: y,
      head: [['Línea', 'Componente', 'Almacén', 'Cantidad', 'Hoja']],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
      headStyles: { fillColor: [80, 90, 110], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 14, right: 14 },
    });
  }

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
