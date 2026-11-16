import type { EstimateProject, EstimateTotals, OpeningCalculation, PricingRules, StorefrontOpening } from './types';

/**
 * Convert inches strings to decimal inches.
 * Examples: 59 1/4, 59-1/4, 5' 3 1/2", 5' 3-1/2", 59.25, 3/4.
 * Never treat a guessed PDF scale or rough opening as an approved glass cut size.
 */
export function parseInches(input: string): number | null {
  if (typeof input !== 'string') return null;
  let str = input.trim().replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  str = str.replace(/\binches?\b|\bin\.?\b/gi, '').trim();
  if (!str) return null;

  let feet = 0;
  if (str.includes("'")) {
    const matched = str.match(/^(\d+(?:\.\d+)?)\s*'\s*(.*)$/);
    if (!matched) return null;
    feet = Number(matched[1]);
    str = matched[2].trim().replace(/^[-\s]+/, '');
  }
  str = str.replace(/"/g, '').replace(/(\d)-(\d+\/\d+)/g, '$1 $2').trim();
  if (/[^\d./\s]/.test(str)) return null;
  const parts = str ? str.split(/\s+/) : [];
  if (parts.length > 2) return null;
  let inches = 0;
  let fractions = 0;
  for (const p of parts) {
    if (/^\d+\/\d+$/.test(p)) {
      fractions += 1;
      const [num, den] = p.split('/').map(Number);
      if (!den || num >= den) return null;
      inches += num / den;
    } else if (/^\d+(?:\.\d+)?$/.test(p)) {
      inches += Number(p);
    } else {
      return null;
    }
  }
  if (fractions > 1 || !Number.isFinite(inches) || !Number.isFinite(feet)) return null;
  const total = feet * 12 + inches;
  return total > 0 ? total : null;
}

function validMoney(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function validPercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

export function validateProject(project: EstimateProject): string[] {
  const errors: string[] = [];
  if (!project.projectName.trim()) errors.push('Enter a project name.');
  if (!project.estimateNumber.trim()) errors.push('Enter an estimate number.');
  if (project.openings.length === 0) errors.push('Add at least one storefront opening.');

  const usedMarks = new Set<string>();
  for (const opening of project.openings) {
    const label = opening.mark.trim() || '(unmarked opening)';
    const markKey = label.toUpperCase();
    if (!opening.mark.trim()) errors.push('Every opening needs a mark.');
    if (usedMarks.has(markKey)) errors.push(`${label}: duplicate opening mark.`);
    usedMarks.add(markKey);
    if (parseInches(opening.width) === null) errors.push(`${label}: enter a valid width (for example 59 1/4).`);
    if (parseInches(opening.height) === null) errors.push(`${label}: enter a valid height.`);
    if (!Number.isInteger(opening.quantity) || opening.quantity < 1) errors.push(`${label}: quantity must be a whole number of at least 1.`);
    if (!Number.isInteger(opening.columns) || opening.columns < 1) errors.push(`${label}: columns must be a whole number of at least 1.`);
    if (!Number.isInteger(opening.rows) || opening.rows < 1) errors.push(`${label}: rows must be a whole number of at least 1.`);
    if (!validMoney(opening.hardwareAllowance) || !validMoney(opening.laborHoursPerAssembly)) errors.push(`${label}: hardware allowance and labor hours must be zero or greater.`);
    if (opening.glassRateOverride !== null && !validMoney(opening.glassRateOverride)) errors.push(`${label}: the glass rate override is invalid.`);
    if (opening.frameRateOverride !== null && !validMoney(opening.frameRateOverride)) errors.push(`${label}: the frame rate override is invalid.`);
  }
  const p = project.pricing;
  for (const [name, n] of [
    ['Frame rate', p.framingRatePerLF], ['Single-door package', p.singleDoorPackage],
    ['Double-door package', p.doubleDoorPackage], ['Labor rate', p.laborRatePerHour],
    ['Freight', p.freight], ['Equipment', p.equipment], ['Miscellaneous', p.miscellaneous],
    ['Overhead', p.overheadAllowance],
    ...Object.entries(p.glassRates).map(([name, val]) => [`${name} price`, val] as [string, number]),
  ] as [string, number][]) {
    if (!validMoney(n)) errors.push(`${name} must be zero or greater.`);
  }
  for (const [name, n] of [
    ['Glass allowance', p.glassWastePct], ['Frame allowance', p.frameWastePct],
    ['Contingency', p.contingencyPct], ['Margin', p.targetMarginPct],
    ['Commission', p.salesCommissionPct], ['Payment processing', p.paymentProcessingPct],
  ] as [string, number][]) {
    if (!validPercent(n)) errors.push(`${name} must be between 0% and 100%.`);
  }
  if (p.targetMarginPct + p.salesCommissionPct + p.paymentProcessingPct >= 100) {
    errors.push('Target margin + commission + processing fees must be below 100%.');
  }
  return [...new Set(errors)];
}

export function calculateOpening(opening: StorefrontOpening, pricing: PricingRules): OpeningCalculation | null {
  const w = parseInches(opening.width);
  const h = parseInches(opening.height);
  if (w === null || h === null || !Number.isInteger(opening.quantity) || opening.quantity < 1 ||
      !Number.isInteger(opening.columns) || opening.columns < 1 ||
      !Number.isInteger(opening.rows) || opening.rows < 1) return null;

  const q = opening.quantity;
  // ESTIMATING ONLY: opening area is used, not engineered glass cut size.
  const grossSF = (w * h / 144) * q;
  const purchasableGlassSF = grossSF * (1 + pricing.glassWastePct / 100);
  // One outer perimeter + continuous interior mullions/transoms (no fabrication waste counted here).
  const netFrameLF = ((2 * (w + h)) + (opening.columns - 1) * h + (opening.rows - 1) * w) / 12 * q;
  const purchasableFrameLF = netFrameLF * (1 + pricing.frameWastePct / 100);
  const glassRate = opening.glassRateOverride ?? pricing.glassRates[opening.glassType];
  const frameRate = opening.frameRateOverride ?? pricing.framingRatePerLF;
  const glassCost = purchasableGlassSF * glassRate;
  const frameCost = purchasableFrameLF * frameRate;
  const doorPackageCost = q * (
    opening.openingType === 'single-door' ? pricing.singleDoorPackage :
    opening.openingType === 'double-door' ? pricing.doubleDoorPackage : 0
  );
  const hardwareAllowanceCost = q * opening.hardwareAllowance;
  const laborCost = q * opening.laborHoursPerAssembly * pricing.laborRatePerHour;
  return {
    opening, widthInches: w, heightInches: h, grossSF, purchasableGlassSF,
    netFrameLF, purchasableFrameLF, glassCost, frameCost, doorPackageCost,
    hardwareAllowanceCost, laborCost,
    total: glassCost + frameCost + doorPackageCost + hardwareAllowanceCost + laborCost,
  };
}

export function calculateEstimate(project: EstimateProject): EstimateTotals {
  const pricing = project.pricing;
  const errors = validateProject(project);
  const lines = project.openings.flatMap((o) => {
    const line = calculateOpening(o, pricing);
    return line ? [line] : [];
  });
  const sum = (key: keyof OpeningCalculation) => lines.reduce((acc, x) => acc + (x[key] as number), 0);
  const glassCost = sum('glassCost');
  const frameCost = sum('frameCost');
  const doorPackageCost = sum('doorPackageCost');
  const additionalHardwareCost = sum('hardwareAllowanceCost');
  const laborCost = sum('laborCost');
  const directCost = glassCost + frameCost + doorPackageCost + additionalHardwareCost + laborCost +
    pricing.freight + pricing.equipment + pricing.miscellaneous + pricing.overheadAllowance;
  const contingencyBase = pricing.contingencyBasis === 'glass' ? glassCost : directCost;
  const contingency = contingencyBase * pricing.contingencyPct / 100;
  const totalCost = directCost + contingency;
  const marginRate = pricing.targetMarginPct / 100;
  const commissionRate = pricing.salesCommissionPct / 100;
  const processingRate = pricing.paymentProcessingPct / 100;
  const denominator = 1 - marginRate - commissionRate - processingRate;
  const sellingPrice = denominator > 0 ? totalCost / denominator : 0;
  const commissionFee = sellingPrice * commissionRate;
  const paymentFee = sellingPrice * processingRate;
  const projectedProfit = sellingPrice - totalCost - commissionFee - paymentFee;
  return {
    lines, errors,
    totalAssemblies: lines.reduce((n, l) => n + l.opening.quantity, 0),
    totalGlassSF: sum('grossSF'), totalFrameLF: sum('netFrameLF'),
    glassCost, frameCost, doorPackageCost, additionalHardwareCost, laborCost,
    freight: pricing.freight, equipment: pricing.equipment,
    miscellaneous: pricing.miscellaneous, overhead: pricing.overheadAllowance,
    directCost, contingency, totalCost, commissionFee, paymentFee,
    sellingPrice, projectedProfit,
    projectedMarginPct: sellingPrice > 0 ? projectedProfit / sellingPrice * 100 : 0,
  };
}

export const currency = (value: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
export const decimal = (value: number, places = 2): string =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: places, maximumFractionDigits: places }).format(value);

export function formatOpeningType(value: StorefrontOpening['openingType']) {
  return value === 'fixed' ? 'Fixed glazing' : value === 'single-door' ? 'Single-door entrance' : 'Double-door entrance';
}
