export interface ReceivingFormData {
  poNumber: string;
  poLine: number | '';
  expectedSku?: string;
  receivedSku: string;
  cartonsReceived?: number | '';
  unitsPerCartonCounted?: number | '';
  directQtyReceived?: number | '';
  cartonDamage?: string;
  unitDamage?: string;
  qualityFlags?: string[];
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
  const parsedLine = Number(formData.poLine);
  if (
    formData.poLine === '' ||
    formData.poLine === undefined ||
    Number.isNaN(parsedLine) ||
    !Number.isInteger(parsedLine) ||
    parsedLine < 1
  ) {
    errors.poLine = 'Valid PO line item must be selected.';
  }

  // Expected SKU validation (if provided)
  if (formData.expectedSku !== undefined && formData.expectedSku.trim() === '') {
    errors.expectedSku = 'Expected Product SKU is required.';
  }

  // Received SKU validation
  if (!formData.receivedSku || formData.receivedSku.trim() === '') {
    errors.receivedSku = 'Received Product SKU is required. Scan barcode or enter SKU code.';
  } else if (/<[^>]*>/g.test(formData.receivedSku)) {
    errors.receivedSku = 'Invalid characters or script tags detected in SKU barcode.';
  }

  // Quantity Validation: Either direct quantity or packaging counts (cartons x units)
  if (formData.directQtyReceived !== undefined) {
    if (formData.directQtyReceived === '') {
      errors.directQtyReceived = 'Received quantity is required.';
    } else if (Number.isNaN(Number(formData.directQtyReceived))) {
      errors.directQtyReceived = 'Received quantity must be a valid numeric quantity.';
    } else if (Number(formData.directQtyReceived) < 0) {
      errors.directQtyReceived = 'Received quantity cannot be negative.';
    } else if (!Number.isInteger(Number(formData.directQtyReceived))) {
      errors.directQtyReceived = 'Received quantity must be a whole number.';
    }
  } else {
    // Cartons validation
    if (formData.cartonsReceived === '' || formData.cartonsReceived === undefined || formData.cartonsReceived === null) {
      errors.cartonsReceived = 'Cartons received quantity is required.';
    } else if (Number.isNaN(Number(formData.cartonsReceived))) {
      errors.cartonsReceived = 'Cartons received must be a valid numeric quantity.';
    } else if (Number(formData.cartonsReceived) < 0) {
      errors.cartonsReceived = 'Carton count cannot be negative.';
    } else if (!Number.isInteger(Number(formData.cartonsReceived))) {
      errors.cartonsReceived = 'Carton count must be a whole number.';
    }

    // Units per carton validation
    if (formData.unitsPerCartonCounted === '' || formData.unitsPerCartonCounted === undefined || formData.unitsPerCartonCounted === null) {
      errors.unitsPerCartonCounted = 'Units per carton quantity is required.';
    } else if (Number.isNaN(Number(formData.unitsPerCartonCounted))) {
      errors.unitsPerCartonCounted = 'Units per carton must be a valid numeric quantity.';
    } else if (Number(formData.unitsPerCartonCounted) < 0) {
      errors.unitsPerCartonCounted = 'Units per carton cannot be negative.';
    } else if (!Number.isInteger(Number(formData.unitsPerCartonCounted))) {
      errors.unitsPerCartonCounted = 'Units per carton must be a whole number.';
    }
  }

  // Total quantity calculation verification
  const totalUnits =
    formData.directQtyReceived !== undefined && formData.directQtyReceived !== ''
      ? Number(formData.directQtyReceived)
      : Number(formData.cartonsReceived || 0) * Number(formData.unitsPerCartonCounted || 0);

  if (!Number.isNaN(totalUnits) && totalUnits < 0) {
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
