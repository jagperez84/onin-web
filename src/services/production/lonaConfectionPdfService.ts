import jsPDF from 'jspdf';
import type { LonaConfectionComponent, LonaConfectionResult } from './lonaConfectionService';
import { getLonaCutGeometry } from './lonaConfectionService';

function formatNumber(value: number | null) {
  return value == null ? '—' : value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

function drawCutDiagram(pdf: jsPDF, component: LonaConfectionComponent, x: number, y: number, maxWidth: number, maxHeight: number) {
  const geometry = getLonaCutGeometry(component);
  if (!geometry) {
    pdf.setFontSize(8);
    pdf.text('No hay dos dimensiones resueltas para representar el corte.', x, y + 8);
    return y + 16;
  }

  const scale = Math.min(maxWidth / geometry.width, maxHeight / geometry.height);
  const width = geometry.width * scale;
  const height = geometry.height * scale;
  const rectX = x + (maxWidth - width) / 2;
  const rectY = y + 10 + (maxHeight - height) / 2;

  pdf.setDrawColor(90, 90, 90);
  pdf.setFillColor(245, 247, 250);
  pdf.rect(rectX, rectY, width, height, 'FD');
  pdf.setDrawColor(30, 30, 30);
  pdf.line(rectX, rectY - 4, rectX + width, rectY - 4);
  pdf.line(rectX - 4, rectY, rectX - 4, rectY + height);
  pdf.setFontSize(7);
  pdf.text(`${formatNumber(geometry.width)} ${component.lineUnit ?? ''}`.trim(), rectX + width / 2, rectY - 7, { align: 'center' });
  pdf.text(`${formatNumber(geometry.height)} ${component.outputUnit ?? ''}`.trim(), rectX - 7, rectY + height / 2, { angle: 90, align: 'center' });
  pdf.setFontSize(7);
  pdf.text(geometry.widthLabel, rectX + width / 2, rectY + height + 9, { align: 'center' });
  pdf.text(geometry.heightLabel, rectX + width + 9, rectY + height / 2, { angle: 90, align: 'center' });
  return Math.max(y + maxHeight + 12, rectY + height + 18);
}

export function downloadLonaConfectionPdf(result: LonaConfectionResult) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;

  pdf.setFontSize(9);
  pdf.text('ONIN · PRODUCCIÓN', margin, 15);
  pdf.setFontSize(8);
  pdf.text('DOCUMENTO TÉCNICO · CONFECCIÓN DE LONAS', pageWidth - margin, 15, { align: 'right' });
  pdf.setFontSize(18);
  pdf.text('INFORME DE CORTE DE LONA', margin, 25);
  pdf.setFontSize(10);
  pdf.text(`Pedido: ${result.reference ?? '—'}`, margin, 34);
  pdf.text(`Línea: ${result.orderLineNo}`, margin, 40);
  pdf.text(`OTD: ${result.otdCode ?? '—'}`, pageWidth - margin, 34, { align: 'right' });
  pdf.line(margin, 45, pageWidth - margin, 45);

  let y = 54;
  result.components.forEach((component, index) => {
    if (index > 0 && y > pageHeight - 85) {
      pdf.addPage();
      y = 20;
    }

    pdf.setFontSize(12);
    pdf.text(`${index + 1}. ${component.productCode}`, margin, y);
    pdf.setFontSize(9);
    pdf.text(component.productName, margin, y + 6);
    pdf.text(`Cantidad: ${formatNumber(component.quantity)} · Característica: ${component.characteristicName ?? '—'}`, margin, y + 12);
    pdf.text(`Línea: ${formatNumber(component.line)} ${component.lineUnit ?? ''} · Salida: ${formatNumber(component.output)} ${component.outputUnit ?? ''}`, margin, y + 18);

    y = drawCutDiagram(pdf, component, margin, y + 23, pageWidth - margin * 2, 65) + 12;
    pdf.setFontSize(8);
    pdf.text('Tipo de corte: pendiente de regla específica', margin, y);
    y += 9;
    pdf.setDrawColor(210, 210, 210);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;
  });

  pdf.setFontSize(8);
  pdf.text('Documento técnico generado por ONIN. La representación gráfica utiliza las dimensiones resueltas de la configuración del OTD.', margin, pageHeight - 10);
  pdf.save(`confeccion-lona-linea-${result.orderLineNo}.pdf`);
}
