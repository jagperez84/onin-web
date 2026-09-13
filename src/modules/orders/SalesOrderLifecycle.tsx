import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Receipt,
  Ruler,
  Scissors,
  Truck,
} from 'lucide-react';
import type { SalesOrder } from '../../services/sales/salesOrderService';
import type { WorkSheet } from '../../services/production/workSheetService';
import type { LonaConfectionWorkSheet } from '../../services/production/lonaConfectionQueryService';
import type { ComponentConsumptionWorkSheet } from '../../services/production/componentConsumptionService';
import type { Installation, InstallationIncident } from '../../services/production/installationService';
import type { Invoice } from '../../services/sales/invoiceService';

type StageState = 'done' | 'active' | 'pending' | 'unavailable';
type StageTone = 'warning' | 'danger';

type Stage = {
  key: string;
  label: string;
  detail: string;
  state: StageState;
  tone?: StageTone;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
};

type TimelineEvent = {
  key: string;
  date: string | null;
  /** Orden dentro del mismo día cuando la fecha no lleva hora (p. ej. issue_date de pedido/factura, que son solo fecha) — sin esto un evento sin hora se ordenaba antes que cualquier evento con hora del mismo día, aunque en el flujo real vaya después. */
  priority: number;
  title: string;
  detail?: string;
  docCode?: string;
};

const asLocalDate = (v: string) => new Date(v.includes('T') ? v : `${v}T00:00:00`);

const shortDate = (v: string | null | undefined) =>
  v ? asLocalDate(v).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : null;

const fullDateTime = (v: string | null | undefined) =>
  v
    ? asLocalDate(v).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

type LifecycleProps = {
  order: SalesOrder;
  cutSheets: WorkSheet[];
  lonaSheets: LonaConfectionWorkSheet[];
  componentSheets: ComponentConsumptionWorkSheet[];
  installations: Installation[];
  invoice: Invoice | null;
  /** Nº de líneas del pedido con algo aún pendiente de entregar (delivery_note). */
  pendingDeliveryLines?: number;
  totalDeliveryLines?: number;
};

function useLifecycleState({ order, cutSheets, lonaSheets, componentSheets, installations, invoice, pendingDeliveryLines, totalDeliveryLines }: LifecycleProps) {
  const status = order.status;
  const isCancelled = status === 'CANCELLED';
  const isManufactured = ['MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED'].includes(status);
  const hasStartedFabrication = cutSheets.length + lonaSheets.length + componentSheets.length > 0;

  const fabricationDates = [
    ...cutSheets.map((s) => s.issue_date),
    ...lonaSheets.map((s) => s.issueDate),
    ...componentSheets.map((s) => s.issueDate),
  ].filter(Boolean) as string[];
  const latestFabricationDate = fabricationDates.length
    ? fabricationDates.reduce((a, b) => (a > b ? a : b))
    : null;

  const fabricationState: StageState = isCancelled
    ? 'unavailable'
    : isManufactured
      ? 'done'
      : hasStartedFabrication
        ? 'active'
        : 'pending';

  const workingStatuses = ['SCHEDULED', 'IN_PROGRESS', 'BLOCKED'];
  const hasActiveInstallation = installations.some((i) => workingStatuses.includes(i.status));
  const allInstallationsCompleted = installations.length > 0 && installations.every((i) => i.status === 'COMPLETED');
  const blockedInstallation = installations.find((i) => i.status === 'BLOCKED') ?? null;
  const openIncident: { installation: Installation; incident: InstallationIncident } | null =
    installations
      .flatMap((i) => i.incidents.filter((inc) => inc.status === 'OPEN').map((incident) => ({ installation: i, incident })))
      .sort((a, b) => b.incident.reportedAt.localeCompare(a.incident.reportedAt))[0] ?? null;
  const latestInstallation =
    blockedInstallation ??
    installations.find((i) => i.status === 'IN_PROGRESS') ??
    installations.find((i) => i.status === 'SCHEDULED') ??
    installations[0] ??
    null;

  const installationState: StageState = isCancelled
    ? 'unavailable'
    : hasActiveInstallation
      ? 'active'
      : allInstallationsCompleted
        ? 'done'
        : isManufactured
          ? 'pending'
          : 'unavailable';
  const installationTone: StageTone | undefined = blockedInstallation ? 'danger' : openIncident ? 'warning' : undefined;

  const deliveryState: StageState = isCancelled
    ? 'unavailable'
    : !isManufactured
      ? 'unavailable'
      : totalDeliveryLines != null && pendingDeliveryLines === 0
        ? 'done'
        : totalDeliveryLines != null && pendingDeliveryLines != null && pendingDeliveryLines < totalDeliveryLines
          ? 'active'
          : 'pending';

  const invoicingState: StageState = isCancelled
    ? 'unavailable'
    : invoice
      ? 'done'
      : isManufactured
        ? 'pending'
        : 'unavailable';

  return {
    isCancelled,
    isManufactured,
    hasStartedFabrication,
    fabricationState,
    installationState,
    installationTone,
    blockedInstallation,
    openIncident,
    deliveryState,
    invoicingState,
    latestFabricationDate,
    latestInstallation,
  };
}

function buildTimelineEvents({ order, cutSheets, lonaSheets, componentSheets, installations, invoice }: LifecycleProps): TimelineEvent[] {
  return [
    { key: 'order-created', date: order.issue_date, priority: 0, title: 'Pedido creado a partir del presupuesto' },
    ...cutSheets.map((s) => ({
      key: `cut-${s.id}`,
      date: s.issue_date,
      priority: 10,
      title: 'Corte de perfil realizado',
      docCode: s.code,
    })),
    ...lonaSheets.map((s) => ({
      key: `lona-${s.id}`,
      date: s.issueDate,
      priority: 10,
      title: 'Confección de lona realizada',
      docCode: s.code,
    })),
    ...componentSheets.map((s) => ({
      key: `comp-${s.id}`,
      date: s.issueDate,
      priority: 10,
      title: 'Componentes descontados',
      docCode: s.code,
    })),
    ...installations.flatMap((installation) => [
      {
        key: `install-scheduled-${installation.id}`,
        date: installation.createdAt,
        priority: 20,
        title: 'Montaje programado',
        detail: [shortDate(installation.scheduledDate), installation.startTime].filter(Boolean).join(' · ') || undefined,
      },
      ...(installation.status === 'COMPLETED'
        ? [
            {
              key: `install-completed-${installation.id}`,
              date: installation.updatedAt,
              priority: 21,
              title: 'Montaje completado',
            },
          ]
        : []),
    ]),
    ...(invoice ? [{ key: `invoice-${invoice.id}`, date: invoice.issue_date, priority: 30, title: 'Factura emitida', docCode: invoice.code }] : []),
  ].sort((a, b) => {
    const dayA = (a.date || '').slice(0, 10);
    const dayB = (b.date || '').slice(0, 10);
    if (dayA !== dayB) return dayA.localeCompare(dayB);
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (a.date || '').localeCompare(b.date || '');
  });
}

export function SalesOrderLifecycleStepper({
  order,
  cutSheets,
  lonaSheets,
  componentSheets,
  installations,
  invoice,
  pendingDeliveryLines,
  totalDeliveryLines,
  onFabricate,
  onInstall,
  onInvoice,
  onViewProductionSheets,
}: LifecycleProps & {
  onFabricate: () => void;
  onInstall: () => void;
  onInvoice?: () => void;
  onViewProductionSheets: () => void;
}) {
  const {
    isCancelled,
    hasStartedFabrication,
    fabricationState,
    installationState,
    installationTone,
    blockedInstallation,
    openIncident,
    deliveryState,
    invoicingState,
    latestFabricationDate,
    latestInstallation,
  } = useLifecycleState({ order, cutSheets, lonaSheets, componentSheets, installations, invoice, pendingDeliveryLines, totalDeliveryLines });

  const stages: Stage[] = [
    ...(order.measurement_id
      ? [
          {
            key: 'measurement',
            label: 'Medición',
            detail: `#${order.measurement_id}`,
            state: 'done' as StageState,
            icon: <Ruler size={17} />,
            to: `/gestion/mediciones/${order.measurement_id}`,
          },
        ]
      : []),
    {
      key: 'quotation',
      label: 'Presupuesto',
      detail: order.quotation_code ? `Aceptado · ${order.quotation_code}` : 'Aceptado',
      state: 'done',
      icon: <FileText size={17} />,
      to: `/ventas/presupuestos/${order.quotation_id}`,
    },
    {
      key: 'order',
      label: 'Pedido',
      detail: `Creado · ${shortDate(order.issue_date)}`,
      state: 'done',
      icon: <Package size={17} />,
    },
    {
      key: 'fabrication',
      label: 'Fabricación',
      detail:
        fabricationState === 'done'
          ? `Completa${latestFabricationDate ? ` · ${shortDate(latestFabricationDate)}` : ''}`
          : fabricationState === 'active'
            ? 'En curso'
            : 'Pendiente',
      state: fabricationState,
      icon: <Scissors size={17} />,
      onClick: hasStartedFabrication ? onViewProductionSheets : undefined,
    },
    {
      key: 'installation',
      label: 'Montaje',
      detail: blockedInstallation
        ? 'Bloqueado por incidencia'
        : openIncident
          ? 'Incidencia abierta'
          : installationState === 'done'
            ? `Completado${installations.length > 1 ? ` · ${installations.length} visitas` : ''}`
            : installationState === 'active'
              ? `Programado · ${shortDate(latestInstallation?.scheduledDate) || '—'}${installations.length > 1 ? ` (${installations.length} visitas)` : ''}`
              : installationState === 'pending'
                ? 'Pendiente'
                : 'No disponible aún',
      state: installationState,
      tone: installationTone,
      icon: blockedInstallation || openIncident ? <AlertTriangle size={17} /> : <CalendarClock size={17} />,
      onClick: installationState === 'active' || installationState === 'done' || installationState === 'pending' ? onInstall : undefined,
    },
    {
      key: 'delivery',
      label: 'Entrega',
      detail:
        deliveryState === 'done'
          ? 'Completa'
          : deliveryState === 'active'
            ? `${(totalDeliveryLines ?? 0) - (pendingDeliveryLines ?? 0)} de ${totalDeliveryLines} líneas`
            : deliveryState === 'pending'
              ? 'Pendiente'
              : 'No disponible aún',
      state: deliveryState,
      icon: <Truck size={17} />,
    },
    {
      key: 'invoicing',
      label: 'Facturación',
      detail:
        invoicingState === 'done'
          ? `Emitida · ${invoice?.code}`
          : invoicingState === 'pending'
            ? 'Pendiente'
            : 'No disponible aún',
      state: invoicingState,
      icon: <Receipt size={17} />,
      to: invoice ? `/facturacion/facturas/${invoice.id}` : undefined,
      onClick: !invoice && invoicingState === 'pending' ? onInvoice : undefined,
    },
  ];

  const nextStep = isCancelled
    ? null
    : blockedInstallation
      ? {
          tone: 'danger' as const,
          title: 'Montaje bloqueado por una incidencia',
          detail: openIncident ? openIncident.incident.description : 'Resuelve la incidencia para poder continuar con el montaje.',
          actionLabel: 'Ver montaje',
          onAction: onInstall,
        }
      : openIncident
        ? {
            tone: 'warning' as const,
            title: 'Incidencia abierta en el montaje',
            detail: openIncident.incident.description,
            actionLabel: 'Ver montaje',
            onAction: onInstall,
          }
        : fabricationState !== 'done'
          ? {
              tone: 'info' as const,
              title: 'Próximo paso: fabricar el pedido',
              detail: 'Corte de perfil, confección de lona y componentes desde un mismo asistente.',
              actionLabel: 'Fabricar pedido',
              onAction: onFabricate,
            }
          : installationState === 'pending'
        ? {
            tone: 'info' as const,
            title: 'Próximo paso: programar el montaje',
            detail: 'El pedido está fabricado y listo para instalar.',
            actionLabel: 'Programar montaje',
            onAction: onInstall,
          }
        : installationState === 'active'
          ? {
              tone: 'info' as const,
              title: 'Montaje programado',
              detail: `${shortDate(latestInstallation?.scheduledDate) || '—'}${latestInstallation?.startTime ? `, ${latestInstallation.startTime}` : ''}${latestInstallation?.installers?.length ? ` · ${latestInstallation.installers.map((i) => i.name).join(', ')}` : ''}`,
              actionLabel: 'Ver montajes',
              onAction: onInstall,
            }
          : deliveryState === 'pending' || deliveryState === 'active'
            ? {
                tone: 'info' as const,
                title: 'Próximo paso: entregar lo pendiente',
                detail: 'Quedan artículos simples sin entregar en este pedido.',
                actionLabel: null,
                onAction: undefined,
              }
            : installationState === 'done' || deliveryState === 'done'
              ? invoice
                ? {
                    tone: 'success' as const,
                    title: 'Pedido entregado y facturado',
                    detail: `Factura ${invoice.code}`,
                    actionLabel: null,
                    onAction: undefined,
                  }
                : {
                    tone: 'info' as const,
                    title: 'Próximo paso: facturar el pedido',
                    detail: 'El pedido está entregado y listo para facturar.',
                    actionLabel: 'Generar factura',
                    onAction: onInvoice,
                  }
              : null;

  if (isCancelled) {
    return (
      <div className="lifecycle-callout danger">
        <div className="lifecycle-callout-icon">
          <Clock size={19} />
        </div>
        <div className="lifecycle-callout-body">
          <div className="lifecycle-callout-title">Pedido cancelado</div>
          <div className="lifecycle-callout-detail">El seguimiento de fabricación y montaje no aplica a este pedido.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="quotation-card lifecycle-card">
        <div className="lifecycle-stepper">
          {stages.map((stage, i) => {
            const content = (
              <>
                <div className={`lifecycle-stage-dot ${stage.state} ${stage.tone ?? ''}`}>
                  {stage.state === 'done' ? <CheckCircle2 size={18} /> : stage.icon}
                </div>
                <div className="lifecycle-stage-label">{stage.label}</div>
                <div className={`lifecycle-stage-detail ${stage.state} ${stage.tone ?? ''}`}>{stage.detail}</div>
              </>
            );
            return (
              <Fragment key={stage.key}>
                {stage.to ? (
                  <Link to={stage.to} className="lifecycle-stage clickable">
                    {content}
                  </Link>
                ) : stage.onClick ? (
                  <button type="button" className="lifecycle-stage clickable" onClick={stage.onClick}>
                    {content}
                  </button>
                ) : (
                  <div className="lifecycle-stage">{content}</div>
                )}
                {i < stages.length - 1 && (
                  <div className={`lifecycle-stage-connector ${stage.state === 'done' ? 'done' : ''}`} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {nextStep && (
        <div className={`lifecycle-callout ${nextStep.tone}`}>
          <div className="lifecycle-callout-icon">
            {nextStep.tone === 'success' ? (
              <CheckCircle2 size={19} />
            ) : nextStep.tone === 'danger' || nextStep.tone === 'warning' ? (
              <AlertTriangle size={19} />
            ) : (
              <Clock size={19} />
            )}
          </div>
          <div className="lifecycle-callout-body">
            <div className="lifecycle-callout-title">{nextStep.title}</div>
            <div className="lifecycle-callout-detail">{nextStep.detail}</div>
          </div>
          {nextStep.actionLabel && (
            <button type="button" className="primary-button" onClick={nextStep.onAction}>
              {nextStep.actionLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function SalesOrderLifecycleHistory(props: LifecycleProps) {
  const events = buildTimelineEvents(props);

  return (
    <section className="quotation-card lifecycle-history">
      <h2>Historial de la venta</h2>
      <div className="lifecycle-timeline">
        {events.map((ev, i) => (
          <div className="lifecycle-event" key={ev.key}>
            <div className="lifecycle-event-rail">
              <div className="lifecycle-event-dot">
                <CheckCircle2 size={13} />
              </div>
              {i < events.length - 1 && <div className="lifecycle-event-line" />}
            </div>
            <div className="lifecycle-event-body">
              <div className="lifecycle-event-title">{ev.title}</div>
              <div className="lifecycle-event-meta">
                {fullDateTime(ev.date)}
                {ev.detail ? ` · ${ev.detail}` : ''}
                {ev.docCode ? ` · ${ev.docCode}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
