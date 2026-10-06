import { DamageGrade, PurchaseOrderLine, QualityFlag } from '../types/receiving';
import { calculateDifference } from './comparisonEngine';

export type PresetScenario = 'matched' | 'short' | 'over' | 'wrong_sku' | 'damaged' | 'uncertain';

export interface PresetValues {
  receivedSku: string;
  cartonsReceived: number;
  unitsPerCartonCounted: number;
  cartonDamage: DamageGrade;
  unitDamage: DamageGrade;
  qualityFlags: QualityFlag[];
  qtyReceived: number;
  qtyDifference: number;
}

type PresetPO = Pick<PurchaseOrderLine, 'sku' | 'cartonsOrdered' | 'unitsPerCartonOrdered' | 'qtyOrdered'>;

/**
 * Test presets for the manual receiving form. The quantity change depends on the
 * PO line's carton layout (counts are entered as cartons × units per carton):
 * - short: 2 fewer units per carton when cartons hold more than 2 units, otherwise one carton fewer;
 * - over: one extra carton.
 * qtyDifference is computed with the same calculateDifference used for real records.
 */
export function presetValues(po: PresetPO, scenario: PresetScenario): PresetValues {
  let receivedSku = po.sku;
  let cartonsReceived = po.cartonsOrdered;
  let unitsPerCartonCounted = po.unitsPerCartonOrdered;
  let cartonDamage: DamageGrade = 'none';
  let unitDamage: DamageGrade = 'none';

  switch (scenario) {
    case 'short':
      if (po.unitsPerCartonOrdered > 2) {
        unitsPerCartonCounted = po.unitsPerCartonOrdered - 2;
      } else {
        cartonsReceived = Math.max(0, po.cartonsOrdered - 1);
      }
      break;
    case 'over':
      cartonsReceived = po.cartonsOrdered + 1;
      break;
    case 'wrong_sku':
      receivedSku = `${po.sku}-ERR`;
      break;
    case 'damaged':
      cartonDamage = 'crushing';
      unitDamage = 'water';
      break;
    case 'uncertain':
      cartonDamage = 'uncertain';
      unitDamage = 'uncertain';
      break;
    case 'matched':
    default:
      break;
  }

  const qtyReceived = cartonsReceived * unitsPerCartonCounted;
  return {
    receivedSku,
    cartonsReceived,
    unitsPerCartonCounted,
    cartonDamage,
    unitDamage,
    qualityFlags: [],
    qtyReceived,
    qtyDifference: calculateDifference(qtyReceived, po.qtyOrdered),
  };
}

/** Button label showing the exact quantity change the preset applies, e.g. "Short (−6)" / "Over (+24)". */
export function presetLabel(po: PresetPO | null | undefined, scenario: 'short' | 'over'): string {
  const name = scenario === 'short' ? 'Short' : 'Over';
  if (!po) return name;
  const diff = presetValues(po, scenario).qtyDifference;
  const signed = diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : '0';
  return `${name} (${signed})`;
}
