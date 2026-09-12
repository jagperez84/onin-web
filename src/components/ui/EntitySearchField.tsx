import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";

export type EntitySearchOption = {
  id: number | string;
  label: string;
  code?: string;
  secondary?: string;
};

export type EntitySearchFieldProps<T extends EntitySearchOption> = {
  value: T | null;
  onChange: (option: T | null) => void;
  placeholder: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** Filtrado en cliente sobre un array ya cargado. */
  options?: T[];
  /** Búsqueda remota con debounce. Incompatible con `options`. */
  onSearch?: (query: string) => Promise<T[]>;
  debounceMs?: number;
  maxResults?: number;
  /** Solo aplica en modo `options`: si el texto coincide exactamente con un `code`, selecciona automáticamente (lectura de código de barras/artículo). */
  matchExactCode?: boolean;
  emptyText?: string;
  loadingText?: string;
  renderOption?: (option: T, selected: boolean) => ReactNode;
  /** Variante `inline`: desplegable bajo el campo. `modal`: diálogo de búsqueda. */
  variant?: "inline" | "modal";
  /** Solo variante `inline`: renderiza el desplegable en un portal a document.body, útil dentro de tablas con overflow. */
  portal?: boolean;
  /** Solo variante `modal`. */
  title?: string;
  description?: string;
  searchPlaceholder?: string;
};

function defaultRenderOption<T extends EntitySearchOption>(option: T) {
  return (
    <>
      <span className="entity-search-option-main">
        {option.code && <strong>{option.code}</strong>}
        <span>{option.label}</span>
      </span>
      {option.secondary && (
        <span className="entity-search-option-secondary">
          {option.secondary}
        </span>
      )}
    </>
  );
}

export function EntitySearchField<T extends EntitySearchOption = EntitySearchOption>({
  value,
  onChange,
  placeholder,
  label,
  required = false,
  disabled = false,
  compact = false,
  options,
  onSearch,
  debounceMs = 200,
  maxResults = 12,
  matchExactCode = false,
  emptyText = "No se han encontrado resultados.",
  loadingText = "Buscando…",
  renderOption,
  variant = "inline",
  portal = false,
  title,
  description,
  searchPlaceholder,
}: EntitySearchFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const localResults = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLocaleLowerCase();
    const list = !q
      ? options
      : options.filter((o) =>
          `${o.code ?? ""} ${o.label}`.toLocaleLowerCase().includes(q),
        );
    return list.slice(0, maxResults);
  }, [options, query, maxResults]);

  useEffect(() => {
    if (!onSearch || !open) return;
    if (value && query.trim() === value.label.trim()) {
      setRemoteResults([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await onSearch(query.trim());
        if (alive) setRemoteResults(r.slice(0, maxResults));
      } catch {
        if (alive) setRemoteResults([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, debounceMs);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      setLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, onSearch, debounceMs, maxResults]);

  const results = onSearch ? remoteResults : localResults;

  // Cierre al hacer click fuera (incluye el contenido en portal, si lo hay).
  useEffect(() => {
    if (!open || variant !== "inline") return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, variant]);

  // Cierre con Escape.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const reposition = () => {
    if (containerRef.current) setRect(containerRef.current.getBoundingClientRect());
  };
  useEffect(() => {
    if (!open || variant !== "inline" || !portal) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant, portal]);

  function select(option: T) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setOpen(false);
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setOpen(true);
    if (value) onChange(null);
    if (matchExactCode && options) {
      const exact = options.find(
        (o) => o.code && o.code.trim().toLocaleLowerCase() === next.trim().toLocaleLowerCase(),
      );
      if (exact) select(exact);
    }
  }

  function openField() {
    setOpen(true);
    setQuery(value ? value.label : "");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (results.length > 0) select(results[0]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const resultsPanel = (
    <div className="entity-search-results" role="listbox">
      {loading ? (
        <div className="entity-search-state">{loadingText}</div>
      ) : results.length === 0 ? (
        <div className="entity-search-state">{emptyText}</div>
      ) : (
        results.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`entity-search-option${value && String(value.id) === String(option.id) ? " selected" : ""}`}
            onClick={() => select(option)}
          >
            {renderOption ? renderOption(option, value?.id === option.id) : defaultRenderOption(option)}
          </button>
        ))
      )}
    </div>
  );

  if (variant === "modal") {
    return (
      <div className={`entity-search-field ${compact ? "compact" : ""}`}>
        {label && (
          <span className="field-label">
            {label}
            {required ? " *" : ""}
          </span>
        )}
        <div className="entity-search-trigger-row">
          <button
            type="button"
            className="entity-search-trigger"
            onClick={openField}
            disabled={disabled}
          >
            <span className={value ? "" : "entity-search-placeholder"}>
              {value ? value.label : placeholder}
            </span>
            <Search size={16} />
          </button>
          {value && !required && !disabled && (
            <button
              type="button"
              className="entity-search-clear"
              title="Quitar selección"
              onClick={clear}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {open &&
          createPortal(
            <div
              className="modal-backdrop"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                className="modal-card sm"
                role="dialog"
                aria-modal="true"
                aria-label={title ?? label ?? placeholder}
              >
                <div className="modal-header">
                  <div>
                    <h3>{title ?? label ?? "Buscar"}</h3>
                    {description && <p>{description}</p>}
                  </div>
                  <button
                    type="button"
                    className="close-btn"
                    title="Cerrar"
                    onClick={() => setOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body">
                  <div className="entity-search-control">
                    <Search size={15} />
                    <input
                      autoFocus
                      value={query}
                      placeholder={searchPlaceholder ?? "Buscar…"}
                      onChange={(e) => handleQueryChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    {loading && <Loader2 size={14} className="spin-inline" />}
                  </div>
                  <div className="entity-search-results static" role="listbox">
                    {loading ? (
                      <div className="entity-search-state">{loadingText}</div>
                    ) : results.length === 0 ? (
                      <div className="empty-state">
                        <span>{emptyText}</span>
                      </div>
                    ) : (
                      results.map((option) => (
                        <button
                          type="button"
                          key={option.id}
                          className={`entity-search-option${value?.id === option.id ? " selected" : ""}`}
                          onClick={() => select(option)}
                        >
                          {renderOption
                            ? renderOption(option, value?.id === option.id)
                            : defaultRenderOption(option)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="modal-actions-footer">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </div>
    );
  }

  const dropdown = open && (
    <div
      className="entity-search-results"
      role="listbox"
      style={
        portal && rect
          ? {
              position: "fixed",
              top: rect.bottom + 4,
              left: rect.left,
              width: Math.max(rect.width, 260),
            }
          : undefined
      }
    >
      {loading ? (
        <div className="entity-search-state">{loadingText}</div>
      ) : results.length === 0 ? (
        <div className="entity-search-state">{emptyText}</div>
      ) : (
        results.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`entity-search-option${value?.id === option.id ? " selected" : ""}`}
            onClick={() => select(option)}
          >
            {renderOption ? renderOption(option, value?.id === option.id) : defaultRenderOption(option)}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div
      className={`entity-search-field ${compact ? "compact" : ""}`}
      ref={containerRef}
    >
      {label && (
        <span className="field-label">
          {label}
          {required ? " *" : ""}
        </span>
      )}
      <div className={`entity-search-control${disabled ? " disabled" : ""}`}>
        <Search size={15} className="entity-search-icon" />
        <input
          ref={inputRef}
          required={required && !value}
          disabled={disabled}
          value={open ? query : (value?.label ?? "")}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={openField}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {loading && <Loader2 size={14} className="spin-inline" />}
        {value && !disabled && (
          <button
            type="button"
            className="entity-search-clear"
            aria-label="Limpiar selección"
            onClick={clear}
          >
            <X size={14} />
          </button>
        )}
      </div>
      {portal
        ? open &&
          createPortal(
            <div ref={portalRef} className="entity-search-portal">
              {dropdown}
            </div>,
            document.body,
          )
        : dropdown}
    </div>
  );
}
