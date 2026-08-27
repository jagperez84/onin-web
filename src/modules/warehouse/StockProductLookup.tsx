import { useEffect, useRef, useState } from "react";
import { Search, X, Check, Loader2 } from "lucide-react";
import {
  listStockCharacteristics,
  searchStockProducts,
  type StockCharacteristic,
  type StockProduct,
} from "../../services/warehouse/stockRepository";

export function StockProductLookup({
  companyId,
  value,
  onChange,
}: {
  companyId: number;
  value: StockProduct | null;
  onChange: (product: StockProduct | null) => void;
}) {
  const [term, setTerm] = useState(value?.code ?? "");
  const [results, setResults] = useState<StockProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setTerm(value ? `${value.code} · ${value.commercial_description || value.technical_description || 'Sin descripción'}` : "");
  }, [value?.id, value?.code, value?.commercial_description]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function executeSearch(query: string) {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const data = await searchStockProducts(companyId, query);
      setResults(data);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron buscar artículos.");
    } finally {
      setLoading(false);
    }
  }

  const handleInputChange = (newTerm: string) => {
    setTerm(newTerm);
    if (value) {
      onChange(null);
    }
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void executeSearch(newTerm);
    }, 200);
  };

  const handleFocus = () => {
    if (!value) {
      void executeSearch(term);
    }
  };

  return (
    <div className="stock-lookup" ref={containerRef}>
      <label>
        <span>Artículo *</span>
        <div className={`lookup-input ${value ? 'has-value' : ''}`}>
          <Search size={15} />
          <input
            value={term}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
                void executeSearch(term);
              }
            }}
            placeholder="Buscar por código o descripción en catálogo..."
          />
          {loading && <Loader2 size={15} className="spin-inline" />}
          {value ? (
            <button
              type="button"
              title="Quitar artículo seleccionado"
              onClick={() => {
                onChange(null);
                setTerm("");
                setResults([]);
                setOpen(false);
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <button type="button" title="Buscar" onClick={() => void executeSearch(term)}>
              <Search size={15} />
            </button>
          )}
        </div>
      </label>
      {open && !value && (
        <div className="lookup-results-stock" role="listbox">
          {loading && <small className="lookup-state">Buscando artículos en el catálogo…</small>}
          {!loading && results.length === 0 && (
            <small className="lookup-state">No se encontraron artículos que coincidan.</small>
          )}
          {results.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChange(p);
                setOpen(false);
              }}
            >
              <div className="lookup-item-head">
                <strong>{p.code}</strong>
                {p.stock_minimum > 0 && <span className="lookup-item-badge">Mín: {p.stock_minimum}</span>}
              </div>
              <span className="lookup-item-desc">
                {p.commercial_description || p.technical_description || "Sin descripción"}
              </span>
            </button>
          ))}
        </div>
      )}
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

