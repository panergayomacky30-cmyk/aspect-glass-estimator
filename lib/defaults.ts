import type { EstimateProject, PricingRules, StorefrontOpening } from './types';
import { GLASS_TYPES } from './types';

/** ILLUSTRATIVE COSTS ONLY — not copied from confidential supplier quotations. */
export const DEFAULT_PRICING: PricingRules = {
  glassRates: {
    [GLASS_TYPES[0]]: 18,
    [GLASS_TYPES[1]]: 29,
    [GLASS_TYPES[2]]: 35,
    [GLASS_TYPES[3]]: 43,
  },
  framingRatePerLF: 20,
  glassWastePct: 5,
  frameWastePct: 5,
  singleDoorPackage: 900,
  doubleDoorPackage: 1650,
  laborRatePerHour: 70,
  freight: 250,
  equipment: 0,
  miscellaneous: 0,
  overheadAllowance: 0,
  contingencyPct: 10,
  contingencyBasis: 'glass',
  targetMarginPct: 25,
  salesCommissionPct: 0,
  paymentProcessingPct: 0,
};

export function newOpening(index = 1): StorefrontOpening {
  return {
    id: makeId(), mark: `SF-${String(index).padStart(2, '0')}`,
    quantity: 1, width: '120', height: '96', columns: 3, rows: 2,
    glassType: GLASS_TYPES[2], openingType: 'fixed',
    glassRateOverride: null, frameRateOverride: null,
    hardwareAllowance: 0, laborHoursPerAssembly: 6, note: '',
  };
}

function makeId(): string {
  return typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newProject(): EstimateProject {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return {
    version: 1, estimateNumber: `EST-${today.getFullYear()}-001`,
    projectName: 'Sample Storefront Project', clientName: '',
    location: '', estimator: '', date,
    framingSystem: '2 x 4-1/2 in aluminum storefront', finish: 'Dark Bronze Anodized',
    scopeNotes: 'Preliminary budget estimate. Verify field dimensions, plans, specifications, system compatibility, and vendor quotations prior to acceptance.',
    openings: [newOpening(1)],
    pricing: structuredClone(DEFAULT_PRICING),
  };
}

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const txt = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.slice(0, 3000) : fallback;

/** Import old project backups defensively. Never treat uploaded JSON as executable content. */
export function normalizeProject(input: unknown): EstimateProject | null {
  if (input === null || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.openings) || o.openings.length > 200) return null;
  const defaults = newProject();
  const p = o.pricing && typeof o.pricing === 'object' ? o.pricing as Record<string, unknown> : {};
  const rawRates = p.glassRates && typeof p.glassRates === 'object' ? p.glassRates as Record<string, unknown> : {};
  const pricing: PricingRules = {
    ...defaults.pricing,
    glassRates: Object.fromEntries(GLASS_TYPES.map((key) => [key, num(rawRates[key], defaults.pricing.glassRates[key])])) as PricingRules['glassRates'],
    framingRatePerLF: num(p.framingRatePerLF, defaults.pricing.framingRatePerLF),
    glassWastePct: num(p.glassWastePct, defaults.pricing.glassWastePct),
    frameWastePct: num(p.frameWastePct, defaults.pricing.frameWastePct),
    singleDoorPackage: num(p.singleDoorPackage, defaults.pricing.singleDoorPackage),
    doubleDoorPackage: num(p.doubleDoorPackage, defaults.pricing.doubleDoorPackage),
    laborRatePerHour: num(p.laborRatePerHour, defaults.pricing.laborRatePerHour),
    freight: num(p.freight, defaults.pricing.freight),
    equipment: num(p.equipment, defaults.pricing.equipment),
    miscellaneous: num(p.miscellaneous, defaults.pricing.miscellaneous),
    overheadAllowance: num(p.overheadAllowance, defaults.pricing.overheadAllowance),
    contingencyPct: num(p.contingencyPct, defaults.pricing.contingencyPct),
    contingencyBasis: p.contingencyBasis === 'direct' ? 'direct' : 'glass',
    targetMarginPct: num(p.targetMarginPct, defaults.pricing.targetMarginPct),
    salesCommissionPct: num(p.salesCommissionPct, defaults.pricing.salesCommissionPct),
    paymentProcessingPct: num(p.paymentProcessingPct, defaults.pricing.paymentProcessingPct),
  };
  const openings: StorefrontOpening[] = o.openings.map((entry, i) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const base = newOpening(i + 1);
    const rawGlassRate = item.glassRateOverride;
    const rawFrameRate = item.frameRateOverride;
    return {
      ...base,
      id: txt(item.id, base.id), mark: txt(item.mark, base.mark),
      quantity: num(item.quantity, base.quantity),
      width: txt(item.width, base.width), height: txt(item.height, base.height),
      columns: num(item.columns, base.columns), rows: num(item.rows, base.rows),
      glassType: GLASS_TYPES.includes(item.glassType as typeof GLASS_TYPES[number])
        ? item.glassType as typeof GLASS_TYPES[number] : base.glassType,
      openingType: item.openingType === 'single-door' || item.openingType === 'double-door' ? item.openingType : 'fixed',
      glassRateOverride: rawGlassRate === null || rawGlassRate === undefined ? null : num(rawGlassRate, base.glassRateOverride ?? 0),
      frameRateOverride: rawFrameRate === null || rawFrameRate === undefined ? null : num(rawFrameRate, base.frameRateOverride ?? 0),
      hardwareAllowance: num(item.hardwareAllowance, base.hardwareAllowance),
      laborHoursPerAssembly: num(item.laborHoursPerAssembly, base.laborHoursPerAssembly),
      note: txt(item.note),
    };
  });
  return {
    version: 1,
    estimateNumber: txt(o.estimateNumber, defaults.estimateNumber),
    projectName: txt(o.projectName, defaults.projectName),
    clientName: txt(o.clientName), location: txt(o.location),
    estimator: txt(o.estimator), date: txt(o.date, defaults.date),
    framingSystem: txt(o.framingSystem, defaults.framingSystem),
    finish: txt(o.finish, defaults.finish), scopeNotes: txt(o.scopeNotes, defaults.scopeNotes),
    openings, pricing,
  };
}
