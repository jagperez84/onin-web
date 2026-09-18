import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type Props = {
  id?: string;
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

export function CollapsibleSection({
  id,
  title,
  description,
  headerExtra,
  defaultOpen = true,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      id={id}
      className={`panel product-profile-anchor collapsible-section${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="panel-head collapsible-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="collapsible-section-title">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
        </div>
        {headerExtra && (
          <div
            className="collapsible-section-extra"
            onClick={(e) => e.stopPropagation()}
          >
            {headerExtra}
          </div>
        )}
      </button>
      {open && <div className="collapsible-section-body">{children}</div>}
    </section>
  );
}
