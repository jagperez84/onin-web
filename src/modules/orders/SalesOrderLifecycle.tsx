import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
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
import type { Installation } from '../../services/production/installationService';

type StageState = 'done' | 'active' | 'pending' | 'unavailable';

type Stage = {
  key: string;
  label: string;
  detail: string;
  state: StageState;
  icon: ReactNode;
  to?: string;
  onClick?: () => void;
};

type TimelineEvent = {
  key: string;
  date: string | null;
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
  installation: Installation | null;
};

function useLifecycleState({ order, cutSheets, lonaSheets, componentSheets, installation }: LifecycleProps) {
  const status = order.status;
  const isCancelled = status === 'CANCELLED';
  const isManufactured = ['MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED'].includes(status);
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

  const installationState: StageState = isCancelled
    ? 'unavailable'
    : installation?.status === 'COMPLETED'
      ? 'done'
      : installation?.status === 'SCHEDULED'
        ? 'active'
        : isManufactured
          ? 'pending'
          : 'unavailable';

  return { isCancelled, isManufactured, hasStartedFabrication, fabricationState, installationState, latestFabricationDate };
}

function buildTimelineEvents({ order, cutSheets, lonaSheets, componentSheets, installation }: LifecycleProps): TimelineEvent[] {
  return [
    { key: 'order-created', date: order.issue_date, title: 'Pedido creado a partir del presupuesto' },
    ...cutSheets.map((s) => ({
      key: `cut-${s.id}`,
      date: s.issue_date,
      title: 'Corte de perfil realizado',
      docCode: s.code,
    })),
    ...lonaSheets.map((s) => ({
      key: `lona-${s.id}`,
      date: s.issueDate,
      title: 'Confección de lona realizada',
      docCode: s.code,
    })),
    ...componentSheets.map((s) => ({
      key: `comp-${s.id}`,
      date: s.issueDate,
      title: 'Componentes descontados',
      docCode: s.code,
    })),
    ...(installation
      ? [
          {
            key: 'install-scheduled',
            date: installation.createdAt,
            title: 'Montaje programado',
            detail: `${shortDate(installation.scheduledDate)}${installation.startTime ? ` · ${installation.startTime}` : ''}`,
          },
          ...(installation.status === 'COMPLETED'
            ? [
                {
                  key: 'install-completed',
                  date: installation.updatedAt,
                  title: 'Montaje completado',
                },
              ]
            : []),
        ]
      : []),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function SalesOrderLifecycleStepper({
  order,
  cutSheets,
  lonaSheets,
  componentSheets,
  installation,
  onFabricate,
  onInstall,
  onViewProductionSheets,
}: LifecycleProps & {
  onFabricate: () => void;
  onInstall: () => void;
  onViewProductionSheets: () => void;
}) {
  const { isCancelled, hasStartedFabrication, fabricationState, installationState, latestFabricationDate } =
    useLifecycleState({ order, cutSheets, lonaSheets, componentSheets, installation });

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
      detail:
        installationState === 'done'
          ? `Completado${installation?.updatedAt ? ` · ${shortDate(installation.updatedAt)}` : ''}`
          : installationState === 'active'
            ? `Programado · ${shortDate(installation?.scheduledDate) || '—'}`
            : installationState === 'pending'
              ? 'Pendiente'
              : 'No disponible aún',
      state: installationState,
      icon: <CalendarClock size={17} />,
      onClick: installationState === 'active' || installationState === 'done' ? onInstall : undefined,
    },
    {
      key: 'delivery',
      label: 'Entrega',
      detail: 'No disponible aún',
      state: 'unavailable',
      icon: <Truck size={17} />,
    },
    {
      key: 'invoicing',
      label: 'Facturación',
      detail: 'No disponible aún',
      state: 'unavailable',
      icon: <Receipt size={17} />,
    },
  ];

  const nextStep = isCancelled
    ? null
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
              detail: `${shortDate(installation?.scheduledDate) || '—'}${installation?.startTime ? `, ${installation.startTime}` : ''}${installation?.installers?.length ? ` · ${installation.installers.map((i) => i.name).join(', ')}` : ''}`,
              actionLabel: 'Ver montaje',
              onAction: onInstall,
            }
          : installationState === 'done'
            ? {
                tone: 'success' as const,
                title: 'Instalación completada',
                detail: 'Entrega y facturación aún no están disponibles en la aplicación.',
                actionLabel: null,
                onAction: undefined,
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
                <div className={`lifecycle-stage-dot ${stage.state}`}>
                  {stage.state === 'done' ? <CheckCircle2 size={18} /> : stage.icon}
                </div>
                <div className="lifecycle-stage-label">{stage.label}</div>
                <div className={`lifecycle-stage-detail ${stage.state}`}>{stage.detail}</div>
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
            {nextStep.tone === 'success' ? <CheckCircle2 size={19} /> : <Clock size={19} />}
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
