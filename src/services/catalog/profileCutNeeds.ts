import { isProfileComponent } from './componentClassification';

export type CutNeed = {
  id: string;
  componentIndex: number;
  lineNo: number;
  profile: string;
  profileId?: number;
  profileName: string;
  length: number;
  quantity: number;
  characteristic: string;
  characteristicCode?: string;
  characteristicId?: number;
  unit: string;
};

/** Deriva la lista de perfiles a cortar (uno por componente de perfil del despiece) de una línea de pedido. */
export function deriveProfileCutNeeds(line: any): CutNeed[] {
  const snapshot = (line.specific_data?.configuration_snapshot ||
    line.specific_data?.otd_snapshot ||
    line.specific_data ||
    {}) as any;
  const rawComponents: any[] = Array.isArray(snapshot.components) ? snapshot.components : [];

  const profileComponents = rawComponents.filter(isProfileComponent);

  const candidates =
    profileComponents.length > 0
      ? profileComponents
      : rawComponents.length > 0
      ? rawComponents.filter(c => (!isProfileComponent(c) ? false : true))
      : [null];

  const safeCandidates = candidates.length > 0 ? candidates : [null];

  return safeCandidates.map((comp: any, index: number) => {
    const profile = String(
      comp?.product_code ||
        snapshot.profile_code ||
        line.product?.code ||
        (safeCandidates.length > 1 ? `Perfil ${index + 1}` : 'Perfil')
    );
    const profileId = Number(comp?.product_id || comp?.article_id || line.product_id || 0) || undefined;
    const profileName = String(
      comp?.product_name ||
        comp?.name ||
        line.product?.commercial_description ||
        line.description ||
        profile
    );

    const compCharacteristicCode =
      comp?.characteristic_code ||
      comp?.characteristic?.code ||
      snapshot.characteristic_code ||
      snapshot.characteristic?.code ||
      line.characteristic_code ||
      line.characteristic?.code ||
      line.specific_data?.characteristic_code ||
      undefined;

    const compCharacteristicId =
      (comp?.characteristic_id ? Number(comp.characteristic_id) : undefined) ||
      (comp?.characteristic?.id ? Number(comp.characteristic?.id) : undefined) ||
      (snapshot.characteristic_id ? Number(snapshot.characteristic_id) : undefined) ||
      (snapshot.characteristic?.id ? Number(snapshot.characteristic?.id) : undefined) ||
      (line.characteristic_id ? Number(line.characteristic_id) : undefined) ||
      (line.characteristic?.id ? Number(line.characteristic?.id) : undefined) ||
      (line.specific_data?.characteristic_id ? Number(line.specific_data?.characteristic_id) : undefined) ||
      undefined;

    const characteristicCode = compCharacteristicCode ? String(compCharacteristicCode) : undefined;
    const characteristicId = compCharacteristicId ? Number(compCharacteristicId) : undefined;

    const characteristicName =
      comp?.characteristic_name ||
      comp?.characteristic?.description ||
      snapshot.characteristic_name ||
      snapshot.characteristic?.description ||
      line.characteristic?.description ||
      line.characteristic_name ||
      characteristicCode ||
      undefined;

    const characteristic = String(
      characteristicName ||
        (characteristicId ? `Característica #${characteristicId}` : 'Sin característica')
    );

    const dimensions =
      comp?.dimension_list || comp?.dimensions || snapshot.dimensions || line.specific_data?.dimensions || [];
    const dimEntries = Array.isArray(dimensions)
      ? dimensions
      : typeof dimensions === 'object' && dimensions !== null
      ? Object.entries(dimensions).map(([code, value]) => ({ code, value }))
      : [];

    const length = Number(
      dimEntries.find((d: any) => /long|largo|length|dim|medida|corte/i.test(String(d.name || d.code)))?.value ||
        dimEntries[0]?.value ||
        0
    );

    const compQty = Math.max(1, Number(comp?.quantity || 1));
    const lineQty = Math.max(1, Number(line.quantity || 1));
    const quantity = Math.max(1, Math.round(compQty * lineQty));

    const initialDimensionUnit =
      dimEntries.find((d: any) => /long|largo|length/i.test(String(d.name || d.code)))?.unit_symbol ||
      dimEntries.find((d: any) => /long|largo|length/i.test(String(d.name || d.code)))?.unit_code ||
      dimEntries[0]?.unit_symbol ||
      dimEntries[0]?.unit_code ||
      comp?.unit_symbol ||
      comp?.unit_code ||
      snapshot.work_unit?.symbol ||
      snapshot.work_unit_symbol ||
      snapshot.work_unit?.code ||
      snapshot.work_unit_code ||
      '';

    return {
      id: comp?.id ? String(comp.id) : `profile-need-${index}`,
      componentIndex: index,
      lineNo: Number(line.line_no),
      profile,
      profileId,
      profileName,
      length,
      quantity,
      characteristic,
      characteristicCode,
      characteristicId,
      unit: initialDimensionUnit
    };
  });
}

type NeedMatchableSheet = { product_id: number | null; product_code: string | null; characteristic_id: number | null; characteristic_code: string | null; required_length: number };

/** Localiza, entre las hojas ya generadas para la línea, la que cubre una necesidad de perfil concreta. */
export function findWorkSheetForNeed<T extends NeedMatchableSheet>(need: CutNeed, sheets: T[]): T | null {
  return (
    sheets.find(ws => {
      const prodMatch = (need.profileId && ws.product_id === need.profileId) || (need.profile && ws.product_code === need.profile);
      if (!prodMatch) return false;
      if (need.characteristicId || ws.characteristic_id) {
        if (need.characteristicId && ws.characteristic_id && need.characteristicId === ws.characteristic_id) {
          // match
        } else if (
          need.characteristicCode &&
          ws.characteristic_code &&
          need.characteristicCode.toLowerCase() === ws.characteristic_code.toLowerCase()
        ) {
          // match
        } else {
          return false;
        }
      } else if (need.characteristicCode || ws.characteristic_code) {
        if (need.characteristicCode && ws.characteristic_code && need.characteristicCode.toLowerCase() === ws.characteristic_code.toLowerCase()) {
          // match
        } else {
          return false;
        }
      }
      if (need.length && ws.required_length) {
        return Number(ws.required_length) === Number(need.length);
      }
      return true;
    }) || null
  );
}
