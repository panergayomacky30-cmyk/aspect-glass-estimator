
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  currency,
  decimal,
  formatOpeningType,
  parseInches,
} from '../lib/calculations';
import {
  newOpening,
  newProject,
  normalizeProject,
} from '../lib/defaults';
import { GLASS_TYPES } from '../lib/types';
import type {
  EstimateProject,
  PricingRules,
  StorefrontOpening,
} from '../lib/types';

// ASPECT OFFICE FIT-OUT V1.6.2
// Per-opening calculations, automatic glass and
// framing rates, custom overrides, saved estimates.

type Tab = 'estimate' | 'pricing' | 'saved';
type Mode = 'calculated' | 'manual';

type Opening = StorefrontOpening & {
  glassMode: Mode;
  hardwareMode: Mode;
  manualGlassCostEach: number;
  manualHardwareCostEach: number;
  opexPerAssembly: number;
  targetGrossNetPct: number | null;
};

type Rules = PricingRules & {
  hardwareFixedFee: number;
  hardwareTaxPct: number;
  glassDiscountPct: number;
  riskPct: number;
  ccSurchargePct: number;
};

type Project = Omit<
  EstimateProject,
  'openings' | 'pricing'
> & {
  openings: Opening[];
  pricing: Rules;
};

type Saved = {
  id: string;
  createdAt: string;
  updatedAt: string;
  project: Project;
};

type Line = {
  opening: Opening;
  width: number;
  height: number;
  glassSF: number;
  frameLF: number;
  glassRate: number;
  frameRate: number;
  doorRate: number;
  glassCost: number;
  hardwareCost: number;
  totalGlassCost: number;
  totalHardwareCost: number;
  opex: number;
  risk: number;
  totalCost: number;
  price: number | null;
  ccSurcharge: number | null;
  finalPrice: number | null;
  grossNet: number | null;
  grossNetProfitPct: number | null;
};

type Totals = {
  lines: Line[];
  errors: string[];
  assemblies: number;
  glassSF: number;
  frameLF: number;
  glassCost: number;
  hardwareCost: number;
  totalGlassCost: number;
  totalHardwareCost: number;
  opex: number;
  risk: number;
  totalCost: number;
  price: number;
  ccSurcharge: number;
  finalPrice: number;
  grossNet: number;
  complete: boolean;
};

// Preserve original browser storage keys.
const DRAFT_KEY = 'aspect-storefront-estimator-v1';
const LIBRARY_KEY =
  'aspect-storefront-estimator-library-v1';
const ACTIVE_KEY =
  'aspect-storefront-estimator-active-v1';

const n4 = (n: number) => decimal(n, 4);
const pct = (n: number) => decimal(n, 2);

const obj = (
  v: unknown
): Record<string, unknown> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

const nonneg = (
  v: unknown,
  fallback = 0
): number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0
    ? v
    : fallback;

const isMargin = (
  v: unknown
): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= 0 &&
  v < 100;

const id = () => crypto.randomUUID();

const clone = (p: Project): Project =>
  structuredClone(p);

// =====================================================
// SAVED PROJECT COMPATIBILITY
// =====================================================

function normalizeAppProject(
  value: unknown
): Project | null {
  const base = normalizeProject(value);

  if (!base) return null;

  const raw = obj(value);
  const rp = obj(raw.pricing);

  const originals = Array.isArray(raw.openings)
    ? raw.openings
    : [];

  const totalQty = base.openings.reduce(
    (s, o) => s + Math.max(1, o.quantity),
    0
  );

  const legacyOpexPerAssembly = totalQty
    ? nonneg(rp.opex) / totalQty
    : 0;

  const legacyMargin = isMargin(
    rp.targetGrossNetPct
  )
    ? rp.targetGrossNetPct
    : typeof rp.profitMarkupPct === 'number' &&
      rp.profitMarkupPct >= 0
      ? 100 * rp.profitMarkupPct /
        (100 + rp.profitMarkupPct)
      : null;

  return {
    ...base,

    openings: base.openings.map((o, i) => {
      const r = obj(originals[i]);

      return {
        ...o,

        glassMode:
          r.glassMode === 'manual'
            ? 'manual'
            : 'calculated',

        hardwareMode:
          r.hardwareMode === 'manual'
            ? 'manual'
            : 'calculated',

        manualGlassCostEach: nonneg(
          r.manualGlassCostEach
        ),

        manualHardwareCostEach: nonneg(
          r.manualHardwareCostEach
        ),

        opexPerAssembly: nonneg(
          r.opexPerAssembly,
          legacyOpexPerAssembly
        ),

        targetGrossNetPct: isMargin(
          r.targetGrossNetPct
        )
          ? r.targetGrossNetPct
          : r.targetGrossNetPct === null
            ? null
            : legacyMargin,
      };
    }),

    pricing: {
      ...base.pricing,

      hardwareFixedFee: nonneg(
        rp.hardwareFixedFee,
        15
      ),

      hardwareTaxPct: nonneg(
        rp.hardwareTaxPct,
        8.13
      ),

      glassDiscountPct: nonneg(
        rp.glassDiscountPct,
        17
      ),

      riskPct: nonneg(
        rp.riskPct,
        10
      ),

      ccSurchargePct: nonneg(
        rp.ccSurchargePct,
        8.5
      ),
    },
  };
}

function fresh(): Project {
  return normalizeAppProject(newProject()) as Project;
}

function freshOpening(index: number): Opening {
  return {
    ...newOpening(index),

    glassMode: 'calculated',
    hardwareMode: 'calculated',

    manualGlassCostEach: 0,
    manualHardwareCostEach: 0,

    glassRateOverride: null,
    frameRateOverride: null,

    opexPerAssembly: 0,
    targetGrossNetPct: null,
  };
}

// =====================================================
// PER-OPENING COST CALCULATIONS
// =====================================================

function calculate(project: Project): Totals {
  const p = project.pricing;

  const errors: string[] = [];
  const lines: Line[] = [];
  const marks = new Set<string>();

  if (!project.projectName.trim()) {
    errors.push('Enter a project name.');
  }

  if (!project.estimateNumber.trim()) {
    errors.push('Enter an estimate number.');
  }

  if (!project.openings.length) {
    errors.push('Add at least one opening.');
  }

  const rates: [string, number][] = [
    ['Framing rate', p.framingRatePerLF],
    ['Fixed hardware fee', p.hardwareFixedFee],
    ['Single-door package', p.singleDoorPackage],
    ['Double-door package', p.doubleDoorPackage],

    ...GLASS_TYPES.map(
      g =>
        [g, p.glassRates[g]] as [string, number]
    ),
  ];

  for (const [name, value] of rates) {
    if (
      !Number.isFinite(value) ||
      value < 0
    ) {
      errors.push(
        `${name} must be zero or greater.`
      );
    }
  }

  for (const [name, value] of [
    ['Hardware tax', p.hardwareTaxPct],
    ['Glass discount', p.glassDiscountPct],
    ['Risk', p.riskPct],
    ['CC surcharge', p.ccSurchargePct],
  ] as [string, number][]) {
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      errors.push(
        `${name} must be between 0% and 100%.`
      );
    }
  }

  for (const o of project.openings) {
    const label =
      o.mark.trim() || 'Unnamed opening';

    if (!o.mark.trim()) {
      errors.push(
        'Every opening needs a mark.'
      );
    }

    if (marks.has(label.toUpperCase())) {
      errors.push(
        `${label}: duplicate mark.`
      );
    }

    marks.add(label.toUpperCase());

    const w = parseInches(o.width);
    const h = parseInches(o.height);

    if (w === null || h === null) {
      errors.push(
        `${label}: enter valid width and height.`
      );

      continue;
    }

    if (
      ![
        o.quantity,
        o.columns,
        o.rows,
      ].every(
        x =>
          Number.isInteger(x) &&
          x >= 1
      )
    ) {
      errors.push(
        `${label}: quantity, columns and rows must be positive whole numbers.`
      );

      continue;
    }

    if (
      ![
        o.manualGlassCostEach,
        o.manualHardwareCostEach,
        o.hardwareAllowance,
        o.opexPerAssembly,
      ].every(
        x =>
          Number.isFinite(x) &&
          x >= 0
      )
    ) {
      errors.push(
        `${label}: material costs and OPEX must be zero or greater.`
      );

      continue;
    }

    // ACTUAL GLASS RATE
    // Uses type-specific Pricing & Rates unless
    // the user entered an opening override.

    const glassRate =
      o.glassRateOverride ??
      p.glassRates[o.glassType];

    // ACTUAL FRAMING RATE
    // Uses Pricing & Rates unless customized.

    const frameRate =
      o.frameRateOverride ??
      p.framingRatePerLF;

    if (
      ![
        glassRate,
        frameRate,
      ].every(
        x =>
          Number.isFinite(x) &&
          x >= 0
      )
    ) {
      errors.push(
        `${label}: material rate must be zero or greater.`
      );

      continue;
    }

    if (!isMargin(o.targetGrossNetPct)) {
      errors.push(
        `${label}: enter a Gross Net Profit % from 0 to less than 100.`
      );
    }

    const qty = o.quantity;

    // GROSS GLASS AREA
    // No waste allowance.

    const glassSF =
      w * h / 144 * qty;

    // SIMPLIFIED FRAME LENGTH
    // No waste allowance.

    const frameLF =
      (
        2 * (w + h) +
        (o.columns - 1) * h +
        (o.rows - 1) * w
      ) / 12 * qty;

    const doorRate =
      o.openingType === 'single-door'
        ? p.singleDoorPackage
        : o.openingType === 'double-door'
          ? p.doubleDoorPackage
          : 0;

    // COST OF GLASS

    const glassCost =
      o.glassMode === 'manual'
        ? o.manualGlassCostEach * qty
        : glassSF * glassRate;

    // COST OF HARDWARE

    const hardwareCost =
      o.hardwareMode === 'manual'
        ? o.manualHardwareCostEach * qty
        : frameLF * frameRate +
          (
            doorRate +
            o.hardwareAllowance
          ) * qty;

    // TOTAL HARDWARE COST
    // Fixed fee once per opening mark.

    const totalHardwareCost =
      (
        hardwareCost +
        p.hardwareFixedFee
      ) *
      (
        1 +
        p.hardwareTaxPct / 100
      );

    // TOTAL GLASS COST

    const totalGlassCost =
      glassCost *
      (
        1 -
        p.glassDiscountPct / 100
      );

    // OPEX

    const opex =
      o.opexPerAssembly * qty;

    // RISK

    const risk =
      totalGlassCost *
      p.riskPct / 100;

    // TOTAL COST / FINAL COST

    const totalCost =
      totalHardwareCost +
      totalGlassCost +
      opex +
      risk;

    // PRICE

    const price = isMargin(
      o.targetGrossNetPct
    )
      ? totalCost /
        (
          1 -
          o.targetGrossNetPct / 100
        )
      : null;

    // CC SURCHARGE

    const ccSurcharge =
      price === null
        ? null
        : price *
          p.ccSurchargePct / 100;

    // FINAL PRICE

    const finalPrice =
      price === null ||
      ccSurcharge === null
        ? null
        : price + ccSurcharge;

    // GROSS NET

    const grossNet =
      price === null
        ? null
        : price - totalCost;

    // ACTUAL GROSS NET PROFIT %

    const grossNetProfitPct =
      price !== null &&
      price > 0 &&
      grossNet !== null
        ? grossNet / price * 100
        : null;

    lines.push({
      opening: o,

      width: w,
      height: h,

      glassSF,
      frameLF,

      glassRate,
      frameRate,
      doorRate,

      glassCost,
      hardwareCost,

      totalGlassCost,
      totalHardwareCost,

      opex,
      risk,
      totalCost,

      price,
      ccSurcharge,
      finalPrice,

      grossNet,
      grossNetProfitPct,
    });
  }

  const sum = (
    key: keyof Pick<
      Line,
      | 'glassSF'
      | 'frameLF'
      | 'glassCost'
      | 'hardwareCost'
      | 'totalGlassCost'
      | 'totalHardwareCost'
      | 'opex'
      | 'risk'
      | 'totalCost'
    >
  ) =>
    lines.reduce(
      (acc, line) =>
        acc + line[key],
      0
    );

  return {
    lines,

    errors: [...new Set(errors)],

    assemblies: lines.reduce(
      (acc, l) =>
        acc + l.opening.quantity,
      0
    ),

    glassSF: sum('glassSF'),
    frameLF: sum('frameLF'),

    glassCost: sum('glassCost'),
    hardwareCost: sum('hardwareCost'),

    totalGlassCost: sum('totalGlassCost'),
    totalHardwareCost: sum('totalHardwareCost'),

    opex: sum('opex'),
    risk: sum('risk'),
    totalCost: sum('totalCost'),

    price: lines.reduce(
      (acc, l) =>
        acc + (l.price ?? 0),
      0
    ),

    ccSurcharge: lines.reduce(
      (acc, l) =>
        acc + (l.ccSurcharge ?? 0),
      0
    ),

    finalPrice: lines.reduce(
      (acc, l) =>
        acc + (l.finalPrice ?? 0),
      0
    ),

    grossNet: lines.reduce(
      (acc, l) =>
        acc + (l.grossNet ?? 0),
      0
    ),

    complete:
      errors.length === 0 &&
      lines.length === project.openings.length,
  };
}

// =====================================================
// DOWNLOAD HELPERS
// =====================================================

function download(
  name: string,
  data: string,
  mime = 'application/json'
) {
  const url = URL.createObjectURL(
    new Blob(
      [data],
      { type: mime }
    )
  );

  const a = document.createElement('a');

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

const safeName = (s: string) =>
  s.replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 64) ||
  'estimate';

function csvCell(v: string | number) {
  let s = String(v);

  if (/^\s*[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  return `"${s.replace(/"/g, '""')}"`;
}

// =====================================================
// INPUT COMPONENTS
// =====================================================

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
      </span>

      {children}

      {hint && (
        <span className="field-hint">
          {hint}
        </span>
      )}
    </label>
  );
}

function Txt({
  value,
  onChange,
  type = 'text',
}: {
  value: string;
  onChange: (s: string) => void;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      onChange={e =>
        onChange(e.target.value)
      }
    />
  );
}

function Num({
  value,
  onChange,
  min = 0,
  max,
  step = 0.01,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      className="input number-input"
      type="number"
      min={min}
      max={max}
      step={step}
      value={
        Number.isFinite(value)
          ? value
          : ''
      }
      onChange={e =>
        onChange(
          e.target.value === ''
            ? 0
            : Number(e.target.value)
        )
      }
    />
  );
}

function MarginInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <input
      className="input number-input"
      type="number"
      min="0"
      max="99.99"
      step="0.1"
      placeholder="Enter percentage"
      value={value ?? ''}
      onChange={e =>
        onChange(
          e.target.value === ''
            ? null
            : Number(e.target.value)
        )
      }
    />
  );
}

// =====================================================
// AUTOMATIC GLASS / FRAMING RATE INPUT
// =====================================================

// When no custom rate exists, the actual rate
// automatically comes from Pricing & Rates.
//
// For glass: rate is tied to selected glass type.
// For hardware: framing rate is tied to base
// framing rate in Pricing & Rates.
//
// User can override or restore default.

function RateInput({
  label,
  unit,
  selected,
  defaultRate,
  override,
  onChange,
}: {
  label: string;
  unit: 'SF' | 'LF';
  selected: string;
  defaultRate: number;
  override: number | null;
  onChange: (rate: number | null) => void;
}) {
  const usingDefault =
    override === null;

  const effectiveRate =
    override ?? defaultRate;

  return (
    <div className="field">
      <span className="field-label">
        {label}
      </span>

      <input
        className="input number-input"
        type="number"
        min="0"
        step="0.01"
        value={effectiveRate}
        onChange={e =>
          onChange(
            e.target.value === ''
              ? null
              : Number(e.target.value)
          )
        }
      />

      <span className="field-hint">
        {selected}
        {' · '}
        Pricing &amp; Rates default:
        {' '}
        {currency(defaultRate)}/{unit}

        {' · '}

        {usingDefault
          ? 'Using automatic rate'
          : 'Custom rate for this opening'}
      </span>

      {!usingDefault && (
        <button
          type="button"
          className="btn btn-quiet"
          style={{
            alignSelf: 'flex-start',
            marginTop: 5,
          }}
          onClick={() =>
            onChange(null)
          }
        >
          ↺ Use default {currency(defaultRate)}/{unit}
        </button>
      )}
    </div>
  );
}

// =====================================================
// COMPUTATION DETAILS
// =====================================================

function Detail({
  title,
  formula,
  result,
}: {
  title: string;
  formula: string;
  result: string;
}) {
  return (
    <div
      style={{
        padding: '10px 0',
        borderBottom: '1px solid #dce7e2',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 12 }}>
          {title}
        </strong>

        <div
          style={{
            color: '#62798a',
            fontSize: 11,
            overflowWrap: 'anywhere',
            marginTop: 4,
          }}
        >
          {formula}
        </div>
      </div>

      <strong
        style={{
          color: '#087459',
          fontSize: 12,
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
      >
        {result}
      </strong>
    </div>
  );
}

// =====================================================
// COMPLETE OPENING WORKSHEET
// =====================================================

function Worksheet({
  l,
  p,
}: {
  l: Line;
  p: Rules;
}) {
  const m = (v: number | null) =>
    v === null
      ? 'Enter profit %'
      : currency(v);

  const o = l.opening;

  return (
    <>
      <Detail
        title="Price (auto)"
        formula={
          `${currency(l.totalCost)} ÷ ` +
          `(1 − ${
            o.targetGrossNetPct === null
              ? '?'
              : pct(o.targetGrossNetPct)
          }%)`
        }
        result={m(l.price)}
      />

      <Detail
        title="CC Surcharge (Final Price)"
        formula={
          `${m(l.price)} × ` +
          `(1 + ${pct(p.ccSurchargePct)}%)`
        }
        result={m(l.finalPrice)}
      />

      <Detail
        title="Cost of Hardware"
        formula={
          o.hardwareMode === 'manual'
            ? (
              `${currency(
                o.manualHardwareCostEach
              )} per assembly × ${o.quantity}`
            )
            : (
              `${n4(l.frameLF)} LF × ` +
              `${currency(l.frameRate)}/LF + ` +
              `${o.quantity} × (` +
              `${currency(l.doorRate)} door + ` +
              `${currency(
                o.hardwareAllowance
              )} extras)`
            )
        }
        result={currency(l.hardwareCost)}
      />

      <Detail
        title="Total Hardware Cost"
        formula={
          `(${currency(l.hardwareCost)} + ` +
          `${currency(p.hardwareFixedFee)}) × ` +
          `(1 + ${pct(p.hardwareTaxPct)}%)`
        }
        result={currency(l.totalHardwareCost)}
      />

      <Detail
        title="Cost of Glass"
        formula={
          o.glassMode === 'manual'
            ? (
              `${currency(
                o.manualGlassCostEach
              )} per assembly × ${o.quantity}`
            )
            : (
              `${n4(l.glassSF)} SF × ` +
              `${currency(l.glassRate)}/SF`
            )
        }
        result={currency(l.glassCost)}
      />

      <Detail
        title="Total Glass Cost"
        formula={
          `${currency(l.glassCost)} × ` +
          `(1 − ${pct(p.glassDiscountPct)}%)`
        }
        result={currency(l.totalGlassCost)}
      />

      <Detail
        title="OPEX"
        formula={
          `${currency(o.opexPerAssembly)} ` +
          `per assembly × ${o.quantity}`
        }
        result={currency(l.opex)}
      />

      <Detail
        title="Risk"
        formula={
          `${currency(l.totalGlassCost)} × ` +
          `${pct(p.riskPct)}%`
        }
        result={currency(l.risk)}
      />

      <Detail
        title="Total Cost"
        formula={
          `${currency(l.totalHardwareCost)} + ` +
          `${currency(l.totalGlassCost)} + ` +
          `${currency(l.opex)} + ` +
          `${currency(l.risk)}`
        }
        result={currency(l.totalCost)}
      />

      <Detail
        title="(gross) Net"
        formula={
          `${m(l.price)} − ` +
          `${currency(l.totalCost)}`
        }
        result={m(l.grossNet)}
      />

      <Detail
        title="(gross) Net Profit %"
        formula="(Price − Total Cost) ÷ Price × 100"
        result={
          l.grossNetProfitPct === null
            ? 'Enter profit %'
            : `${pct(l.grossNetProfitPct)}%`
        }
      />
    </>
  );
}

// =====================================================
// EXPANDABLE COMPUTATION DROPDOWN
// =====================================================

function OpeningFormula({
  l,
  p,
}: {
  l: Line;
  p: Rules;
}) {
  const o = l.opening;

  return (
    <details
      style={{
        margin: '12px 0',
        padding: 14,
        background: '#f7fbf9',
        border: '1px solid #cbded6',
        borderRadius: 10,
        color: '#20384a',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 12,
          color: '#087459',
        }}
      >
        Show Computation — {o.mark}
      </summary>

      <Detail
        title="Gross opening area"
        formula={
          `(${n4(l.width)} × ` +
          `${n4(l.height)} ÷ 144) × ` +
          `${o.quantity}`
        }
        result={`${n4(l.glassSF)} SF`}
      />

      <Detail
        title="Framing length"
        formula={
          `[2 × (${n4(l.width)} + ` +
          `${n4(l.height)}) + ` +
          `(${o.columns} − 1) × ` +
          `${n4(l.height)} + ` +
          `(${o.rows} − 1) × ` +
          `${n4(l.width)}] ÷ 12 × ` +
          `${o.quantity}`
        }
        result={`${n4(l.frameLF)} LF`}
      />

      <Worksheet l={l} p={p} />

      <p
        style={{
          fontSize: 11,
          color: '#657987',
        }}
      >
        Complete worksheet for this opening mark,
        including all quantities. The fixed hardware
        fee is charged once per mark. No 5% material
        allowance is added.
      </p>
    </details>
  );
}

const smallBtn: CSSProperties = {
  padding: '8px 11px',
  borderRadius: 8,
  border: '1px solid #d5e2e7',
  color: '#183b54',
  background: '#fff',
  cursor: 'pointer',
};

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function Home() {
  const [project, setProject] =
    useState<Project>(() => fresh());

  const [tab, setTab] =
    useState<Tab>('estimate');

  const [library, setLibrary] =
    useState<Saved[]>([]);

  const [activeId, setActiveId] =
    useState<string | null>(null);

  const [
    selectedOpeningId,
    setSelectedOpeningId,
  ] = useState<string | null>(null);

  const [ready, setReady] =
    useState(false);

  const [notice, setNotice] =
    useState('');

  const [search, setSearch] =
    useState('');

  const importRef =
    useRef<HTMLInputElement>(null);

  const libraryRef =
    useRef<HTMLInputElement>(null);

  const totals = useMemo(
    () => calculate(project),
    [project]
  );

  const p = project.pricing;

  const selected =
    totals.lines.find(
      l =>
        l.opening.id === selectedOpeningId
    ) ?? totals.lines[0];

  const active = library.find(
    x => x.id === activeId
  );

  const dirty =
    !active ||
    JSON.stringify(active.project) !==
      JSON.stringify(project);

  const matches = library
    .filter(x =>
      [
        x.project.projectName,
        x.project.estimateNumber,
        x.project.clientName,
        x.project.location,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt)
    );

  // ==================================================
  // LOAD SAVED PROJECTS
  // ==================================================

  useEffect(() => {
    try {
      const draft =
        localStorage.getItem(DRAFT_KEY);

      if (draft) {
        setProject(
          normalizeAppProject(
            JSON.parse(draft)
          ) ?? fresh()
        );
      }

      const saved =
        localStorage.getItem(LIBRARY_KEY);

      if (saved) {
        const parsed: unknown =
          JSON.parse(saved);

        if (Array.isArray(parsed)) {
          const records: Saved[] = parsed
            .slice(0, 250)
            .flatMap(
              (item): Saved[] => {
                const r = obj(item);

                const pr =
                  normalizeAppProject(
                    r.project
                  );

                if (!pr) return [];

                return [{
                  id:
                    typeof r.id === 'string'
                      ? r.id
                      : id(),

                  createdAt:
                    typeof r.createdAt === 'string'
                      ? r.createdAt
                      : new Date()
                          .toISOString(),

                  updatedAt:
                    typeof r.updatedAt === 'string'
                      ? r.updatedAt
                      : new Date()
                          .toISOString(),

                  project: pr,
                }];
              }
            );

          setLibrary(records);

          const savedId =
            localStorage.getItem(
              ACTIVE_KEY
            );

          if (
            savedId &&
            records.some(
              x => x.id === savedId
            )
          ) {
            setActiveId(savedId);
          }
        }
      }
    } catch {
      setNotice(
        'Some browser data could not be loaded. Restore a backup if necessary.'
      );
    }

    setReady(true);
  }, []);

  // ==================================================
  // AUTOMATIC DRAFT SAVE
  // ==================================================

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify(project)
      );
    } catch {
      setNotice(
        'Browser storage is full. Download a backup.'
      );
    }
  }, [project, ready]);

  // ==================================================
  // INPUT UPDATES
  // ==================================================

  function setInfo<K extends keyof Project>(
    key: K,
    value: Project[K]
  ) {
    setProject(old => ({
      ...old,
      [key]: value,
    }));
  }

  function setRule<K extends keyof Rules>(
    key: K,
    value: Rules[K]
  ) {
    setProject(old => ({
      ...old,

      pricing: {
        ...old.pricing,
        [key]: value,
      },
    }));
  }

  function setOpening(
    openingId: string,
    patch: Partial<Opening>
  ) {
    setProject(old => ({
      ...old,

      openings: old.openings.map(
        o =>
          o.id === openingId
            ? { ...o, ...patch }
            : o
      ),
    }));
  }

  function addOpening() {
    const used = new Set(
      project.openings.map(
        o => o.mark
      )
    );

    let k =
      project.openings.length + 1;

    while (
      used.has(
        `SF-${String(k).padStart(2, '0')}`
      )
    ) {
      k++;
    }

    const next = freshOpening(k);

    setProject(old => ({
      ...old,

      openings: [
        ...old.openings,
        next,
      ],
    }));

    setSelectedOpeningId(next.id);
  }

  // ==================================================
  // SAVED ESTIMATES
  // ==================================================

  function saveLibrary(
    items: Saved[],
    message: string
  ): boolean {
    if (items.length > 250) {
      setNotice(
        'Library limit reached (250). Back up older records.'
      );
      return false;
    }

    try {
      localStorage.setItem(
        LIBRARY_KEY,
        JSON.stringify(items)
      );

      setLibrary(items);
      setNotice(message);

      return true;
    } catch {
      setNotice(
        'Library could not be saved. Back up and check browser storage.'
      );
      return false;
    }
  }

  function saveCurrent() {
    if (!ready) return;

    const previous = library.find(
      x => x.id === activeId
    );

    const nextId =
      previous?.id ?? id();

    const now =
      new Date().toISOString();

    const record: Saved = {
      id: nextId,

      createdAt:
        previous?.createdAt ?? now,

      updatedAt: now,

      project: clone(project),
    };

    if (
      saveLibrary(
        [
          record,

          ...library.filter(
            x => x.id !== nextId
          ),
        ],

        previous
          ? 'Estimate changes saved.'
          : 'Estimate saved.'
      )
    ) {
      setActiveId(nextId);

      localStorage.setItem(
        ACTIVE_KEY,
        nextId
      );
    }
  }

  function safeSwitch() {
    return (
      !dirty ||
      confirm(
        'You have unsaved changes. Save your estimate first if needed. Continue?'
      )
    );
  }

  function openSaved(record: Saved) {
    if (!safeSwitch()) return;

    setProject(
      clone(record.project)
    );

    setActiveId(record.id);
    setSelectedOpeningId(null);

    localStorage.setItem(
      ACTIVE_KEY,
      record.id
    );

    setTab('estimate');
  }

  function newEstimate() {
    if (!safeSwitch()) return;

    setProject(fresh());

    setActiveId(null);
    setSelectedOpeningId(null);

    localStorage.removeItem(
      ACTIVE_KEY
    );

    setTab('estimate');
  }

  function duplicate(record: Saved) {
    const pr = clone(record.project);

    pr.projectName += ' (Copy)';
    pr.estimateNumber += '-COPY';

    const now =
      new Date().toISOString();

    saveLibrary(
      [
        {
          id: id(),
          createdAt: now,
          updatedAt: now,
          project: pr,
        },

        ...library,
      ],

      'Estimate duplicated.'
    );
  }

  function rename(record: Saved) {
    const name = prompt(
      'New project name:',
      record.project.projectName
    )?.trim();

    if (!name) return;

    if (
      saveLibrary(
        library.map(
          x =>
            x.id === record.id
              ? {
                  ...x,

                  updatedAt:
                    new Date().toISOString(),

                  project: {
                    ...x.project,
                    projectName: name,
                  },
                }
              : x
        ),

        'Estimate renamed.'
      ) &&
      activeId === record.id
    ) {
      setInfo(
        'projectName',
        name
      );
    }
  }

  function remove(record: Saved) {
    if (
      !confirm(
        `Delete ${record.project.projectName}? You cannot undo this without a backup.`
      )
    ) {
      return;
    }

    if (
      saveLibrary(
        library.filter(
          x => x.id !== record.id
        ),

        'Estimate deleted.'
      ) &&
      activeId === record.id
    ) {
      setActiveId(null);

      localStorage.removeItem(
        ACTIVE_KEY
      );
    }
  }

  // ==================================================
  // BACKUP AND IMPORT
  // ==================================================

  function backupDraft() {
    download(
      `${safeName(project.estimateNumber)}.json`,

      JSON.stringify(
        project,
        null,
        2
      )
    );
  }

  function backupAll() {
    download(
      'aspect-all-estimates.json',

      JSON.stringify(
        {
          format: 'aspect-estimator-library',
          version: 4,
          estimates: library,
        },

        null,
        2
      )
    );
  }

  async function importDraft(file?: File) {
    if (!file) return;

    try {
      if (file.size > 2_000_000) {
        throw Error('Too large');
      }

      const pr =
        normalizeAppProject(
          JSON.parse(
            await file.text()
          )
        );

      if (!pr) {
        throw Error('Invalid');
      }

      if (!safeSwitch()) return;

      setProject(pr);
      setActiveId(null);
      setSelectedOpeningId(null);

      localStorage.removeItem(
        ACTIVE_KEY
      );

      setTab('estimate');

      setNotice(
        'Estimate imported. Save it to add it to Saved Estimates.'
      );
    } catch {
      setNotice(
        'Invalid estimate backup.'
      );
    } finally {
      if (importRef.current) {
        importRef.current.value = '';
      }
    }
  }

  async function importLibrary(file?: File) {
    if (!file) return;

    try {
      if (file.size > 5_000_000) {
        throw Error('Too large');
      }

      const raw = obj(
        JSON.parse(
          await file.text()
        )
      );

      if (
        raw.format !==
          'aspect-estimator-library' ||
        !Array.isArray(
          raw.estimates
        ) ||
        raw.estimates.length > 250
      ) {
        throw Error('Invalid');
      }

      const imported =
        raw.estimates.map(
          (item: unknown): Saved => {
            const r = obj(item);

            const pr =
              normalizeAppProject(
                r.project
              );

            if (!pr) {
              throw Error(
                'Invalid estimate'
              );
            }

            const now =
              new Date()
                .toISOString();

            return {
              id: id(),

              createdAt:
                typeof r.createdAt === 'string'
                  ? r.createdAt
                  : now,

              updatedAt:
                typeof r.updatedAt === 'string'
                  ? r.updatedAt
                  : now,

              project: pr,
            };
          }
        );

      if (
        confirm(
          `Add ${imported.length} estimates to your existing library?`
        )
      ) {
        saveLibrary(
          [
            ...imported,
            ...library,
          ],

          'Library imported.'
        );
      }
    } catch {
      setNotice(
        'Invalid library backup file.'
      );
    } finally {
      if (libraryRef.current) {
        libraryRef.current.value = '';
      }
    }
  }

  // ==================================================
  // EXPORT TAKEOFF
  // ==================================================

  function exportCSV() {
    const header = [
      'Mark',
      'Qty',
      'Width in',
      'Height in',
      'Glass SF',
      'Frame LF',
      'Hardware Cost',
      'Total Hardware Cost',
      'Glass Cost',
      'Total Glass Cost',
      'OPEX',
      'Risk',
      'Total Cost',
      'Gross Net Profit %',
      'Price',
      'Final Price with CC',
    ];

    const rows = totals.lines.map(
      l => [
        l.opening.mark,
        l.opening.quantity,

        l.width,
        l.height,

        l.glassSF.toFixed(4),
        l.frameLF.toFixed(4),

        l.hardwareCost.toFixed(2),
        l.totalHardwareCost.toFixed(2),

        l.glassCost.toFixed(2),
        l.totalGlassCost.toFixed(2),

        l.opex.toFixed(2),
        l.risk.toFixed(2),
        l.totalCost.toFixed(2),

        l.opening.targetGrossNetPct ?? '',

        l.price?.toFixed(2) ?? '',
        l.finalPrice?.toFixed(2) ?? '',
      ]
    );

    download(
      `${safeName(
        project.estimateNumber
      )}-takeoff.csv`,

      '\uFEFF' +
        [header, ...rows]
          .map(
            r =>
              r.map(csvCell)
                .join(',')
          )
          .join('\r\n'),

      'text/csv;charset=utf-8'
    );
  }

  // ==================================================
  // TOP TOOLBAR
  // ==================================================

  const toolbar = (
    <div className="toolbar-actions">
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={e =>
          void importDraft(
            e.target.files?.[0]
          )
        }
      />

      <button
        className="btn btn-quiet"
        onClick={() =>
          importRef.current?.click()
        }
      >
        ↑ Import
      </button>

      <button
        className="btn btn-quiet"
        onClick={backupDraft}
      >
        ↓ Backup
      </button>

      <button
        className="btn btn-outline"
        onClick={saveCurrent}
        disabled={!ready}
      >
        {activeId
          ? '✓ Save Changes'
          : '+ Save Estimate'}
      </button>

      <button
        className="btn btn-dark"
        onClick={newEstimate}
      >
        + New Estimate
      </button>
    </div>
  );

  // ==================================================
  // WEBSITE INTERFACE
  // ==================================================

  return (
    <div className="app-root">

      {/* HEADER */}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            A<span>.</span>
          </span>

          <span className="brand-names">
            <strong>
              ASPECT GLASSWORK
            </strong>

            <small>
              ESTIMATING STUDIO
            </small>
          </span>
        </div>

        <div className="topbar-right">
          <span className="top-pill">
            <span className="green-dot" />
            Browser-based · V1.6.2
          </span>

          <span className="autosave">
            {ready
              ? 'Draft autosaved locally'
              : 'Loading...'}
          </span>
        </div>
      </header>

      <div className="shell">

        {/* SIDEBAR */}

        <aside className="sidebar">
          <p className="sidebar-label">
            WORKSPACE
          </p>

          <button
            className={`navitem ${
              tab === 'estimate'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setTab('estimate')
            }
          >
            ▦ Office Fit-Out
          </button>

          <button
            className={`navitem ${
              tab === 'pricing'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setTab('pricing')
            }
          >
            ◫ Pricing & Rates
          </button>

          <button
            className={`navitem ${
              tab === 'saved'
                ? 'active'
                : ''
            }`}
            onClick={() =>
              setTab('saved')
            }
          >
            ▤ Saved Estimates ({library.length})
          </button>

          <div className="sidebar-spacer" />

          <div className="sidebar-help">
            <strong>
              Estimator V1.6.2
            </strong>

            <p>
              Every opening has its own profit
              target and pricing worksheet.
              Saved projects stay in this browser;
              back them up regularly.
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT */}

        <main className="main">

          <div className="page-toolbar">
            <div>
              <div className="eyebrow">
                COMMERCIAL GLAZING / STOREFRONTS
              </div>

              <h1>
                {tab === 'estimate'
                  ? 'Office Fit-Out'
                  : tab === 'pricing'
                    ? 'Pricing & Cost Rules'
                    : 'Saved Estimates'}
              </h1>

              <p className="page-desc">
                {tab === 'estimate'
                  ? 'Set glass, hardware, OPEX and Gross Net Profit % for each opening separately.'
                  : tab === 'pricing'
                    ? 'Shared hardware fee, tax, glass discount, risk and CC surcharge rates.'
                    : 'Search and reopen your saved projects.'}
              </p>
            </div>

            {toolbar}
          </div>

          {/* NOTIFICATIONS */}

          {notice && (
            <div
              className="toast"
              role="status"
            >
              {notice}

              <button
                onClick={() =>
                  setNotice('')
                }
              >
                ×
              </button>
            </div>
          )}

          {/* MOBILE NAVIGATION */}

          <div className="nav-mobile">
            {(
              [
                ['estimate', 'Office Fit-Out'],
                ['pricing', 'Pricing'],
                ['saved', 'Saved Estimates'],
              ] as [Tab, string][]
            ).map(
              ([key, label]) => (
                <button
                  key={key}
                  className={
                    tab === key
                      ? 'selected'
                      : ''
                  }
                  onClick={() =>
                    setTab(key)
                  }
                >
                  {label}
                </button>
              )
            )}
          </div>

          {/* WARNINGS */}

          {tab !== 'saved' && (
            <>
              <div className="sample-notice">
                <strong>
                  Internal estimates only.
                </strong>

                {' '}
                Profit % and OPEX are set
                individually per opening.
                Calculated rates are taken from
                Pricing &amp; Rates unless overridden.
                Confirm supplier costs before quoting.
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: '#62798a',
                }}
              >
                {activeId
                  ? dirty
                    ? '● Unsaved changes — click Save Changes.'
                    : '✓ Matches saved project.'
                  : '● Unsaved draft — click Save Estimate to save this project.'}
              </p>

              {totals.errors.length > 0 && (
                <div
                  className="validation"
                  role="alert"
                >
                  <strong>
                    Review estimate inputs (
                    {totals.errors.length})
                  </strong>

                  <ul>
                    {totals.errors.map(
                      (error, i) => (
                        <li key={i}>
                          {error}
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* ==================================== */}
          {/* OFFICE FIT-OUT */}
          {/* ==================================== */}

          {tab === 'estimate' && (
            <div className="workspace-columns">

              <div className="content-column">

                {/* PROJECT INFORMATION */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        01 / PROJECT DETAILS
                      </span>

                      <h2>
                        Project Information
                      </h2>
                    </div>

                    <span className="tag">
                      Internal Estimate
                    </span>
                  </div>

                  <div className="form-grid">
                    {(
                      [
                        ['Project Name', 'projectName'],
                        ['Estimate Number', 'estimateNumber'],
                        ['Client / Contractor', 'clientName'],
                        ['Project Address', 'location'],
                        ['Estimator', 'estimator'],
                        ['Estimate Date', 'date'],
                        ['Framing System', 'framingSystem'],
                      ] as [
                        string,
                        | 'projectName'
                        | 'estimateNumber'
                        | 'clientName'
                        | 'location'
                        | 'estimator'
                        | 'date'
                        | 'framingSystem'
                      ][]
                    ).map(
                      ([label, key]) => (
                        <Field
                          key={key}
                          label={label}
                        >
                          <Txt
                            type={
                              key === 'date'
                                ? 'date'
                                : 'text'
                            }
                            value={project[key]}
                            onChange={v =>
                              setInfo(key, v)
                            }
                          />
                        </Field>
                      )
                    )}

                    <Field label="Frame Finish">
                      <select
                        className="input"
                        value={project.finish}
                        onChange={e =>
                          setInfo(
                            'finish',
                            e.target.value
                          )
                        }
                      >
                        {[
                          'Dark Bronze Anodized',
                          'Clear Anodized',
                          'Black',
                          'Mill Finish',
                          'Custom / Other',
                        ].map(
                          x => (
                            <option key={x}>
                              {x}
                            </option>
                          )
                        )}
                      </select>
                    </Field>
                  </div>
                </section>

                {/* OPENING SCHEDULE */}

                <section className="panel">

                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / STOREFRONT TAKEOFF
                      </span>

                      <h2>
                        Openings ({project.openings.length})
                      </h2>
                    </div>

                    <button
                      className="btn btn-outline"
                      onClick={addOpening}
                    >
                      + Add Opening
                    </button>
                  </div>

                  <p className="panel-subtitle">
                    Each opening has its own OPEX,
                    Gross Net Profit %, and full
                    worksheet. When Calculated pricing
                    is selected, the corresponding
                    glass or framing rate appears
                    automatically. You can customize
                    these rates for each opening.
                  </p>

                  {project.openings.map(
                    (o, i) => {
                      const line =
                        totals.lines.find(
                          l =>
                            l.opening.id === o.id
                        );

                      return (
                        <div
                          className="opening-card"
                          key={o.id}
                        >

                          {/* OPENING HEADING */}

                          <div className="opening-heading">
                            <div className="opening-identity">
                              <span className="opening-index">
                                {String(
                                  i + 1
                                ).padStart(
                                  2,
                                  '0'
                                )}
                              </span>

                              <strong>
                                {o.mark}
                              </strong>

                              <span className="opening-category">
                                {formatOpeningType(
                                  o.openingType
                                )}
                              </span>
                            </div>

                            <button
                              className="remove-btn"
                              aria-label={
                                `Remove ${o.mark}`
                              }
                              onClick={() => {
                                if (
                                  confirm(
                                    `Remove ${o.mark}?`
                                  )
                                ) {
                                  setProject(
                                    old => ({
                                      ...old,

                                      openings:
                                        old.openings.filter(
                                          x =>
                                            x.id !== o.id
                                        ),
                                    })
                                  );
                                }
                              }}
                            >
                              ×
                            </button>
                          </div>

                          {/* OPENING INPUTS */}

                          <div className="form-grid opening-grid">

                            <Field label="Opening mark">
                              <Txt
                                value={o.mark}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { mark: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Opening type">
                              <select
                                className="input"
                                value={o.openingType}
                                onChange={e =>
                                  setOpening(
                                    o.id,
                                    {
                                      openingType:
                                        e.target.value as Opening['openingType'],
                                    }
                                  )
                                }
                              >
                                <option value="fixed">
                                  Fixed glazing
                                </option>

                                <option value="single-door">
                                  Single door
                                </option>

                                <option value="double-door">
                                  Double door
                                </option>
                              </select>
                            </Field>

                            <Field label="Width (inches)">
                              <Txt
                                value={o.width}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { width: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Height (inches)">
                              <Txt
                                value={o.height}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { height: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Quantity">
                              <Num
                                value={o.quantity}
                                min={1}
                                step={1}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { quantity: v }
                                  )
                                }
                              />
                            </Field>

                            {/* GLASS TYPE */}

                            <Field label="Glass type">
                              <select
                                className="input"
                                value={o.glassType}
                                onChange={e =>
                                  setOpening(
                                    o.id,
                                    {
                                      glassType:
                                        e.target.value as Opening['glassType'],

                                      // Reset glass rate so
                                      // the newly selected
                                      // type's rate applies.
                                      glassRateOverride:
                                        null,
                                    }
                                  )
                                }
                              >
                                {GLASS_TYPES.map(
                                  g => (
                                    <option
                                      key={g}
                                      value={g}
                                    >
                                      {g}
                                    </option>
                                  )
                                )}
                              </select>
                            </Field>

                            <Field label="Glazing columns">
                              <Num
                                value={o.columns}
                                min={1}
                                step={1}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { columns: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Glazing rows">
                              <Num
                                value={o.rows}
                                min={1}
                                step={1}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { rows: v }
                                  )
                                }
                              />
                            </Field>

                            {/* GLASS PRICING METHOD */}

                            <Field label="Glass pricing method">
                              <select
                                className="input"
                                value={o.glassMode}
                                onChange={e =>
                                  setOpening(
                                    o.id,
                                    {
                                      glassMode:
                                        e.target.value as Mode,
                                    }
                                  )
                                }
                              >
                                <option value="calculated">
                                  Calculated — SF × rate
                                </option>

                                <option value="manual">
                                  Manual — cost per assembly
                                </option>
                              </select>
                            </Field>

                            {/* MANUAL OR CALCULATED GLASS RATE */}

                            {o.glassMode === 'manual' ? (
                              <Field label="Manual glass cost $ / assembly">
                                <Num
                                  value={
                                    o.manualGlassCostEach
                                  }
                                  onChange={v =>
                                    setOpening(
                                      o.id,
                                      {
                                        manualGlassCostEach:
                                          v,
                                      }
                                    )
                                  }
                                />
                              </Field>
                            ) : (
                              <RateInput
                                label="Glass Rate $/SF"
                                unit="SF"
                                selected={o.glassType}
                                defaultRate={
                                  p.glassRates[
                                    o.glassType
                                  ]
                                }
                                override={
                                  o.glassRateOverride
                                }
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    {
                                      glassRateOverride:
                                        v,
                                    }
                                  )
                                }
                              />
                            )}

                            {/* HARDWARE PRICING METHOD */}

                            <Field label="Hardware pricing method">
                              <select
                                className="input"
                                value={o.hardwareMode}
                                onChange={e =>
                                  setOpening(
                                    o.id,
                                    {
                                      hardwareMode:
                                        e.target.value as Mode,
                                    }
                                  )
                                }
                              >
                                <option value="calculated">
                                  Calculated — frame LF + accessories
                                </option>

                                <option value="manual">
                                  Manual — cost per assembly
                                </option>
                              </select>
                            </Field>

                            {/* MANUAL OR CALCULATED FRAMING RATE */}

                            {o.hardwareMode === 'manual' ? (
                              <Field label="Manual hardware cost $ / assembly">
                                <Num
                                  value={
                                    o.manualHardwareCostEach
                                  }
                                  onChange={v =>
                                    setOpening(
                                      o.id,
                                      {
                                        manualHardwareCostEach:
                                          v,
                                      }
                                    )
                                  }
                                />
                              </Field>
                            ) : (
                              <>

                                <RateInput
                                  label="Framing Rate $/LF"
                                  unit="LF"
                                  selected={
                                    project.framingSystem
                                  }
                                  defaultRate={
                                    p.framingRatePerLF
                                  }
                                  override={
                                    o.frameRateOverride
                                  }
                                  onChange={v =>
                                    setOpening(
                                      o.id,
                                      {
                                        frameRateOverride:
                                          v,
                                      }
                                    )
                                  }
                                />

                                <Field label="Additional hardware $ / assembly">
                                  <Num
                                    value={
                                      o.hardwareAllowance
                                    }
                                    onChange={v =>
                                      setOpening(
                                        o.id,
                                        {
                                          hardwareAllowance:
                                            v,
                                        }
                                      )
                                    }
                                  />
                                </Field>

                              </>
                            )}

                            {/* OPEX PER OPENING */}

                            <Field label="OPEX / installation labor $ per assembly">
                              <Num
                                value={
                                  o.opexPerAssembly
                                }
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    {
                                      opexPerAssembly:
                                        v,
                                    }
                                  )
                                }
                              />
                            </Field>

                            {/* PROFIT PER OPENING */}

                            <Field
                              label="TARGET (GROSS) NET PROFIT %"
                              hint="Enter your own percentage for this opening (below 100)."
                            >
                              <MarginInput
                                value={
                                  o.targetGrossNetPct
                                }
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    {
                                      targetGrossNetPct:
                                        v,
                                    }
                                  )
                                }
                              />
                            </Field>
                          </div>

                          {/* OPENING NOTES */}

                          <div
                            style={{
                              padding:
                                '0 18px 12px',
                            }}
                          >
                            <Field label="Opening notes">
                              <Txt
                                value={o.note}
                                onChange={v =>
                                  setOpening(
                                    o.id,
                                    { note: v }
                                  )
                                }
                              />
                            </Field>
                          </div>

                          {/* OPENING RESULTS */}

                          <div className="opening-result">

                            <div>
                              <span>
                                Glass area
                              </span>

                              <strong>
                                {line
                                  ? `${n4(line.glassSF)} SF`
                                  : '—'}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Frame length
                              </span>

                              <strong>
                                {line
                                  ? `${n4(line.frameLF)} LF`
                                  : '—'}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Final Cost
                              </span>

                              <strong>
                                {line
                                  ? currency(
                                      line.totalCost
                                    )
                                  : '—'}
                              </strong>
                            </div>

                          </div>

                          {/* OPENING COMPUTATION */}

                          {line && (
                            <div
                              style={{
                                padding:
                                  '0 15px 12px',
                              }}
                            >
                              <button
                                className="btn btn-outline"
                                style={{
                                  marginTop: 12,
                                }}
                                onClick={() =>
                                  setSelectedOpeningId(
                                    o.id
                                  )
                                }
                              >
                                Review {o.mark} in summary →
                              </button>

                              <OpeningFormula
                                l={line}
                                p={p}
                              />
                            </div>
                          )}

                        </div>
                      );
                    }
                  )}

                  <button
                    className="add-bottom"
                    onClick={addOpening}
                  >
                    + Add Another Opening
                  </button>
                </section>

                {/* PROJECT NOTES */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / NOTES
                      </span>

                      <h2>
                        Scope & Exclusions
                      </h2>
                    </div>
                  </div>

                  <textarea
                    className="textarea"
                    rows={4}
                    value={project.scopeNotes}
                    onChange={e =>
                      setInfo(
                        'scopeNotes',
                        e.target.value
                      )
                    }
                  />
                </section>

              </div>

              {/* ================================== */}
              {/* SELECTED OPENING SUMMARY */}
              {/* ================================== */}

              <aside className="summary-column">
                <section className="summary-card">

                  <div className="summary-header">
                    <div>
                      <span className="section-label light-label">
                        LIVE CALCULATION
                      </span>

                      <h2>
                        Worksheet Cost Summary
                      </h2>
                    </div>

                    <span className="summary-indicator" />
                  </div>

                  {/* SELECT OPENING */}

                  <div
                    style={{
                      padding: '12px',
                      color: '#fff',
                    }}
                  >
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        marginBottom: 7,
                      }}
                    >
                      Choose opening to review
                    </label>

                    <select
                      className="input"
                      value={
                        selected?.opening.id ??
                        ''
                      }
                      onChange={e =>
                        setSelectedOpeningId(
                          e.target.value
                        )
                      }
                    >
                      {totals.lines.map(
                        l => (
                          <option
                            key={l.opening.id}
                            value={l.opening.id}
                          >
                            {l.opening.mark}
                            {' — '}
                            {l.opening.quantity}
                            {' assembly(s)'}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* FINAL PRICE */}

                  <div className="summary-hero">
                    <span>
                      FINAL PRICE ·{' '}
                      {selected?.opening.mark ??
                        'OPENING'}
                    </span>

                    <strong>
                      {selected?.finalPrice === null ||
                      !selected
                        ? 'Enter profit %'
                        : currency(
                            selected.finalPrice
                          )}
                    </strong>

                    <small>
                      Price + {pct(
                        p.ccSurchargePct
                      )}% CC surcharge for this opening
                    </small>
                  </div>

                  {/* OPENING QUANTITIES */}

                  <div className="summary-stats">
                    <div>
                      <span>
                        Assemblies
                      </span>

                      <strong>
                        {selected?.opening.quantity ??
                          0}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Glass SF
                      </span>

                      <strong>
                        {selected
                          ? n4(selected.glassSF)
                          : '—'}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Frame LF
                      </span>

                      <strong>
                        {selected
                          ? n4(selected.frameLF)
                          : '—'}
                      </strong>
                    </div>
                  </div>

                  {selected && (
                    <>

                      {/* GROSS NET PROFIT */}

                      <div
                        style={{
                          margin: '12px',
                          padding: 12,
                          borderRadius: 9,
                          background: '#edf7f3',
                          color: '#173d34',
                        }}
                      >
                        <Field
                          label={
                            `(GROSS) NET PROFIT % — ` +
                            selected.opening.mark
                          }
                        >
                          <MarginInput
                            value={
                              selected.opening
                                .targetGrossNetPct
                            }
                            onChange={v =>
                              setOpening(
                                selected.opening.id,
                                {
                                  targetGrossNetPct:
                                    v,
                                }
                              )
                            }
                          />
                        </Field>

                        <small>
                          Enter any target from 0 to
                          less than 100. No preset buttons.
                        </small>
                      </div>

                      {/* WORKSHEET VALUES */}

                      <div className="summary-breakdown">

                        {(
                          [
                            [
                              'Price (auto)',
                              selected.price,
                            ],

                            [
                              'CC Surcharge (Final Price)',
                              selected.finalPrice,
                            ],

                            [
                              'Cost of Hardware',
                              selected.hardwareCost,
                            ],

                            [
                              'Total Hardware Cost',
                              selected.totalHardwareCost,
                            ],

                            [
                              'Cost of Glass',
                              selected.glassCost,
                            ],

                            [
                              'Total Glass Cost',
                              selected.totalGlassCost,
                            ],

                            ['OPEX', selected.opex],
                            ['Risk', selected.risk],

                            [
                              'Total Cost',
                              selected.totalCost,
                            ],

                            [
                              '(gross) Net',
                              selected.grossNet,
                            ],
                          ] as [
                            string,
                            number | null
                          ][]
                        ).map(
                          ([label, v]) => (
                            <div
                              key={label}
                              className={
                                label === 'Total Cost'
                                  ? 'summary-total'
                                  : label === '(gross) Net'
                                    ? 'summary-profit'
                                    : ''
                              }
                            >
                              <span>
                                {label}
                              </span>

                              <strong>
                                {v === null
                                  ? 'Enter profit %'
                                  : currency(v)}
                              </strong>
                            </div>
                          )
                        )}

                        <div className="summary-profit">
                          <span>
                            (gross) Net Profit %
                          </span>

                          <strong>
                            {selected.grossNetProfitPct ===
                            null
                              ? 'Enter profit %'
                              : `${pct(
                                  selected.grossNetProfitPct
                                )}%`}
                          </strong>
                        </div>
                      </div>

                      {/* EXPANDABLE COMPUTATION */}

                      <div
                        style={{
                          padding:
                            '0 12px 12px',
                        }}
                      >
                        <OpeningFormula
                          l={selected}
                          p={p}
                        />
                      </div>

                    </>
                  )}

                  <button
                    className="summary-button"
                    onClick={saveCurrent}
                  >
                    Save Estimate
                  </button>

                  <button
                    className="summary-secondary"
                    onClick={exportCSV}
                    disabled={!totals.complete}
                  >
                    Export Takeoff CSV ↗
                  </button>

                </section>

                {/* ================================= */}
                {/* PROJECT TOTALS */}
                {/* ================================= */}

                <section
                  className="panel"
                  style={{
                    marginTop: 16,
                  }}
                >
                  <span className="section-label">
                    ALL OPENINGS COMBINED
                  </span>

                  <h2>
                    Project Totals
                  </h2>

                  <div className="pricing-totals">

                    <div className="stat">
                      <span className="stat-title">
                        Total Cost
                      </span>

                      <strong className="stat-value">
                        {currency(
                          totals.totalCost
                        )}
                      </strong>
                    </div>

                    <div className="stat">
                      <span className="stat-title">
                        Total Price before CC
                      </span>

                      <strong className="stat-value">
                        {totals.complete
                          ? currency(
                              totals.price
                            )
                          : 'Set all margins'}
                      </strong>
                    </div>

                    <div className="stat stat-hero">
                      <span className="stat-title">
                        Final Price including CC
                      </span>

                      <strong className="stat-value">
                        {totals.complete
                          ? currency(
                              totals.finalPrice
                            )
                          : 'Set all margins'}
                      </strong>
                    </div>

                  </div>

                  <p
                    style={{
                      fontSize: 11,
                      color: '#62798a',
                    }}
                  >
                    Project values are sums of each
                    opening. The margin is selected
                    separately for every opening.
                  </p>
                </section>

              </aside>
            </div>
          )}

          {/* ==================================== */}
          {/* PRICING & RATES */}
          {/* ==================================== */}

          {tab === 'pricing' && (
            <div className="pricing-layout">

              <div className="pricing-main">

                {/* DEFAULT GLASS AND FRAMING RATES */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        01 / BASE MATERIAL RATES
                      </span>

                      <h2>
                        Glass & Framing
                      </h2>
                    </div>
                  </div>

                  <p className="panel-subtitle">
                    These default rates automatically
                    appear in calculated opening fields.
                    Changing the selected glass type
                    updates the corresponding glass
                    rate. No waste allowance is added.
                  </p>

                  <div className="form-grid">

                    {GLASS_TYPES.map(
                      g => (
                        <Field
                          key={g}
                          label={`${g} — $/SF`}
                        >
                          <Num
                            value={
                              p.glassRates[g]
                            }
                            onChange={v =>
                              setRule(
                                'glassRates',
                                {
                                  ...p.glassRates,
                                  [g]: v,
                                }
                              )
                            }
                          />
                        </Field>
                      )
                    )}

                    <Field label="Framing $/LF">
                      <Num
                        value={
                          p.framingRatePerLF
                        }
                        onChange={v =>
                          setRule(
                            'framingRatePerLF',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Single-door package $ / assembly">
                      <Num
                        value={
                          p.singleDoorPackage
                        }
                        onChange={v =>
                          setRule(
                            'singleDoorPackage',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Double-door package $ / assembly">
                      <Num
                        value={
                          p.doubleDoorPackage
                        }
                        onChange={v =>
                          setRule(
                            'doubleDoorPackage',
                            v
                          )
                        }
                      />
                    </Field>

                  </div>
                </section>

                {/* FEES, TAX AND DISCOUNTS */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / WORKSHEET SETTINGS
                      </span>

                      <h2>
                        Fees, Tax, Discount & Risk
                      </h2>
                    </div>
                  </div>

                  <div className="form-grid">

                    <Field
                      label="Fixed hardware fee $ / opening mark"
                      hint="Added once per opening mark; default $15."
                    >
                      <Num
                        value={
                          p.hardwareFixedFee
                        }
                        onChange={v =>
                          setRule(
                            'hardwareFixedFee',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Hardware tax %">
                      <Num
                        value={
                          p.hardwareTaxPct
                        }
                        max={100}
                        onChange={v =>
                          setRule(
                            'hardwareTaxPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Glass discount %">
                      <Num
                        value={
                          p.glassDiscountPct
                        }
                        max={100}
                        onChange={v =>
                          setRule(
                            'glassDiscountPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Risk % of discounted glass">
                      <Num
                        value={p.riskPct}
                        max={100}
                        onChange={v =>
                          setRule(
                            'riskPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="CC surcharge %">
                      <Num
                        value={
                          p.ccSurchargePct
                        }
                        max={100}
                        onChange={v =>
                          setRule(
                            'ccSurchargePct',
                            v
                          )
                        }
                      />
                    </Field>

                  </div>
                </section>

                {/* PER OPENING SETTINGS */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / PER OPENING SETTINGS
                      </span>

                      <h2>
                        OPEX and Profit Margin
                      </h2>
                    </div>
                  </div>

                  <p className="panel-subtitle">
                    OPEX and (gross) Net Profit %
                    are edited separately on each
                    opening card under Office Fit-Out.
                    There is no global profit percentage
                    and no 20%, 30%, or 40% shortcut.
                  </p>

                  <div className="formula-panel">
                    <strong>
                      Price formula for every opening
                    </strong>

                    <code>
                      Price = Opening Total Cost ÷
                      (1 − Opening Gross Net Profit % / 100)
                    </code>

                    <p>
                      Final Price = Price ×
                      (1 + CC surcharge % / 100).
                    </p>
                  </div>

                  <button
                    className="btn btn-dark"
                    onClick={() =>
                      setTab('estimate')
                    }
                  >
                    ← Set opening margins
                  </button>
                </section>

              </div>

              {/* PROJECT TOTALS */}

              <div className="pricing-side">
                <section className="panel sticky-panel">

                  <span className="section-label">
                    LIVE PROJECT TOTALS
                  </span>

                  <h2>
                    All Openings
                  </h2>

                  <div className="pricing-totals">

                    <div className="stat">
                      <span className="stat-title">
                        Total Cost
                      </span>

                      <strong className="stat-value">
                        {currency(
                          totals.totalCost
                        )}
                      </strong>
                    </div>

                    <div className="stat">
                      <span className="stat-title">
                        Total Price
                      </span>

                      <strong className="stat-value">
                        {totals.complete
                          ? currency(
                              totals.price
                            )
                          : 'Set all margins'}
                      </strong>
                    </div>

                    <div className="stat stat-hero">
                      <span className="stat-title">
                        Final Price with CC
                      </span>

                      <strong className="stat-value">
                        {totals.complete
                          ? currency(
                              totals.finalPrice
                            )
                          : 'Set all margins'}
                      </strong>
                    </div>

                    <div className="stat">
                      <span className="stat-title">
                        Total Gross Net
                      </span>

                      <strong className="stat-value">
                        {totals.complete
                          ? currency(
                              totals.grossNet
                            )
                          : 'Set all margins'}
                      </strong>
                    </div>

                  </div>
                </section>
              </div>

            </div>
          )}

          {/* ==================================== */}
          {/* SAVED ESTIMATES */}
          {/* ==================================== */}

          {tab === 'saved' && (
            <section className="panel">

              <div className="panel-heading">
                <div>
                  <span className="section-label">
                    BROWSER PROJECT LIBRARY
                  </span>

                  <h2>
                    Saved Estimates (
                    {library.length})
                  </h2>
                </div>

                <div className="toolbar-actions">

                  <input
                    ref={libraryRef}
                    hidden
                    type="file"
                    accept=".json,application/json"
                    onChange={e =>
                      void importLibrary(
                        e.target.files?.[0]
                      )
                    }
                  />

                  <button
                    className="btn btn-outline"
                    onClick={() =>
                      libraryRef.current?.click()
                    }
                  >
                    ↑ Restore Library
                  </button>

                  <button
                    className="btn btn-outline"
                    onClick={backupAll}
                  >
                    ↓ Backup All
                  </button>

                </div>
              </div>

              <p className="panel-subtitle">
                Projects are saved in your browser,
                not a shared database. Back up
                regularly before changing or clearing
                browser data.
              </p>

              <input
                className="input"
                type="search"
                placeholder="Search project, estimate number, client, location..."
                style={{
                  maxWidth: 470,
                  marginBottom: 20,
                }}
                value={search}
                onChange={e =>
                  setSearch(
                    e.target.value
                  )
                }
              />

              {matches.length === 0 ? (
                <p>
                  No matching saved estimates.
                </p>
              ) : (
                <div
                  style={{
                    display: 'grid',

                    gridTemplateColumns:
                      'repeat(auto-fit,minmax(min(100%,300px),1fr))',

                    gap: 14,
                  }}
                >

                  {matches.map(
                    item => {
                      const s =
                        calculate(
                          item.project
                        );

                      return (
                        <article
                          key={item.id}
                          style={{
                            border:
                              '1px solid #d9e5e6',
                            padding: 16,
                            borderRadius: 12,
                            background: '#fff',
                            display: 'grid',
                            gap: 12,
                          }}
                        >

                          <div>
                            <strong>
                              {item.project.projectName ||
                                'Untitled Project'}
                            </strong>

                            <p
                              style={{
                                fontSize: 12,
                                color: '#65788a',
                              }}
                            >
                              {item.project.estimateNumber}
                              {' · '}
                              {item.project.clientName}
                            </p>
                          </div>

                          <small>
                            Last saved:{' '}
                            {new Date(
                              item.updatedAt
                            ).toLocaleString()}
                          </small>

                          <div
                            style={{
                              display: 'flex',
                              justifyContent:
                                'space-between',
                              gap: 12,
                            }}
                          >

                            <div>
                              <small>
                                Total Cost
                              </small>

                              <strong
                                style={{
                                  display: 'block',
                                }}
                              >
                                {currency(
                                  s.totalCost
                                )}
                              </strong>
                            </div>

                            <div>
                              <small>
                                Final Price
                              </small>

                              <strong
                                style={{
                                  display: 'block',
                                  color: '#087459',
                                }}
                              >
                                {s.complete
                                  ? currency(
                                      s.finalPrice
                                    )
                                  : 'Set margins'}
                              </strong>
                            </div>

                          </div>

                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                            }}
                          >

                            <button
                              className="btn btn-dark"
                              onClick={() =>
                                openSaved(item)
                              }
                            >
                              Open
                            </button>

                            <button
                              style={smallBtn}
                              onClick={() =>
                                duplicate(item)
                              }
                            >
                              Duplicate
                            </button>

                            <button
                              style={smallBtn}
                              onClick={() =>
                                rename(item)
                              }
                            >
                              Rename
                            </button>

                            <button
                              style={{
                                ...smallBtn,
                                color: '#a22',
                              }}
                              onClick={() =>
                                remove(item)
                              }
                            >
                              Delete
                            </button>

                          </div>

                        </article>
                      );
                    }
                  )}

                </div>
              )}

            </section>
          )}

          {/* FOOTER */}

          <footer className="footer">
            <span>
              Aspect Office Fit-Out · V1.6.2
            </span>

            <span>
              Per-opening worksheets · USD ·
              Browser-local saved projects
            </span>
          </footer>

        </main>
      </div>
    </div>
  );
}
