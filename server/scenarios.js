const sharp = require('sharp');
const { computeSha256 } = require('./security');

/**
 * 10 PRD-3 DEBATE Test Scenarios with Complete PO Data,
 * Physical Receiving Visuals, and Adversarial Ground Truth.
 */

const SCENARIOS = [
  {
    id: 'scenario-1-correct',
    name: '1. Correct Shipment (Clean Match)',
    category: 'MATCH',
    description: 'PO matches physically received items completely. 4 units present, correct SKU, correct variant, packaging pristine.',
    expectedVerdict: 'ACCEPT',
    po: {
      poNumber: 'PO-2026-9041',
      vendor: 'Nexus Industrial Tech Corp',
      expectedSku: 'SKU-EL-1044',
      productName: 'Industrial Ethernet Gateway (Steel Blue, 4-Port)',
      expectedQuantity: 4,
      expectedVariant: 'Steel Blue / 4-Port Gigabit / DIN-Rail',
      expectedComponents: ['Gateway Unit', '24V Power Adapter', 'DIN Rail Mount', 'Terminal Block'],
      carrierTracking: '1Z999AA10123456784',
      notes: 'Standard warehouse receiving. Verify all 4 units and intact seal.'
    },
    visualMetadata: {
      itemsDetected: 4,
      detectedSku: 'SKU-EL-1044',
      detectedVariant: 'Steel Blue / 4-Port Gigabit / DIN-Rail',
      packagingStatus: 'INTACT',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#1e293b"/>
          </linearGradient>
          <linearGradient id="blueUnit" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#2563eb"/>
            <stop offset="100%" stop-color="#1e40af"/>
          </linearGradient>
        </defs>
        <!-- Warehouse Background -->
        <rect width="800" height="600" fill="url(#bgGrad)"/>
        <line x1="50" y1="520" x2="750" y2="520" stroke="#475569" stroke-width="4"/>
        <text x="50" y="555" fill="#64748b" font-family="monospace" font-size="14">BAY 4 • DOCK 02 • SCAN STATION ALPHA</text>

        <!-- Shipping Carton -->
        <rect x="70" y="80" width="660" height="420" rx="8" fill="#d97706" stroke="#b45309" stroke-width="3"/>
        <rect x="85" y="95" width="630" height="390" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>

        <!-- Receiving Label -->
        <rect x="110" y="115" width="280" height="130" fill="#ffffff" stroke="#94a3b8" stroke-width="2" rx="4"/>
        <text x="125" y="140" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">SHIPPING LABEL</text>
        <text x="125" y="160" fill="#334155" font-family="monospace" font-size="12">PO: ${po.poNumber}</text>
        <text x="125" y="180" fill="#334155" font-family="monospace" font-size="13" font-weight="bold">SKU: ${po.expectedSku}</text>
        <text x="125" y="200" fill="#475569" font-family="sans-serif" font-size="11">VAR: ${po.expectedVariant}</text>
        <!-- Barcode -->
        <rect x="125" y="210" width="240" height="22" fill="#0f172a"/>
        <line x1="135" y1="210" x2="135" y2="232" stroke="#fff" stroke-width="2"/>
        <line x1="145" y1="210" x2="145" y2="232" stroke="#fff" stroke-width="3"/>
        <line x1="160" y1="210" x2="160" y2="232" stroke="#fff" stroke-width="1"/>
        <line x1="180" y1="210" x2="180" y2="232" stroke="#fff" stroke-width="4"/>
        <line x1="205" y1="210" x2="205" y2="232" stroke="#fff" stroke-width="2"/>
        <line x1="230" y1="210" x2="230" y2="232" stroke="#fff" stroke-width="3"/>
        <line x1="260" y1="210" x2="260" y2="232" stroke="#fff" stroke-width="2"/>
        <line x1="290" y1="210" x2="290" y2="232" stroke="#fff" stroke-width="3"/>
        <line x1="330" y1="210" x2="330" y2="232" stroke="#fff" stroke-width="2"/>

        <!-- 4 Gateway Units in Package -->
        <g transform="translate(110, 270)">
          <!-- Unit 1 -->
          <rect x="0" y="0" width="130" height="190" rx="6" fill="url(#blueUnit)" stroke="#1d4ed8" stroke-width="2"/>
          <text x="15" y="30" fill="#93c5fd" font-family="sans-serif" font-size="11" font-weight="bold">GATEWAY #1</text>
          <rect x="15" y="45" width="100" height="30" fill="#1e293b" rx="2"/>
          <circle cx="30" cy="60" r="4" fill="#22c55e"/>
          <circle cx="45" cy="60" r="4" fill="#22c55e"/>
          <circle cx="60" cy="60" r="4" fill="#22c55e"/>
          <circle cx="75" cy="60" r="4" fill="#22c55e"/>
          <text x="15" y="110" fill="#e2e8f0" font-family="monospace" font-size="10">4-PORT GBE</text>
          <text x="15" y="130" fill="#94a3b8" font-family="monospace" font-size="9">STEEL BLUE</text>
          <rect x="15" y="150" width="100" height="24" fill="#0f172a" rx="2"/>
          <text x="25" y="166" fill="#38bdf8" font-family="monospace" font-size="9">QC: PASS</text>
        </g>
        <g transform="translate(260, 270)">
          <!-- Unit 2 -->
          <rect x="0" y="0" width="130" height="190" rx="6" fill="url(#blueUnit)" stroke="#1d4ed8" stroke-width="2"/>
          <text x="15" y="30" fill="#93c5fd" font-family="sans-serif" font-size="11" font-weight="bold">GATEWAY #2</text>
          <rect x="15" y="45" width="100" height="30" fill="#1e293b" rx="2"/>
          <circle cx="30" cy="60" r="4" fill="#22c55e"/>
          <circle cx="45" cy="60" r="4" fill="#22c55e"/>
          <circle cx="60" cy="60" r="4" fill="#22c55e"/>
          <circle cx="75" cy="60" r="4" fill="#22c55e"/>
          <text x="15" y="110" fill="#e2e8f0" font-family="monospace" font-size="10">4-PORT GBE</text>
          <text x="15" y="130" fill="#94a3b8" font-family="monospace" font-size="9">STEEL BLUE</text>
          <rect x="15" y="150" width="100" height="24" fill="#0f172a" rx="2"/>
          <text x="25" y="166" fill="#38bdf8" font-family="monospace" font-size="9">QC: PASS</text>
        </g>
        <g transform="translate(410, 270)">
          <!-- Unit 3 -->
          <rect x="0" y="0" width="130" height="190" rx="6" fill="url(#blueUnit)" stroke="#1d4ed8" stroke-width="2"/>
          <text x="15" y="30" fill="#93c5fd" font-family="sans-serif" font-size="11" font-weight="bold">GATEWAY #3</text>
          <rect x="15" y="45" width="100" height="30" fill="#1e293b" rx="2"/>
          <circle cx="30" cy="60" r="4" fill="#22c55e"/>
          <circle cx="45" cy="60" r="4" fill="#22c55e"/>
          <circle cx="60" cy="60" r="4" fill="#22c55e"/>
          <circle cx="75" cy="60" r="4" fill="#22c55e"/>
          <text x="15" y="110" fill="#e2e8f0" font-family="monospace" font-size="10">4-PORT GBE</text>
          <text x="15" y="130" fill="#94a3b8" font-family="monospace" font-size="9">STEEL BLUE</text>
          <rect x="15" y="150" width="100" height="24" fill="#0f172a" rx="2"/>
          <text x="25" y="166" fill="#38bdf8" font-family="monospace" font-size="9">QC: PASS</text>
        </g>
        <g transform="translate(560, 270)">
          <!-- Unit 4 -->
          <rect x="0" y="0" width="130" height="190" rx="6" fill="url(#blueUnit)" stroke="#1d4ed8" stroke-width="2"/>
          <text x="15" y="30" fill="#93c5fd" font-family="sans-serif" font-size="11" font-weight="bold">GATEWAY #4</text>
          <rect x="15" y="45" width="100" height="30" fill="#1e293b" rx="2"/>
          <circle cx="30" cy="60" r="4" fill="#22c55e"/>
          <circle cx="45" cy="60" r="4" fill="#22c55e"/>
          <circle cx="60" cy="60" r="4" fill="#22c55e"/>
          <circle cx="75" cy="60" r="4" fill="#22c55e"/>
          <text x="15" y="110" fill="#e2e8f0" font-family="monospace" font-size="10">4-PORT GBE</text>
          <text x="15" y="130" fill="#94a3b8" font-family="monospace" font-size="9">STEEL BLUE</text>
          <rect x="15" y="150" width="100" height="24" fill="#0f172a" rx="2"/>
          <text x="25" y="166" fill="#38bdf8" font-family="monospace" font-size="9">QC: PASS</text>
        </g>
      </svg>
    `
  },
  {
    id: 'scenario-2-short-quantity',
    name: '2. Short Quantity (Deficit of 3 Units)',
    category: 'QUANTITY_MISMATCH',
    description: 'PO ordered 12 units of Temperature Sensors in molded tray. Package only contains 9 units; 3 grid cavities are empty.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9042',
      vendor: 'Precision Therm Sensor Ltd',
      expectedSku: 'SKU-SN-5020',
      productName: 'Precision Temperature Sensor Probe (Industrial PT100)',
      expectedQuantity: 12,
      expectedVariant: 'Stainless Steel Probe / 2m Braided Cable',
      expectedComponents: ['12x PT100 Probes', 'Calibration Certificate', 'Mounting Flanges'],
      carrierTracking: '1Z999AA10123456785',
      notes: 'High precision lot. Full count of 12 required.'
    },
    visualMetadata: {
      itemsDetected: 9,
      detectedSku: 'SKU-SN-5020',
      detectedVariant: 'Stainless Steel Probe / 2m Braided Cable',
      packagingStatus: 'INTACT',
      missingComponents: ['3x PT100 Probe Units']
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
          <linearGradient id="trayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#1e293b"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg2)"/>
        
        <!-- Tray Header -->
        <rect x="60" y="50" width="680" height="500" rx="10" fill="#1e293b" stroke="#475569" stroke-width="3"/>
        <text x="85" y="85" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="bold">MOLDED COMPONENT BLISTER TRAY (12-SLOT CAPACITY)</text>
        <text x="85" y="108" fill="#94a3b8" font-family="monospace" font-size="12">PO: ${po.poNumber} | SKU: ${po.expectedSku} | EXPECTED COUNT: ${po.expectedQuantity}</text>

        <!-- 3x4 Grid of Slots -->
        ${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => {
          const index = r * 4 + c;
          const x = 90 + c * 155;
          const y = 135 + r * 125;
          const isMissing = index >= 9; // Slots 10, 11, 12 missing

          if (isMissing) {
            return `
              <g>
                <rect x="${x}" y="${y}" width="140" height="110" rx="8" fill="#0f172a" stroke="#ef4444" stroke-width="2" stroke-dasharray="4,4"/>
                <circle cx="${x+70}" cy="${y+55}" r="22" fill="#450a0a" stroke="#ef4444" stroke-width="1.5"/>
                <text x="${x+70}" y="${y+60}" fill="#ef4444" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">EMPTY</text>
                <text x="${x+70}" y="${y+95}" fill="#f87171" font-family="monospace" font-size="10" text-anchor="middle">SLOT #${index+1}</text>
              </g>
            `;
          }

          return `
            <g>
              <rect x="${x}" y="${y}" width="140" height="110" rx="8" fill="#334155" stroke="#64748b" stroke-width="2"/>
              <!-- Probe graphic -->
              <rect x="${x+20}" y="${y+48}" width="100" height="14" rx="3" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1"/>
              <rect x="${x+90}" y="${y+43}" width="30" height="24" rx="2" fill="#0284c7"/>
              <circle cx="${x+30}" cy="${y+55}" r="5" fill="#e2e8f0"/>
              <text x="${x+70}" y="${y+95}" fill="#94a3b8" font-family="monospace" font-size="10" text-anchor="middle">PROBE #${index+1}</text>
            </g>
          `;
        }).join('')).join('')}
      </svg>
    `
  },
  {
    id: 'scenario-3-extra-quantity',
    name: '3. Extra Quantity (Overshipment of 1 Unit)',
    category: 'QUANTITY_MISMATCH',
    description: 'PO ordered 3 units of Micro PLC Controller Boxes. Package carton contains 4 physical units.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9043',
      vendor: 'Automation Systems Direct',
      expectedSku: 'SKU-MC-3011',
      productName: 'Micro PLC Controller Box (24VDC, 16-I/O)',
      expectedQuantity: 3,
      expectedVariant: 'Standard Din-Rail / Modbus RTU',
      expectedComponents: ['PLC Module', 'Programming Ribbon', 'Terminal Screws'],
      carrierTracking: '1Z999AA10123456786',
      notes: 'PO quantity strict authorization.'
    },
    visualMetadata: {
      itemsDetected: 4,
      detectedSku: 'SKU-MC-3011',
      detectedVariant: 'Standard Din-Rail / Modbus RTU',
      packagingStatus: 'INTACT',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <!-- Outer Box -->
        <rect x="60" y="60" width="680" height="480" rx="8" fill="#78350f" stroke="#b45309" stroke-width="3"/>
        <rect x="75" y="75" width="650" height="450" rx="6" fill="#fef3c7"/>
        
        <rect x="95" y="95" width="300" height="90" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" rx="4"/>
        <text x="110" y="120" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">PACKING SLIP</text>
        <text x="110" y="140" fill="#334155" font-family="monospace" font-size="12">PO: ${po.poNumber} | SKU: ${po.expectedSku}</text>
        <text x="110" y="160" fill="#b91c1c" font-family="sans-serif" font-size="12" font-weight="bold">AUTHORIZED QTY: ${po.expectedQuantity} UNITS</text>

        <!-- 4 Packed Units -->
        ${[0, 1, 2, 3].map(i => {
          const x = 95 + i * 155;
          const y = 220;
          const isExtra = i === 3;
          return `
            <g>
              <rect x="${x}" y="${y}" width="140" height="260" rx="6" fill="${isExtra ? '#450a0a' : '#1e293b'}" stroke="${isExtra ? '#ef4444' : '#0284c7'}" stroke-width="${isExtra ? '3' : '2'}"/>
              <rect x="${x+10}" y="${y+15}" width="120" height="60" rx="4" fill="#0f172a"/>
              <text x="${x+20}" y="${y+40}" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="bold">PLC-3011</text>
              <circle cx="${x+30}" cy="${y+60}" r="4" fill="#22c55e"/>
              <circle cx="${x+50}" cy="${y+60}" r="4" fill="#22c55e"/>
              <circle cx="${x+70}" cy="${y+60}" r="4" fill="#eab308"/>
              <text x="${x+70}" y="${y+120}" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">UNIT #${i+1}</text>
              ${isExtra ? `
                <rect x="${x+10}" y="${y+150}" width="120" height="85" fill="#7f1d1d" rx="4"/>
                <text x="${x+70}" y="${y+180}" fill="#fecaca" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">OVERAGE</text>
                <text x="${x+70}" y="${y+205}" fill="#fca5a5" font-family="monospace" font-size="10" text-anchor="middle">+1 EXTRA UNIT</text>
              ` : `
                <text x="${x+70}" y="${y+180}" fill="#94a3b8" font-family="monospace" font-size="10" text-anchor="middle">MATCHED PO</text>
              `}
            </g>
          `;
        }).join('')}
      </svg>
    `
  },
  {
    id: 'scenario-4-wrong-sku',
    name: '4. Wrong SKU (Mismatched Barcode Label)',
    category: 'SKU_MISMATCH',
    description: 'PO expected SKU-VR-8800 (High-Speed Optical Scanner 8800). Received shipping box barcode label displays SKU-VR-7200.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9044',
      vendor: 'OptiVision Systems Inc',
      expectedSku: 'SKU-VR-8800',
      productName: 'High-Speed Optical Scanner Model 8800 (GigE Vision)',
      expectedQuantity: 1,
      expectedVariant: 'GigE Vision / 12MP / C-Mount',
      expectedComponents: ['Scanner Head', 'Sensor Cable', 'Power Supply', 'Software Dongle'],
      carrierTracking: '1Z999AA10123456787',
      notes: 'Must be latest generation Model 8800. Do not accept 7200.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-VR-7200',
      detectedVariant: 'USB3 Vision / 5MP (Legacy)',
      packagingStatus: 'INTACT',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <rect x="100" y="80" width="600" height="440" rx="8" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        
        <!-- Big Product Box Label -->
        <rect x="140" y="120" width="520" height="360" rx="6" fill="#ffffff" stroke="#ef4444" stroke-width="3"/>
        
        <rect x="170" y="150" width="460" height="50" fill="#fee2e2" rx="4"/>
        <text x="185" y="182" fill="#991b1b" font-family="sans-serif" font-size="16" font-weight="bold">WARNING: PRODUCT IDENTIFICATION MISMATCH</text>
        
        <text x="170" y="240" fill="#0f172a" font-family="sans-serif" font-size="20" font-weight="bold">PRODUCT IDENTIFIER LABEL</text>
        <text x="170" y="275" fill="#64748b" font-family="sans-serif" font-size="14">PO EXPECTED SKU:</text>
        <text x="330" y="275" fill="#0284c7" font-family="monospace" font-size="16" font-weight="bold">${po.expectedSku}</text>
        
        <rect x="170" y="300" width="460" height="110" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" rx="4"/>
        <text x="190" y="335" fill="#64748b" font-family="sans-serif" font-size="14">PHYSICAL BARCODE SCANNED:</text>
        <text x="190" y="375" fill="#dc2626" font-family="monospace" font-size="28" font-weight="bold">SKU-VR-7200</text>
        <text x="420" y="375" fill="#dc2626" font-family="sans-serif" font-size="14" font-weight="bold">≠ EXPECTED</text>
        
        <!-- Scanned Barcode Graphic -->
        <rect x="190" y="420" width="420" height="35" fill="#0f172a"/>
        <line x1="210" y1="420" x2="210" y2="455" stroke="#fff" stroke-width="3"/>
        <line x1="240" y1="420" x2="240" y2="455" stroke="#fff" stroke-width="5"/>
        <line x1="280" y1="420" x2="280" y2="455" stroke="#fff" stroke-width="2"/>
        <line x1="330" y1="420" x2="330" y2="455" stroke="#fff" stroke-width="6"/>
        <line x1="380" y1="420" x2="380" y2="455" stroke="#fff" stroke-width="4"/>
        <line x1="450" y1="420" x2="450" y2="455" stroke="#fff" stroke-width="3"/>
        <line x1="520" y1="420" x2="520" y2="455" stroke="#fff" stroke-width="5"/>
      </svg>
    `
  },
  {
    id: 'scenario-5-wrong-variant',
    name: '5. Wrong Variant (Color / Storage Spec)',
    category: 'VARIANT_MISMATCH',
    description: 'PO specified 128GB Midnight Blue variant. Package label & physical device indicate 64GB Space Gray.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9045',
      vendor: 'MobileTech Enterprise Solutions',
      expectedSku: 'SKU-TS-4420-BLU',
      productName: 'Rugged Touch Tablet 10-inch (128GB, Midnight Blue)',
      expectedQuantity: 1,
      expectedVariant: 'Midnight Blue / 128GB Flash / IP68 Rugged',
      expectedComponents: ['Tablet Unit', 'Heavy-Duty Handstrap', 'Stylus', 'AC Fast Charger'],
      carrierTracking: '1Z999AA10123456788',
      notes: 'Customer specifically ordered Blue 128GB for field maintenance.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-TS-4420',
      detectedVariant: 'Space Gray / 64GB Flash / Standard',
      packagingStatus: 'INTACT',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <rect x="70" y="60" width="660" height="480" rx="10" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        
        <!-- Tablet Unit -->
        <rect x="100" y="100" width="320" height="400" rx="16" fill="#475569" stroke="#64748b" stroke-width="4"/>
        <rect x="120" y="120" width="280" height="340" rx="8" fill="#1e293b"/>
        <text x="260" y="270" fill="#94a3b8" font-family="sans-serif" font-size="16" text-anchor="middle">DEVICE DISPLAY</text>
        <text x="260" y="300" fill="#64748b" font-family="monospace" font-size="12" text-anchor="middle">HOUSING: SPACE GRAY</text>

        <!-- Spec Specification Label Panel -->
        <rect x="450" y="100" width="250" height="400" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <text x="470" y="135" fill="#0f172a" font-family="sans-serif" font-size="16" font-weight="bold">DEVICE SPEC TAG</text>
        
        <rect x="470" y="160" width="210" height="70" fill="#f1f5f9" rx="4"/>
        <text x="480" y="185" fill="#475569" font-family="sans-serif" font-size="11">PO EXPECTED VARIANT:</text>
        <text x="480" y="210" fill="#0284c7" font-family="monospace" font-size="12" font-weight="bold">128GB / Midnight Blue</text>

        <rect x="470" y="250" width="210" height="110" fill="#fee2e2" stroke="#ef4444" stroke-width="2" rx="4"/>
        <text x="480" y="275" fill="#991b1b" font-family="sans-serif" font-size="11" font-weight="bold">DETECTED PHYSICAL VARIANT:</text>
        <text x="480" y="305" fill="#dc2626" font-family="monospace" font-size="14" font-weight="bold">COLOR: SPACE GRAY</text>
        <text x="480" y="335" fill="#dc2626" font-family="monospace" font-size="14" font-weight="bold">CAPACITY: 64 GB</text>

        <rect x="470" y="380" width="210" height="90" fill="#0f172a" rx="4"/>
        <text x="480" y="410" fill="#f87171" font-family="monospace" font-size="11">STATUS: VARIANT MISMATCH</text>
        <text x="480" y="435" fill="#fca5a5" font-family="sans-serif" font-size="10">Requires customer approval</text>
      </svg>
    `
  },
  {
    id: 'scenario-6-crushed-packaging',
    name: '6. Crushed Packaging (Corner & Sidewall Collapse)',
    category: 'DAMAGE_CRUSH',
    description: 'PO ordered modular power supply. Received carton displays severe corner crush, sidewall crease, and structural impact deformation.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9046',
      vendor: 'Titan Power Systems',
      expectedSku: 'SKU-PS-9000',
      productName: 'Modular 750W Titanium Power Supply',
      expectedQuantity: 1,
      expectedVariant: 'Full Modular / 80+ Titanium / Ultra Quiet',
      expectedComponents: ['PSU Unit', 'Modular Cable Bag', 'Power Cord', 'Mounting Screws'],
      carrierTracking: '1Z999AA10123456789',
      notes: 'Fragile power electronics. Reject any impact or box crush damage.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-PS-9000',
      detectedVariant: 'Full Modular / 80+ Titanium',
      packagingStatus: 'CRUSHED',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="boxGrad6" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#b45309"/>
            <stop offset="100%" stop-color="#78350f"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="#0f172a"/>
        
        <!-- Distorted / Crushed Box Polygon -->
        <polygon points="120,160 550,110 680,380 580,520 220,530 90,390" fill="#d97706" stroke="#92400e" stroke-width="4"/>
        
        <!-- Crushed Corner Fracture Polygon at bottom-right / bottom-left -->
        <polygon points="550,110 680,380 580,520 500,420 540,280" fill="#92400e" stroke="#451a03" stroke-width="3"/>
        <path d="M 520,250 Q 560,350 630,390 T 570,510" fill="none" stroke="#78350f" stroke-width="6"/>
        <path d="M 540,280 L 610,340 L 580,420" fill="none" stroke="#451a03" stroke-width="4"/>
        
        <!-- Deep impact indentation and tear lines -->
        <polygon points="560,300 640,360 590,440 520,380" fill="#451a03" opacity="0.8"/>
        <line x1="530" y1="310" x2="650" y2="390" stroke="#fca5a5" stroke-width="3" stroke-dasharray="6,3"/>
        <line x1="510" y1="360" x2="620" y2="460" stroke="#ef4444" stroke-width="3"/>

        <!-- Box Label -->
        <g transform="translate(180, 200) rotate(-4)">
          <rect x="0" y="0" width="260" height="150" fill="#ffffff" rx="4" stroke="#94a3b8" stroke-width="2"/>
          <text x="15" y="30" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">INCOMING PACKAGE</text>
          <text x="15" y="60" fill="#334155" font-family="monospace" font-size="13">PO: ${po.poNumber}</text>
          <text x="15" y="85" fill="#334155" font-family="monospace" font-size="13" font-weight="bold">SKU: ${po.expectedSku}</text>
          <rect x="15" y="105" width="220" height="25" fill="#0f172a"/>
        </g>

        <!-- Defect Callout Banner -->
        <rect x="460" y="440" width="280" height="90" rx="6" fill="#450a0a" stroke="#ef4444" stroke-width="2"/>
        <text x="480" y="470" fill="#fecaca" font-family="sans-serif" font-size="14" font-weight="bold">DEFECT DETECTED</text>
        <text x="480" y="495" fill="#f87171" font-family="monospace" font-size="11">STRUCTURAL CORNER CRUSH</text>
        <text x="480" y="515" fill="#fca5a5" font-family="sans-serif" font-size="10">Sidewall buckling &amp; depth deformation</text>
      </svg>
    `
  },
  {
    id: 'scenario-7-water-damage',
    name: '7. Water Damage (Moisture Stain & Warped Fibers)',
    category: 'DAMAGE_WATER',
    description: 'PO ordered electronic control unit mainboards. Outer carton exhibits dark water tide marks, liquid soaking rings, and warped cardboard.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9047',
      vendor: 'CircuitTech Microelectronics',
      expectedSku: 'SKU-MB-1010',
      productName: 'Automotive Control Unit Mainboard (ECU Rev-4)',
      expectedQuantity: 2,
      expectedVariant: 'Rev-4.2 / Conformal Coated / ESD Sealed',
      expectedComponents: ['2x ECU Mainboards', 'ESD Shield Bags', 'Moisture Desiccant Packets'],
      carrierTracking: '1Z999AA10123456790',
      notes: 'ESD & Moisture Sensitive Level 3. Zero tolerance for moisture exposure.'
    },
    visualMetadata: {
      itemsDetected: 2,
      detectedSku: 'SKU-MB-1010',
      detectedVariant: 'Rev-4.2 / Conformal Coated',
      packagingStatus: 'WATER_DAMAGED',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="waterStain" cx="45%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#451a03" stop-opacity="0.95"/>
            <stop offset="50%" stop-color="#78350f" stop-opacity="0.85"/>
            <stop offset="85%" stop-color="#92400e" stop-opacity="0.6"/>
            <stop offset="100%" stop-color="#d97706" stop-opacity="0.0"/>
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="#0f172a"/>
        
        <!-- Cardboard Carton -->
        <rect x="90" y="80" width="620" height="440" rx="8" fill="#d97706" stroke="#b45309" stroke-width="3"/>
        
        <!-- Label partially damp -->
        <rect x="130" y="120" width="260" height="150" fill="#ffffff" rx="4" stroke="#94a3b8" stroke-width="2"/>
        <text x="150" y="150" fill="#0f172a" font-family="sans-serif" font-size="14" font-weight="bold">RECEIVING SLIP</text>
        <text x="150" y="180" fill="#334155" font-family="monospace" font-size="12">PO: ${po.poNumber}</text>
        <text x="150" y="205" fill="#334155" font-family="monospace" font-size="12" font-weight="bold">SKU: ${po.expectedSku}</text>
        <text x="150" y="235" fill="#0284c7" font-family="sans-serif" font-size="11">MSL-3 MOISTURE SENSITIVE</text>

        <!-- Water Stains Overlay -->
        <ellipse cx="480" cy="340" rx="190" ry="140" fill="url(#waterStain)"/>
        <ellipse cx="430" cy="390" rx="140" ry="90" fill="url(#waterStain)"/>
        <path d="M 320,280 Q 420,240 560,260 T 640,420 T 400,480 T 320,280" fill="none" stroke="#451a03" stroke-width="4" opacity="0.9"/>
        <path d="M 350,310 Q 450,280 530,300 T 590,400" fill="none" stroke="#78350f" stroke-width="3" opacity="0.8"/>

        <!-- Water damage callout -->
        <rect x="420" y="110" width="260" height="90" rx="6" fill="#450a0a" stroke="#ef4444" stroke-width="2"/>
        <text x="440" y="140" fill="#fecaca" font-family="sans-serif" font-size="14" font-weight="bold">MOISTURE INGRESS DETECTED</text>
        <text x="440" y="165" fill="#f87171" font-family="monospace" font-size="11">WATER TIDE DISCOLORATION</text>
        <text x="440" y="185" fill="#fca5a5" font-family="sans-serif" font-size="10">Corrugated fiber softening &amp; staining</text>
      </svg>
    `
  },
  {
    id: 'scenario-8-torn-packaging',
    name: '8. Torn Packaging & Broken Seal (Ripped Box)',
    category: 'DAMAGE_TORN',
    description: 'PO ordered Fiber Optic Splice Enclosure. Carton security tamper tape is sliced/torn open, box flap ripped.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9048',
      vendor: 'Optical Networks Direct',
      expectedSku: 'SKU-CS-6600',
      productName: 'Fiber Optic Splice Enclosure (Dome Type, 48-Fiber)',
      expectedQuantity: 1,
      expectedVariant: 'Dome Type / IP68 / 48-Splice Tray',
      expectedComponents: ['Splice Dome Enclosure', 'Base Clamp', 'Sealing Gasket', 'Splice Trays'],
      carrierTracking: '1Z999AA10123456791',
      notes: 'Tamper-evident security tape must be 100% intact.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-CS-6600',
      detectedVariant: 'Dome Type / IP68 / 48-Splice Tray',
      packagingStatus: 'TORN',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <!-- Shipping Box -->
        <rect x="80" y="80" width="640" height="440" rx="8" fill="#b45309" stroke="#78350f" stroke-width="3"/>
        <rect x="95" y="95" width="610" height="410" rx="6" fill="#d97706"/>

        <!-- Box Center Seam with Torn Tape -->
        <line x1="95" y1="280" x2="705" y2="280" stroke="#78350f" stroke-width="3"/>
        <!-- Security Tape -->
        <rect x="95" y="265" width="220" height="30" fill="#ef4444" opacity="0.9"/>
        <rect x="520" y="265" width="185" height="30" fill="#ef4444" opacity="0.9"/>
        
        <!-- Torn / Open Gap in Tape and Flap -->
        <polygon points="315,260 360,210 490,200 520,270 480,340 340,330" fill="#1e293b" stroke="#ef4444" stroke-width="3"/>
        <path d="M 315,265 Q 370,220 440,230 T 520,265" fill="none" stroke="#fca5a5" stroke-width="3" stroke-dasharray="4,4"/>
        <text x="410" y="295" fill="#fecaca" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">TORN VOID SEAL</text>
        <text x="410" y="315" fill="#f87171" font-family="monospace" font-size="10" text-anchor="middle">INTERIOR EXPOSED</text>

        <!-- Shipping Label -->
        <rect x="120" y="120" width="240" height="120" fill="#ffffff" rx="4" stroke="#94a3b8" stroke-width="2"/>
        <text x="135" y="145" fill="#0f172a" font-family="sans-serif" font-size="13" font-weight="bold">PACKAGE SEAL AUDIT</text>
        <text x="135" y="170" fill="#334155" font-family="monospace" font-size="11">PO: ${po.poNumber}</text>
        <text x="135" y="195" fill="#334155" font-family="monospace" font-size="11" font-weight="bold">SKU: ${po.expectedSku}</text>
        <text x="135" y="220" fill="#dc2626" font-family="sans-serif" font-size="10" font-weight="bold">SECURITY SEAL: COMPROMISED</text>
      </svg>
    `
  },
  {
    id: 'scenario-9-missing-component',
    name: '9. Missing Component (Empty Cutout Slot in Kit)',
    category: 'MISSING_COMPONENT',
    description: 'PO ordered Servo Motor Drive Kit with 4 items: Drive Unit, 100W Power Module, Encoder Cable, Mounting Bracket. The Encoder Cable foam slot is empty.',
    expectedVerdict: 'EXCEPTION',
    po: {
      poNumber: 'PO-2026-9049',
      vendor: 'Delta Dynamic Servo Corp',
      expectedSku: 'SKU-DR-2200',
      productName: 'Servo Motor Drive Kit (750W AC Servo + Encoder)',
      expectedQuantity: 1,
      expectedVariant: '750W 220VAC / Absolute Encoder / Pulse-Dir',
      expectedComponents: ['Servo Drive Unit', '100W Power Module', 'Encoder Cable (5m)', 'Mounting Bracket Kit'],
      carrierTracking: '1Z999AA10123456792',
      notes: 'All 4 modular kit components must be verified present.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-DR-2200',
      detectedVariant: '750W 220VAC / Absolute Encoder',
      packagingStatus: 'INTACT',
      missingComponents: ['Encoder Cable (5m)']
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="#0f172a"/>
        <!-- Foam Insert Case -->
        <rect x="70" y="60" width="660" height="480" rx="12" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        <text x="95" y="95" fill="#f8fafc" font-family="sans-serif" font-size="16" font-weight="bold">CUSTOM FOAM KIT ORGANIZER — SKU-DR-2200</text>
        <text x="95" y="118" fill="#94a3b8" font-family="monospace" font-size="11">PO: ${po.poNumber} | 4 MODULAR ACCESSORY CAVITIES</text>

        <!-- Slot 1: Servo Drive Unit (Present) -->
        <rect x="95" y="145" width="280" height="175" rx="6" fill="#0f172a" stroke="#0284c7" stroke-width="2"/>
        <rect x="110" y="160" width="250" height="145" rx="4" fill="#1e3a8a"/>
        <text x="125" y="190" fill="#93c5fd" font-family="sans-serif" font-size="13" font-weight="bold">1. SERVO DRIVE UNIT</text>
        <text x="125" y="215" fill="#bfdbfe" font-family="monospace" font-size="11">STATUS: PRESENT</text>
        <circle cx="330" cy="185" r="8" fill="#22c55e"/>

        <!-- Slot 2: 100W Power Module (Present) -->
        <rect x="405" y="145" width="300" height="175" rx="6" fill="#0f172a" stroke="#0284c7" stroke-width="2"/>
        <rect x="420" y="160" width="270" height="145" rx="4" fill="#1e293b"/>
        <text x="435" y="190" fill="#93c5fd" font-family="sans-serif" font-size="13" font-weight="bold">2. POWER MODULE (100W)</text>
        <text x="435" y="215" fill="#bfdbfe" font-family="monospace" font-size="11">STATUS: PRESENT</text>
        <circle cx="660" cy="185" r="8" fill="#22c55e"/>

        <!-- Slot 3: Encoder Cable (MISSING - EMPTY CAVITY) -->
        <rect x="95" y="340" width="280" height="175" rx="6" fill="#450a0a" stroke="#ef4444" stroke-width="3" stroke-dasharray="6,4"/>
        <rect x="110" y="355" width="250" height="145" rx="4" fill="#180505"/>
        <text x="125" y="385" fill="#ef4444" font-family="sans-serif" font-size="13" font-weight="bold">3. ENCODER CABLE (5M)</text>
        <text x="125" y="410" fill="#fca5a5" font-family="monospace" font-size="12" font-weight="bold">STATUS: MISSING (EMPTY)</text>
        <text x="125" y="440" fill="#f87171" font-family="sans-serif" font-size="11">Empty dark foam cutout void detected</text>
        <circle cx="330" cy="380" r="10" fill="#ef4444"/>
        <text x="330" y="385" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">✕</text>

        <!-- Slot 4: Mounting Bracket Kit (Present) -->
        <rect x="405" y="340" width="300" height="175" rx="6" fill="#0f172a" stroke="#0284c7" stroke-width="2"/>
        <rect x="420" y="355" width="270" height="145" rx="4" fill="#334155"/>
        <text x="435" y="385" fill="#93c5fd" font-family="sans-serif" font-size="13" font-weight="bold">4. BRACKET KIT</text>
        <text x="435" y="410" fill="#bfdbfe" font-family="monospace" font-size="11">STATUS: PRESENT</text>
        <circle cx="660" cy="380" r="8" fill="#22c55e"/>
      </svg>
    `
  },
  {
    id: 'scenario-10-ambiguous',
    name: '10. Ambiguous / Low Confidence (Specular Glare on Barcode)',
    category: 'AMBIGUOUS',
    description: 'PO ordered Radar Transceiver. Receiving barcode has high specular reflection / glare obstruction. Blind verifier reports low visibility -> CHALLENGED -> UNCERTAIN.',
    expectedVerdict: 'UNCERTAIN',
    po: {
      poNumber: 'PO-2026-9050',
      vendor: 'DefenseTech Avionics',
      expectedSku: 'SKU-RD-4000',
      productName: 'Radar Transceiver Unit (24GHz FMCW Radar)',
      expectedQuantity: 1,
      expectedVariant: '24GHz FMCW / RS-485 / Mil-Spec Housing',
      expectedComponents: ['Radar Unit', 'Calibrated Antenna Horn', 'Interface Harness'],
      carrierTracking: '1Z999AA10123456793',
      notes: 'Verify serial and model barcode.'
    },
    visualMetadata: {
      itemsDetected: 1,
      detectedSku: 'SKU-RD-40?? (Partially Glared)',
      detectedVariant: '24GHz FMCW / RS-485',
      packagingStatus: 'INTACT',
      missingComponents: []
    },
    svgVisual: (po) => `
      <svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="glareGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.0"/>
            <stop offset="45%" stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="60%" stop-color="#ffffff" stop-opacity="0.85"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <rect width="800" height="600" fill="#0f172a"/>
        <rect x="80" y="80" width="640" height="440" rx="8" fill="#1e293b" stroke="#334155" stroke-width="3"/>
        
        <!-- Label with Glare -->
        <rect x="140" y="130" width="520" height="340" fill="#ffffff" rx="6" stroke="#94a3b8" stroke-width="2"/>
        <text x="170" y="170" fill="#0f172a" font-family="sans-serif" font-size="16" font-weight="bold">RADAR TRANSCEIVER SPECIFICATION</text>
        <text x="170" y="200" fill="#475569" font-family="monospace" font-size="13">PO: ${po.poNumber}</text>
        <text x="170" y="235" fill="#334155" font-family="monospace" font-size="16" font-weight="bold">MODEL: SKU-RD-4000 (24GHz FMCW)</text>

        <!-- Barcode section -->
        <rect x="170" y="270" width="460" height="120" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" rx="4"/>
        <rect x="190" y="295" width="420" height="40" fill="#0f172a"/>
        <line x1="210" y1="295" x2="210" y2="335" stroke="#fff" stroke-width="4"/>
        <line x1="250" y1="295" x2="250" y2="335" stroke="#fff" stroke-width="3"/>
        <line x1="300" y1="295" x2="300" y2="335" stroke="#fff" stroke-width="5"/>
        <line x1="370" y1="295" x2="370" y2="335" stroke="#fff" stroke-width="3"/>
        <line x1="440" y1="295" x2="440" y2="335" stroke="#fff" stroke-width="4"/>
        <line x1="510" y1="295" x2="510" y2="335" stroke="#fff" stroke-width="3"/>

        <text x="190" y="365" fill="#64748b" font-family="monospace" font-size="14">SERIAL: SN-RD-984420-X</text>

        <!-- Intense Specular Glare / Flash Reflection across Barcode -->
        <ellipse cx="380" cy="315" rx="140" ry="70" fill="url(#glareGrad)" transform="rotate(-25 380 315)"/>
        <ellipse cx="370" cy="315" rx="60" ry="30" fill="#ffffff" opacity="0.95"/>

        <!-- Ambiguity Warning Banner -->
        <rect x="140" y="485" width="520" height="35" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="1"/>
        <text x="400" y="508" fill="#fef3c7" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">AMBIGUOUS: Specular reflection occludes 35% of optical barcode matrix</text>
      </svg>
    `
  }
];

/**
 * Generates PNG buffer and SHA-256 hash for a scenario
 * @param {string} scenarioId 
 */
async function getScenarioImageBuffer(scenarioId) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
  const svgString = scenario.svgVisual(scenario.po);
  
  const pngBuffer = await sharp(Buffer.from(svgString)).png().toBuffer();
  const sha256 = computeSha256(pngBuffer);
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  return {
    scenario,
    pngBuffer,
    sha256,
    dataUrl
  };
}

module.exports = {
  SCENARIOS,
  getScenarioImageBuffer
};
