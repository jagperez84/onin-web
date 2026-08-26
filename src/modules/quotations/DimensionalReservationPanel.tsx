import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, RotateCcw } from "lucide-react";
import {
  reserveDimensionalStock,
  releaseDimensionalStockReservation,
  listReservationAllocations,
  type DimensionalReservation,
} from "../../services/warehouse/dimensionalStockService";
import { supabase } from "../../lib/supabase";
import "./dimensional-reservation.css";

type Props = {
  companyId: number;
  warehouseId: number | null;
  quotationId: number;
  lineId: number;
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  characteristicId: number | null;
  characteristicLabel: string | null;
  dimensionValues: number[];
  recuttable: boolean;
};
export function DimensionalReservationPanel({
  companyId,
  warehouseId,
  quotationId,
  lineId,
  productId,
  productCode,
  quantity,
  characteristicId,
  characteristicLabel,
  dimensionValues,
  recuttable,
}: Props) {
  const [reservation, setReservation] = useState<DimensionalReservation | null>(
    null,
  );
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reference = `QUOTATION:${quotationId}:LINE:${lineId}`;
  useEffect(() => {
    let active = true;
    (async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("stock_reservation")
        .select(
          "id,status,product_id,characteristic_id,quantity,dimension_values",
        )
        .eq("reference", reference)
        .in("status", ["ACTIVE", "CONSUMED"])
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setError(error.message);
        return;
      }
      if (data) {
        const r = {
          id: Number(data.id),
          status: data.status,
          productId: Number(data.product_id),
          characteristicId:
            data.characteristic_id == null
              ? null
              : Number(data.characteristic_id),
          quantity: Number(data.quantity),
          dimensionValues: Array.isArray(data.dimension_values)
            ? data.dimension_values.map(Number)
            : [],
        };
        setReservation(r);
        const a = await listReservationAllocations(r.id);
        if (active) setAllocations(a);
      }
    })();
    return () => {
      active = false;
    };
  }, [reference]);
  if (!dimensionValues.length || !recuttable) return null;
  const dimensionText = dimensionValues
    .map((v) => Number(v).toLocaleString("es-ES"))
    .join(" × ");
  async function reserve() {
    if (!warehouseId) {
      setError("El presupuesto no tiene almacén asignado.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const id = await reserveDimensionalStock({
        companyId,
        warehouseId,
        productId,
        quantity,
        characteristicId,
        dimensionValues,
        reference,
        notes: `Reserva desde presupuesto ${quotationId}, línea ${lineId}`,
      });
      const r = {
        id,
        status: "ACTIVE" as const,
        productId,
        characteristicId,
        quantity,
        dimensionValues,
      };
      setReservation(r);
      setAllocations(await listReservationAllocations(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reservar stock.");
    } finally {
      setLoading(false);
    }
  }
  async function release() {
    if (!reservation) return;
    setLoading(true);
    setError("");
    try {
      await releaseDimensionalStockReservation(reservation.id);
      setReservation(null);
      setAllocations([]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo liberar la reserva.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="dimensional-reservation-panel">
      <div className="dimensional-reservation-main">
        <div className="dimensional-reservation-icon">
          <LockKeyhole size={16} />
        </div>
        <div>
          <strong>Stock dimensional</strong>
          <span>
            {characteristicLabel || "Sin característica"} · {dimensionText} ·{" "}
            {quantity} ud.
          </span>
          {reservation && allocations.length > 0 && (
            <small>
              Reservado sobre{" "}
              {allocations
                .map((a) => {
                  const d = Array.isArray(
                    a.warehouse_stock_item?.dimension_values,
                  )
                    ? a.warehouse_stock_item.dimension_values
                        .map(Number)
                        .join(" × ")
                    : "";
                  return d || "existencia física";
                })
                .join(", ")}
              {recuttable
                ? " · El remanente se generará al consumir, no al reservar."
                : ""}
            </small>
          )}
          {error && <small className="reservation-error">{error}</small>}
        </div>
      </div>
      {reservation?.status === "ACTIVE" ? (
        <div className="dimensional-reservation-actions">
          <span className="reservation-active">
            <CheckCircle2 size={14} /> Reservado
          </span>
          <button
            type="button"
            className="secondary-button compact"
            disabled={loading}
            onClick={release}
          >
            <RotateCcw size={14} /> Liberar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button compact"
          disabled={loading}
          onClick={reserve}
        >
          <LockKeyhole size={14} /> {loading ? "Reservando…" : "Reservar stock"}
        </button>
      )}
    </div>
  );
}
