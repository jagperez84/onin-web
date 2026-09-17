import { useEffect, useState } from "react";
import { FileText, CircleCheck, ShoppingCart, Truck, Hammer, PackageX, Bell, Ruler, Wallet } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  getQuotationDashboardMetrics,
  type QuotationDashboardMetrics,
} from "../../services/sales/quotationDashboardRepository";
import {
  getBusinessDashboardMetrics,
  type BusinessDashboardMetrics,
} from "../../services/core/dashboardRepository";
import {
  listAssignedMeasurements,
  type AssignedMeasurementRow,
} from "../../services/measurements/measurementRepository";
import "../quotations/quotation.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

export function HomeDashboard() {
  const { user } = useAuth();
  const [quotation, setQuotation] = useState<QuotationDashboardMetrics | null>(null);
  const [business, setBusiness] = useState<BusinessDashboardMetrics | null>(null);
  const [assigned, setAssigned] = useState<AssignedMeasurementRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getQuotationDashboardMetrics(),
      getBusinessDashboardMetrics(),
      user?.id ? listAssignedMeasurements(user.id) : Promise.resolve([]),
    ])
      .then(([q, b, a]) => {
        if (active) {
          setQuotation(q);
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

  const acceptance =
    quotation && quotation.total
      ? Math.round((quotation.accepted / quotation.total) * 100)
      : 0;
  const lowStock = business?.lowStockCount ?? 0;

  return (
    <section className="quotation-dashboard" aria-label="Pulso del negocio">
      <div className="quotation-dashboard-head">
        <div>
          <div className="eyebrow">RESUMEN</div>
          <h2>Pulso del negocio</h2>
          <p>Cómo va todo ahora mismo, de presupuesto a montaje.</p>
        </div>
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
            <strong>{quotation ? money(quotation.lastYearAmount) : "—"}</strong>
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
            <strong>{quotation?.accepted ?? "—"}</strong>
            <small>{quotation ? `${acceptance}% de tasa de aceptación` : "—"}</small>
          </div>
        </NavLink>
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
    </section>
  );
}
