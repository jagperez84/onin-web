import React from "react";
import { ChevronRight, Loader2, Search } from "lucide-react";
import type { OtdSummary } from "../../../services/otd/otdCalculationService";

export type OtdSelectionStepProps = {
  otdList: OtdSummary[];
  loadingOtdList: boolean;
  otdSearch: string;
  onSearchChange: (val: string) => void;
  onSelectOtd: (id: number) => void;
};

export function OtdSelectionStep({
  otdList,
  loadingOtdList,
  otdSearch,
  onSearchChange,
  onSelectOtd,
}: OtdSelectionStepProps) {
  const filteredOtds = otdList.filter(
    (o) =>
      o.name.toLowerCase().includes(otdSearch.toLowerCase()) ||
      o.code.toLowerCase().includes(otdSearch.toLowerCase()) ||
      (o.template_type &&
        o.template_type.toLowerCase().includes(otdSearch.toLowerCase())),
  );

  return (
    <div style={{ padding: "24px" }}>
      <div
        style={{
          marginBottom: "18px",
          display: "flex",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b",
            }}
          />
          <input
            type="text"
            placeholder="Buscar OTD por nombre, código o tipo de producto…"
            value={otdSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px 10px 38px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
            }}
            autoFocus
          />
        </div>
      </div>

      {loadingOtdList ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "#64748b",
          }}
        >
          <Loader2
            size={28}
            className="animate-spin"
            style={{ margin: "0 auto 12px" }}
          />
          <p>Cargando catálogo de OTDs activos…</p>
        </div>
      ) : filteredOtds.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "#f8fafc",
            borderRadius: "8px",
            border: "1px dashed #cbd5e1",
          }}
        >
          <p style={{ color: "#64748b", fontSize: "14px" }}>
            No se encontraron OTDs disponibles con ese criterio.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          {filteredOtds.map((o) => (
            <div
              key={o.id}
              onClick={() => onSelectOtd(o.id)}
              style={{
                padding: "16px",
                borderRadius: "10px",
                border: "1px solid #e4e2dc",
                background: "#ffffff",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#0284c7";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(2, 132, 199, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e4e2dc";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#0369a1",
                      background: "#e0f2fe",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    {o.code}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#64748b",
                      textTransform: "uppercase",
                    }}
                  >
                    {o.template_type || "OTD"}
                  </span>
                </div>
                <h4
                  style={{
                    margin: "0 0 6px",
                    fontSize: "15px",
                    color: "#0f172a",
                    fontWeight: 600,
                  }}
                >
                  {o.name}
                </h4>
              </div>
              <div
                style={{
                  marginTop: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "4px",
                  color: "#0284c7",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <span>Configurar</span>
                <ChevronRight size={14} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
