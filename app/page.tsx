
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

// ASPECT GLASSWORK ESTIMATING STUDIO V1.7.1
// Storefront-only framing and door model dropdowns.
// Other workspaces and estimating logic are retained.

// =====================================================
// WORKSPACES
// =====================================================

const WORKSPACES = [
  'storefront',
  'windows',
  'curtain-walls',
  'office-fit-out',
] as const;

type Workspace = (typeof WORKSPACES)[number];
type Tab = Workspace | 'pricing' | 'saved';
type Mode = 'calculated' | 'manual';
type GlassStyle = 'Annealed' | 'Tempered';
type PricingView = 'glass' | 'framing' | 'settings';
type RateFilter = 'all' | 'priced' | 'unpriced';
type LegacyGlassType = (typeof GLASS_TYPES)[number];

const WORKSPACE_NAMES: Record<Workspace, string> = {
  storefront: 'Storefront',
  windows: 'Windows',
  'curtain-walls': 'Curtain Walls',
  'office-fit-out': 'Office Fit-Out',
};

const WORKSPACE_PREFIX: Record<Workspace, string> = {
  storefront: 'SF',
  windows: 'W',
  'curtain-walls': 'CW',
  'office-fit-out': 'OF',
};

const isWorkspace = (v: unknown): v is Workspace =>
  typeof v === 'string' &&
  WORKSPACES.some(w => w === v);

// =====================================================
// STOREFRONT FRAMING SYSTEMS
// NEW — STOREFRONT ONLY
// =====================================================

const STOREFRONT_FRAMES = [
  {
    name:
      'FG450 / GAMCO, 1-3/4" × 4-1/2" NON-THERMAL BREAK MATERIAL',
    description:
      'GAMCO flush-glazed storefront system. The supplied reference describes a 2" × 4-1/2" system. Confirm the specified profile against the manufacturer submittal.',
  },
  {
    name:
      'FG451 / GAMCO, 2" × 4-1/2" NON-THERMAL BREAK MATERIAL',
    description:
      'GAMCO storefront frame series designed to integrate entrance doors into a flush-glazed storefront system.',
  },
  {
    name:
      'REBCO, 1-3/4" × 4-1/2" FRAMING',
    description:
      'Standard architectural storefront aluminum extrusion featuring a 1-3/4" sightline face width and 4-1/2" deep profile, used across fixed frames, transoms, sidelites, and entrance assemblies.',
  },
  {
    name:
      'REBCO, 2" × 4-1/2" FRAMING (FLUSH GLAZED / TALL BEAD)',
    description:
      'Architectural storefront aluminum extrusion featuring a 2" sightline face width and 4-1/2" deep profile, with recessed pockets for flush glazing or tall glazing stops for 1" insulated glass.',
  },
] as const;

// =====================================================
// STOREFRONT DOOR MODELS
// NEW — STOREFRONT ONLY
// =====================================================

const STOREFRONT_DOORS = [
  {
    name: 'D500 / GAMCO WIDE STILE DOOR',
    description:
      'GAMCO heavy-duty wide-stile commercial aluminum door designed for high-traffic or heavy-use applications.',
  },
  {
    name: 'D350 / GAMCO MEDIUM STILE DOOR',
    description:
      'GAMCO medium-stile commercial door featuring narrower, streamlined vertical stiles than the heavy-duty D500 model for a higher glass-to-metal ratio.',
  },
  {
    name: 'D200 / GAMCO NARROW STILE DOOR',
    description:
      'Commercial narrow-stile aluminum entrance door designed for light-to-moderate pedestrian traffic and maximum glass visibility.',
  },
  {
    name:
      'BD3000 — OUT SWING BALCONY DOOR, 3-1/4" THERMAL BREAK PROFILE',
    description:
      'High-performance terrace or balcony door system designed to swing outward, featuring a 3-1/4" deep aluminum profile with an integrated thermal break for improved energy performance.',
  },
  {
    name: 'SERIES N / REBCO NARROW STILE DOOR',
    description:
      'Commercial narrow-stile aluminum entrance door for light-to-moderate pedestrian traffic, featuring triple-reinforced welded corner construction and preparation for 1/4" or 1" insulated glass.',
  },
  {
    name: 'SERIES M / REBCO MEDIUM STILE DOOR',
    description:
      'REBCO medium-stile commercial door with wider 3-1/2" vertical stiles for balanced structural strength and visibility. Available with bottom kick rails and optional intermediate rails.',
  },
  {
    name: 'REBCO, 1" HALF BRONZE STUCCO PANEL DOOR',
    description:
      'Commercial medium-stile entrance door with a 2" intermediate horizontal rail, upper glazed section prepared for 1" insulated glass, and lower insulated aluminum stucco-textured panel.',
  },
  {
    name: 'SERIES W / REBCO WIDE STILE DOOR',
    description:
      'Heavy-duty commercial entrance door featuring 5" wide vertical stiles designed for high-impact pedestrian traffic.',
  },
  {
    name:
      'REBCO FRP (FIBERGLASS REINFORCED POLYESTER) DOOR',
    description:
      'Heavy-duty commercial or institutional entrance door with scratch- and dent-resistant FRP face sheets, aluminum subframe, and insulated core.',
  },
  {
    name: 'REBCO FLUSH & PANEL DOORS',
    description:
      'Commercial aluminum doors available in insulated full-flush construction or partial aluminum panel configurations for privacy, security, and sound insulation.',
  },
] as const;

// =====================================================
// GLASS SPECIFICATIONS
// =====================================================

const GLASS_SPECIFICATIONS = [
  '1/2" 1/4 Mirror Low Iron',
  '1/2" Alice Printed White',
  '3/8" Bronze',
  '1/2" Bronze',
  '3/8" Bubbles',
  '3/8" Cast Glass',
  '3/8" Clear 055 #3 White Print',
  '1/2" Clear 055 #3 White Print',
  '3/8" Clear',
  '1/2" Clear',
  '5/8" Clear',
  '3/4" Clear',
  '1" Clear',
  '3/8" Gluechip',
  '3/8" Grey',
  '1/2" Grey',
  '3/8" Laminate Acoustic Arctic White Clear',
  '1/2" Laminate Acoustic Arctic White Clear',
  '3/8" Laminate Acoustic Clear',
  '1/2" Laminate Acoustic Clear',
  '3/8" Laminate Acoustic Low Iron',
  '1/2" Laminate Acoustic Low Iron',
  '3/8" Laminate Artic White Clear',
  '1/2" Laminate Artic White Clear',
  '9/16" Laminate Clear SGP Interlayer',
  '3/8" Laminate Clear',
  '1/2" Laminate Clear',
  '3/8" Laminate Low Iron',
  '1/2" Laminate Low Iron',
  '3/8" Low Iron 055 #3 White Print',
  '3/8" Low Iron Alice Print White',
  '3/8" Micro Ribbed',
  '3/8" Low Iron Reeded',
  '1/2" White Back Painted Glass',
  '3/8" Low Iron',
  '1/2" Low Iron',
  '5/8" Low Iron',
  '3/8" Master Care',
  '3/8" Optiwhite',
  '1/2" Optiwhite',
  '5/8" Optiwhite',
  '3/4" Optiwhite',
  '3/8" Zeus Antique',
  '3/8" Pyran Platinum Laminated',
  '3/8" Rain',
  '3/8" Reeded',
  '3/8" Satin Starphire (Low Iron)',
  '1/2" Satin Starphire (Low Iron)',
  '3/8" Satin',
  '1/2" Satin',
  '3/8" Shower Guard Low Iron',
  '1/2" Shower Guard Low Iron',
  '3/8" Shower Guard',
  '1/2" Shower Guard',
  '3/8" Starphire (Low Iron)',
  '1/2" Starphire (Low Iron)',
  '5/8" Starphire (Low Iron)',
  '3/4" Starphire (Low Iron)',
  '3/8" Stipolite',
  ...GLASS_TYPES,
];

const GLASS_OPTIONS = Array.from(
  new Set<string>(GLASS_SPECIFICATIONS)
);

// =====================================================
// GLASS GROUPS
// =====================================================

const GLASS_GROUP_NAMES = [
  'Clear, Bronze & Grey',
  'Low Iron, Optiwhite & Starphire',
  'Laminated & Acoustic',
  'Decorative, Mirror & Printed',
  'Textured, Satin & Coated',
  'Insulated Glass',
] as const;

type GlassGroup = (typeof GLASS_GROUP_NAMES)[number];

function groupOf(spec: string): GlassGroup {
  if (/Insulated/i.test(spec)) {
    return 'Insulated Glass';
  }

  if (/Laminate|SGP Interlayer|Pyran/i.test(spec)) {
    return 'Laminated & Acoustic';
  }

  if (
    /Mirror|Printed|White Print|Back Painted|Alice|055/i.test(
      spec
    )
  ) {
    return 'Decorative, Mirror & Printed';
  }

  if (
    /Reeded|Ribbed|Bubbles|Gluechip|Cast Glass|Rain|Master Care|Zeus|Stipolite|Satin|Shower Guard/i.test(
      spec
    )
  ) {
    return 'Textured, Satin & Coated';
  }

  if (/Low Iron|Optiwhite|Starphire/i.test(spec)) {
    return 'Low Iron, Optiwhite & Starphire';
  }

  return 'Clear, Bronze & Grey';
}

const GLASS_GROUPS = GLASS_GROUP_NAMES.map(name => ({
  name,
  specs: GLASS_OPTIONS.filter(
    spec => groupOf(spec) === name
  ),
}));

const glassKey = (
  spec: string,
  style: GlassStyle
) => `${spec}::${style}`;

const permittedStyles = (
  spec: string
): GlassStyle[] =>
  /Tempered/i.test(spec)
    ? ['Tempered']
    : ['Annealed', 'Tempered'];

function priceCategory(
  spec: string,
  style: GlassStyle
): LegacyGlassType | null {
  if (
    spec === '1/2" Clear' &&
    style === 'Tempered'
  ) {
    return '1/2" Clear Tempered';
  }

  if (
    spec === '1/4" Clear' &&
    style === 'Tempered'
  ) {
    return '1/4" Clear Tempered';
  }

  if (
    GLASS_TYPES.includes(
      spec as LegacyGlassType
    )
  ) {
    if (
      /Tempered|Insulated/i.test(spec) &&
      style !== 'Tempered'
    ) {
      return null;
    }

    return spec as LegacyGlassType;
  }

  return null;
}

// =====================================================
// DATA TYPES
// =====================================================

type Opening = StorefrontOpening & {
  glassSpecification: string;
  glassStyle: GlassStyle;
  glassMode: Mode;
  hardwareMode: Mode;
  manualGlassCostEach: number;
  manualHardwareCostEach: number;
  opexPerAssembly: number;
  targetGrossNetPct: number | null;
};

type Rules = PricingRules & {
  glassSpecRates: Record<string, number | null>;
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

  // NEW — Saved on Storefront projects
  storefrontDoorModel: string;
};

type Saved = {
  id: string;
  workspace: Workspace;
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

// =====================================================
// STORAGE KEYS
// =====================================================

const DRAFT_KEY =
  'aspect-storefront-estimator-v1';

const LIBRARY_KEY =
  'aspect-storefront-estimator-library-v1';

const ACTIVE_KEY =
  'aspect-storefront-estimator-active-v1';

const WORKSPACE_DRAFTS_KEY =
  'aspect-estimator-workspace-drafts-v1';

const WORKSPACE_ACTIVE_KEY =
  'aspect-estimator-workspace-active-v1';

const CURRENT_WORKSPACE_KEY =
  'aspect-estimator-current-workspace-v1';

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

const clone = (
  p: Project
): Project => structuredClone(p);

function modelDescription(
  items: readonly {
    name: string;
    description: string;
  }[],
  key: string
) {
  return (
    items.find(x => x.name === key)
      ?.description ?? ''
  );
}

// =====================================================
// GLASS RATE LOOKUP
// =====================================================

function catalogRate(
  spec: string,
  style: GlassStyle,
  p: Rules
): number | null {
  const key = glassKey(spec, style);

  if (
    Object.prototype.hasOwnProperty.call(
      p.glassSpecRates,
      key
    )
  ) {
    return p.glassSpecRates[key];
  }

  const linked = priceCategory(
    spec,
    style
  );

  return linked === null
    ? null
    : p.glassRates[linked];
}

// =====================================================
// PROJECT NORMALIZATION
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
    (s, o) =>
      s + Math.max(1, o.quantity),
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

    storefrontDoorModel:
      typeof raw.storefrontDoorModel === 'string'
        ? raw.storefrontDoorModel
        : '',

    openings: base.openings.map((o, i) => {
      const r = obj(originals[i]);

      return {
        ...o,

        glassSpecification:
          typeof r.glassSpecification === 'string' &&
          r.glassSpecification.trim()
            ? r.glassSpecification
            : o.glassType,

        glassStyle:
          r.glassStyle === 'Annealed' ||
          r.glassStyle === 'Tempered'
            ? r.glassStyle
            : 'Tempered',

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

      glassSpecRates: Object.fromEntries(
        Object.entries(
          obj(rp.glassSpecRates)
        ).filter(
          ([, value]) =>
            value === null ||
            (
              typeof value === 'number' &&
              Number.isFinite(value) &&
              value >= 0
            )
        )
      ) as Record<string, number | null>,

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

// =====================================================
// NEW PROJECTS
// =====================================================

function fresh(): Project {
  return normalizeAppProject(
    newProject()
  ) as Project;
}

function freshOpening(
  index: number,
  workspace: Workspace
): Opening {
  const base = newOpening(index);

  return {
    ...base,

    mark:
      `${WORKSPACE_PREFIX[workspace]}-` +
      String(index).padStart(2, '0'),

    glassSpecification: base.glassType,
    glassStyle: 'Tempered',

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

function freshFor(
  workspace: Workspace
): Project {
  const project = fresh();

  if (workspace === 'office-fit-out') {
    return project;
  }

  project.projectName =
    `New ${WORKSPACE_NAMES[workspace]} Project`;

  project.estimateNumber = '';

  project.openings = [
    freshOpening(1, workspace),
  ];

  project.scopeNotes = '';

  project.framingSystem =
    workspace === 'storefront'
      ? ''
      : workspace === 'windows'
        ? 'Aluminum window framing'
        : 'Aluminum curtain wall framing';

  project.storefrontDoorModel = '';

  return project;
}

function newDrafts(): Record<
  Workspace,
  Project
> {
  return {
    storefront: freshFor('storefront'),
    windows: freshFor('windows'),
    'curtain-walls': freshFor('curtain-walls'),
    'office-fit-out': freshFor('office-fit-out'),
  };
}

// =====================================================
// ESTIMATING CALCULATIONS
// =====================================================

function calculate(
  project: Project
): Totals {
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

  for (
    const [key, rate] of
    Object.entries(p.glassSpecRates)
  ) {
    if (
      rate !== null &&
      (
        !Number.isFinite(rate) ||
        rate < 0
      )
    ) {
      errors.push(
        `Invalid catalog rate: ${key}`
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

    if (
      marks.has(label.toUpperCase())
    ) {
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

    const defaultGlassRate = catalogRate(
      o.glassSpecification,
      o.glassStyle,
      p
    );

    const glassRate =
      o.glassRateOverride ??
      defaultGlassRate;

    const frameRate =
      o.frameRateOverride ??
      p.framingRatePerLF;

    if (
      o.glassMode === 'calculated' &&
      (
        glassRate === null ||
        !Number.isFinite(glassRate) ||
        glassRate < 0
      )
    ) {
      errors.push(
        `${label}: No default $/SF for ${o.glassSpecification} (${o.glassStyle}). Enter a custom Glass Rate or choose Manual glass pricing.`
      );

      continue;
    }

    if (
      !Number.isFinite(frameRate) ||
      frameRate < 0
    ) {
      errors.push(
        `${label}: framing rate must be zero or greater.`
      );

      continue;
    }

    if (
      !isMargin(o.targetGrossNetPct)
    ) {
      errors.push(
        `${label}: enter a Gross Net Profit % from 0 to less than 100.`
      );
    }

    const qty = o.quantity;

    // Glass area — no material allowance
    const glassSF =
      w * h / 144 * qty;

    // Simplified framing length
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

    const glassCost =
      o.glassMode === 'manual'
        ? o.manualGlassCostEach * qty
        : glassSF * (glassRate ?? 0);

    const hardwareCost =
      o.hardwareMode === 'manual'
        ? o.manualHardwareCostEach * qty
        : frameLF * frameRate +
          (
            doorRate +
            o.hardwareAllowance
          ) * qty;

    const totalHardwareCost =
      (
        hardwareCost +
        p.hardwareFixedFee
      ) *
      (
        1 +
        p.hardwareTaxPct / 100
      );

    const totalGlassCost =
      glassCost *
      (
        1 -
        p.glassDiscountPct / 100
      );

    const opex =
      o.opexPerAssembly * qty;

    const risk =
      totalGlassCost *
      p.riskPct / 100;

    const totalCost =
      totalHardwareCost +
      totalGlassCost +
      opex +
      risk;

    const price =
      isMargin(o.targetGrossNetPct)
        ? totalCost /
          (
            1 -
            o.targetGrossNetPct / 100
          )
        : null;

    const ccSurcharge =
      price === null
        ? null
        : price *
          p.ccSurchargePct / 100;

    const finalPrice =
      price === null ||
      ccSurcharge === null
        ? null
        : price + ccSurcharge;

    const grossNet =
      price === null
        ? null
        : price - totalCost;

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
      glassRate: glassRate ?? 0,
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
// DOWNLOAD AND EXPORT
// =====================================================

function download(
  name: string,
  data: string,
  mime = 'application/json'
) {
  const url = URL.createObjectURL(
    new Blob([data], { type: mime })
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
    .slice(0, 64) || 'estimate';

function csvCell(
  v: string | number
) {
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
  defaultRate: number | null;
  override: number | null;
  onChange: (rate: number | null) => void;
}) {
  const usingDefault =
    override === null;

  const rateLabel =
    defaultRate === null
      ? 'Not assigned'
      : `${currency(defaultRate)}/${unit}`;

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
        value={
          override ??
          defaultRate ??
          ''
        }
        placeholder={
          defaultRate === null
            ? 'Enter custom rate'
            : undefined
        }
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
        Pricing &amp; Rates default: {rateLabel}
        {' · '}
        {usingDefault
          ? defaultRate === null
            ? 'Custom rate required'
            : 'Using automatic rate'
          : 'Custom rate for this opening'}
      </span>

      {!usingDefault &&
        defaultRate !== null && (
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
            ↺ Use default rate
          </button>
        )}
    </div>
  );
}

// =====================================================
// COMPUTATION DISPLAY
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

function Worksheet({
  l,
  p,
}: {
  l: Line;
  p: Rules;
}) {
  const m = (
    v: number | null
  ) =>
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
            ? `${currency(
                o.manualHardwareCostEach
              )} per assembly × ${o.quantity}`
            : `${n4(l.frameLF)} LF × ` +
              `${currency(l.frameRate)}/LF + ` +
              `${o.quantity} × (` +
              `${currency(l.doorRate)} door + ` +
              `${currency(o.hardwareAllowance)} extras)`
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
            ? `${currency(
                o.manualGlassCostEach
              )} per assembly × ${o.quantity}`
            : `${n4(l.glassSF)} SF × ` +
              `${currency(l.glassRate)}/SF`
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
          `${m(l.price)} − ${currency(l.totalCost)}`
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

      <p style={{ fontSize: 12 }}>
        <strong>Glass Specification:</strong>
        {' '}
        {o.glassSpecification}
        {' · '}
        {o.glassStyle}
      </p>

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
          `(${o.columns} − 1) × ${n4(l.height)} + ` +
          `(${o.rows} − 1) × ${n4(l.width)}] ÷ 12 × ` +
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
        Preliminary takeoff quantities.
        The fixed hardware fee is charged
        once per opening mark.
        No material waste allowance is added.
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
  const [drafts, setDrafts] = useState<
    Record<Workspace, Project>
  >(() => newDrafts());

  const [workspace, setWorkspace] =
    useState<Workspace>('office-fit-out');

  const [tab, setTab] =
    useState<Tab>('office-fit-out');

  const [activeIds, setActiveIds] = useState<
    Partial<Record<Workspace, string>>
  >({});

  const [savedFilter, setSavedFilter] = useState<
    Workspace | 'all'
  >('all');

  const [pricingView, setPricingView] =
    useState<PricingView>('glass');

  const [glassSearch, setGlassSearch] =
    useState('');

  const [rateFilter, setRateFilter] =
    useState<RateFilter>('all');

  const [expandedGroups, setExpandedGroups] =
    useState<string[]>([
      'Clear, Bronze & Grey',
    ]);

  const [library, setLibrary] =
    useState<Saved[]>([]);

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

  const [styleMenuId, setStyleMenuId] =
    useState<string | null>(null);

  const importRef =
    useRef<HTMLInputElement>(null);

  const libraryRef =
    useRef<HTMLInputElement>(null);

  const project = drafts[workspace];

  const activeId =
    activeIds[workspace] ?? null;

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
    .filter(
      x =>
        (
          savedFilter === 'all' ||
          x.workspace === savedFilter
        ) &&
        [
          x.project.projectName,
          x.project.estimateNumber,
          x.project.clientName,
          x.project.location,
        ]
          .join(' ')
          .toLowerCase()
          .includes(
            search.trim().toLowerCase()
          )
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(
          a.updatedAt
        )
    );

  // ==================================================
  // LOAD EXISTING SAVED DATA
  // ==================================================

  useEffect(() => {
    try {
      const result = newDrafts();

      const workspaceDrafts =
        localStorage.getItem(
          WORKSPACE_DRAFTS_KEY
        );

      if (workspaceDrafts) {
        const raw = obj(
          JSON.parse(workspaceDrafts)
        );

        for (const name of WORKSPACES) {
          const normalized =
            normalizeAppProject(raw[name]);

          if (normalized) {
            result[name] = normalized;
          }
        }
      } else {
        // Migrate previous Office Fit-Out draft
        const legacy =
          localStorage.getItem(DRAFT_KEY);

        if (legacy) {
          const old = normalizeAppProject(
            JSON.parse(legacy)
          );

          if (old) {
            result['office-fit-out'] = old;
          }
        }
      }

      setDrafts(result);

      const savedRaw =
        localStorage.getItem(LIBRARY_KEY);

      let records: Saved[] = [];

      if (savedRaw) {
        const parsed: unknown =
          JSON.parse(savedRaw);

        if (Array.isArray(parsed)) {
          records = parsed
            .slice(0, 250)
            .flatMap((item): Saved[] => {
              const r = obj(item);

              const pr = normalizeAppProject(
                r.project
              );

              if (!pr) return [];

              return [{
                id:
                  typeof r.id === 'string'
                    ? r.id
                    : id(),

                workspace:
                  isWorkspace(r.workspace)
                    ? r.workspace
                    : 'office-fit-out',

                createdAt:
                  typeof r.createdAt === 'string'
                    ? r.createdAt
                    : new Date().toISOString(),

                updatedAt:
                  typeof r.updatedAt === 'string'
                    ? r.updatedAt
                    : new Date().toISOString(),

                project: pr,
              }];
            });
        }
      }

      setLibrary(records);

      const savedActive =
        localStorage.getItem(
          WORKSPACE_ACTIVE_KEY
        );

      const active: Partial<
        Record<Workspace, string>
      > = {};

      if (savedActive) {
        const raw = obj(
          JSON.parse(savedActive)
        );

        for (const name of WORKSPACES) {
          const value = raw[name];

          if (
            typeof value === 'string' &&
            records.some(
              x =>
                x.id === value &&
                x.workspace === name
            )
          ) {
            active[name] = value;
          }
        }
      } else {
        const legacyActive =
          localStorage.getItem(ACTIVE_KEY);

        if (
          legacyActive &&
          records.some(
            x =>
              x.id === legacyActive &&
              x.workspace === 'office-fit-out'
          )
        ) {
          active['office-fit-out'] = legacyActive;
        }
      }

      setActiveIds(active);

      const lastWorkspace =
        localStorage.getItem(
          CURRENT_WORKSPACE_KEY
        );

      if (isWorkspace(lastWorkspace)) {
        setWorkspace(lastWorkspace);
        setTab(lastWorkspace);
      }
    } catch {
      setNotice(
        'Some stored estimates could not be loaded. Restore a backup if necessary.'
      );
    }

    setReady(true);
  }, []);

  // ==================================================
  // AUTOSAVE WORKSPACE DRAFTS
  // ==================================================

  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(
        WORKSPACE_DRAFTS_KEY,
        JSON.stringify(drafts)
      );

      localStorage.setItem(
        WORKSPACE_ACTIVE_KEY,
        JSON.stringify(activeIds)
      );

      localStorage.setItem(
        CURRENT_WORKSPACE_KEY,
        workspace
      );
    } catch {
      setNotice(
        'Browser storage is full. Back up your estimates.'
      );
    }
  }, [
    drafts,
    activeIds,
    workspace,
    ready,
  ]);

  // ==================================================
  // PROJECT UPDATE FUNCTIONS
  // ==================================================

  function setProject(
    fn: (old: Project) => Project
  ) {
    setDrafts(old => ({
      ...old,
      [workspace]: fn(old[workspace]),
    }));
  }

  function goWorkspace(
    next: Workspace
  ) {
    setWorkspace(next);
    setTab(next);

    setSelectedOpeningId(null);
    setStyleMenuId(null);
    setNotice('');
  }

  function setInfo<
    K extends keyof Project
  >(
    key: K,
    value: Project[K]
  ) {
    setProject(old => ({
      ...old,
      [key]: value,
    }));
  }

  function setRule<
    K extends keyof Rules
  >(
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

  function setCatalogRate(
    spec: string,
    style: GlassStyle,
    rate: number | null
  ) {
    setProject(old => {
      const updated = {
        ...old.pricing.glassSpecRates,
        [glassKey(spec, style)]: rate,
      };

      const linked = priceCategory(
        spec,
        style
      );

      if (
        linked === '1/2" Clear Tempered'
      ) {
        updated[
          glassKey(
            '1/2" Clear',
            'Tempered'
          )
        ] = rate;

        updated[
          glassKey(
            '1/2" Clear Tempered',
            'Tempered'
          )
        ] = rate;
      }

      if (
        linked === '1/4" Clear Tempered'
      ) {
        updated[
          glassKey(
            '1/4" Clear',
            'Tempered'
          )
        ] = rate;

        updated[
          glassKey(
            '1/4" Clear Tempered',
            'Tempered'
          )
        ] = rate;
      }

      return {
        ...old,

        pricing: {
          ...old.pricing,

          glassSpecRates: updated,

          glassRates:
            linked !== null &&
            rate !== null
              ? {
                  ...old.pricing.glassRates,
                  [linked]: rate,
                }
              : old.pricing.glassRates,
        },
      };
    });
  }

  function toggleGroup(
    name: string
  ) {
    setExpandedGroups(old =>
      old.includes(name)
        ? old.filter(
            item => item !== name
          )
        : [...old, name]
    );
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
        `${WORKSPACE_PREFIX[workspace]}-${String(
          k
        ).padStart(2, '0')}`
      )
    ) {
      k++;
    }

    const next = freshOpening(
      k,
      workspace
    );

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
      x =>
        x.id === activeId &&
        x.workspace === workspace
    );

    const nextId =
      previous?.id ?? id();

    const now =
      new Date().toISOString();

    const record: Saved = {
      id: nextId,
      workspace,

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
      setActiveIds(old => ({
        ...old,
        [workspace]: nextId,
      }));
    }
  }

  function safeSwitch(
    target: Workspace = workspace
  ) {
    const record = library.find(
      x =>
        x.id === activeIds[target] &&
        x.workspace === target
    );

    const unchanged =
      !!record &&
      JSON.stringify(record.project) ===
        JSON.stringify(drafts[target]);

    return (
      unchanged ||
      confirm(
        `Replace the current ${WORKSPACE_NAMES[target]} draft? Unsaved changes will be lost. Cancel to save first.`
      )
    );
  }

  function openSaved(
    record: Saved
  ) {
    if (
      !safeSwitch(record.workspace)
    ) {
      return;
    }

    setDrafts(old => ({
      ...old,

      [record.workspace]: clone(
        record.project
      ),
    }));

    setActiveIds(old => ({
      ...old,
      [record.workspace]: record.id,
    }));

    setWorkspace(record.workspace);
    setSelectedOpeningId(null);
    setTab(record.workspace);
  }

  function newEstimate() {
    if (!safeSwitch()) return;

    setProject(
      () => freshFor(workspace)
    );

    setActiveIds(old => {
      const next = { ...old };
      delete next[workspace];

      return next;
    });

    setSelectedOpeningId(null);
    setTab(workspace);
  }

  function duplicate(
    record: Saved
  ) {
    const pr = clone(record.project);

    pr.projectName += ' (Copy)';
    pr.estimateNumber += '-COPY';

    const now =
      new Date().toISOString();

    saveLibrary(
      [
        {
          id: id(),
          workspace: record.workspace,
          createdAt: now,
          updatedAt: now,
          project: pr,
        },

        ...library,
      ],

      'Estimate duplicated.'
    );
  }

  function rename(
    record: Saved
  ) {
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
      activeIds[record.workspace] ===
        record.id
    ) {
      setDrafts(old => ({
        ...old,

        [record.workspace]: {
          ...old[record.workspace],
          projectName: name,
        },
      }));
    }
  }

  function remove(
    record: Saved
  ) {
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
      activeIds[record.workspace] ===
        record.id
    ) {
      setActiveIds(old => {
        const next = { ...old };
        delete next[record.workspace];

        return next;
      });
    }
  }

  // ==================================================
  // BACKUP FUNCTIONS
  // ==================================================

  function backupDraft() {
    download(
      `${workspace}-${safeName(
        project.estimateNumber
      )}.json`,

      JSON.stringify(
        {
          format:
            'aspect-workspace-estimate',
          workspace,
          project,
        },

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
          format:
            'aspect-estimator-library',
          version: 6,
          estimates: library,
        },

        null,
        2
      )
    );
  }

  // ==================================================
  // IMPORT FUNCTIONS
  // ==================================================

  async function importDraft(
    file?: File
  ) {
    if (!file) return;

    try {
      if (
        file.size > 2_000_000
      ) {
        throw Error('Too large');
      }

      const payload = JSON.parse(
        await file.text()
      );

      const content = obj(payload);

      const pr = normalizeAppProject(
        content.format ===
          'aspect-workspace-estimate'
          ? content.project
          : payload
      );

      if (!pr) {
        throw Error('Invalid');
      }

      const target =
        isWorkspace(content.workspace)
          ? content.workspace
          : workspace;

      if (!safeSwitch(target)) return;

      setDrafts(old => ({
        ...old,
        [target]: pr,
      }));

      setActiveIds(old => {
        const next = { ...old };
        delete next[target];

        return next;
      });

      setWorkspace(target);
      setSelectedOpeningId(null);
      setTab(target);

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

  async function importLibrary(
    file?: File
  ) {
    if (!file) return;

    try {
      if (
        file.size > 5_000_000
      ) {
        throw Error('Too large');
      }

      const raw = obj(
        JSON.parse(await file.text())
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

      const imported = raw.estimates.map(
        (item: unknown): Saved => {
          const r = obj(item);

          const pr = normalizeAppProject(
            r.project
          );

          if (!pr) {
            throw Error('Invalid estimate');
          }

          const now =
            new Date().toISOString();

          return {
            id: id(),

            workspace:
              isWorkspace(r.workspace)
                ? r.workspace
                : 'office-fit-out',

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
          `Add ${imported.length} estimates to your library?`
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
  // CSV EXPORT
  // ==================================================

  function exportCSV() {
    const header = [
      'Workspace',
      'Project Framing System',
      'Project Door Model',
      'Opening Mark',
      'Glass Specification',
      'Glass Style',
      'Opening Type',
      'Quantity',
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

    const rows = totals.lines.map(l => [
      WORKSPACE_NAMES[workspace],

      project.framingSystem,

      workspace === 'storefront'
        ? project.storefrontDoorModel
        : '',

      l.opening.mark,
      l.opening.glassSpecification,
      l.opening.glassStyle,

      formatOpeningType(
        l.opening.openingType
      ),

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
    ]);

    download(
      `${workspace}-${safeName(
        project.estimateNumber
      )}-takeoff.csv`,

      '\uFEFF' +
        [header, ...rows]
          .map(
            r =>
              r.map(csvCell).join(',')
          )
          .join('\r\n'),

      'text/csv;charset=utf-8'
    );
  }

  // ==================================================
  // TOOLBAR
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
  // APPLICATION INTERFACE
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
            <strong>ASPECT GLASSWORK</strong>
            <small>ESTIMATING STUDIO</small>
          </span>
        </div>

        <div className="topbar-right">
          <span className="top-pill">
            <span className="green-dot" />
            Browser-based · V1.7.1
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

          {WORKSPACES.map(name => (
            <button
              key={name}
              className={`navitem ${
                tab === name ? 'active' : ''
              }`}
              onClick={() =>
                goWorkspace(name)
              }
            >
              {name === 'storefront'
                ? '▦'
                : name === 'windows'
                  ? '▤'
                  : name === 'curtain-walls'
                    ? '▥'
                    : '▣'}
              {' '}
              {WORKSPACE_NAMES[name]}
            </button>
          ))}

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
            ◫ Pricing &amp; Rates
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
              Estimator V1.7.1
            </strong>

            <p>
              Four independent estimating
              workspaces. Storefront includes
              framing and entrance-door models.
              Saved projects remain in this browser.
            </p>
          </div>
        </aside>

        {/* MAIN AREA */}

        <main className="main">
          <div className="page-toolbar">
            <div>
              <div className="eyebrow">
                COMMERCIAL GLAZING /{' '}
                {WORKSPACE_NAMES[
                  workspace
                ].toUpperCase()}
              </div>

              <h1>
                {tab === 'pricing'
                  ? 'Pricing & Cost Rules'
                  : tab === 'saved'
                    ? 'Saved Estimates'
                    : WORKSPACE_NAMES[tab]}
              </h1>

              <p className="page-desc">
                {tab !== 'pricing' &&
                tab !== 'saved'
                  ? 'Set glass, hardware, OPEX and Gross Net Profit % for each opening separately.'
                  : tab === 'pricing'
                    ? 'Organized glass rates, framing rates, and worksheet settings.'
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
                ...WORKSPACES.map(
                  w =>
                    [
                      w,
                      WORKSPACE_NAMES[w],
                    ] as [Tab, string]
                ),
                ['pricing', 'Pricing'],
                ['saved', 'Saved Estimates'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={
                  tab === key
                    ? 'selected'
                    : ''
                }
                onClick={() =>
                  isWorkspace(key)
                    ? goWorkspace(key)
                    : setTab(key)
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* WARNINGS */}

          {tab !== 'saved' && (
            <>
              <div className="sample-notice">
                <strong>
                  Internal estimates only.
                </strong>

                {' '}
                Profit % and OPEX are set individually
                per opening. No material waste allowance
                is applied. Confirm supplier rates and
                scope before quoting in Smart Glazier.
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

          {/* ===================================== */}
          {/* ALL FOUR ESTIMATING WORKSPACES */}
          {/* ===================================== */}

          {isWorkspace(tab) && (
            <div className="workspace-columns">
              <div className="content-column">

                {/* PROJECT DETAILS */}

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
                      ] as [
                        string,
                        | 'projectName'
                        | 'estimateNumber'
                        | 'clientName'
                        | 'location'
                        | 'estimator'
                        | 'date'
                      ][]
                    ).map(([label, key]) => (
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
                    ))}

                    {/* ================================= */}
                    {/* STOREFRONT-ONLY FRAMING DROPDOWN */}
                    {/* ================================= */}

                    {workspace === 'storefront' ? (
                      <>
                        <Field
                          label="Framing Type / System"
                          hint={
                            modelDescription(
                              STOREFRONT_FRAMES,
                              project.framingSystem
                            ) ||
                            (
                              project.framingSystem
                                ? 'Existing/custom framing value. Select a listed model when applicable.'
                                : 'Choose the framing system for this storefront project.'
                            )
                          }
                        >
                          <select
                            className="input"
                            value={project.framingSystem}
                            onChange={e =>
                              setInfo(
                                'framingSystem',
                                e.target.value
                              )
                            }
                          >
                            <option value="">
                              — Select Storefront Framing —
                            </option>

                            {project.framingSystem &&
                              !STOREFRONT_FRAMES.some(
                                x =>
                                  x.name ===
                                  project.framingSystem
                              ) && (
                                <option
                                  value={project.framingSystem}
                                >
                                  {project.framingSystem}
                                  {' '}(existing)
                                </option>
                              )}

                            {STOREFRONT_FRAMES.map(item => (
                              <option
                                key={item.name}
                                value={item.name}
                              >
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </Field>

                        {/* ================================= */}
                        {/* STOREFRONT-ONLY DOOR DROPDOWN */}
                        {/* ================================= */}

                        <Field
                          label="Door Model / Type"
                          hint={
                            modelDescription(
                              STOREFRONT_DOORS,
                              project.storefrontDoorModel
                            ) ||
                            (
                              project.storefrontDoorModel
                                ? 'Previously saved custom door model.'
                                : 'Choose a door model, or leave blank if no entrance door is specified.'
                            )
                          }
                        >
                          <select
                            className="input"
                            value={
                              project.storefrontDoorModel
                            }
                            onChange={e =>
                              setInfo(
                                'storefrontDoorModel',
                                e.target.value
                              )
                            }
                          >
                            <option value="">
                              — No door / Not specified —
                            </option>

                            {project.storefrontDoorModel &&
                              !STOREFRONT_DOORS.some(
                                x =>
                                  x.name ===
                                  project.storefrontDoorModel
                              ) && (
                                <option
                                  value={
                                    project.storefrontDoorModel
                                  }
                                >
                                  {project.storefrontDoorModel}
                                  {' '}(existing)
                                </option>
                              )}

                            {STOREFRONT_DOORS.map(item => (
                              <option
                                key={item.name}
                                value={item.name}
                              >
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    ) : (
                      <Field label="Framing System">
                        <Txt
                          value={project.framingSystem}
                          onChange={v =>
                            setInfo(
                              'framingSystem',
                              v
                            )
                          }
                        />
                      </Field>
                    )}

                    {/* FRAME FINISH */}

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
                        {![
                          'Clear Anodized',
                          'Dark Bronze Anodized',
                          'Black Anodized',
                          'Black Painted',
                          'White Painted',
                          'Mill Finish',
                          'Custom / Other',
                        ].includes(project.finish) && (
                          <option value={project.finish}>
                            {project.finish}
                            {' '}(existing)
                          </option>
                        )}

                        {[
                          'Clear Anodized',
                          'Dark Bronze Anodized',
                          'Black Anodized', 
                          'Black Painted',
                          'White Painted',
                          'Mill Finish',
                          'Custom / Other',
                        ].map(x => (
                          <option
                            key={x}
                            value={x}
                          >
                            {x}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  {workspace === 'storefront' && (
                    <p
                      className="panel-subtitle"
                      style={{ marginTop: 18 }}
                    >
                      <strong>
                        Storefront specifications:
                      </strong>
                      {' '}
                      The selected framing and door
                      models are saved with this project
                      and included in CSV exports.
                      Their selection does not
                      automatically change material
                      rates or confirm compatibility.
                      Different door models within
                      one project may be specified
                      in individual opening notes.
                    </p>
                  )}
                </section>

                {/* ================================= */}
                {/* OPENING SCHEDULE */}
                {/* ================================= */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 /{' '}
                        {WORKSPACE_NAMES[
                          workspace
                        ].toUpperCase()}
                        {' '}TAKEOFF
                      </span>

                      <h2>
                        Openings (
                        {project.openings.length})
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
                    Each opening has its own
                    OPEX, Gross Net Profit %,
                    glass specification,
                    and full cost worksheet.
                    Use the three-dot button beside
                    Glass Specification to select
                    Annealed or Tempered.
                  </p>

                  {project.openings.map((o, i) => {
                    const line = totals.lines.find(
                      l => l.opening.id === o.id
                    );

                    return (
                      <div
                        className="opening-card"
                        key={o.id}
                      >

                        {/* OPENING HEADER */}

                        <div className="opening-heading">
                          <div className="opening-identity">
                            <span className="opening-index">
                              {String(
                                i + 1
                              ).padStart(2, '0')}
                            </span>

                            <strong>{o.mark}</strong>

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
                                setProject(old => ({
                                  ...old,

                                  openings:
                                    old.openings.filter(
                                      x =>
                                        x.id !== o.id
                                    ),
                                }));
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
                                setOpening(o.id, {
                                  openingType:
                                    e.target.value as Opening['openingType'],
                                })
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

                          {/* GLASS SPECIFICATION */}

                          <div
                            className="field"
                            style={{
                              position: 'relative',
                            }}
                          >
                            <span className="field-label">
                              Glass Specification
                            </span>

                            <div
                              style={{
                                display: 'flex',
                                gap: 6,
                                alignItems: 'stretch',
                              }}
                            >
                              <select
                                className="input"
                                aria-label={
                                  `Glass Specification for ${o.mark}`
                                }
                                style={{
                                  minWidth: 0,
                                  flex: 1,
                                }}
                                value={o.glassSpecification}
                                onChange={e => {
                                  const spec =
                                    e.target.value;

                                  const legacy =
                                    GLASS_TYPES.find(
                                      g => g === spec
                                    );

                                  setOpening(o.id, {
                                    glassSpecification: spec,

                                    glassStyle:
                                      /Tempered/i.test(spec)
                                        ? 'Tempered'
                                        : o.glassStyle,

                                    ...(legacy
                                      ? { glassType: legacy }
                                      : {}),

                                    glassRateOverride: null,
                                  });
                                }}
                              >
                                {!GLASS_OPTIONS.includes(
                                  o.glassSpecification
                                ) && (
                                  <option
                                    value={
                                      o.glassSpecification
                                    }
                                  >
                                    {o.glassSpecification}
                                    {' '}(saved)
                                  </option>
                                )}

                                {GLASS_OPTIONS.map(
                                  spec => (
                                    <option
                                      key={spec}
                                      value={spec}
                                    >
                                      {spec}
                                    </option>
                                  )
                                )}
                              </select>

                              <button
                                type="button"
                                aria-label={
                                  `Choose glass style for ${o.mark}`
                                }
                                aria-expanded={
                                  styleMenuId === o.id
                                }
                                title="Annealed or Tempered"
                                onClick={() =>
                                  setStyleMenuId(
                                    styleMenuId === o.id
                                      ? null
                                      : o.id
                                  )
                                }
                                style={{
                                  ...smallBtn,
                                  minWidth: 45,
                                  fontWeight: 800,
                                }}
                              >
                                ...
                              </button>
                            </div>

                            <span className="field-hint">
                              Glass Style:
                              {' '}
                              <strong>
                                {o.glassStyle}
                              </strong>
                            </span>

                            {styleMenuId === o.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  zIndex: 30,
                                  top: '100%',
                                  right: 0,
                                  minWidth: 160,
                                  background: '#fff',
                                  borderRadius: 9,
                                  padding: 6,
                                  border:
                                    '1px solid #d5e2e7',
                                  boxShadow:
                                    '0 8px 26px #10243a30',
                                }}
                              >
                                {permittedStyles(
                                  o.glassSpecification
                                ).map(style => (
                                  <button
                                    key={style}
                                    type="button"
                                    onClick={() => {
                                      setOpening(o.id, {
                                        glassStyle: style,
                                        glassRateOverride:
                                          null,
                                      });

                                      setStyleMenuId(null);
                                    }}
                                    style={{
                                      width: '100%',
                                      textAlign: 'left',
                                      padding:
                                        '11px 12px',
                                      border: 0,
                                      borderRadius: 7,
                                      cursor: 'pointer',
                                      color: '#20384a',

                                      background:
                                        o.glassStyle === style
                                          ? '#e9f5f0'
                                          : '#fff',
                                    }}
                                  >
                                    {o.glassStyle === style
                                      ? '✓ '
                                      : ''}
                                    {style}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* GLAZING DIVISIONS */}

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

                          {/* GLASS PRICING */}

                          <Field label="Glass pricing method">
                            <select
                              className="input"
                              value={o.glassMode}
                              onChange={e =>
                                setOpening(o.id, {
                                  glassMode:
                                    e.target.value as Mode,
                                })
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

                          {o.glassMode === 'manual' ? (
                            <Field label="Manual glass cost $ / assembly">
                              <Num
                                value={
                                  o.manualGlassCostEach
                                }
                                onChange={v =>
                                  setOpening(o.id, {
                                    manualGlassCostEach:
                                      v,
                                  })
                                }
                              />
                            </Field>
                          ) : (
                            <RateInput
                              label="Glass Rate $/SF"
                              unit="SF"
                              selected={
                                `${o.glassSpecification} · ` +
                                o.glassStyle
                              }
                              defaultRate={catalogRate(
                                o.glassSpecification,
                                o.glassStyle,
                                p
                              )}
                              override={
                                o.glassRateOverride
                              }
                              onChange={v =>
                                setOpening(o.id, {
                                  glassRateOverride:
                                    v,
                                })
                              }
                            />
                          )}

                          {/* HARDWARE PRICING */}

                          <Field label="Hardware pricing method">
                            <select
                              className="input"
                              value={o.hardwareMode}
                              onChange={e =>
                                setOpening(o.id, {
                                  hardwareMode:
                                    e.target.value as Mode,
                                })
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

                          {o.hardwareMode === 'manual' ? (
                            <Field label="Manual hardware cost $ / assembly">
                              <Num
                                value={
                                  o.manualHardwareCostEach
                                }
                                onChange={v =>
                                  setOpening(o.id, {
                                    manualHardwareCostEach:
                                      v,
                                  })
                                }
                              />
                            </Field>
                          ) : (
                            <>
                              <RateInput
                                label="Framing Rate $/LF"
                                unit="LF"
                                selected={
                                  project.framingSystem ||
                                  'Framing system not selected'
                                }
                                defaultRate={
                                  p.framingRatePerLF
                                }
                                override={
                                  o.frameRateOverride
                                }
                                onChange={v =>
                                  setOpening(o.id, {
                                    frameRateOverride:
                                      v,
                                  })
                                }
                              />

                              <Field label="Additional hardware $ / assembly">
                                <Num
                                  value={
                                    o.hardwareAllowance
                                  }
                                  onChange={v =>
                                    setOpening(o.id, {
                                      hardwareAllowance:
                                        v,
                                    })
                                  }
                                />
                              </Field>
                            </>
                          )}

                          {/* OPEX */}

                          <Field label="OPEX / installation labor $ per assembly">
                            <Num
                              value={
                                o.opexPerAssembly
                              }
                              onChange={v =>
                                setOpening(o.id, {
                                  opexPerAssembly:
                                    v,
                                })
                              }
                            />
                          </Field>

                          {/* GROSS PROFIT */}

                          <Field
                            label="TARGET (GROSS) NET PROFIT %"
                            hint="Enter your percentage for this opening (below 100)."
                          >
                            <MarginInput
                              value={
                                o.targetGrossNetPct
                              }
                              onChange={v =>
                                setOpening(o.id, {
                                  targetGrossNetPct:
                                    v,
                                })
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
                                ? `${n4(
                                    line.glassSF
                                  )} SF`
                                : '—'}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Frame length
                            </span>

                            <strong>
                              {line
                                ? `${n4(
                                    line.frameLF
                                  )} LF`
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

                        {/* COMPUTATION */}

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
                  })}

                  <button
                    className="add-bottom"
                    onClick={addOpening}
                  >
                    + Add Another Opening
                  </button>
                </section>

                {/* NOTES */}

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / NOTES
                      </span>

                      <h2>
                        Scope &amp; Exclusions
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

              {/* ================================= */}
              {/* LIVE WORKSHEET */}
              {/* ================================= */}

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

                  {/* OPENING SELECTOR */}

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

                  {/* STOREFRONT SPECIFICATIONS */}

                  {workspace === 'storefront' &&
                    (
                      project.framingSystem ||
                      project.storefrontDoorModel
                    ) && (
                      <div
                        style={{
                          color: '#dae6f0',
                          fontSize: 11,
                          padding:
                            '0 14px 8px',
                          lineHeight: 1.65,
                        }}
                      >
                        {project.framingSystem && (
                          <div>
                            <strong>
                              Framing:
                            </strong>
                            {' '}
                            {project.framingSystem}
                          </div>
                        )}

                        {project.storefrontDoorModel && (
                          <div>
                            <strong>
                              Door model:
                            </strong>
                            {' '}
                            {project.storefrontDoorModel}
                          </div>
                        )}
                      </div>
                    )}

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

                  {/* QUANTITIES */}

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
                      {/* GROSS PROFIT */}

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
                          less than 100.
                        </small>
                      </div>

                      {/* COST BREAKDOWN */}

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
                        ).map(([label, v]) => (
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
                        ))}

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

                      {/* COMPUTATION */}

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

                {/* PROJECT TOTALS */}

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

          {/* ===================================== */}
          {/* PRICING & RATES */}
          {/* ===================================== */}

          {tab === 'pricing' && (
            <div className="pricing-layout">
              <div className="pricing-main">

                {/* PRICING NAVIGATION */}

                <section
                  className="panel"
                  style={{
                    paddingBottom: 18,
                  }}
                >
                  <span className="section-label">
                    PRICING &amp; RATES DIRECTORY
                  </span>

                  <h2
                    style={{
                      marginBottom: 13,
                    }}
                  >
                    Manage {WORKSPACE_NAMES[workspace]} Rates
                  </h2>

                  <p className="panel-subtitle">
                    Pricing is saved with the current
                    {` ${WORKSPACE_NAMES[workspace]} `}
                    estimate. Other workspaces
                    retain their own rates.
                    Selecting a framing or door model
                    does not automatically change
                    these rates.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    {(
                      [
                        ['glass', 'Glass Rates'],
                        [
                          'framing',
                          'Framing & Door Packages',
                        ],
                        [
                          'settings',
                          'Worksheet Settings',
                        ],
                      ] as [
                        PricingView,
                        string
                      ][]
                    ).map(
                      ([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setPricingView(key)
                          }
                          aria-pressed={
                            pricingView === key
                          }
                          className={
                            pricingView === key
                              ? 'btn btn-dark'
                              : 'btn btn-outline'
                          }
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>
                </section>

                {/* ================================= */}
                {/* GLASS RATES */}
                {/* ================================= */}

                {pricingView === 'glass' && (
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-label">
                          01 / GLASS RATE CATALOG
                        </span>

                        <h2>
                          Glass Rates ($/SF)
                        </h2>
                      </div>
                    </div>

                    <p className="panel-subtitle">
                      All {GLASS_OPTIONS.length} glass
                      specifications, organized in
                      collapsible categories.
                      Enter separate Annealed or
                      Tempered rates as applicable.
                      Blank means not priced.
                      Existing rates are retained.
                    </p>

                    {/* SEARCH AND FILTER */}

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        alignItems: 'end',
                        marginBottom: 15,
                      }}
                    >
                      <label
                        className="field"
                        style={{
                          flex: '1 1 230px',
                          minWidth: 180,
                        }}
                      >
                        <span className="field-label">
                          Find glass specification
                        </span>

                        <input
                          className="input"
                          type="search"
                          placeholder="Search clear, laminated, satin, low iron..."
                          value={glassSearch}
                          onChange={e =>
                            setGlassSearch(
                              e.target.value
                            )
                          }
                        />
                      </label>

                      <label
                        className="field"
                        style={{
                          flex: '0 1 180px',
                        }}
                      >
                        <span className="field-label">
                          Show
                        </span>

                        <select
                          className="input"
                          value={rateFilter}
                          onChange={e =>
                            setRateFilter(
                              e.target.value as RateFilter
                            )
                          }
                        >
                          <option value="all">
                            All types
                          </option>

                          <option value="priced">
                            With a rate
                          </option>

                          <option value="unpriced">
                            Not fully priced
                          </option>
                        </select>
                      </label>

                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setGlassSearch('');
                          setRateFilter('all');

                          setExpandedGroups(
                            [...GLASS_GROUP_NAMES]
                          );
                        }}
                      >
                        Expand all
                      </button>

                      <button
                        type="button"
                        className="btn btn-quiet"
                        onClick={() => {
                          setGlassSearch('');
                          setRateFilter('all');
                          setExpandedGroups([]);
                        }}
                      >
                        Collapse all
                      </button>
                    </div>

                    {/* GLASS GROUPS */}

                    {GLASS_GROUPS.map(group => {
                      const visible = group.specs.filter(
                        spec => {
                          if (
                            !spec
                              .toLowerCase()
                              .includes(
                                glassSearch
                                  .trim()
                                  .toLowerCase()
                              )
                          ) {
                            return false;
                          }

                          const annealed = catalogRate(
                            spec,
                            'Annealed',
                            p
                          );

                          const tempered = catalogRate(
                            spec,
                            'Tempered',
                            p
                          );

                          const hasAny =
                            annealed !== null ||
                            tempered !== null;

                          const fullyPriced =
                            permittedStyles(spec).every(
                              style =>
                                catalogRate(
                                  spec,
                                  style,
                                  p
                                ) !== null
                            );

                          return rateFilter === 'priced'
                            ? hasAny
                            : rateFilter === 'unpriced'
                              ? !fullyPriced
                              : true;
                        }
                      );

                      if (!visible.length) {
                        return null;
                      }

                      const expanded =
                        glassSearch.trim().length > 0 ||
                        rateFilter !== 'all' ||
                        expandedGroups.includes(
                          group.name
                        );

                      const priced = group.specs.filter(
                        spec =>
                          catalogRate(
                            spec,
                            'Annealed',
                            p
                          ) !== null ||
                          catalogRate(
                            spec,
                            'Tempered',
                            p
                          ) !== null
                      ).length;

                      return (
                        <div
                          key={group.name}
                          style={{
                            border:
                              '1px solid #dce6ea',
                            borderRadius: 10,
                            marginBottom: 10,
                            overflow: 'hidden',
                            background: '#fff',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              toggleGroup(
                                group.name
                              )
                            }
                            style={{
                              width: '100%',
                              padding: '14px 15px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent:
                                'space-between',
                              gap: 10,
                              border: 0,
                              background: '#f5f9fa',
                              color: '#142c43',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 750,
                                fontSize: 13,
                              }}
                            >
                              {expanded
                                ? '▾'
                                : '▸'}
                              {'  '}
                              {group.name}
                            </span>

                            <span
                              style={{
                                fontSize: 11,
                                color: '#687f91',
                              }}
                            >
                              {priced}/{group.specs.length}
                              {' '}types priced
                            </span>
                          </button>

                          {expanded && (
                            <div
                              style={{
                                padding:
                                  '6px 12px 12px',
                              }}
                            >
                              {/* COLUMN HEADERS */}

                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns:
                                    'minmax(140px,1fr) 104px 104px',
                                  gap: 10,
                                  padding: '10px 0',
                                  color: '#5b7185',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  borderBottom:
                                    '1px solid #e1e9ee',
                                }}
                              >
                                <span>
                                  Glass specification
                                </span>

                                <span>
                                  Annealed $/SF
                                </span>

                                <span>
                                  Tempered $/SF
                                </span>
                              </div>

                              {/* GLASS RATE ROWS */}

                              {visible.map(spec => (
                                <div
                                  key={spec}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                      'minmax(140px,1fr) 104px 104px',
                                    gap: 10,
                                    padding: '8px 0',
                                    alignItems: 'center',
                                    borderBottom:
                                      '1px solid #edf1f3',
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      overflowWrap:
                                        'anywhere',
                                      color: '#223c51',
                                    }}
                                  >
                                    {spec}
                                  </span>

                                  {(
                                    [
                                      'Annealed',
                                      'Tempered',
                                    ] as GlassStyle[]
                                  ).map(style => {
                                    const rate =
                                      catalogRate(
                                        spec,
                                        style,
                                        p
                                      );

                                    const incompatible =
                                      style === 'Annealed' &&
                                      /Tempered/i.test(spec);

                                    return (
                                      <input
                                        key={style}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        aria-label={
                                          `${spec} ${style} rate per square foot`
                                        }
                                        className="input number-input"
                                        disabled={
                                          incompatible
                                        }
                                        style={{
                                          width: '100%',
                                          minWidth: 0,
                                          padding:
                                            '8px 7px',
                                          fontSize: 12,
                                          background:
                                            incompatible
                                              ? '#f1f4f5'
                                              : '#fff',
                                        }}
                                        title={
                                          incompatible
                                            ? 'This specification is explicitly labeled Tempered.'
                                            : 'Blank = not priced'
                                        }
                                        placeholder={
                                          incompatible
                                            ? 'N/A'
                                            : '—'
                                        }
                                        value={
                                          incompatible
                                            ? ''
                                            : rate ?? ''
                                        }
                                        onChange={e =>
                                          setCatalogRate(
                                            spec,
                                            style,

                                            e.target.value === ''
                                              ? null
                                              : Number(
                                                  e.target.value
                                                )
                                          )
                                        }
                                      />
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <p
                      className="panel-subtitle"
                      style={{
                        marginTop: 12,
                      }}
                    >
                      Rates are saved with the
                      current estimate when you click
                      Save Changes. Blank rates are
                      not treated as $0.00.
                      Custom rates can also be entered
                      for individual openings.
                    </p>
                  </section>
                )}

                {/* ================================= */}
                {/* FRAMING AND DOOR PACKAGES */}
                {/* ================================= */}

                {pricingView === 'framing' && (
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-label">
                          02 / FRAMING &amp; DOOR PACKAGES
                        </span>

                        <h2>
                          Framing and Hardware Rates
                        </h2>
                      </div>
                    </div>

                    <p className="panel-subtitle">
                      These rates apply to the
                      current {WORKSPACE_NAMES[workspace]}
                      {' '}draft independently of the
                      Glass Rates catalog.
                      Selecting a Storefront framing
                      or door model does not
                      automatically change these costs.
                    </p>

                    <div className="form-grid">
                      <Field label="Default aluminum framing $/LF">
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

                    <div
                      className="formula-panel"
                      style={{
                        marginTop: 20,
                      }}
                    >
                      <strong>
                        Calculated hardware cost
                      </strong>

                      <code>
                        Framing LF × Framing Rate +
                        Door Package + Accessories
                      </code>

                      <p>
                        Opening-specific framing rates
                        and accessories can still be
                        overridden under the active
                        estimating workspace.
                      </p>
                    </div>
                  </section>
                )}

                {/* ================================= */}
                {/* WORKSHEET SETTINGS */}
                {/* ================================= */}

                {pricingView === 'settings' && (
                  <>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">
                            03 / WORKSHEET SETTINGS
                          </span>

                          <h2>
                            Fees, Tax, Discounts &amp; Risk
                          </h2>
                        </div>
                      </div>

                      <div className="form-grid">
                        <Field
                          label="Fixed hardware fee $ / opening mark"
                          hint="Added once per mark; default $15."
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
                            value={
                              p.riskPct
                            }
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

                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <span className="section-label">
                            04 / PER-OPENING SETTINGS
                          </span>

                          <h2>
                            OPEX &amp; Profit Targets
                          </h2>
                        </div>
                      </div>

                      <p className="panel-subtitle">
                        Set OPEX and (gross) Net Profit %
                        independently for each opening
                        in the active workspace.
                        There is no global profit target.
                      </p>

                      <div className="formula-panel">
                        <strong>
                          Per-opening calculation
                        </strong>

                        <code>
                          Price = Total Cost ÷
                          (1 − Gross Net Profit % / 100)
                        </code>

                        <p>
                          Final Price = Price ×
                          (1 + CC Surcharge % / 100).
                        </p>
                      </div>

                      <button
                        className="btn btn-dark"
                        onClick={() =>
                          goWorkspace(workspace)
                        }
                      >
                        ← {WORKSPACE_NAMES[workspace]}
                      </button>
                    </section>
                  </>
                )}
              </div>

              {/* LIVE PROJECT TOTALS */}

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
                          : 'Set all rates and margins'}
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
                          : 'Set all rates and margins'}
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
                          : 'Set all rates and margins'}
                      </strong>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* ===================================== */}
          {/* SAVED ESTIMATES */}
          {/* ===================================== */}

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
                Saved projects from all four
                workspaces appear here.
                Older estimates are filed under
                Office Fit-Out.
                Data is browser-local, not yet shared
                across employees or computers.
              </p>

              <label
                className="field"
                style={{
                  maxWidth: 280,
                  marginBottom: 14,
                }}
              >
                <span className="field-label">
                  Workspace category
                </span>

                <select
                  className="input"
                  value={savedFilter}
                  onChange={e =>
                    setSavedFilter(
                      e.target.value as
                        Workspace | 'all'
                    )
                  }
                >
                  <option value="all">
                    All workspaces
                  </option>

                  {WORKSPACES.map(w => (
                    <option
                      key={w}
                      value={w}
                    >
                      {WORKSPACE_NAMES[w]}
                    </option>
                  ))}
                </select>
              </label>

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
                  {matches.map(item => {
                    const s =
                      calculate(item.project);

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
                          <span
                            className="tag"
                            style={{
                              display: 'inline-block',
                              marginBottom: 8,
                            }}
                          >
                            {WORKSPACE_NAMES[
                              item.workspace
                            ]}
                          </span>

                          <strong
                            style={{
                              display: 'block',
                            }}
                          >
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

                          {/* STOREFRONT SPECIFICATIONS */}

                          {item.workspace === 'storefront' && (
                            <p
                              style={{
                                fontSize: 11,
                                color: '#65788a',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {item.project.framingSystem &&
                                `Framing: ${item.project.framingSystem}`}

                              {item.project.storefrontDoorModel &&
                                ` · Door: ${item.project.storefrontDoorModel}`}
                            </p>
                          )}
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
                  })}
                </div>
              )}
            </section>
          )}

          {/* FOOTER */}

          <footer className="footer">
            <span>
              Aspect Glasswork · V1.7.1
            </span>

            <span>
              Four workspaces · USD ·
              Browser-local saved projects
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
