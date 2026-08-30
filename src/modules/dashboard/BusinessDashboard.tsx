import { useEffect, useState } from "react";
import { ShoppingCart, Truck, Hammer, PackageX } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  getBusinessDashboardMetrics,
  type BusinessDashboardMetrics,
} from "../../services/core/dashboardRepository";
import "../quotations/quotation.css";

const money = (n: number) =>
  n.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

export function BusinessDashboard() {
  const [metrics, setMetrics] = useState<BusinessDashboardMetrics | null>(
    null,
  );
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getBusinessDashboardMetrics()
      .then((data) => {
        if (active) setMetrics(data);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron cargar los indicadores de operaciones.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return <div className="inline-error quotation-dashboard-error">{error}</div>;
  return (
    <section className="quotation-dashboard" aria-label="Indicadores de operaciones">
      <div className="quotation-dashboard-head">
        <div>
          <div className="eyebrow">OPERACIONES</div>
          <h2>Estado del negocio</h2>
          <p>Lo que está en curso ahora mismo en pedidos, montajes y almacén.</p>
        </div>
      </div>
      <div className="quotation-kpi-grid">
        <NavLink
          to="/ventas/pedidos"
          className="quotation-kpi quotation-kpi-link"
          aria-label="Ver listado de pedidos"
        >
          <div className="quotation-kpi-icon">
            <ShoppingCart size={18} />
          </div>
          <div>
            <span>Pedidos en curso</span>
            <strong>{metrics?.ordersInProgress ?? "—"}</strong>
            <small>
              {metrics ? `${money(metrics.ordersInProgressAmount)} en cartera` : "—"}
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
            <strong>{metrics?.ordersDueSoon ?? "—"}</strong>
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
            <strong>{metrics?.installationsScheduled ?? "—"}</strong>
            <small>Instalaciones pendientes de realizar.</small>
          </div>
        </NavLink>
        <NavLink
          to="/almacen/existencias"
          className="quotation-kpi quotation-kpi-link"
          aria-label="Ver existencias por debajo del mínimo"
        >
          <div className="quotation-kpi-icon">
            <PackageX size={18} />
          </div>
          <div>
            <span>Stock bajo mínimo</span>
            <strong>{metrics?.lowStockCount ?? "—"}</strong>
            <small>Referencias por debajo de su cantidad mínima.</small>
          </div>
        </NavLink>
      </div>
    </section>
  );
}
