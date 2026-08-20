import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

type MeasurementRef = { code: string; name: string };

function findTarget() {
  return document.querySelector<HTMLElement>('#producto-datos-generales .form-grid');
}

export function ProductInheritedMeasurement() {
  const { id } = useParams<{ id: string }>();
  const [value, setValue] = useState<MeasurementRef | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!id || id === 'nuevo') return;

    const updateTarget = () => {
      const next = findTarget();
      setTarget(current => current === next ? current : next);
    };

    updateTarget();
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [id]);

  useEffect(() => {
    if (!id || id === 'nuevo' || !supabase) return;
    const db = supabase;
    let cancelled = false;

    async function load() {
      const { data: product } = await db
        .from('product')
        .select('family_id')
        .eq('id', Number(id))
        .maybeSingle();

      if (!product?.family_id) {
        if (!cancelled) setValue(null);
        return;
      }

      const { data: family } = await db
        .from('product_family')
        .select('measurement_type_id')
        .eq('id', product.family_id)
        .maybeSingle();

      if (cancelled || family?.measurement_type_id == null) {
        if (!cancelled) setValue(null);
        return;
      }

      const { data: type } = await db
        .from('measurement_type')
        .select('code,name')
        .eq('id', family.measurement_type_id)
        .maybeSingle();

      if (!cancelled) {
        setValue(type ? { code: String(type.code), name: String(type.name) } : null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id || id === 'nuevo' || !target || !value) return null;

  return createPortal(
    <label className="product-measurement-link-field">
      Tipo de medida
      <Link
        to="/configuracion/tipos-medida"
        className="link-button primary-link"
        title="Consultar tipo de medida"
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: '38px',
          padding: '8px 10px',
          border: '1px solid var(--border, #d8d1c3)',
          borderRadius: '6px',
          background: 'var(--surface-muted, #f5f2eb)',
          textDecoration: 'none',
        }}
      >
        {value.code} · {value.name}
      </Link>
    </label>,
    target,
  );
}
