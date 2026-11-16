
'use client';

import { currency, decimal } from '../lib/calculations';
import type {
  EstimateTotals,
  OpeningCalculation,
  PricingRules,
} from '../lib/types';

// Show 4 decimals for measurements.
// The calculation engine keeps full precision.
const num = (n: number) => decimal(n, 4);
const percent = (n: number) => decimal(n, 2);

type Row = [
  label: string,
  formula: string,
  result: string
];

function CalculationDropdown({
  title,
  rows,
  note,
}: {
  title: string;
  rows: Row[];
  note: string;
}) {
  return (
    <details
      style={{
        margin: '14px 0',
        border: '1px solid #cbded6',
        borderRadius: 10,
        background: '#f7fbf9',
        color: '#20384a',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          padding: '13px 15px',
          cursor: 'pointer',
          color: '#166e56',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {title}
      </summary>

      <div style={{ padding: '0 15px 14px' }}>
        {rows.map(([label, formula, result], i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) auto',
              gap: 14,
              padding: '12px 0',
              borderBottom: '1px solid #dce7e2',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong
                style={{
                  display: 'block',
                  fontSize: 12,
                }}
              >
                {label}
              </strong>

              <div
                style={{
                  color: '#607787',
                  fontSize: 11,
                  lineHeight: 1.6,
                  fontFamily: 'Consolas, monospace',
                  overflowWrap: 'anywhere',
                  marginTop: 4,
                }}
              >
                {formula}
              </div>
            </div>

            <strong
              style={{
                fontSize: 12,
                color: '#117958',
                whiteSpace: 'nowrap',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {result}
            </strong>
          </div>
        ))}

        <p
          style={{
            fontSize: 11,
            lineHeight: 1.6,
            color: '#687c88',
          }}
        >
          {note}
        </p>
      </div>
    </details>
  );
}

// Calculation breakdown for each storefront opening.
export function OpeningCalculationBreakdown({
  line,
  pricing,
}: {
  line: OpeningCalculation;
  pricing: PricingRules;
}) {
  const o = line.opening;
  const w = line.widthInches;
  const h = line.heightInches;
  const q = o.quantity;

  const glassRate =
    o.glassRateOverride ??
    pricing.glassRates[o.glassType];

  const frameRate =
    o.frameRateOverride ??
    pricing.framingRatePerLF;

  const doorRate =
    o.openingType === 'single-door'
      ? pricing.singleDoorPackage
      : o.openingType === 'double-door'
        ? pricing.doubleDoorPackage
        : 0;

  const rows: Row[] = [
    [
      'Gross opening area (SF)',
      `(${num(w)} in × ${num(h)} in ÷ 144) × ${q}`,
      `${num(line.grossSF)} SF`,
    ],
    [
      'Glass area with allowance',
      `${num(line.grossSF)} SF × (1 + ${percent(pricing.glassWastePct)} ÷ 100)`,
      `${num(line.purchasableGlassSF)} SF`,
    ],
    [
      'Net framing length (LF)',
      `([2 × (${num(w)} + ${num(h)})] + [(${o.columns} − 1) × ${num(h)}] + [(${o.rows} − 1) × ${num(w)}]) ÷ 12 × ${q}`,
      `${num(line.netFrameLF)} LF`,
    ],
    [
      'Framing length with allowance',
      `${num(line.netFrameLF)} LF × (1 + ${percent(pricing.frameWastePct)} ÷ 100)`,
      `${num(line.purchasableFrameLF)} LF`,
    ],
    [
      'Glass cost',
      `${num(line.purchasableGlassSF)} SF × ${currency(glassRate)}/SF${o.glassRateOverride !== null ? ' (custom rate)' : ''}`,
      currency(line.glassCost),
    ],
    [
      'Framing cost',
      `${num(line.purchasableFrameLF)} LF × ${currency(frameRate)}/LF${o.frameRateOverride !== null ? ' (custom rate)' : ''}`,
      currency(line.frameCost),
    ],
    [
      'Door package',
      `${q} × ${currency(doorRate)} per assembly (${o.openingType})`,
      currency(line.doorPackageCost),
    ],
    [
      'Additional hardware',
      `${q} × ${currency(o.hardwareAllowance)} per assembly`,
      currency(line.hardwareAllowanceCost),
    ],
    [
      'Installation labor',
      `${q} × ${num(o.laborHoursPerAssembly)} hours × ${currency(pricing.laborRatePerHour)}/hour`,
      currency(line.laborCost),
    ],
    [
      'Estimated line cost',
      `${currency(line.glassCost)} + ${currency(line.frameCost)} + ${currency(line.doorPackageCost)} + ${currency(line.hardwareAllowanceCost)} + ${currency(line.laborCost)}`,
      currency(line.total),
    ],
  ];

  return (
    <CalculationDropdown
      title={`▸ Show computation — ${o.mark || 'Opening'}`}
      rows={rows}
      note="Opening area and simplified framing lengths are budgeting estimates, not glass cut sizes or fabrication quantities. Intermediate values are rounded for display only."
    />
  );
}

// Calculation breakdown for the complete project.
export function ProjectCalculationBreakdown({
  totals,
  pricing,
}: {
  totals: EstimateTotals;
  pricing: PricingRules;
}) {
  const feeTotal =
    pricing.targetMarginPct +
    pricing.salesCommissionPct +
    pricing.paymentProcessingPct;

  const denominator = 1 - feeTotal / 100;

  const contingencyBase =
    pricing.contingencyBasis === 'glass'
      ? totals.glassCost
      : totals.directCost;

  const rows: Row[] = [
    [
      'Gross glass area',
      'Sum of gross opening areas for all marks',
      `${num(totals.totalGlassSF)} SF`,
    ],
    [
      'Net framing length',
      'Sum of net framing lengths for all marks',
      `${num(totals.totalFrameLF)} LF`,
    ],
    [
      'Glass + frame cost',
      `${currency(totals.glassCost)} + ${currency(totals.frameCost)}`,
      currency(totals.glassCost + totals.frameCost),
    ],
    [
      'Direct project cost',
      `${currency(totals.glassCost)} glass + ${currency(totals.frameCost)} frame + ${currency(totals.doorPackageCost)} door + ${currency(totals.additionalHardwareCost)} hardware + ${currency(totals.laborCost)} labor + ${currency(totals.freight)} freight + ${currency(totals.equipment)} equipment + ${currency(totals.miscellaneous)} misc. + ${currency(totals.overhead)} overhead`,
      currency(totals.directCost),
    ],
    [
      'Contingency',
      `${currency(contingencyBase)} (${pricing.contingencyBasis === 'glass' ? 'glass cost' : 'direct project cost'}) × ${percent(pricing.contingencyPct)}%`,
      currency(totals.contingency),
    ],
    [
      'Total estimated cost',
      `${currency(totals.directCost)} direct cost + ${currency(totals.contingency)} contingency`,
      currency(totals.totalCost),
    ],
    [
      'Selling-price divisor',
      `1 − (${percent(pricing.targetMarginPct)}% target margin + ${percent(pricing.salesCommissionPct)}% commission + ${percent(pricing.paymentProcessingPct)}% processing) ÷ 100`,
      num(denominator),
    ],
    [
      'Internal estimated selling price',
      `${currency(totals.totalCost)} ÷ ${num(denominator)}`,
      denominator > 0
        ? currency(totals.sellingPrice)
        : 'Invalid rates',
    ],
    [
      'Sales commission',
      `${currency(totals.sellingPrice)} × ${percent(pricing.salesCommissionPct)}%`,
      currency(totals.commissionFee),
    ],
    [
      'Payment-processing fees',
      `${currency(totals.sellingPrice)} × ${percent(pricing.paymentProcessingPct)}%`,
      currency(totals.paymentFee),
    ],
    [
      'Projected profit',
      `${currency(totals.sellingPrice)} selling price − ${currency(totals.totalCost)} total cost − ${currency(totals.commissionFee)} commission − ${currency(totals.paymentFee)} processing`,
      denominator > 0
        ? currency(totals.projectedProfit)
        : 'Invalid rates',
    ],
    [
      'Projected margin',
      `${currency(totals.projectedProfit)} ÷ ${currency(totals.sellingPrice)} × 100`,
      denominator > 0
        ? `${percent(totals.projectedMarginPct)}%`
        : 'Invalid rates',
    ],
  ];

  const note =
    (totals.errors.length
      ? 'Some inputs are invalid; correct them before relying on these results. '
      : '') +
    'Values update automatically. Figures are rounded for display; the existing pricing engine retains full precision.';

  return (
    <CalculationDropdown
      title="▸ Show complete project computation"
      rows={rows}
      note={note}
    />
  );
}
