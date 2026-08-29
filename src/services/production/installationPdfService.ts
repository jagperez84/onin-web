import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SalesOrder } from '../sales/salesOrderService';
import type { Installation } from './installationService';

const fmtDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-ES') : '—');

/** Genera y descarga la hoja de montaje: el documento que se entrega al equipo de instalación. */
export function downloadInstallationSheetPdf(order: SalesOrder, installation: Installation) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const o = order as any;

  pdf.setFontSize(9);
  pdf.setTextColor(80, 80, 80);
  pdf.text('ONIN · MONTAJE / INSTALACIÓN', 14, 15);
  pdf.setFontSize(8);
  pdf.text('DOCUMENTO PARA EL EQUIPO DE INSTALACIÓN', width - 14, 15, { align: 'right' });

  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(20, 20, 20);
  pdf.text(`HOJA DE MONTAJE · ${order.code}`, 14, 25);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(70, 70, 70);
  pdf.text(`Cliente: ${order.customer_name || '—'}`, 14, 34);
  pdf.text(`Contacto: ${order.contact_name || '—'}${order.contact_phone ? ` · ${order.contact_phone}` : ''}`, 14, 40);
  const address = [o.installation_address_street, o.installation_address_city, o.installation_address_postal_code, o.installation_address_region].filter(Boolean).join(', ');
  pdf.text(`Dirección de instalación: ${address || '—'}`, 14, 46);

  pdf.text(`Fecha: ${fmtDate(installation.scheduledDate)}`, width - 14, 34, { align: 'right' });
  pdf.text(`Hora: ${installation.startTime || '—'}`, width - 14, 40, { align: 'right' });
  pdf.text(`Tipo: ${installation.installationTypeDescription || '—'}`, width - 14, 46, { align: 'right' });

  pdf.setDrawColor(210, 210, 210);
  pdf.line(14, 51, width - 14, 51);

  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(40, 40, 40);
  pdf.text('Equipo asignado:', 14, 58);
  pdf.setFont('helvetica', 'normal');
  pdf.text(installation.installers.length ? installation.installers.map(i => i.name).join(', ') : 'Sin asignar', 45, 58);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Duración estimada:', width - 75, 58);
  pdf.setFont('helvetica', 'normal');
  pdf.text(installation.estimatedDuration || '—', width - 14, 58, { align: 'right' });

  let y = 68;
  const rows = (order.lines || []).map((l: any) => [String(l.line_no), l.description || '—', String(l.quantity)]);
  autoTable(pdf, {
    startY: y,
    head: [['Línea', 'Artículo / descripción', 'Cantidad']],
    body: rows,
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [40, 40, 40], lineColor: [220, 220, 220], lineWidth: 0.1 },
    headStyles: { fillColor: [45, 55, 72], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    margin: { left: 14, right: 14 },
  });
  y = ((pdf as any).lastAutoTable?.finalY || y) + 10;

  if (y > 250) {
    pdf.addPage();
    y = 20;
  }
  pdf.setFillColor(245, 247, 250);
  pdf.roundedRect(14, y, width - 28, 30, 2, 2, 'F');
  pdf.setDrawColor(210, 220, 230);
  pdf.roundedRect(14, y, width - 28, 30, 2, 2, 'D');
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(45, 55, 72);
  pdf.text('Observaciones:', 18, y + 6);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(70, 70, 70);
  pdf.text(pdf.splitTextToSize(installation.notes || 'Sin observaciones.', width - 36), 18, y + 12);

  y += 40;
  if (y < 265) {
    pdf.setDrawColor(200, 200, 200);
    pdf.line(14, y + 15, 90, y + 15);
    pdf.line(width - 90, y + 15, width - 14, y + 15);
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Firma del equipo de instalación', 14, y + 20);
    pdf.text('Firma / Vº Bº del cliente', width - 90, y + 20);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  pdf.text('Hoja de montaje generada por ONIN.', 14, 290);

  pdf.save(`HOJA-MONTAJE-${order.code.replace(/\//g, '-')}.pdf`);
}
