import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getCurrentCompanyId } from "../../services/core/coreRepository";
import type { Otd } from "./editor/types";
import "./otd.css";

export function OtdList() {
  const [rows, setRows] = useState<Otd[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase) return;
      try {
        const companyId = await getCurrentCompanyId();
        const { data, error } = await supabase
          .from("otd")
          .select("*")
          .eq("company_id", companyId)
          .order("name");

        if (cancelled) return;
        if (error) throw error;
        setRows(data ?? []);
      } catch (error) {
        if (!cancelled) {
          console.error("Error cargando OTD:", error);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="otd-page">
      <div className="otd-head">
        <div>
          <div className="eyebrow">PRODUCCIÓN</div>
          <h1>OTD (Objetos Técnicos Dinámicos)</h1>
          <p>
            Configuradores técnicos de productos compuestos con escalado y
            formulación.
          </p>
        </div>
        <NavLink to="/produccion/otd/nuevo" className="primary-button">
          <Plus size={16} /> Nuevo OTD
        </NavLink>
      </div>
      <div className="otd-card">
        {loading ? (
          <div className="otd-empty">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="otd-empty">No hay OTD creados todavía.</div>
        ) : (
          rows.map((r) => (
            <NavLink
              className="otd-list-row"
              key={r.id}
              to={`/produccion/otd/${r.id}`}
            >
              <span>
                <strong>{r.name}</strong> · {r.code}
              </span>
              <span className="otd-pill">{r.template_type ?? "Genérico"}</span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}
