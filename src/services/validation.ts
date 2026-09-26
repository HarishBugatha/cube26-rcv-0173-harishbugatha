export interface ReceivingFormData {
  poNumber: string;
  poLine: number | '';
  expectedSku: string;
  receivedSku: string;
  cartonsReceived: number | '';
  unitsPerCartonCounted: number | '';
  directQtyReceived?: number | '';
  cartonDamage: string;
  unitDamage: string;
  qualityFlags: string[];
  operatorId: string;
  notes?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateReceivingForm(formData: ReceivingFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // PO Number validation
  if (!formData.poNumber || formData.poNumber.trim() === '') {
    errors.poNumber = 'Purchase Order selection is required.';
  }

  // PO Line validation
  if (formData.poLine === '' || formData.poLine === undefined || Number(formData.poLine) < 1) {
    errors.poLine = 'Valid PO line item must be selected.';
  }

  // SKU validation
  if (!formData.receivedSku || formData.receivedSku.trim() === '') {
    errors.receivedSku = 'Received Product SKU is required. Scan barcode or enter SKU code.';
  }

  // Cartons validation
  if (formData.cartonsReceived === '' || formData.cartonsReceived === undefined) {
    errors.cartonsReceived = 'Cartons received is required.';
  } else if (!Number.isInteger(Number(formData.cartonsReceived))) {
    errors.cartonsReceived = 'Carton count must be a whole number.';
  } else if (Number(formData.cartonsReceived) < 0) {
    errors.cartonsReceived = 'Carton count cannot be negative.';
  }

  // Units per carton validation
  if (formData.unitsPerCartonCounted === '' || formData.unitsPerCartonCounted === undefined) {
    errors.unitsPerCartonCounted = 'Units per carton is required.';
  } else if (!Number.isInteger(Number(formData.unitsPerCartonCounted))) {
    errors.unitsPerCartonCounted = 'Units per carton must be a whole number.';
  } else if (Number(formData.unitsPerCartonCounted) < 0) {
    errors.unitsPerCartonCounted = 'Units per carton cannot be negative.';
  }

  // Total quantity calculation verification
  const totalUnits = Number(formData.cartonsReceived || 0) * Number(formData.unitsPerCartonCounted || 0);
  if (totalUnits < 0) {
    errors.general = 'Total calculated quantity cannot be negative.';
  }

  // Operator ID validation
  if (!formData.operatorId || formData.operatorId.trim() === '') {
    errors.operatorId = 'Receiving agent / Operator ID is required for audit trail.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateOverrideReason(reason: string): { isValid: boolean; error?: string } {
  if (!reason || reason.trim().length < 8) {
    return {
      isValid: false,
      error: 'A mandatory supervisory justification (minimum 8 characters) is required to override automated verdicts.',
    };
  }
  return { isValid: true };
}
