import { ReactNode, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export type LineActionMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  title?: string;
};

export function LineActionsMenu({ items }: { items: LineActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPanelStyle({ top: rect.bottom + 4, left: Math.max(8, rect.right - 210) });
    }
    place();
    function onDocMouseDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        title="Acciones"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={15} />
      </button>
      {open && panelStyle && (
        <div
          ref={panelRef}
          className="line-actions-menu-panel"
          style={{ top: panelStyle.top, left: panelStyle.left }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              className="line-actions-menu-item"
              title={it.title}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
