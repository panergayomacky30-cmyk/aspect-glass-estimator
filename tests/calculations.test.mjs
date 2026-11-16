import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateEstimate, calculateOpening, parseInches } from '../lib/calculations.ts';

const baseOpening = () => ({
  id: '1', mark: 'SF-01', quantity: 2, width: '60', height: '96',
  columns: 2, rows: 1, glassType: '1" Insulated Clear', openingType: 'fixed',
  glassRateOverride: null, frameRateOverride: null,
  hardwareAllowance: 100, laborHoursPerAssembly: 5, note: ''
});
const pricing = () => ({
  glassRates: {'1/4" Clear Tempered': 18, '1/2" Clear Tempered': 29,
    '1" Insulated Clear': 30, '1" Insulated Low-E': 40},
  framingRatePerLF: 20, glassWastePct: 0, frameWastePct: 0,
  singleDoorPackage: 1000, doubleDoorPackage: 1800,
  laborRatePerHour: 50, freight: 200, equipment: 0,
  miscellaneous: 0, overheadAllowance: 0, contingencyPct: 10,
  contingencyBasis: 'glass', targetMarginPct: 20,
  salesCommissionPct: 5, paymentProcessingPct: 0,
});
const project = () => ({
  version: 1, estimateNumber: 'EST-TEST', projectName: 'Demo', clientName: '', location: '',
  estimator: '', date: '2026-11-17', framingSystem: '2x4', finish: 'Bronze', scopeNotes: '',
  openings: [baseOpening()], pricing: pricing(),
});

test('reads imperial mixed fractions and feet', () => {
  assert.equal(parseInches('59 1/4'), 59.25);
  assert.equal(parseInches('59-1/4'), 59.25);
  assert.equal(parseInches('5\' 3-1/2"'), 63.5);
  assert.equal(parseInches('3/4'), 0.75);
  assert.equal(parseInches('59.25'), 59.25);
  assert.equal(parseInches('12"'), 12);
  assert.equal(parseInches('abc'), null);
  assert.equal(parseInches('-3'), null);
  assert.equal(parseInches('1/0'), null);
  assert.equal(parseInches('0'), null);
});

test('computes opening square footage, framing, costs, quantities', () => {
  const l = calculateOpening(baseOpening(), pricing());
  assert.ok(l);
  // 60x96 / 144 x 2 = 80 square feet
  assert.equal(l.grossSF, 80);
  // Per unit: perimeter 2(60+96)=312 in + 1 vertical 96 in = 408 in = 34 ft. x 2 = 68 ft
  assert.equal(l.netFrameLF, 68);
  assert.equal(l.glassCost, 2400);
  assert.equal(l.frameCost, 1360);
  assert.equal(l.hardwareAllowanceCost, 200);
  assert.equal(l.laborCost, 500);
  assert.equal(l.total, 4460);
});

test('calculates target profit margin after percentage-of-sale fees', () => {
  const result = calculateEstimate(project());
  // direct: opening 4460 + freight 200 = 4660; risk 10% of 2400 = 240.
  // price: 4900 / (1 - 0.20 - 0.05) = 6533.333...
  assert.equal(result.errors.length, 0);
  assert.equal(result.totalCost, 4900);
  assert.ok(Math.abs(result.sellingPrice - 6533.333333333333) < 1e-7);
  assert.ok(Math.abs(result.projectedMarginPct - 20) < 1e-9);
  assert.equal(result.totalAssemblies, 2);
});

test('door package is multiplied per assembly', () => {
  const o = {...baseOpening(), openingType: 'double-door'};
  const line = calculateOpening(o, pricing());
  assert.equal(line.doorPackageCost, 3600);
});

test('rejects duplicate marks, invalid dimensions and impossible margin', () => {
  const p = project();
  p.openings.push({...baseOpening(), id: '2', width: '??'});
  p.pricing.targetMarginPct = 96;
  const res = calculateEstimate(p);
  assert.ok(res.errors.some((e) => e.includes('duplicate')));
  assert.ok(res.errors.some((e) => e.includes('valid width')));
  assert.ok(res.errors.some((e) => e.includes('below 100%')));
});

test('applies specified glass and framing material allowances', () => {
  const p = pricing();
  p.glassWastePct = 5;
  p.frameWastePct = 10;
  const line = calculateOpening(baseOpening(), p);
  assert.ok(Math.abs(line.purchasableGlassSF - 84) < 0.001);
  assert.ok(Math.abs(line.purchasableFrameLF - 74.8) < 0.001);
});
