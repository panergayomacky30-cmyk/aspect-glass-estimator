export const GLASS_TYPES = [
  '1/4" Clear Tempered',
  '1/2" Clear Tempered',
  '1" Insulated Clear',
  '1" Insulated Low-E',
] as const;

export type GlassType = (typeof GLASS_TYPES)[number];
export type OpeningType = 'fixed' | 'single-door' | 'double-door';
export type ContingencyBasis = 'glass' | 'direct';

export interface StorefrontOpening {
  id: string;
  mark: string;
  quantity: number;
  /** A text field to support fractions (e.g. 59 1/4 or 5' 3 1/2). */
  width: string;
  height: string;
  columns: number;
  rows: number;
  glassType: GlassType;
  openingType: OpeningType;
  glassRateOverride: number | null;
  frameRateOverride: number | null;
  hardwareAllowance: number;
  laborHoursPerAssembly: number;
  note: string;
}

export interface PricingRules {
  glassRates: Record<GlassType, number>;
  framingRatePerLF: number;
  glassWastePct: number;
  frameWastePct: number;
  singleDoorPackage: number;
  doubleDoorPackage: number;
  laborRatePerHour: number;
  freight: number;
  equipment: number;
  miscellaneous: number;
  overheadAllowance: number;
  contingencyPct: number;
  contingencyBasis: ContingencyBasis;
  targetMarginPct: number;
  salesCommissionPct: number;
  paymentProcessingPct: number;
}

export interface EstimateProject {
  version: 1;
  estimateNumber: string;
  projectName: string;
  clientName: string;
  location: string;
  estimator: string;
  date: string;
  framingSystem: string;
  finish: string;
  scopeNotes: string;
  openings: StorefrontOpening[];
  pricing: PricingRules;
}

export interface OpeningCalculation {
  opening: StorefrontOpening;
  widthInches: number;
  heightInches: number;
  grossSF: number;
  purchasableGlassSF: number;
  netFrameLF: number;
  purchasableFrameLF: number;
  glassCost: number;
  frameCost: number;
  doorPackageCost: number;
  hardwareAllowanceCost: number;
  laborCost: number;
  total: number;
}

export interface EstimateTotals {
  lines: OpeningCalculation[];
  errors: string[];
  totalAssemblies: number;
  totalGlassSF: number;
  totalFrameLF: number;
  glassCost: number;
  frameCost: number;
  doorPackageCost: number;
  additionalHardwareCost: number;
  laborCost: number;
  freight: number;
  equipment: number;
  miscellaneous: number;
  overhead: number;
  directCost: number;
  contingency: number;
  totalCost: number;
  commissionFee: number;
  paymentFee: number;
  sellingPrice: number;
  projectedProfit: number;
  projectedMarginPct: number;
}
