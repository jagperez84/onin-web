import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CollapsibleSection } from "../../components/ui/CollapsibleSection";
import { ColorSwatch } from "../../components/ui/ColorSwatch";
import {
  listStockBalancesForProduct,
  type StockBalance,
} from "../../services/warehouse/stockRepository";
import "../warehouse/stock.css";

type Props = {
  productId: number;
  refreshKey?: number;
  onError: (message: string) => void;
};

export function ProductStockPanel({ productId, refreshKey = 0, onError }: Props) {
  const [rows, setRows] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listStockBalancesForProduct(productId)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) =>
        onError(e instanceof Error ? e.message : "No se pudieron cargar las existencias."),
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId, refreshKey]);

  const totals = rows.reduce(
    (a, r) => ({
      quantity: a.quantity + Number(r.quantity || 0),
      reserved: a.reserved + Number(r.reserved_quantity || 0),
    }),
    { quantity: 0, reserved: 0 },
  );

  return (
    <CollapsibleSection
      id="producto-existencias"
      title="Existencias"
      description="Stock físico, reservado y disponible de este artículo, por almacén, característica y color."
      headerExtra={
        <Link to="/almacen/existencias" className="secondary-button compact">
          Ver en Almacén
        </Link>
      }
    >
      <div className="commercial-summary">
        <div>
          <span>Físico</span>
          <strong>{totals.quantity}</strong>
        </div>
        <div>
          <span>Reservado</span>
          <strong>{totals.reserved}</strong>
        </div>
        <div>
          <span>Disponible</span>
          <strong>{totals.quantity - totals.reserved}</strong>
        </div>
      </div>
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              <th>Almacén</th>
              <th>Característica</th>
              <th>Color</th>
              <th className="numeric">Físico</th>
              <th className="numeric">Reservado</th>
              <th className="numeric">Disponible</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">No hay existencias registradas para este artículo.</div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const available = Number(r.quantity) - Number(r.reserved_quantity);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.warehouse?.code}
                      <span className="secondary-line">{r.warehouse?.name}</span>
                    </td>
                    <td>
                      {r.characteristic?.code || "General"}
                      {r.characteristic?.description && (
                        <span className="secondary-line">{r.characteristic.description}</span>
                      )}
                    </td>
                    <td style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {r.color?.name || r.color?.code || "—"}
                      {(r.color?.name || r.color?.code) && (
                        <ColorSwatch hex={r.color?.hex} code={r.color?.code} name={r.color?.name} size="xs" />
                      )}
                    </td>
                    <td className="numeric">{r.quantity}</td>
                    <td className="numeric">{r.reserved_quantity}</td>
                    <td className={`numeric ${available < 0 ? "negative" : ""}`}>{available}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
