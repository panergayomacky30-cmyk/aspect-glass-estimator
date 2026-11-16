
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  calculateEstimate,
  calculateOpening,
  currency,
  decimal,
  formatOpeningType,
} from '../lib/calculations';
import {
  newOpening,
  newProject,
  normalizeProject,
} from '../lib/defaults';
import { GLASS_TYPES } from '../lib/types';
import type {
  EstimateProject,
  EstimateTotals,
  OpeningCalculation,
  PricingRules,
  StorefrontOpening,
} from '../lib/types';

// Display four decimals for quantities.
// The calculation engine keeps full precision.
const num = (n: number) => decimal(n, 4);
const percent = (n: number) => decimal(n, 2);

type Row = [
  label: string,
  formula: string,
  result: string
];

// EXPANDABLE COMPUTATION DROPDOWN
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

// COMPUTATION FOR EACH STOREFRONT OPENING
function OpeningCalculationBreakdown({
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
      `${num(line.grossSF)} SF × (1 + ${percent(
        pricing.glassWastePct
      )} ÷ 100)`,
      `${num(line.purchasableGlassSF)} SF`,
    ],
    [
      'Net framing length (LF)',
      `([2 × (${num(w)} + ${num(h)})] + ` +
        `[(${o.columns} − 1) × ${num(h)}] + ` +
        `[(${o.rows} − 1) × ${num(w)}]) ÷ 12 × ${q}`,
      `${num(line.netFrameLF)} LF`,
    ],
    [
      'Framing length with allowance',
      `${num(line.netFrameLF)} LF × (1 + ${percent(
        pricing.frameWastePct
      )} ÷ 100)`,
      `${num(line.purchasableFrameLF)} LF`,
    ],
    [
      'Glass cost',
      `${num(line.purchasableGlassSF)} SF × ` +
        `${currency(glassRate)}/SF` +
        (o.glassRateOverride !== null
          ? ' (custom rate)'
          : ''),
      currency(line.glassCost),
    ],
    [
      'Framing cost',
      `${num(line.purchasableFrameLF)} LF × ` +
        `${currency(frameRate)}/LF` +
        (o.frameRateOverride !== null
          ? ' (custom rate)'
          : ''),
      currency(line.frameCost),
    ],
    [
      'Door package',
      `${q} × ${currency(doorRate)} per assembly ` +
        `(${o.openingType})`,
      currency(line.doorPackageCost),
    ],
    [
      'Additional hardware',
      `${q} × ${currency(
        o.hardwareAllowance
      )} per assembly`,
      currency(line.hardwareAllowanceCost),
    ],
    [
      'Installation labor',
      `${q} × ${num(
        o.laborHoursPerAssembly
      )} hours × ${currency(
        pricing.laborRatePerHour
      )}/hour`,
      currency(line.laborCost),
    ],
    [
      'Estimated line cost',
      `${currency(line.glassCost)} + ` +
        `${currency(line.frameCost)} + ` +
        `${currency(line.doorPackageCost)} + ` +
        `${currency(line.hardwareAllowanceCost)} + ` +
        `${currency(line.laborCost)}`,
      currency(line.total),
    ],
  ];

  return (
    <CalculationDropdown
      title={`▸ Show computation — ${
        o.mark || 'Opening'
      }`}
      rows={rows}
      note="Opening area and simplified framing lengths are budgeting estimates, not glass cut sizes or fabrication quantities. Intermediate values are rounded for display only."
    />
  );
}

// COMPUTATION FOR THE ENTIRE PROJECT
function ProjectCalculationBreakdown({
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
      `${currency(totals.glassCost)} + ` +
        `${currency(totals.frameCost)}`,
      currency(
        totals.glassCost + totals.frameCost
      ),
    ],
    [
      'Direct project cost',
      `${currency(totals.glassCost)} glass + ` +
        `${currency(totals.frameCost)} frame + ` +
        `${currency(totals.doorPackageCost)} door + ` +
        `${currency(totals.additionalHardwareCost)} hardware + ` +
        `${currency(totals.laborCost)} labor + ` +
        `${currency(totals.freight)} freight + ` +
        `${currency(totals.equipment)} equipment + ` +
        `${currency(totals.miscellaneous)} misc. + ` +
        `${currency(totals.overhead)} overhead`,
      currency(totals.directCost),
    ],
    [
      'Contingency',
      `${currency(contingencyBase)} ` +
        `(${
          pricing.contingencyBasis === 'glass'
            ? 'glass cost'
            : 'direct project cost'
        }) × ${percent(pricing.contingencyPct)}%`,
      currency(totals.contingency),
    ],
    [
      'Total estimated cost',
      `${currency(totals.directCost)} direct cost + ` +
        `${currency(totals.contingency)} contingency`,
      currency(totals.totalCost),
    ],
    [
      'Selling-price divisor',
      `1 − (${percent(
        pricing.targetMarginPct
      )}% target margin + ` +
        `${percent(
          pricing.salesCommissionPct
        )}% commission + ` +
        `${percent(
          pricing.paymentProcessingPct
        )}% processing) ÷ 100`,
      num(denominator),
    ],
    [
      'Internal estimated selling price',
      `${currency(totals.totalCost)} ÷ ` +
        `${num(denominator)}`,
      denominator > 0
        ? currency(totals.sellingPrice)
        : 'Invalid rates',
    ],
    [
      'Sales commission',
      `${currency(totals.sellingPrice)} × ` +
        `${percent(
          pricing.salesCommissionPct
        )}%`,
      currency(totals.commissionFee),
    ],
    [
      'Payment-processing fees',
      `${currency(totals.sellingPrice)} × ` +
        `${percent(
          pricing.paymentProcessingPct
        )}%`,
      currency(totals.paymentFee),
    ],
    [
      'Projected profit',
      `${currency(totals.sellingPrice)} selling price − ` +
        `${currency(totals.totalCost)} total cost − ` +
        `${currency(totals.commissionFee)} commission − ` +
        `${currency(totals.paymentFee)} processing`,
      denominator > 0
        ? currency(totals.projectedProfit)
        : 'Invalid rates',
    ],
    [
      'Projected margin',
      `${currency(totals.projectedProfit)} ÷ ` +
        `${currency(totals.sellingPrice)} × 100`,
      denominator > 0
        ? `${percent(
            totals.projectedMarginPct
          )}%`
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

type Tab = 'estimate' | 'pricing';

const STORAGE_KEY =
  'aspect-storefront-estimator-v1';

// FILE DOWNLOAD FUNCTION
function downloadFile(
  filename: string,
  content: string,
  mime: string
) {
  const url = URL.createObjectURL(
    new Blob([content], { type: mime })
  );

  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

function safeFilename(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'estimate'
  );
}

function csvValue(value: string | number): string {
  let str = String(value);

  if (/^[\s]*[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

// REUSABLE INPUT COMPONENTS
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
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

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) =>
        onChange(e.target.value)
      }
    />
  );
}

function NumberInput({
  value,
  onChange,
  step = 0.01,
  min = 0,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
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
      onChange={(e) =>
        onChange(
          e.target.value === ''
            ? 0
            : Number(e.target.value)
        )
      }
    />
  );
}

function Stat({
  title,
  value,
  help,
  hero = false,
}: {
  title: string;
  value: string;
  help?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={`stat ${
        hero ? 'stat-hero' : ''
      }`}
    >
      <span className="stat-title">
        {title}
      </span>

      <strong className="stat-value">
        {value}
      </strong>

      {help && (
        <span className="stat-help">
          {help}
        </span>
      )}
    </div>
  );
}

// MAIN APPLICATION
export default function Home() {
  const [project, setProject] =
    useState<EstimateProject>(
      () => newProject()
    );

  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('estimate');
  const [savedAt, setSavedAt] = useState('');
  const [alertText, setAlertText] = useState('');

  const importRef =
    useRef<HTMLInputElement>(null);

  // LOAD SAVED PROJECT
  useEffect(() => {
    try {
      const existing =
        localStorage.getItem(STORAGE_KEY);

      if (existing) {
        const parsed = normalizeProject(
          JSON.parse(existing)
        );

        if (parsed) {
          setProject(parsed);
        }
      }
    } catch {
      // Browser storage may be unavailable.
    }

    setLoaded(true);
  }, []);

  // AUTOSAVE PROJECT
  useEffect(() => {
    if (!loaded) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(project)
      );

      setSavedAt(
        new Date().toLocaleTimeString(
          [],
          {
            hour: 'numeric',
            minute: '2-digit',
          }
        )
      );
    } catch {
      setSavedAt(
        'Storage unavailable — export a backup'
      );
    }
  }, [project, loaded]);

  // CALCULATE ESTIMATE
  const totals = useMemo(
    () => calculateEstimate(project),
    [project]
  );

  const valid = totals.errors.length === 0;
  const p = project.pricing;

  function updateProject<
    K extends keyof EstimateProject
  >(
    key: K,
    value: EstimateProject[K]
  ) {
    setProject((old) => ({
      ...old,
      [key]: value,
    }));
  }

  function updatePricing<
    K extends keyof PricingRules
  >(
    key: K,
    value: PricingRules[K]
  ) {
    setProject((old) => ({
      ...old,
      pricing: {
        ...old.pricing,
        [key]: value,
      },
    }));
  }

  function updateOpening(
    id: string,
    patch: Partial<StorefrontOpening>
  ) {
    setProject((old) => ({
      ...old,
      openings: old.openings.map(
        (opening) =>
          opening.id === id
            ? { ...opening, ...patch }
            : opening
      ),
    }));
  }

  function addOpening() {
    setProject((old) => {
      const marks = new Set(
        old.openings.map((x) => x.mark)
      );

      let index = old.openings.length + 1;

      while (
        marks.has(
          `SF-${String(index).padStart(2, '0')}`
        )
      ) {
        index += 1;
      }

      return {
        ...old,
        openings: [
          ...old.openings,
          newOpening(index),
        ],
      };
    });
  }

  function removeOpening(id: string) {
    if (
      !window.confirm(
        'Remove this opening from the estimate?'
      )
    ) {
      return;
    }

    setProject((old) => ({
      ...old,
      openings: old.openings.filter(
        (x) => x.id !== id
      ),
    }));
  }

  function resetProject() {
    if (
      !window.confirm(
        'Create a new estimate? Export a JSON backup first if you need to keep this project.'
      )
    ) {
      return;
    }

    setProject(newProject());
    setTab('estimate');

    setAlertText(
      'Created a fresh sample estimate. Replace the sample information and rates.'
    );
  }

  // EXPORT JSON BACKUP
  function exportJSON() {
    downloadFile(
      `${safeFilename(
        project.estimateNumber
      )}.json`,
      JSON.stringify(project, null, 2),
      'application/json'
    );

    setAlertText(
      'Project backup exported. Keep this file somewhere secure.'
    );
  }

  // EXPORT TAKEOFF CSV
  function exportCSV() {
    const header = [
      'Mark',
      'Opening type',
      'Qty',
      'Width (in)',
      'Height (in)',
      'Glass',
      'Columns',
      'Rows',
      'Gross glass SF',
      'Frame LF',
      'Glass cost',
      'Frame cost',
      'Door package',
      'Other hardware',
      'Labor cost',
      'Line cost',
    ];

    const rows = totals.lines.map(
      (l) => [
        l.opening.mark,
        formatOpeningType(
          l.opening.openingType
        ),
        l.opening.quantity,
        l.widthInches,
        l.heightInches,
        l.opening.glassType,
        l.opening.columns,
        l.opening.rows,
        l.grossSF.toFixed(3),
        l.netFrameLF.toFixed(3),
        l.glassCost.toFixed(2),
        l.frameCost.toFixed(2),
        l.doorPackageCost.toFixed(2),
        l.hardwareAllowanceCost.toFixed(2),
        l.laborCost.toFixed(2),
        l.total.toFixed(2),
      ]
    );

    const csv = [header, ...rows]
      .map((r) =>
        r.map(csvValue).join(',')
      )
      .join('\r\n');

    downloadFile(
      `${safeFilename(
        project.estimateNumber
      )}-takeoff.csv`,
      `\uFEFF${csv}`,
      'text/csv;charset=utf-8'
    );
  }

  // IMPORT PROJECT
  async function importJSON(file?: File) {
    if (!file) return;

    if (file.size > 2_000_000) {
      setAlertText(
        'The file is too large for a project backup.'
      );
      return;
    }

    try {
      const data = JSON.parse(
        await file.text()
      );

      const loadedProject =
        normalizeProject(data);

      if (!loadedProject) {
        setAlertText(
          'Invalid project backup.'
        );
        return;
      }

      if (
        !window.confirm(
          'Replace the current estimate with this imported backup?'
        )
      ) {
        return;
      }

      setProject(loadedProject);
      setTab('estimate');

      setAlertText(
        'Project backup imported successfully. Check all costs and dimensions.'
      );
    } catch {
      setAlertText(
        'Could not open the JSON file.'
      );
    } finally {
      if (importRef.current) {
        importRef.current.value = '';
      }
    }
  }

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
            Browser-based · V1.2
          </span>

          <span className="autosave">
            {loaded
              ? savedAt
                ? `Saved at ${savedAt}`
                : 'Autosaving locally'
              : 'Loading draft...'}
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
            <span>▦</span>
            Storefront estimate
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
            <span>◫</span>
            Pricing & rates
          </button>

          <div className="sidebar-spacer" />

          <div className="sidebar-help">
            <strong>
              Estimator V1.2
            </strong>

            <p>
              Estimates are stored in this
              browser, not a shared database.
              Export a backup before changing
              computers.
            </p>
          </div>

          <a
            href="https://www.aspectglasswork.com/"
            target="_blank"
            rel="noreferrer"
            className="sidebar-link"
          >
            Aspect Glasswork website ↗
          </a>
        </aside>

        {/* MAIN CONTENT */}
        <main className="main">
          <div className="page-toolbar">
            <div>
              <div className="eyebrow">
                COMMERCIAL GLAZING /
                STOREFRONTS
              </div>

              <h1>
                {tab === 'estimate'
                  ? 'Storefront Estimator'
                  : 'Pricing & Cost Rules'}
              </h1>

              <p className="page-desc">
                {tab === 'estimate'
                  ? 'Create an internal cost estimate, manage openings, and review project costs in one place.'
                  : 'Adjust your material rates, labor assumptions, risk, and profit targets.'}
              </p>
            </div>

            <div className="toolbar-actions">
              <input
                type="file"
                ref={importRef}
                accept=".json,application/json"
                hidden
                onChange={(e) =>
                  void importJSON(
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
                onClick={exportJSON}
              >
                ↓ Backup
              </button>

              <button
                className="btn btn-dark"
                onClick={resetProject}
              >
                + New estimate
              </button>
            </div>
          </div>

          {/* NOTIFICATION */}
          {alertText && (
            <div
              className="toast"
              role="status"
            >
              {alertText}

              <button
                aria-label="Dismiss message"
                onClick={() =>
                  setAlertText('')
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
                ['estimate', 'Estimate'],
                ['pricing', 'Pricing'],
              ] as [Tab, string][]
            ).map(([key, name]) => (
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
                {name}
              </button>
            ))}
          </div>

          {/* SAMPLE PRICING NOTICE */}
          <div className="sample-notice">
            <strong>
              Sample pricing only
            </strong>
            {' '}— Replace all example rates
            with verified supplier quotes and
            Aspect-approved labor assumptions
            before using any result for business
            decisions.
          </div>

          {/* VALIDATION */}
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
                {totals.errors
                  .slice(0, 10)
                  .map((e, i) => (
                    <li key={`${i}-${e}`}>
                      {e}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* STOREFRONT ESTIMATE PAGE */}
          {tab === 'estimate' && (
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
                        Project information
                      </h2>
                    </div>

                    <span className="tag">
                      Draft estimate
                    </span>
                  </div>

                  <div className="form-grid">
                    <Field label="Project name">
                      <TextInput
                        value={
                          project.projectName
                        }
                        onChange={(v) =>
                          updateProject(
                            'projectName',
                            v
                          )
                        }
                        placeholder="e.g. 573 Route 17M"
                      />
                    </Field>

                    <Field label="Estimate number">
                      <TextInput
                        value={
                          project.estimateNumber
                        }
                        onChange={(v) =>
                          updateProject(
                            'estimateNumber',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Client / contractor">
                      <TextInput
                        value={
                          project.clientName
                        }
                        onChange={(v) =>
                          updateProject(
                            'clientName',
                            v
                          )
                        }
                        placeholder="Client name"
                      />
                    </Field>

                    <Field label="Project address">
                      <TextInput
                        value={
                          project.location
                        }
                        onChange={(v) =>
                          updateProject(
                            'location',
                            v
                          )
                        }
                        placeholder="City, state"
                      />
                    </Field>

                    <Field label="Estimator">
                      <TextInput
                        value={
                          project.estimator
                        }
                        onChange={(v) =>
                          updateProject(
                            'estimator',
                            v
                          )
                        }
                        placeholder="Prepared by"
                      />
                    </Field>

                    <Field label="Estimate date">
                      <TextInput
                        value={
                          project.date
                        }
                        onChange={(v) =>
                          updateProject(
                            'date',
                            v
                          )
                        }
                        type="date"
                      />
                    </Field>

                    <Field label="Framing system">
                      <TextInput
                        value={
                          project.framingSystem
                        }
                        onChange={(v) =>
                          updateProject(
                            'framingSystem',
                            v
                          )
                        }
                        placeholder="System and series"
                      />
                    </Field>

                    <Field label="Frame finish">
                      <select
                        className="input"
                        value={project.finish}
                        onChange={(e) =>
                          updateProject(
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
                        ].map((value) => (
                          <option key={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </section>

                {/* STOREFRONT OPENINGS */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / TAKEOFF SCHEDULE
                      </span>

                      <h2>
                        Storefront openings{' '}
                        <span className="title-count">
                          {project.openings.length}
                        </span>
                      </h2>
                    </div>

                    <button
                      className="btn btn-outline"
                      onClick={addOpening}
                    >
                      + Add opening
                    </button>
                  </div>

                  <p className="panel-subtitle">
                    Enter opening dimensions in
                    inches; mixed fractions such as{' '}
                    <code>59 1/4</code> and feet
                    such as{' '}
                    <code>5' 3 1/2"</code> are
                    supported. Areas are preliminary{' '}
                    <em>opening areas</em>,
                    not glass cut sizes.
                  </p>

                  {project.openings.map(
                    (opening, index) => {
                      const line =
                        calculateOpening(
                          opening,
                          p
                        );

                      return (
                        <div
                          className="opening-card"
                          key={opening.id}
                        >
                          <div className="opening-heading">
                            <div className="opening-identity">
                              <span className="opening-index">
                                {String(
                                  index + 1
                                ).padStart(2, '0')}
                              </span>

                              <strong>
                                {opening.mark ||
                                  'Unmarked opening'}
                              </strong>

                              <span className="opening-category">
                                {formatOpeningType(
                                  opening.openingType
                                )}
                              </span>
                            </div>

                            <button
                              className="remove-btn"
                              title="Remove opening"
                              aria-label={`Remove ${opening.mark}`}
                              onClick={() =>
                                removeOpening(
                                  opening.id
                                )
                              }
                            >
                              ×
                            </button>
                          </div>

                          <div className="form-grid opening-grid">
                            <Field label="Opening mark">
                              <TextInput
                                value={opening.mark}
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { mark: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Type">
                              <select
                                className="input"
                                value={
                                  opening.openingType
                                }
                                onChange={(e) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      openingType:
                                        e.target.value as StorefrontOpening['openingType'],
                                    }
                                  )
                                }
                              >
                                <option value="fixed">
                                  Fixed glazing
                                </option>

                                <option value="single-door">
                                  Single-door entrance
                                </option>

                                <option value="double-door">
                                  Double-door entrance
                                </option>
                              </select>
                            </Field>

                            <Field label="Width (inches)">
                              <TextInput
                                value={opening.width}
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { width: v }
                                  )
                                }
                                placeholder="59 1/4"
                              />
                            </Field>

                            <Field label="Height (inches)">
                              <TextInput
                                value={opening.height}
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { height: v }
                                  )
                                }
                                placeholder="85 5/16"
                              />
                            </Field>

                            <Field label="Quantity">
                              <NumberInput
                                step={1}
                                min={1}
                                value={
                                  opening.quantity
                                }
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { quantity: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Glass specification">
                              <select
                                className="input"
                                value={
                                  opening.glassType
                                }
                                onChange={(e) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      glassType:
                                        e.target.value as StorefrontOpening['glassType'],
                                    }
                                  )
                                }
                              >
                                {GLASS_TYPES.map(
                                  (type) => (
                                    <option
                                      key={type}
                                      value={type}
                                    >
                                      {type}
                                    </option>
                                  )
                                )}
                              </select>
                            </Field>

                            <Field label="Glazing columns">
                              <NumberInput
                                step={1}
                                min={1}
                                value={
                                  opening.columns
                                }
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { columns: v }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Glazing rows">
                              <NumberInput
                                step={1}
                                min={1}
                                value={opening.rows}
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    { rows: v }
                                  )
                                }
                              />
                            </Field>

                            <Field
                              label="Custom glass $/SF"
                              hint={`Blank uses ${currency(
                                p.glassRates[
                                  opening.glassType
                                ]
                              )}/SF`}
                            >
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Use default rate"
                                value={
                                  opening.glassRateOverride ??
                                  ''
                                }
                                onChange={(e) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      glassRateOverride:
                                        e.target.value ===
                                        ''
                                          ? null
                                          : Number(
                                              e.target.value
                                            ),
                                    }
                                  )
                                }
                              />
                            </Field>

                            <Field
                              label="Custom frame $/LF"
                              hint={`Blank uses ${currency(
                                p.framingRatePerLF
                              )}/LF`}
                            >
                              <input
                                className="input"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Use default rate"
                                value={
                                  opening.frameRateOverride ??
                                  ''
                                }
                                onChange={(e) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      frameRateOverride:
                                        e.target.value ===
                                        ''
                                          ? null
                                          : Number(
                                              e.target.value
                                            ),
                                    }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Extra hardware $ / assembly">
                              <NumberInput
                                value={
                                  opening.hardwareAllowance
                                }
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      hardwareAllowance:
                                        v,
                                    }
                                  )
                                }
                              />
                            </Field>

                            <Field label="Labor hours / assembly">
                              <NumberInput
                                value={
                                  opening.laborHoursPerAssembly
                                }
                                onChange={(v) =>
                                  updateOpening(
                                    opening.id,
                                    {
                                      laborHoursPerAssembly:
                                        v,
                                    }
                                  )
                                }
                              />
                            </Field>
                          </div>

                          <Field label="Opening notes / inclusions">
                            <TextInput
                              value={opening.note}
                              onChange={(v) =>
                                updateOpening(
                                  opening.id,
                                  { note: v }
                                )
                              }
                              placeholder="Optional description or assumptions"
                            />
                          </Field>

                          {/* LINE RESULTS */}
                          <div className="opening-result">
                            <div>
                              <span>
                                Glass area
                              </span>

                              <strong>
                                {line
                                  ? `${decimal(
                                      line.grossSF
                                    )} SF`
                                  : '—'}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Framing length
                              </span>

                              <strong>
                                {line
                                  ? `${decimal(
                                      line.netFrameLF
                                    )} LF`
                                  : '—'}
                              </strong>
                            </div>

                            <div>
                              <span>
                                Estimated line cost
                              </span>

                              <strong>
                                {line
                                  ? currency(
                                      line.total
                                    )
                                  : '—'}
                              </strong>
                            </div>
                          </div>

                          {/* NEW LINE COMPUTATION DROPDOWN */}
                          {line && (
                            <OpeningCalculationBreakdown
                              line={line}
                              pricing={p}
                            />
                          )}

                          {opening.openingType !==
                            'fixed' && (
                            <div className="note-line">
                              Door package is an
                              allowance in addition to
                              the modeled glazed-opening
                              area and frame length;
                              adjust to avoid double-
                              counting supplier
                              inclusions.
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
                    + Add another storefront opening
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
                        Scope & exclusions
                      </h2>
                    </div>
                  </div>

                  <textarea
                    className="textarea"
                    rows={4}
                    value={
                      project.scopeNotes
                    }
                    onChange={(e) =>
                      updateProject(
                        'scopeNotes',
                        e.target.value
                      )
                    }
                    placeholder="Add exclusions, schedule assumptions and other project notes."
                  />
                </section>
              </div>

              {/* ESTIMATE OVERVIEW */}
              <aside className="summary-column">
                <section className="summary-card">
                  <div className="summary-header">
                    <div>
                      <span className="section-label light-label">
                        LIVE CALCULATION
                      </span>

                      <h2>
                        Estimate overview
                      </h2>
                    </div>

                    <span className="summary-indicator" />
                  </div>

                  <div className="summary-hero">
                    <span>
                      Estimated selling price
                      (internal)
                    </span>

                    <strong>
                      {valid
                        ? currency(
                            totals.sellingPrice
                          )
                        : 'Review inputs'}
                    </strong>

                    <small>
                      With{' '}
                      {decimal(
                        p.targetMarginPct,
                        1
                      )}
                      % targeted margin after
                      included costs and fees
                    </small>
                  </div>

                  <div className="summary-stats">
                    <div>
                      <span>
                        Assemblies
                      </span>

                      <strong>
                        {totals.totalAssemblies}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Gross glass area
                      </span>

                      <strong>
                        {decimal(
                          totals.totalGlassSF
                        )}{' '}
                        SF
                      </strong>
                    </div>

                    <div>
                      <span>
                        Net framing length
                      </span>

                      <strong>
                        {decimal(
                          totals.totalFrameLF
                        )}{' '}
                        LF
                      </strong>
                    </div>
                  </div>

                  <div className="summary-breakdown">
                    <div>
                      <span>Glass</span>

                      <strong>
                        {currency(
                          totals.glassCost
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Frames</span>

                      <strong>
                        {currency(
                          totals.frameCost
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Door packages & extra
                        hardware
                      </span>

                      <strong>
                        {currency(
                          totals.doorPackageCost +
                            totals.additionalHardwareCost
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Installation labor
                      </span>

                      <strong>
                        {currency(
                          totals.laborCost
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Freight, equipment,
                        misc. & overhead
                      </span>

                      <strong>
                        {currency(
                          totals.freight +
                            totals.equipment +
                            totals.miscellaneous +
                            totals.overhead
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Contingency
                      </span>

                      <strong>
                        {currency(
                          totals.contingency
                        )}
                      </strong>
                    </div>

                    <div className="summary-total">
                      <span>
                        Total estimated cost
                      </span>

                      <strong>
                        {currency(
                          totals.totalCost
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Estimated commissions &
                        processing
                      </span>

                      <strong>
                        {currency(
                          totals.commissionFee +
                            totals.paymentFee
                        )}
                      </strong>
                    </div>

                    <div className="summary-profit">
                      <span>
                        Projected profit after
                        included costs/fees
                      </span>

                      <strong>
                        {valid
                          ? currency(
                              totals.projectedProfit
                            )
                          : '—'}
                      </strong>
                    </div>
                  </div>

                  {/* NEW PROJECT COMPUTATION DROPDOWN */}
                  <ProjectCalculationBreakdown
                    totals={totals}
                    pricing={p}
                  />

                  <button
                    className="summary-button"
                    onClick={() =>
                      setTab('pricing')
                    }
                  >
                    Review pricing & rates →
                  </button>

                  <button
                    className="summary-secondary"
                    onClick={exportCSV}
                    disabled={!valid}
                  >
                    Export takeoff CSV ↗
                  </button>
                </section>

                <p className="summary-disclaimer">
                  Quantities are budgeting
                  assumptions. This is not a
                  fabrication takeoff, engineering
                  check, or verified vendor
                  quotation.
                </p>
              </aside>
            </div>
          )}

          {/* PRICING PAGE */}
          {tab === 'pricing' && (
            <div className="pricing-layout">
              <div className="pricing-main">
                {/* GLASS AND FRAMING */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        01 / MATERIAL RATES
                      </span>

                      <h2>
                        Glass & framing
                      </h2>
                    </div>

                    <span className="tag tag-orange">
                      Illustrative defaults
                    </span>
                  </div>

                  <p className="panel-subtitle">
                    These rates are placeholder
                    amounts in USD. Enter your
                    current vendor cost rates.
                    A line-item rate override
                    takes precedence over these
                    defaults.
                  </p>

                  <div className="form-grid">
                    {GLASS_TYPES.map(
                      (glass) => (
                        <Field
                          key={glass}
                          label={`${glass} — $ / SF`}
                        >
                          <NumberInput
                            value={
                              p.glassRates[glass]
                            }
                            onChange={(v) =>
                              updatePricing(
                                'glassRates',
                                {
                                  ...p.glassRates,
                                  [glass]: v,
                                }
                              )
                            }
                          />
                        </Field>
                      )
                    )}

                    <Field label="Framing cost — $ / LF">
                      <NumberInput
                        value={
                          p.framingRatePerLF
                        }
                        onChange={(v) =>
                          updatePricing(
                            'framingRatePerLF',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Labor rate — $ / hour">
                      <NumberInput
                        value={
                          p.laborRatePerHour
                        }
                        onChange={(v) =>
                          updatePricing(
                            'laborRatePerHour',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Glass material allowance %">
                      <NumberInput
                        value={
                          p.glassWastePct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'glassWastePct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Frame material allowance %">
                      <NumberInput
                        value={
                          p.frameWastePct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'frameWastePct',
                            v
                          )
                        }
                      />
                    </Field>
                  </div>
                </section>

                {/* ENTRANCE PACKAGES */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / ENTRANCE PACKAGES
                      </span>

                      <h2>
                        Door cost allowances
                      </h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Single-door package $ / assembly">
                      <NumberInput
                        value={
                          p.singleDoorPackage
                        }
                        onChange={(v) =>
                          updatePricing(
                            'singleDoorPackage',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Double-door package $ / assembly">
                      <NumberInput
                        value={
                          p.doubleDoorPackage
                        }
                        onChange={(v) =>
                          updatePricing(
                            'doubleDoorPackage',
                            v
                          )
                        }
                      />
                    </Field>
                  </div>

                  <div className="note-line">
                    These are optional cost
                    allowances for entrance leaves,
                    hardware, or supplier scope.
                    They are not certified door BOMs
                    and may overlap with other
                    quoted items.
                  </div>
                </section>

                {/* JOB COSTS */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / PROJECT EXPENSES
                      </span>

                      <h2>
                        Additional job costs
                      </h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Freight / deliveries $">
                      <NumberInput
                        value={p.freight}
                        onChange={(v) =>
                          updatePricing(
                            'freight',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Equipment / lifts $">
                      <NumberInput
                        value={p.equipment}
                        onChange={(v) =>
                          updatePricing(
                            'equipment',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Miscellaneous $">
                      <NumberInput
                        value={
                          p.miscellaneous
                        }
                        onChange={(v) =>
                          updatePricing(
                            'miscellaneous',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Allocated overhead $">
                      <NumberInput
                        value={
                          p.overheadAllowance
                        }
                        onChange={(v) =>
                          updatePricing(
                            'overheadAllowance',
                            v
                          )
                        }
                      />
                    </Field>
                  </div>
                </section>

                {/* PROFIT AND CONTINGENCY */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        04 / PROFIT POLICY
                      </span>

                      <h2>
                        Contingency & margins
                      </h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Contingency %">
                      <NumberInput
                        value={
                          p.contingencyPct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'contingencyPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Contingency based on">
                      <select
                        className="input"
                        value={
                          p.contingencyBasis
                        }
                        onChange={(e) =>
                          updatePricing(
                            'contingencyBasis',
                            e.target.value as PricingRules['contingencyBasis']
                          )
                        }
                      >
                        <option value="glass">
                          Glass material cost
                        </option>

                        <option value="direct">
                          All direct project costs
                        </option>
                      </select>
                    </Field>

                    <Field label="Target profit margin %">
                      <NumberInput
                        value={
                          p.targetMarginPct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'targetMarginPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Sales commission % of sales">
                      <NumberInput
                        value={
                          p.salesCommissionPct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'salesCommissionPct',
                            v
                          )
                        }
                      />
                    </Field>

                    <Field label="Payment-processing % of sales">
                      <NumberInput
                        value={
                          p.paymentProcessingPct
                        }
                        max={100}
                        onChange={(v) =>
                          updatePricing(
                            'paymentProcessingPct',
                            v
                          )
                        }
                      />
                    </Field>
                  </div>

                  <div className="formula-panel">
                    <strong>
                      Pricing formula
                    </strong>

                    <code>
                      Sell = Total Cost ÷ [1 −
                      (Margin% + Commission% +
                      Processing%)/100]
                    </code>

                    <p>
                      This is a target margin
                      calculation, not a markup
                      calculation. The fees are
                      treated as a percentage of
                      selling price.
                    </p>
                  </div>
                </section>
              </div>

              {/* LIVE PROFIT MODEL */}
              <div className="pricing-side">
                <section className="panel sticky-panel">
                  <span className="section-label">
                    LIVE PROFIT MODEL
                  </span>

                  <h2>
                    Pricing result
                  </h2>

                  <div className="pricing-totals">
                    <Stat
                      title="Estimated project cost"
                      value={currency(
                        totals.totalCost
                      )}
                    />

                    <Stat
                      title="Estimated selling price (internal)"
                      value={
                        valid
                          ? currency(
                              totals.sellingPrice
                            )
                          : 'Review inputs'
                      }
                      hero
                    />

                    <Stat
                      title="Projected profit"
                      value={
                        valid
                          ? currency(
                              totals.projectedProfit
                            )
                          : '—'
                      }
                    />

                    <Stat
                      title="Projected margin"
                      value={
                        valid
                          ? `${decimal(
                              totals.projectedMarginPct,
                              1
                            )}%`
                          : '—'
                      }
                    />
                  </div>

                  <button
                    className="btn btn-dark wide"
                    onClick={() =>
                      setTab('estimate')
                    }
                  >
                    ← Back to estimate
                  </button>
                </section>
              </div>
            </div>
          )}

          {/* FOOTER */}
          <footer className="footer">
            <span>
              Aspect Storefront Estimator · V1.2
            </span>

            <span>
              Browser-local draft · USD ·
              Preliminary quantities only
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
