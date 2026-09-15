import type { SalesOrder } from '../sales/salesOrderService';
import { deriveProfileCutNeeds } from '../catalog/profileCutNeeds';
import { isFabricOrLonaComponent } from '../catalog/componentClassification';
import { listProfileStockPieces } from '../warehouse/stockRepository';
import {
  probeLonaStockWidth,
  resolveLonaConfectionComponents,
} from './lonaConfectionService';
import {
  listComponentStockOptions,
  resolveOrderLineComponents,
} from './componentConsumptionService';

export type MaterialCategory = 'PROFILE' | 'LONA' | 'COMPONENT';

export type MissingMaterialItem = {
  category: MaterialCategory;
  lineNo: number;
  productId?: number;
  productCode?: string | null;
  description: string;
  required: string;
  available: string;
  missingQty?: number;
};

export type OrderMaterialAvailabilityStatus = 'FULL' | 'PARTIAL' | 'MISSING';

export type OrderMaterialAvailability = {
  status: OrderMaterialAvailabilityStatus;
  hasMaterials: boolean;
  totalItems: number;
  availableItems: number;
  missingCount: number;
  missingMaterials: MissingMaterialItem[];
  summary: string;
};

function lineSnapshot(line: any): any {
  return (line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null) as any;
}

/**
 * Comprueba en un solo paso si los perfiles, lonas y componentes del pedido tienen
 * existencias suficientes en almacén.
 */
export async function checkOrderMaterialAvailability(
  order: SalesOrder,
  companyId: number
): Promise<OrderMaterialAvailability> {
  const lines = order.lines || [];
  const missingMaterials: MissingMaterialItem[] = [];
  let totalItems = 0;
  let availableItems = 0;

  for (const line of lines) {
    const lineNo = Number(line.line_no) || 1;
    const lineId = Number(line.id);

    // 1. Perfiles a cortar
    try {
      const profileNeeds = deriveProfileCutNeeds(line);
      for (const need of profileNeeds) {
        if (!need.profileId || need.length <= 0) continue;
        totalItems++;
        const pieces = await listProfileStockPieces({
          companyId,
          productId: need.profileId,
          requiredLength: need.length,
          characteristicId: need.characteristicId ?? null,
          colorId: need.colorId ?? null,
        }).catch(() => []);

        const validStock = pieces
          .filter(p => p.length >= need.length)
          .reduce((sum, p) => sum + (p.quantity || 0), 0);

        if (validStock >= need.quantity) {
          availableItems++;
        } else {
          missingMaterials.push({
            category: 'PROFILE',
            lineNo,
            productId: need.profileId,
            productCode: need.profile,
            description: need.profileName || need.profile || 'Perfil',
            required: `${need.quantity} pieza${need.quantity > 1 ? 's' : ''} de ${need.length} mm`,
            available: validStock > 0 ? `${validStock} piezas` : '0 piezas',
            missingQty: need.quantity - validStock,
          });
        }
      }
    } catch {
      // Ignorar fallo puntual en perfiles
    }

    // 2. Confección de lonas
    try {
      const snapshot = lineSnapshot(line);
      const rawComponents: any[] = Array.isArray(snapshot?.components) ? snapshot.components : [];
      if (rawComponents.some(isFabricOrLonaComponent) && snapshot) {
        const confection = await resolveLonaConfectionComponents({
          companyId,
          orderLineId: lineId,
          orderLineNo: lineNo,
          reference: null,
          snapshot,
        }).catch(() => null);

        if (confection && confection.components.length > 0) {
          for (const comp of confection.components) {
            if (!comp.productId) continue;
            totalItems++;
            const probe = await probeLonaStockWidth({
              companyId,
              productId: comp.productId,
              characteristicId: comp.characteristicId,
              characteristicCode: comp.characteristicCode,
              colorId: comp.colorId,
              colorCode: comp.colorCode,
            }).catch(() => null);

            if (probe) {
              availableItems++;
            } else {
              const dimText = comp.line && comp.output ? `(${comp.line} × ${comp.output} ${comp.lineUnit || 'cm'})` : '';
              const descSuffix = comp.colorName ? ` · ${comp.colorName}` : '';
              missingMaterials.push({
                category: 'LONA',
                lineNo,
                productId: comp.productId,
                productCode: comp.productCode,
                description: (comp.productName || 'Lona / Tejido') + descSuffix,
                required: `${comp.quantity || 1} paño ${dimText}`.trim(),
                available: 'Sin rollo / stock compatible',
                missingQty: comp.quantity || 1,
              });
            }
          }
        }
      }
    } catch {
      // Ignorar fallo puntual en lonas
    }

    // 3. Componentes y accesorios
    try {
      const compNeeds = resolveOrderLineComponents(line);
      for (const need of compNeeds) {
        totalItems++;
        const options = await listComponentStockOptions(companyId, need.productId, need.characteristicId, need.colorId).catch(() => []);
        const validStock = options.reduce((sum, opt) => sum + (opt.available || 0), 0);

        if (validStock >= need.quantity) {
          availableItems++;
        } else {
          const descSuffix = [need.characteristicName, need.colorName].filter(Boolean).join(' · ');
          missingMaterials.push({
            category: 'COMPONENT',
            lineNo,
            productId: need.productId,
            productCode: need.productCode,
            description: (need.productName || 'Componente') + (descSuffix ? ` · ${descSuffix}` : ''),
            required: `${need.quantity} ${need.unitCode}`,
            available: validStock > 0 ? `${validStock} ${need.unitCode}` : `0 ${need.unitCode}`,
            missingQty: need.quantity - validStock,
          });
        }
      }
    } catch {
      // Ignorar fallo puntual en componentes
    }
  }

  // Deducción de estado global
  if (totalItems === 0) {
    return {
      status: 'FULL',
      hasMaterials: false,
      totalItems: 0,
      availableItems: 0,
      missingCount: 0,
      missingMaterials: [],
      summary: 'Sin necesidades de fabricación configuradas',
    };
  }

  const missingCount = missingMaterials.length;

  if (missingCount === 0) {
    return {
      status: 'FULL',
      hasMaterials: true,
      totalItems,
      availableItems,
      missingCount: 0,
      missingMaterials: [],
      summary: 'Todos los materiales disponibles en almacén',
    };
  }

  if (availableItems > 0) {
    const missingNames = missingMaterials.slice(0, 2).map(m => m.description).join(', ');
    const moreText = missingMaterials.length > 2 ? ` y ${missingMaterials.length - 2} más` : '';
    return {
      status: 'PARTIAL',
      hasMaterials: true,
      totalItems,
      availableItems,
      missingCount,
      missingMaterials,
      summary: `${availableItems} de ${totalItems} materiales disponibles. Falta: ${missingNames}${moreText}.`,
    };
  }

  return {
    status: 'MISSING',
    hasMaterials: true,
    totalItems,
    availableItems: 0,
    missingCount,
    missingMaterials,
    summary: `Sin stock suficiente (${missingCount} material${missingCount > 1 ? 'es' : ''} faltante${missingCount > 1 ? 's' : ''})`,
  };
}

/**
 * Comprueba disponibilidad en lote para varios pedidos.
 */
export async function checkMultipleOrdersMaterialAvailability(
  orders: SalesOrder[],
  companyId: number
): Promise<Record<number, OrderMaterialAvailability>> {
  const results: Record<number, OrderMaterialAvailability> = {};
  await Promise.all(
    orders.map(async (order) => {
      try {
        const avail = await checkOrderMaterialAvailability(order, companyId);
        results[order.id] = avail;
      } catch {
        results[order.id] = {
          status: 'PARTIAL',
          hasMaterials: false,
          totalItems: 0,
          availableItems: 0,
          missingCount: 0,
          missingMaterials: [],
          summary: 'No se pudo verificar el stock',
        };
      }
    })
  );
  return results;
}
