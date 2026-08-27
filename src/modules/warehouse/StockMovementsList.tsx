import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { listWarehouses, type Warehouse } from "../../services/warehouse/warehouseRepository";
import { listStockMovements, type StockMovement } from "../../services/warehouse/stockRepository";
import "./stock.css";

export function StockMovementsList({ successMessage }: { successMessage?: string }) {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | undefined>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((companies) => setCompanyId(companies[0]?.id ?? null))
      .catch((value) => setError(value instanceof Error ? value.message : "No se pudo cargar la empresa."));
  }, []);

  useEffect(() => {
    if (companyId === null) return;
    Promise.all([
      listWarehouses(companyId, "", "active"),
      listStockMovements(companyId, { warehouseId, from, to }),
    ])
      .then(([warehouseRows, movements]) => {
        setWarehouses(warehouseRows);
        setRows(movements);
      })
      .catch((value) => setError(value instanceof Error ? value.message : "No se pudieron cargar los movimientos."))
      .finally(() => setLoading(false));
  }, [companyId, warehouseId]);

  async function load() {
    if (companyId === null) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listStockMovements(companyId, { warehouseId, from, to }));
    } catch (value) {
      setError(value instanceof Error ? value.message : "No se pudieron cargar los movimientos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">ALMACÉN / MOVIMIENTOS</div>
          <h1>Movimientos de stock</h1>
          <p>Entradas, salidas, ajustes y movimientos generados por traspasos.</p>
        </div>
        <a className="stock-button primary" href="/almacen/movimientos/nuevo">Nuevo movimiento</a>
      </div>
      {successMessage && <div className="inline-success">{successMessage}</div>}
      <div className="stock-toolbar">
        <select value={warehouseId ?? ""} onChange={(event) => setWarehouseId(event.target.value ? Number(event.target.value) : undefined)}>
          <option value="">Todos los almacenes</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
        </select>
        <label className="compact-field"><span>Desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="compact-field"><span>Hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button className="stock-button primary" onClick={() => void load()}>Filtrar</button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="stock-panel">
        <div className="stock-table-wrap">
          <table className="stock-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Almacén</th><th>Artículo</th><th>Característica</th><th>Dimensiones</th><th className="numeric">Cantidad</th><th>Referencia</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}>Cargando…</td></tr> : rows.length === 0 ? <tr><td colSpan={8} className="empty">No hay movimientos.</td></tr> : rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.movement_date).toLocaleString("es-ES")}</td>
                  <td><span className={`movement-badge ${row.movement_type?.direction === 1 ? "in" : "out"}`}>{row.movement_type?.direction === 1 ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />} {row.movement_type?.name}</span></td>
                  <td>{row.warehouse?.code}</td>
                  <td><strong>{row.product?.code}</strong><span className="secondary-line">{row.product?.commercial_description || "Sin descripción"}</span></td>
                  <td>{row.characteristic?.code || "—"}</td>
                  <td>{formatDimensions(row.dimension_values)}</td>
                  <td className="numeric">{row.quantity}</td>
                  <td>{row.reference || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function formatDimensions(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== "object") return "—";
  return Object.entries(value).map(([key, val]) => `${key}: ${val}`).join(" · ") || "—";
}
