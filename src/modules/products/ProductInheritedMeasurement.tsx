import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

type MeasurementRef = { code: string; name: string };

export function ProductInheritedMeasurement() {
  const { id } = useParams<{ id: string }>();
  const [value, setValue] = useState<MeasurementRef | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!id || id === 'nuevo') return;
    setTarget(document.querySelector<HTMLElement>('#producto-datos-generales .form-grid'));
  }, [id]);

  useEffect(() => {
    if (!id || id === 'nuevo' || !supabase) return;
    const db = supabase;
    let cancelled = false;

    async function load() {
      const { data } = await db.from('product').select('family_id').eq('id', Number(id)).maybeSingle();
      if (!data?.family_id) {
        if (!cancelled) setValue(null);
        return;
      }

      const { data: familyData } = await db
        .from('product_family')
        .select('measurement_type_id')
        .eq('id', data.family_id)
        .maybeSingle();

      if (cancelled || familyData?.measurement_type_id == null) {
        if (!cancelled) setValue(null);
        return;
      }

      const { data: type } = await db
        .from('measurement_type')
        .select('code,name')
        .eq('id', familyData.measurement_type_id)
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
      <Link to="/configuracion/tipos-medida" className="link-button primary-link" title="Consultar tipo de medida">
        {value.code} · {value.name}
      </Link>
    </label>,
    target,
  );
}
