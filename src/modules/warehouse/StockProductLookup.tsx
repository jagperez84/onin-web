import { useEffect, useState } from "react";
import {
  listStockCharacteristics,
  searchStockProducts,
  type StockCharacteristic,
  type StockProduct,
} from "../../services/warehouse/stockRepository";
import { EntitySearchField, type EntitySearchOption } from "../../components/ui/EntitySearchField";

type StockOption = StockProduct & EntitySearchOption;

function toOption(p: StockProduct): StockOption {
  return {
    ...p,
    label: `${p.code} · ${p.commercial_description || p.technical_description || "Sin descripción"}`,
  };
}

export function StockProductLookup({
  companyId,
  value,
  onChange,
}: {
  companyId: number;
  value: StockProduct | null;
  onChange: (product: StockProduct | null) => void;
}) {
  const [error, setError] = useState("");

  async function handleSearch(term: string): Promise<StockOption[]> {
    if (!companyId) return [];
    setError("");
    try {
      const data = await searchStockProducts(companyId, term);
      return data.map(toOption);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron buscar artículos.");
      return [];
    }
  }

  return (
    <div className="stock-lookup">
      <EntitySearchField
        label="Artículo"
        required
        value={value ? toOption(value) : null}
        onChange={(opt) => onChange(opt)}
        onSearch={handleSearch}
        placeholder="Buscar por código o descripción en catálogo…"
        loadingText="Buscando artículos en el catálogo…"
        emptyText="No se encontraron artículos que coincidan."
        renderOption={(o) => (
          <div className="entity-search-option-block">
            <div className="entity-search-option-block-head">
              <strong>{o.code}</strong>
              {o.stock_minimum > 0 && (
                <span className="entity-search-option-secondary">Mín: {o.stock_minimum}</span>
              )}
            </div>
            <span className="entity-search-option-block-desc">
              {o.commercial_description || o.technical_description || "Sin descripción"}
            </span>
          </div>
        )}
      />
      {error && <div className="inline-error">{error}</div>}
    </div>
  );
}

export function CharacteristicSelect({
  productId,
  value,
  onChange,
}: {
  productId: number;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [rows, setRows] = useState<StockCharacteristic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setRows([]);
      return;
    }
    let active = true;
    setLoading(true);
    listStockCharacteristics(productId)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setRows([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  return (
    <label>
      <span>Característica / color</span>
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
        disabled={loading || rows.length === 0}
      >
        <option value="">
          {loading ? "Cargando características…" : rows.length === 0 ? "Sin características asignadas (No requerida)" : "Sin característica (Opcional)"}
        </option>
        {rows.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
            {c.description ? ` · ${c.description}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

