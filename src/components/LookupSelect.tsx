import { useMemo, useState } from "react";

type Option = { id: number; label: string; code?: string; price?: number };

type Props = {
  label?: string;
  required?: boolean;
  compact?: boolean;
  options: Option[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder: string;
};

export function LookupSelect({
  label,
  required = false,
  compact = false,
  options,
  value,
  onChange,
  placeholder,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((x) => x.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return options.slice(0, 10);
    return options
      .filter((x) =>
        `${x.code ?? ""} ${x.label}`.toLocaleLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [options, query]);
  return (
    <div className={`lookup-field ${compact ? "lookup-field-compact" : ""}`}>
      {label && (
        <span className="field-label">
          {label}
          {required ? " *" : ""}
        </span>
      )}
      <div className="lookup-control">
        <input
          required={required && !value}
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            if (selected) setQuery(selected.label);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value !== null) onChange(null);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="lookup-results">
          {filtered.map((option) => (
            <button
              type="button"
              key={option.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(option.id);
                setQuery("");
                setOpen(false);
              }}
            >
              <strong>
                {option.code ? `${option.code} · ` : ""}
                {option.label}
              </strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
