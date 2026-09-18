import { useEffect, useState } from "react";
import { FileText, CircleCheck, ShoppingCart, Truck, Hammer, PackageX, Bell, Ruler, Wallet, TrendingUp } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  getBusinessDashboardMetrics,
  type BusinessDashboardMetrics,
} from "../../services/core/dashboardRepository";
import {
  listAssignedMeasurements,
  type AssignedMeasurementRow,
} from "../../services/measurements/measurementRepository";
import {
  defaultDateRange,
  getPipelineReport,
  getSalesReport,
  type PipelineReport,
  type SalesReport,
} from "../../services/reports/reportsRepository";
import { DonutChart, MiniBarChart, type BarPoint, type DonutSegment } from "./DashboardCharts";
import "../quotations/quotation.css";
import "./dashboard.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const MONTH_SHORT = new Intl.DateTimeFormat("es-ES", { month: "short" });

export function HomeDashboard() {
  const { user } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineReport | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [business, setBusiness] = useState<BusinessDashboardMetrics | null>(null);
  const [assigned, setAssigned] = useState<AssignedMeasurementRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const range = defaultDateRange();
    Promise.all([
      getPipelineReport(range),
      getSalesReport(range),
      getBusinessDashboardMetrics(),
      user?.id ? listAssignedMeasurements(user.id) : Promise.resolve([]),
    ])
      .then(([p, s, b, a]) => {
        if (active) {
          setPipeline(p);
          setSales(s);
          setBusiness(b);
          setAssigned(a);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los indicadores del negocio.",
          );
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  if (error)
    return <div className="inline-error quotation-dashboard-error">{error}</div>;

  const lowStock = business?.lowStockCount ?? 0;

  const donutSegments: DonutSegment[] = pipeline
    ? [
        {
          key: "accepted",
          label: "Aceptados",
          value: pipeline.byStatus.find((s) => s.status === "ACCEPTED")?.count ?? 0,
          color: "var(--status-success-fg)",
        },
        {
          key: "open",
          label: "Abiertos",
          value:
            (pipeline.byStatus.find((s) => s.status === "DRAFT")?.count ?? 0) +
            (pipeline.byStatus.find((s) => s.status === "SENT")?.count ?? 0),
          color: "var(--status-info-fg)",
        },
        {
          key: "expired",
          label: "Caducados",
          value: pipeline.byStatus.find((s) => s.status === "EXPIRED")?.count ?? 0,
          color: "var(--status-warning-fg)",
        },
        {
          key: "rejected",
          label: "Rechazados",
          value:
            (pipeline.byStatus.find((s) => s.status === "REJECTED")?.count ?? 0) +
            (pipeline.byStatus.find((s) => s.status === "CANCELLED")?.count ?? 0),
          color: "var(--status-danger-fg)",
        },
      ]
    : [];

  const barPoints: BarPoint[] = sales
    ? sales.byMonth.map((m) => ({
        key: m.month,
        label: MONTH_SHORT.format(new Date(`${m.month}-01T00:00:00`)),
        value: m.amount,
      }))
    : [];

  return (
    <section className="quotation-dashboard" aria-label="Pulso del negocio">
      <div className="quotation-dashboard-head">
        <div>
          <div className="eyebrow">RESUMEN</div>
          <h2>Pulso del negocio</h2>
          <p>Cómo va todo ahora mismo, de presupuesto a montaje.</p>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <h3>Ventas</h3>
          <p>Presupuestos emitidos y su tasa de conversión en los últimos 12 meses.</p>
        </div>
        <div className="dashboard-section-body">
          <div className="chart-card">
            <h4>Presupuestos por estado</h4>
            <p className="chart-card-subtitle">Últimos 12 meses</p>
            <DonutChart segments={donutSegments} totalLabel="presupuestos" />
          </div>
          <div className="quotation-kpi-grid">
            <NavLink
              to="/ventas/presupuestos"
              className="quotation-kpi quotation-kpi-link"
              aria-label="Ver listado de presupuestos"
            >
              <div className="quotation-kpi-icon">
                <FileText size={18} />
              </div>
              <div>
                <span>Presupuestado · 12 meses</span>
                <strong>{pipeline ? money(pipeline.totalAmount) : "—"}</strong>
                <small>Importe total emitido en el último año.</small>
              </div>
            </NavLink>
            <NavLink
              to="/ventas/presupuestos"
              className="quotation-kpi quotation-kpi-link"
              aria-label="Ver presupuestos aceptados"
            >
              <div className="quotation-kpi-icon">
                <CircleCheck size={18} />
              </div>
              <div>
                <span>Presupuestos aceptados</span>
                <strong>{pipeline?.acceptedCount ?? "—"}</strong>
                <small>{pipeline ? `${pipeline.acceptanceRate}% de tasa de aceptación` : "—"}</small>
              </div>
            </NavLink>
          </div>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <h3>Producción y logística</h3>
          <p>Pedidos en marcha, entregas próximas y disponibilidad de material.</p>
        </div>
        <div className="quotation-kpi-grid">
          <NavLink
            to="/ventas/pedidos"
            className="quotation-kpi quotation-kpi-link"
            aria-label="Ver pedidos en curso"
          >
            <div className="quotation-kpi-icon">
              <ShoppingCart size={18} />
            </div>
            <div>
              <span>Pedidos en curso</span>
              <strong>{business?.ordersInProgress ?? "—"}</strong>
              <small>
                {business ? `${money(business.ordersInProgressAmount)} en cartera` : "—"}
              </small>
            </div>
          </NavLink>
          <NavLink
            to="/ventas/pedidos"
            className="quotation-kpi quotation-kpi-link"
            aria-label="Ver pedidos con entrega próxima"
          >
            <div className="quotation-kpi-icon">
              <Truck size={18} />
            </div>
            <div>
              <span>Entregas en 7 días</span>
              <strong>{business?.ordersDueSoon ?? "—"}</strong>
              <small>Pedidos con fecha de entrega solicitada próxima.</small>
            </div>
          </NavLink>
          <NavLink
            to="/gestion/montajes"
            className="quotation-kpi quotation-kpi-link"
            aria-label="Ver montajes programados"
          >
            <div className="quotation-kpi-icon">
              <Hammer size={18} />
            </div>
            <div>
              <span>Montajes programados</span>
              <strong>{business?.installationsScheduled ?? "—"}</strong>
              <small>Instalaciones pendientes de realizar.</small>
            </div>
          </NavLink>
          <NavLink
            to="/almacen/existencias"
            className={`quotation-kpi quotation-kpi-link ${lowStock > 0 ? "quotation-kpi-warning" : ""}`}
            aria-label="Ver existencias por debajo del mínimo"
          >
            <div className="quotation-kpi-icon">
              <PackageX size={18} />
            </div>
            <div>
              <span>Stock bajo mínimo</span>
              <strong>{business?.lowStockCount ?? "—"}</strong>
              <small>Referencias por debajo de su cantidad mínima.</small>
            </div>
          </NavLink>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <h3>Gestión de campo</h3>
          <p>Mediciones por realizar, empezando por las tuyas.</p>
        </div>
        <div className="quotation-kpi-grid">
          <NavLink
            to="/gestion/mediciones"
            className={`quotation-kpi quotation-kpi-link ${assigned.length > 0 ? "quotation-kpi-warning" : ""}`}
            aria-label="Ver mis mediciones asignadas"
          >
            <div className="quotation-kpi-icon">
              <Bell size={18} />
            </div>
            <div>
              <span>Mediciones asignadas a mí</span>
              <strong>{assigned.length}</strong>
              <small>
                {assigned[0]
                  ? `Próxima: ${assigned[0].code}${assigned[0].site_city ? ` · ${assigned[0].site_city}` : ""}`
                  : "Sin pendientes de revisión."}
              </small>
            </div>
          </NavLink>
          <NavLink
            to="/gestion/mediciones"
            className="quotation-kpi quotation-kpi-link"
            aria-label="Ver mediciones pendientes"
          >
            <div className="quotation-kpi-icon">
              <Ruler size={18} />
            </div>
            <div>
              <span>Mediciones pendientes</span>
              <strong>{business?.measurementsPending ?? "—"}</strong>
              <small>Planificadas, asignadas o en curso.</small>
            </div>
          </NavLink>
        </div>
      </div>

      <div className="dashboard-section">
        <div className="dashboard-section-head">
          <h3>Facturación y cobros</h3>
          <p>Lo facturado mes a mes y lo que queda pendiente de cobrar.</p>
        </div>
        <div className="dashboard-section-body">
          <div className="chart-card">
            <h4>Facturación por mes</h4>
            <p className="chart-card-subtitle">Últimos 12 meses</p>
            <MiniBarChart points={barPoints} />
          </div>
          <div className="quotation-kpi-grid">
            <NavLink
              to="/facturacion/facturas"
              className="quotation-kpi quotation-kpi-link"
              aria-label="Ver facturas"
            >
              <div className="quotation-kpi-icon">
                <TrendingUp size={18} />
              </div>
              <div>
                <span>Facturado · 12 meses</span>
                <strong>{sales ? money(sales.totalAmount) : "—"}</strong>
                <small>{sales ? `${sales.invoiceCount} facturas emitidas` : "—"}</small>
              </div>
            </NavLink>
            <NavLink
              to="/facturacion/cobros"
              className={`quotation-kpi quotation-kpi-link ${(business?.collectionsOverdueCount ?? 0) > 0 ? "quotation-kpi-warning" : ""}`}
              aria-label="Ver cobros vencidos"
            >
              <div className="quotation-kpi-icon">
                <Wallet size={18} />
              </div>
              <div>
                <span>Cobros vencidos</span>
                <strong>{business?.collectionsOverdueCount ?? "—"}</strong>
                <small>
                  {business ? `${money(business.collectionsOverdueAmount)} pendientes de cobro` : "—"}
                </small>
              </div>
            </NavLink>
          </div>
        </div>
      </div>
    </section>
  );
}
