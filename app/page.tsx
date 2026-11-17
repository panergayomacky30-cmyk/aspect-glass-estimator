
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
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

// =====================================================
// ASPECT GLASSWORK STOREFRONT ESTIMATOR V1.3
// Includes:
// 1. Storefront Estimate
// 2. Pricing & Rates
// 3. Saved Estimates
// 4. Computation Dropdowns
// 5. Browser Storage and Backup
// =====================================================

type Tab = 'estimate' | 'pricing' | 'saved';

type SavedEstimate = {
  id: string;
  createdAt: string;
  updatedAt: string;
  project: EstimateProject;
};

type FormulaRow = [string, string, string];

const DRAFT_KEY = 'aspect-storefront-estimator-v1';
const LIBRARY_KEY = 'aspect-storefront-estimator-library-v1';
const ACTIVE_KEY = 'aspect-storefront-estimator-active-v1';

const num = (value: number) => decimal(value, 4);
const pct = (value: number) => decimal(value, 2);

function makeId(): string {
  return crypto.randomUUID();
}

function cloneProject(project: EstimateProject): EstimateProject {
  return structuredClone(project);
}

function downloadFile(
  filename: string,
  content: string,
  mime: string
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(name: string) {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64) || 'estimate';
}

function csvValue(value: string | number) {
  let text = String(value);

  if (/^\s*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function readLibrary(data: unknown): SavedEstimate[] {
  if (!Array.isArray(data)) return [];

  return data.slice(0, 250).flatMap((entry): SavedEstimate[] => {
    if (!entry || typeof entry !== 'object') return [];

    const item = entry as Record<string, unknown>;
    const project = normalizeProject(item.project);

    if (!project) return [];

    return [{
      id: typeof item.id === 'string' && item.id
        ? item.id
        : makeId(),
      createdAt: typeof item.createdAt === 'string'
        ? item.createdAt
        : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string'
        ? item.updatedAt
        : new Date().toISOString(),
      project,
    }];
  });
}

// =====================================================
// REUSABLE INPUT COMPONENTS
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
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
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
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 0.01,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      className="input number-input"
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) =>
        onChange(e.target.value === '' ? 0 : Number(e.target.value))
      }
    />
  );
}

function Stat({
  title,
  value,
  hero = false,
}: {
  title: string;
  value: string;
  hero?: boolean;
}) {
  return (
    <div className={`stat ${hero ? 'stat-hero' : ''}`}>
      <span className="stat-title">{title}</span>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

// =====================================================
// COMPUTATION DROPDOWNS
// =====================================================

function CalculationDropdown({
  title,
  rows,
  note,
}: {
  title: string;
  rows: FormulaRow[];
  note: string;
}) {
  return (
    <details
      style={{
        margin: '14px 0',
        background: '#f7fbf9',
        border: '1px solid #cbded6',
        borderRadius: 10,
        color: '#20384a',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          padding: 14,
          cursor: 'pointer',
          color: '#166e56',
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        ▸ {title}
      </summary>

      <div style={{ padding: '0 15px 14px' }}>
        {rows.map(([label, formula, result], i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 15,
              padding: '12px 0',
              borderBottom: '1px solid #dce7e2',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 12 }}>{label}</strong>
              <div
                style={{
                  fontSize: 11,
                  color: '#607787',
                  marginTop: 5,
                  overflowWrap: 'anywhere',
                }}
              >
                {formula}
              </div>
            </div>

            <strong
              style={{
                color: '#117958',
                fontSize: 12,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {result}
            </strong>
          </div>
        ))}

        <p style={{ fontSize: 11, color: '#687c88' }}>
          {note}
        </p>
      </div>
    </details>
  );
}

function OpeningBreakdown({
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
    o.glassRateOverride ?? pricing.glassRates[o.glassType];

  const frameRate =
    o.frameRateOverride ?? pricing.framingRatePerLF;

  const doorRate =
    o.openingType === 'single-door'
      ? pricing.singleDoorPackage
      : o.openingType === 'double-door'
        ? pricing.doubleDoorPackage
        : 0;

  const rows: FormulaRow[] = [
    [
      'Gross glass area',
      `(${num(w)} × ${num(h)} ÷ 144) × ${q}`,
      `${num(line.grossSF)} SF`,
    ],
    [
      'Glass with allowance',
      `${num(line.grossSF)} × (1 + ${pct(pricing.glassWastePct)}%)`,
      `${num(line.purchasableGlassSF)} SF`,
    ],
    [
      'Framing length',
      `(2 × (${num(w)} + ${num(h)}) + ` +
        `(${o.columns} - 1) × ${num(h)} + ` +
        `(${o.rows} - 1) × ${num(w)}) ÷ 12 × ${q}`,
      `${num(line.netFrameLF)} LF`,
    ],
    [
      'Framing with allowance',
      `${num(line.netFrameLF)} × (1 + ${pct(pricing.frameWastePct)}%)`,
      `${num(line.purchasableFrameLF)} LF`,
    ],
    [
      'Glass cost',
      `${num(line.purchasableGlassSF)} × ${currency(glassRate)}/SF`,
      currency(line.glassCost),
    ],
    [
      'Framing cost',
      `${num(line.purchasableFrameLF)} × ${currency(frameRate)}/LF`,
      currency(line.frameCost),
    ],
    [
      'Door package',
      `${q} × ${currency(doorRate)}`,
      currency(line.doorPackageCost),
    ],
    [
      'Additional hardware',
      `${q} × ${currency(o.hardwareAllowance)}`,
      currency(line.hardwareAllowanceCost),
    ],
    [
      'Installation labor',
      `${q} × ${num(o.laborHoursPerAssembly)} × ` +
        `${currency(pricing.laborRatePerHour)}/hour`,
      currency(line.laborCost),
    ],
    [
      'Total line cost',
      'Glass + framing + doors + hardware + labor',
      currency(line.total),
    ],
  ];

  return (
    <CalculationDropdown
      title={`Show Computation — ${o.mark}`}
      rows={rows}
      note="Preliminary estimating quantities only. Glass area is based on overall opening dimensions."
    />
  );
}

function ProjectBreakdown({
  totals,
  pricing,
}: {
  totals: EstimateTotals;
  pricing: PricingRules;
}) {
  const rate =
    pricing.targetMarginPct +
    pricing.salesCommissionPct +
    pricing.paymentProcessingPct;

  const divisor = 1 - rate / 100;

  const contingencyBase =
    pricing.contingencyBasis === 'glass'
      ? totals.glassCost
      : totals.directCost;

  const rows: FormulaRow[] = [
    [
      'Gross glass area',
      'Sum of all opening glass areas',
      `${num(totals.totalGlassSF)} SF`,
    ],
    [
      'Total framing',
      'Sum of all opening frame lengths',
      `${num(totals.totalFrameLF)} LF`,
    ],
    [
      'Direct cost',
      'Glass + frames + doors + hardware + labor + expenses + overhead',
      currency(totals.directCost),
    ],
    [
      'Contingency',
      `${currency(contingencyBase)} × ${pct(pricing.contingencyPct)}%`,
      currency(totals.contingency),
    ],
    [
      'Total estimated cost',
      `${currency(totals.directCost)} + ${currency(totals.contingency)}`,
      currency(totals.totalCost),
    ],
    [
      'Selling-price divisor',
      `1 - (${pct(pricing.targetMarginPct)}% + ` +
        `${pct(pricing.salesCommissionPct)}% + ` +
        `${pct(pricing.paymentProcessingPct)}%)`,
      num(divisor),
    ],
    [
      'Estimated selling price',
      `${currency(totals.totalCost)} ÷ ${num(divisor)}`,
      divisor > 0 ? currency(totals.sellingPrice) : 'Invalid rates',
    ],
    [
      'Sales commission',
      `${currency(totals.sellingPrice)} × ` +
        `${pct(pricing.salesCommissionPct)}%`,
      currency(totals.commissionFee),
    ],
    [
      'Payment-processing fees',
      `${currency(totals.sellingPrice)} × ` +
        `${pct(pricing.paymentProcessingPct)}%`,
      currency(totals.paymentFee),
    ],
    [
      'Projected profit',
      'Selling price - cost - commission - processing',
      divisor > 0 ? currency(totals.projectedProfit) : 'Invalid rates',
    ],
    [
      'Projected margin',
      'Projected profit ÷ selling price × 100',
      `${pct(totals.projectedMarginPct)}%`,
    ],
  ];

  return (
    <CalculationDropdown
      title="Show Complete Project Computation"
      rows={rows}
      note="The calculation engine retains full precision. Values shown here are rounded for review."
    />
  );
}

// =====================================================
// SAVED ESTIMATES CARD
// =====================================================

const cardStyle: CSSProperties = {
  border: '1px solid #e1e8ed',
  borderRadius: 12,
  padding: 18,
  background: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const smallButtonStyle: CSSProperties = {
  padding: '9px 12px',
  background: '#fff',
  border: '1px solid #d7e3e5',
  borderRadius: 8,
  color: '#25445a',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

// =====================================================
// MAIN APPLICATION
// =====================================================

export default function Home() {
  const [project, setProject] = useState<EstimateProject>(
    () => newProject()
  );

  const [tab, setTab] = useState<Tab>('estimate');

  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const [notice, setNotice] = useState('');

  const [savedEstimates, setSavedEstimates] =
    useState<SavedEstimate[]>([]);

  const [activeSavedId, setActiveSavedId] =
    useState<string | null>(null);

  const [librarySearch, setLibrarySearch] = useState('');

  const importRef = useRef<HTMLInputElement>(null);
  const libraryImportRef = useRef<HTMLInputElement>(null);

  // Load current draft and saved library.
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);

      if (draft) {
        const parsed = normalizeProject(JSON.parse(draft));
        if (parsed) setProject(parsed);
      }

      const library = localStorage.getItem(LIBRARY_KEY);

      if (library) {
        const records = readLibrary(JSON.parse(library));
        setSavedEstimates(records);

        const activeId = localStorage.getItem(ACTIVE_KEY);

        if (activeId && records.some((x) => x.id === activeId)) {
          setActiveSavedId(activeId);
        }
      }
    } catch {
      setNotice('Unable to load some browser-saved information.');
    }

    setLoaded(true);
  }, []);

  // Automatically save the current working draft.
  useEffect(() => {
    if (!loaded) return;

    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(project));

      setSavedAt(
        new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      );
    } catch {
      setSavedAt('Storage unavailable');
    }
  }, [project, loaded]);

  const totals = useMemo(
    () => calculateEstimate(project),
    [project]
  );

  const valid = totals.errors.length === 0;
  const p = project.pricing;

  const activeRecord = savedEstimates.find(
    (x) => x.id === activeSavedId
  );

  const hasUnsavedChanges =
    !activeRecord ||
    JSON.stringify(activeRecord.project) !== JSON.stringify(project);

  const filteredSaved = savedEstimates
    .filter((item) => {
      const search = [
        item.project.projectName,
        item.project.estimateNumber,
        item.project.clientName,
        item.project.location,
      ].join(' ').toLowerCase();

      return search.includes(librarySearch.toLowerCase().trim());
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function persistLibrary(
    records: SavedEstimate[],
    message: string
  ): boolean {
    if (records.length > 250) {
      setNotice(
        'Your browser library has reached 250 estimates. Back up and archive older projects before adding more.'
      );
      return false;
    }

    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(records));
      setSavedEstimates(records);
      setNotice(message);
      return true;
    } catch {
      setNotice(
        'Unable to save your project library. Browser storage may be full. Export a backup.'
      );
      return false;
    }
  }

  // ===================================================
  // SAVE CURRENT ESTIMATE
  // ===================================================

  function saveCurrentEstimate() {
    if (!loaded) return;

    const previous = savedEstimates.find(
      (x) => x.id === activeSavedId
    );

    const id = previous?.id ?? makeId();
    const now = new Date().toISOString();

    const record: SavedEstimate = {
      id,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      project: cloneProject(project),
    };

    const updatedLibrary = [
      record,
      ...savedEstimates.filter((x) => x.id !== id),
    ];

    if (
      persistLibrary(
        updatedLibrary,
        previous
          ? 'Changes saved successfully.'
          : 'Estimate added to Saved Estimates.'
      )
    ) {
      setActiveSavedId(id);
      localStorage.setItem(ACTIVE_KEY, id);
    }
  }

  function confirmReplaceDraft() {
    return window.confirm(
      'Opening another project will replace your current working draft. Save your changes or export a backup first if needed. Continue?'
    );
  }

  // ===================================================
  // OPEN SAVED ESTIMATE
  // ===================================================

  function openSavedEstimate(item: SavedEstimate) {
    if (item.id === activeSavedId && !hasUnsavedChanges) {
      setTab('estimate');
      return;
    }

    if (!confirmReplaceDraft()) return;

    setProject(cloneProject(item.project));
    setActiveSavedId(item.id);
    localStorage.setItem(ACTIVE_KEY, item.id);

    setTab('estimate');
    setNotice(`Opened ${item.project.projectName}`);
  }

  // ===================================================
  // DUPLICATE SAVED ESTIMATE
  // ===================================================

  function duplicateSavedEstimate(item: SavedEstimate) {
    if (!confirmReplaceDraft()) return;

    const copied = cloneProject(item.project);

    copied.projectName = `${copied.projectName} (Copy)`;
    copied.estimateNumber = `${copied.estimateNumber}-COPY`;

    const now = new Date().toISOString();
    const id = makeId();

    const record: SavedEstimate = {
      id,
      createdAt: now,
      updatedAt: now,
      project: copied,
    };

    if (
      persistLibrary(
        [record, ...savedEstimates],
        'A separate copy was created.'
      )
    ) {
      setProject(cloneProject(copied));
      setActiveSavedId(id);
      localStorage.setItem(ACTIVE_KEY, id);
      setTab('estimate');
    }
  }

  // ===================================================
  // RENAME SAVED ESTIMATE
  // ===================================================

  function renameSavedEstimate(item: SavedEstimate) {
    const name = window.prompt(
      'Enter the new project name:',
      item.project.projectName
    );

    if (!name?.trim()) return;

    const updated: SavedEstimate = {
      ...item,
      updatedAt: new Date().toISOString(),
      project: {
        ...item.project,
        projectName: name.trim(),
      },
    };

    const next = savedEstimates.map((x) =>
      x.id === item.id ? updated : x
    );

    if (persistLibrary(next, 'Project renamed.')) {
      if (activeSavedId === item.id) {
        setProject((current) => ({
          ...current,
          projectName: name.trim(),
        }));
      }
    }
  }

  // ===================================================
  // DELETE SAVED ESTIMATE
  // ===================================================

  function deleteSavedEstimate(item: SavedEstimate) {
    const confirmed = window.confirm(
      `Delete "${item.project.projectName}" from Saved Estimates? This cannot be undone without a backup.`
    );

    if (!confirmed) return;

    const next = savedEstimates.filter(
      (x) => x.id !== item.id
    );

    if (persistLibrary(next, 'Saved estimate deleted.')) {
      if (activeSavedId === item.id) {
        setActiveSavedId(null);
        localStorage.removeItem(ACTIVE_KEY);
      }
    }
  }

  // ===================================================
  // BACK UP ALL SAVED ESTIMATES
  // ===================================================

  function backupLibrary() {
    const backup = {
      format: 'aspect-estimator-library',
      version: 1,
      exportedAt: new Date().toISOString(),
      estimates: savedEstimates,
    };

    downloadFile(
      'aspect-estimates-library-backup.json',
      JSON.stringify(backup, null, 2),
      'application/json'
    );

    setNotice('Saved Estimates library backup downloaded.');
  }

  // ===================================================
  // RESTORE SAVED ESTIMATES
  // ===================================================

  async function restoreLibrary(file?: File) {
    if (!file) return;

    try {
      if (file.size > 5_000_000) {
        throw new Error('Backup too large');
      }

      const data: unknown = JSON.parse(await file.text());

      if (!data || typeof data !== 'object') {
        throw new Error('Invalid backup');
      }

      const backup = data as Record<string, unknown>;

      if (
        backup.format !== 'aspect-estimator-library' ||
        !Array.isArray(backup.estimates) ||
        backup.estimates.length > 250
      ) {
        throw new Error('Invalid library format');
      }

      const imported = readLibrary(backup.estimates).map(
        (item) => ({
          ...item,
          id: makeId(),
        })
      );

      if (imported.length !== backup.estimates.length) {
        throw new Error('Invalid project records');
      }

      if (
        !window.confirm(
          `Import ${imported.length} saved estimates? They will be added to your existing projects.`
        )
      ) {
        return;
      }

      persistLibrary(
        [...imported, ...savedEstimates],
        `${imported.length} estimates imported.`
      );

      setTab('saved');
    } catch {
      setNotice(
        'Could not restore the library. Choose a valid library backup.'
      );
    } finally {
      if (libraryImportRef.current) {
        libraryImportRef.current.value = '';
      }
    }
  }

  // ===================================================
  // ESTIMATOR UPDATE FUNCTIONS
  // ===================================================

  function updateProject<K extends keyof EstimateProject>(
    key: K,
    value: EstimateProject[K]
  ) {
    setProject((old) => ({ ...old, [key]: value }));
  }

  function updatePricing<K extends keyof PricingRules>(
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
      openings: old.openings.map((opening) =>
        opening.id === id
          ? { ...opening, ...patch }
          : opening
      ),
    }));
  }

  function addOpening() {
    setProject((old) => {
      const marks = new Set(old.openings.map((x) => x.mark));
      let index = old.openings.length + 1;

      while (
        marks.has(`SF-${String(index).padStart(2, '0')}`)
      ) {
        index++;
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
    if (!window.confirm('Remove this opening?')) return;

    setProject((old) => ({
      ...old,
      openings: old.openings.filter((x) => x.id !== id),
    }));
  }

  // ===================================================
  // NEW PROJECT
  // ===================================================

  function newEstimate() {
    if (
      !window.confirm(
        'Start a new estimate? Save your current project first if needed.'
      )
    ) {
      return;
    }

    setProject(newProject());
    setActiveSavedId(null);
    localStorage.removeItem(ACTIVE_KEY);
    setTab('estimate');

    setNotice(
      'New draft created. Click Save Estimate to add it to your library.'
    );
  }

  // ===================================================
  // EXPORT CURRENT PROJECT
  // ===================================================

  function backupDraft() {
    downloadFile(
      `${safeFilename(project.estimateNumber)}.json`,
      JSON.stringify(project, null, 2),
      'application/json'
    );

    setNotice('Current estimate backup downloaded.');
  }

  function exportCSV() {
    const header = [
      'Mark', 'Type', 'Quantity',
      'Width (in)', 'Height (in)',
      'Glass Type', 'Columns', 'Rows',
      'Glass SF', 'Frame LF',
      'Glass Cost', 'Frame Cost',
      'Door Cost', 'Hardware Cost',
      'Labor Cost', 'Total Cost',
    ];

    const rows = totals.lines.map((l) => [
      l.opening.mark,
      formatOpeningType(l.opening.openingType),
      l.opening.quantity,
      l.widthInches,
      l.heightInches,
      l.opening.glassType,
      l.opening.columns,
      l.opening.rows,
      l.grossSF.toFixed(4),
      l.netFrameLF.toFixed(4),
      l.glassCost.toFixed(2),
      l.frameCost.toFixed(2),
      l.doorPackageCost.toFixed(2),
      l.hardwareAllowanceCost.toFixed(2),
      l.laborCost.toFixed(2),
      l.total.toFixed(2),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvValue).join(','))
      .join('\r\n');

    downloadFile(
      `${safeFilename(project.estimateNumber)}-takeoff.csv`,
      '\uFEFF' + csv,
      'text/csv;charset=utf-8'
    );
  }

  async function importDraft(file?: File) {
    if (!file) return;

    try {
      if (file.size > 2_000_000) {
        throw new Error('File too large');
      }

      const parsed = normalizeProject(
        JSON.parse(await file.text())
      );

      if (!parsed) {
        throw new Error('Invalid estimate');
      }

      if (!confirmReplaceDraft()) return;

      setProject(parsed);
      setActiveSavedId(null);
      localStorage.removeItem(ACTIVE_KEY);
      setTab('estimate');

      setNotice(
        'Estimate imported. Click Save Estimate to store it in the library.'
      );
    } catch {
      setNotice('Unable to import the estimate JSON.');
    } finally {
      if (importRef.current) {
        importRef.current.value = '';
      }
    }
  }

  // ===================================================
  // WEBSITE LAYOUT
  // ===================================================

  return (
    <div className="app-root">
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
            Browser-based · V1.3
          </span>

          <span className="autosave">
            {loaded ? `Draft saved at ${savedAt}` : 'Loading...'}
          </span>
        </div>
      </header>

      <div className="shell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <p className="sidebar-label">WORKSPACE</p>

          <button
            className={`navitem ${tab === 'estimate' ? 'active' : ''}`}
            onClick={() => setTab('estimate')}
          >
            <span>▦</span> Storefront Estimate
          </button>

          <button
            className={`navitem ${tab === 'pricing' ? 'active' : ''}`}
            onClick={() => setTab('pricing')}
          >
            <span>◫</span> Pricing & Rates
          </button>

          <button
            className={`navitem ${tab === 'saved' ? 'active' : ''}`}
            onClick={() => setTab('saved')}
          >
            <span>▤</span> Saved Estimates ({savedEstimates.length})
          </button>

          <div className="sidebar-spacer" />

          <div className="sidebar-help">
            <strong>Estimator V1.3</strong>
            <p>
              Save individual project estimates in your
              browser. Use Backup All regularly to protect
              your project records.
            </p>
          </div>
        </aside>

        <main className="main">
          {/* PAGE HEADER */}
          <div className="page-toolbar">
            <div>
              <div className="eyebrow">
                COMMERCIAL GLAZING / STOREFRONTS
              </div>

              <h1>
                {tab === 'estimate'
                  ? 'Storefront Estimator'
                  : tab === 'pricing'
                    ? 'Pricing & Cost Rules'
                    : 'Saved Estimates'}
              </h1>

              <p className="page-desc">
                {tab === 'estimate'
                  ? 'Create and save internal storefront estimates.'
                  : tab === 'pricing'
                    ? 'Manage material rates, labor, expenses, and margins.'
                    : 'Find and manage your previously saved project estimates.'}
              </p>
            </div>

            <div className="toolbar-actions">
              <input
                hidden
                type="file"
                accept=".json,application/json"
                ref={importRef}
                onChange={(e) =>
                  void importDraft(e.target.files?.[0])
                }
              />

              <button
                className="btn btn-quiet"
                onClick={() => importRef.current?.click()}
              >
                ↑ Import
              </button>

              <button
                className="btn btn-quiet"
                onClick={backupDraft}
              >
                ↓ Backup Draft
              </button>

              <button
                className="btn btn-outline"
                onClick={saveCurrentEstimate}
                disabled={!loaded}
              >
                {activeSavedId ? '✓ Save Changes' : '+ Save Estimate'}
              </button>

              <button
                className="btn btn-dark"
                onClick={newEstimate}
              >
                + New Estimate
              </button>
            </div>
          </div>

          {notice && (
            <div className="toast" role="status">
              {notice}
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}

          {/* MOBILE NAVIGATION */}
          <div className="nav-mobile">
            {([
              ['estimate', 'Estimate'],
              ['pricing', 'Pricing'],
              ['saved', 'Saved Estimates'],
            ] as [Tab, string][]).map(([key, name]) => (
              <button
                key={key}
                className={tab === key ? 'selected' : ''}
                onClick={() => setTab(key)}
              >
                {name}
              </button>
            ))}
          </div>

          {tab !== 'saved' && (
            <>
              <div className="sample-notice">
                <strong>Sample pricing only</strong> —
                Replace all example rates with verified
                supplier costs and approved labor assumptions.
              </div>

              <p style={{ fontSize: 11, color: '#62788a' }}>
                {activeSavedId
                  ? hasUnsavedChanges
                    ? '● This estimate has unsaved changes. Click Save Changes.'
                    : '✓ This estimate matches your saved copy.'
                  : 'This working draft is not yet in Saved Estimates.'}
              </p>
            </>
          )}

          {tab !== 'saved' && totals.errors.length > 0 && (
            <div className="validation" role="alert">
              <strong>
                Review estimate inputs ({totals.errors.length})
              </strong>

              <ul>
                {totals.errors.slice(0, 10).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ========================================= */}
          {/* STOREFRONT ESTIMATE */}
          {/* ========================================= */}

          {tab === 'estimate' && (
            <div className="workspace-columns">
              <div className="content-column">

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        01 / PROJECT DETAILS
                      </span>
                      <h2>Project Information</h2>
                    </div>
                    <span className="tag">Draft Estimate</span>
                  </div>

                  <div className="form-grid">
                    <Field label="Project Name">
                      <TextInput
                        value={project.projectName}
                        onChange={(v) =>
                          updateProject('projectName', v)
                        }
                      />
                    </Field>

                    <Field label="Estimate Number">
                      <TextInput
                        value={project.estimateNumber}
                        onChange={(v) =>
                          updateProject('estimateNumber', v)
                        }
                      />
                    </Field>

                    <Field label="Client / Contractor">
                      <TextInput
                        value={project.clientName}
                        onChange={(v) =>
                          updateProject('clientName', v)
                        }
                      />
                    </Field>

                    <Field label="Project Address">
                      <TextInput
                        value={project.location}
                        onChange={(v) =>
                          updateProject('location', v)
                        }
                      />
                    </Field>

                    <Field label="Estimator">
                      <TextInput
                        value={project.estimator}
                        onChange={(v) =>
                          updateProject('estimator', v)
                        }
                      />
                    </Field>

                    <Field label="Estimate Date">
                      <TextInput
                        type="date"
                        value={project.date}
                        onChange={(v) =>
                          updateProject('date', v)
                        }
                      />
                    </Field>

                    <Field label="Framing System">
                      <TextInput
                        value={project.framingSystem}
                        onChange={(v) =>
                          updateProject('framingSystem', v)
                        }
                      />
                    </Field>

                    <Field label="Frame Finish">
                      <select
                        className="input"
                        value={project.finish}
                        onChange={(e) =>
                          updateProject('finish', e.target.value)
                        }
                      >
                        {[
                          'Dark Bronze Anodized',
                          'Clear Anodized',
                          'Black',
                          'Mill Finish',
                          'Custom / Other',
                        ].map((finish) => (
                          <option key={finish}>{finish}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </section>

                {/* OPENINGS */}
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / TAKEOFF SCHEDULE
                      </span>
                      <h2>
                        Storefront Openings{' '}
                        <span className="title-count">
                          {project.openings.length}
                        </span>
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
                    Enter width and height in inches.
                    Fractional measurements such as
                    59 1/4 are supported.
                  </p>

                  {project.openings.map((opening, index) => {
                    const line = calculateOpening(opening, p);

                    return (
                      <div className="opening-card" key={opening.id}>
                        <div className="opening-heading">
                          <div className="opening-identity">
                            <span className="opening-index">
                              {String(index + 1).padStart(2, '0')}
                            </span>

                            <strong>{opening.mark}</strong>
                            <span className="opening-category">
                              {formatOpeningType(opening.openingType)}
                            </span>
                          </div>

                          <button
                            className="remove-btn"
                            onClick={() => removeOpening(opening.id)}
                            title="Remove opening"
                          >
                            ×
                          </button>
                        </div>

                        <div className="form-grid opening-grid">
                          <Field label="Opening Mark">
                            <TextInput
                              value={opening.mark}
                              onChange={(v) =>
                                updateOpening(opening.id, { mark: v })
                              }
                            />
                          </Field>

                          <Field label="Opening Type">
                            <select
                              className="input"
                              value={opening.openingType}
                              onChange={(e) =>
                                updateOpening(opening.id, {
                                  openingType:
                                    e.target.value as StorefrontOpening['openingType'],
                                })
                              }
                            >
                              <option value="fixed">Fixed Glazing</option>
                              <option value="single-door">Single Door</option>
                              <option value="double-door">Double Door</option>
                            </select>
                          </Field>

                          <Field label="Width (inches)">
                            <TextInput
                              value={opening.width}
                              onChange={(v) =>
                                updateOpening(opening.id, { width: v })
                              }
                            />
                          </Field>

                          <Field label="Height (inches)">
                            <TextInput
                              value={opening.height}
                              onChange={(v) =>
                                updateOpening(opening.id, { height: v })
                              }
                            />
                          </Field>

                          <Field label="Quantity">
                            <NumberInput
                              value={opening.quantity}
                              step={1}
                              min={1}
                              onChange={(v) =>
                                updateOpening(opening.id, { quantity: v })
                              }
                            />
                          </Field>

                          <Field label="Glass Specification">
                            <select
                              className="input"
                              value={opening.glassType}
                              onChange={(e) =>
                                updateOpening(opening.id, {
                                  glassType:
                                    e.target.value as StorefrontOpening['glassType'],
                                })
                              }
                            >
                              {GLASS_TYPES.map((glass) => (
                                <option key={glass} value={glass}>
                                  {glass}
                                </option>
                              ))}
                            </select>
                          </Field>

                          <Field label="Glazing Columns">
                            <NumberInput
                              value={opening.columns}
                              step={1}
                              min={1}
                              onChange={(v) =>
                                updateOpening(opening.id, { columns: v })
                              }
                            />
                          </Field>

                          <Field label="Glazing Rows">
                            <NumberInput
                              value={opening.rows}
                              step={1}
                              min={1}
                              onChange={(v) =>
                                updateOpening(opening.id, { rows: v })
                              }
                            />
                          </Field>

                          <Field
                            label="Custom Glass $/SF"
                            hint={`Blank uses ${currency(p.glassRates[opening.glassType])}/SF`}
                          >
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={opening.glassRateOverride ?? ''}
                              placeholder="Use default rate"
                              onChange={(e) =>
                                updateOpening(opening.id, {
                                  glassRateOverride:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </Field>

                          <Field
                            label="Custom Frame $/LF"
                            hint={`Blank uses ${currency(p.framingRatePerLF)}/LF`}
                          >
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={opening.frameRateOverride ?? ''}
                              placeholder="Use default rate"
                              onChange={(e) =>
                                updateOpening(opening.id, {
                                  frameRateOverride:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </Field>

                          <Field label="Hardware $ / Assembly">
                            <NumberInput
                              value={opening.hardwareAllowance}
                              onChange={(v) =>
                                updateOpening(opening.id, {
                                  hardwareAllowance: v,
                                })
                              }
                            />
                          </Field>

                          <Field label="Labor Hours / Assembly">
                            <NumberInput
                              value={opening.laborHoursPerAssembly}
                              onChange={(v) =>
                                updateOpening(opening.id, {
                                  laborHoursPerAssembly: v,
                                })
                              }
                            />
                          </Field>
                        </div>

                        <div style={{ padding: '0 18px 18px' }}>
                          <Field label="Opening Notes">
                            <TextInput
                              value={opening.note}
                              onChange={(v) =>
                                updateOpening(opening.id, { note: v })
                              }
                            />
                          </Field>
                        </div>

                        <div className="opening-result">
                          <div>
                            <span>Glass Area</span>
                            <strong>
                              {line ? `${decimal(line.grossSF)} SF` : '—'}
                            </strong>
                          </div>

                          <div>
                            <span>Framing Length</span>
                            <strong>
                              {line ? `${decimal(line.netFrameLF)} LF` : '—'}
                            </strong>
                          </div>

                          <div>
                            <span>Estimated Line Cost</span>
                            <strong>
                              {line ? currency(line.total) : '—'}
                            </strong>
                          </div>
                        </div>

                        {line && (
                          <OpeningBreakdown line={line} pricing={p} />
                        )}

                        {opening.openingType !== 'fixed' && (
                          <div className="note-line">
                            Door packages are cost allowances.
                            Verify supplier inclusions to prevent
                            double-counting hardware and framing.
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    className="add-bottom"
                    onClick={addOpening}
                  >
                    + Add Another Storefront Opening
                  </button>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / NOTES
                      </span>
                      <h2>Scope & Exclusions</h2>
                    </div>
                  </div>

                  <textarea
                    className="textarea"
                    rows={4}
                    value={project.scopeNotes}
                    onChange={(e) =>
                      updateProject('scopeNotes', e.target.value)
                    }
                  />
                </section>
              </div>

              {/* ESTIMATE SUMMARY */}
              <aside className="summary-column">
                <section className="summary-card">
                  <div className="summary-header">
                    <div>
                      <span className="section-label light-label">
                        LIVE CALCULATION
                      </span>
                      <h2>Estimate Overview</h2>
                    </div>
                    <span className="summary-indicator" />
                  </div>

                  <div className="summary-hero">
                    <span>Estimated Selling Price (Internal)</span>
                    <strong>
                      {valid
                        ? currency(totals.sellingPrice)
                        : 'Review inputs'}
                    </strong>
                    <small>
                      Target profit margin: {pct(p.targetMarginPct)}%
                    </small>
                  </div>

                  <div className="summary-stats">
                    <div>
                      <span>Assemblies</span>
                      <strong>{totals.totalAssemblies}</strong>
                    </div>
                    <div>
                      <span>Gross Glass Area</span>
                      <strong>{decimal(totals.totalGlassSF)} SF</strong>
                    </div>
                    <div>
                      <span>Framing Length</span>
                      <strong>{decimal(totals.totalFrameLF)} LF</strong>
                    </div>
                  </div>

                  <div className="summary-breakdown">
                    <div>
                      <span>Glass</span>
                      <strong>{currency(totals.glassCost)}</strong>
                    </div>
                    <div>
                      <span>Frames</span>
                      <strong>{currency(totals.frameCost)}</strong>
                    </div>
                    <div>
                      <span>Door Packages & Hardware</span>
                      <strong>
                        {currency(
                          totals.doorPackageCost +
                          totals.additionalHardwareCost
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Installation Labor</span>
                      <strong>{currency(totals.laborCost)}</strong>
                    </div>
                    <div>
                      <span>Freight, Equipment, Misc. & Overhead</span>
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
                      <span>Contingency</span>
                      <strong>{currency(totals.contingency)}</strong>
                    </div>
                    <div className="summary-total">
                      <span>Total Estimated Cost</span>
                      <strong>{currency(totals.totalCost)}</strong>
                    </div>
                    <div>
                      <span>Commission & Processing</span>
                      <strong>
                        {currency(
                          totals.commissionFee +
                          totals.paymentFee
                        )}
                      </strong>
                    </div>
                    <div className="summary-profit">
                      <span>Projected Profit</span>
                      <strong>
                        {valid
                          ? currency(totals.projectedProfit)
                          : '—'}
                      </strong>
                    </div>
                  </div>

                  <ProjectBreakdown totals={totals} pricing={p} />

                  <button
                    className="summary-button"
                    onClick={saveCurrentEstimate}
                  >
                    {activeSavedId
                      ? 'Save Estimate Changes'
                      : 'Save This Estimate'}
                  </button>

                  <button
                    className="summary-secondary"
                    onClick={exportCSV}
                    disabled={!valid}
                  >
                    Export Takeoff CSV ↗
                  </button>
                </section>

                <p className="summary-disclaimer">
                  Quantities are preliminary and require
                  verification before supplier ordering.
                </p>
              </aside>
            </div>
          )}

          {/* ========================================= */}
          {/* PRICING AND RATES */}
          {/* ========================================= */}

          {tab === 'pricing' && (
            <div className="pricing-layout">
              <div className="pricing-main">

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        01 / MATERIAL RATES
                      </span>
                      <h2>Glass & Framing</h2>
                    </div>
                    <span className="tag tag-orange">
                      Sample Defaults
                    </span>
                  </div>

                  <div className="form-grid">
                    {GLASS_TYPES.map((glass) => (
                      <Field
                        key={glass}
                        label={`${glass} — $ / SF`}
                      >
                        <NumberInput
                          value={p.glassRates[glass]}
                          onChange={(v) =>
                            updatePricing('glassRates', {
                              ...p.glassRates,
                              [glass]: v,
                            })
                          }
                        />
                      </Field>
                    ))}

                    <Field label="Framing Cost $/LF">
                      <NumberInput
                        value={p.framingRatePerLF}
                        onChange={(v) =>
                          updatePricing('framingRatePerLF', v)
                        }
                      />
                    </Field>

                    <Field label="Labor Rate $/Hour">
                      <NumberInput
                        value={p.laborRatePerHour}
                        onChange={(v) =>
                          updatePricing('laborRatePerHour', v)
                        }
                      />
                    </Field>

                    <Field label="Glass Allowance %">
                      <NumberInput
                        value={p.glassWastePct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('glassWastePct', v)
                        }
                      />
                    </Field>

                    <Field label="Frame Allowance %">
                      <NumberInput
                        value={p.frameWastePct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('frameWastePct', v)
                        }
                      />
                    </Field>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        02 / ENTRANCE PACKAGES
                      </span>
                      <h2>Door Cost Allowances</h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Single-Door Package $">
                      <NumberInput
                        value={p.singleDoorPackage}
                        onChange={(v) =>
                          updatePricing('singleDoorPackage', v)
                        }
                      />
                    </Field>

                    <Field label="Double-Door Package $">
                      <NumberInput
                        value={p.doubleDoorPackage}
                        onChange={(v) =>
                          updatePricing('doubleDoorPackage', v)
                        }
                      />
                    </Field>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        03 / PROJECT EXPENSES
                      </span>
                      <h2>Additional Job Costs</h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Freight / Deliveries $">
                      <NumberInput
                        value={p.freight}
                        onChange={(v) =>
                          updatePricing('freight', v)
                        }
                      />
                    </Field>

                    <Field label="Equipment / Lifts $">
                      <NumberInput
                        value={p.equipment}
                        onChange={(v) =>
                          updatePricing('equipment', v)
                        }
                      />
                    </Field>

                    <Field label="Miscellaneous $">
                      <NumberInput
                        value={p.miscellaneous}
                        onChange={(v) =>
                          updatePricing('miscellaneous', v)
                        }
                      />
                    </Field>

                    <Field label="Allocated Overhead $">
                      <NumberInput
                        value={p.overheadAllowance}
                        onChange={(v) =>
                          updatePricing('overheadAllowance', v)
                        }
                      />
                    </Field>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-label">
                        04 / PROFIT POLICY
                      </span>
                      <h2>Contingency & Margins</h2>
                    </div>
                  </div>

                  <div className="form-grid">
                    <Field label="Contingency %">
                      <NumberInput
                        value={p.contingencyPct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('contingencyPct', v)
                        }
                      />
                    </Field>

                    <Field label="Contingency Basis">
                      <select
                        className="input"
                        value={p.contingencyBasis}
                        onChange={(e) =>
                          updatePricing(
                            'contingencyBasis',
                            e.target.value as PricingRules['contingencyBasis']
                          )
                        }
                      >
                        <option value="glass">Glass Cost</option>
                        <option value="direct">Direct Cost</option>
                      </select>
                    </Field>

                    <Field label="Target Profit Margin %">
                      <NumberInput
                        value={p.targetMarginPct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('targetMarginPct', v)
                        }
                      />
                    </Field>

                    <Field label="Sales Commission %">
                      <NumberInput
                        value={p.salesCommissionPct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('salesCommissionPct', v)
                        }
                      />
                    </Field>

                    <Field label="Payment Processing %">
                      <NumberInput
                        value={p.paymentProcessingPct}
                        max={100}
                        onChange={(v) =>
                          updatePricing('paymentProcessingPct', v)
                        }
                      />
                    </Field>
                  </div>

                  <div className="formula-panel">
                    <strong>Pricing Formula</strong>
                    <code>
                      Selling Price = Total Cost ÷
                      [1 - (Margin% + Commission% + Processing%)/100]
                    </code>
                    <p>
                      All percentage-based fees are included
                      in the pricing calculation.
                    </p>
                  </div>
                </section>
              </div>

              <div className="pricing-side">
                <section className="panel sticky-panel">
                  <span className="section-label">
                    LIVE PROFIT MODEL
                  </span>

                  <h2>Pricing Result</h2>

                  <div className="pricing-totals">
                    <Stat
                      title="Estimated Project Cost"
                      value={currency(totals.totalCost)}
                    />

                    <Stat
                      title="Estimated Selling Price"
                      value={
                        valid
                          ? currency(totals.sellingPrice)
                          : 'Review inputs'
                      }
                      hero
                    />

                    <Stat
                      title="Projected Profit"
                      value={
                        valid
                          ? currency(totals.projectedProfit)
                          : '—'
                      }
                    />

                    <Stat
                      title="Projected Margin"
                      value={
                        valid
                          ? `${pct(totals.projectedMarginPct)}%`
                          : '—'
                      }
                    />
                  </div>

                  <button
                    className="btn btn-dark wide"
                    onClick={() => setTab('estimate')}
                  >
                    ← Back to Estimate
                  </button>
                </section>
              </div>
            </div>
          )}

          {/* ========================================= */}
          {/* NEW: SAVED ESTIMATES */}
          {/* ========================================= */}

          {tab === 'saved' && (
            <section className="panel" style={{ maxWidth: 1120 }}>
              <div className="panel-heading">
                <div>
                  <span className="section-label">
                    PROJECT LIBRARY / LOCAL BROWSER
                  </span>

                  <h2>
                    Saved Estimates{' '}
                    <span className="title-count">
                      {savedEstimates.length}
                    </span>
                  </h2>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    hidden
                    type="file"
                    accept=".json,application/json"
                    ref={libraryImportRef}
                    onChange={(e) =>
                      void restoreLibrary(e.target.files?.[0])
                    }
                  />

                  <button
                    className="btn btn-outline"
                    onClick={() => libraryImportRef.current?.click()}
                  >
                    ↑ Restore Library
                  </button>

                  <button
                    className="btn btn-outline"
                    onClick={backupLibrary}
                    disabled={!savedEstimates.length}
                  >
                    ↓ Backup All
                  </button>
                </div>
              </div>

              <p className="panel-subtitle">
                Save an estimate from the Storefront Estimate
                page to add it here. Each saved project keeps
                its own dimensions, openings, material rates,
                installation costs, and profit calculations.
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  margin: '22px 0',
                }}
              >
                <input
                  className="input"
                  type="search"
                  value={librarySearch}
                  placeholder="Search project name, client, or estimate number..."
                  style={{
                    flex: '1 1 250px',
                    maxWidth: 450,
                  }}
                  onChange={(e) =>
                    setLibrarySearch(e.target.value)
                  }
                />

                <span style={{ fontSize: 12, color: '#647789' }}>
                  {filteredSaved.length} results
                </span>

                <button
                  className="btn btn-dark"
                  onClick={() => setTab('estimate')}
                >
                  ← Current Estimate
                </button>
              </div>

              {savedEstimates.length === 0 ? (
                <div
                  style={{
                    border: '1px dashed #cddcd7',
                    borderRadius: 12,
                    padding: 40,
                    textAlign: 'center',
                  }}
                >
                  <strong>No Saved Estimates Yet</strong>

                  <p style={{ fontSize: 12, color: '#6d7d8c' }}>
                    Create your first project estimate and
                    click Save Estimate.
                  </p>

                  <button
                    className="btn btn-dark"
                    onClick={() => setTab('estimate')}
                  >
                    Go to Storefront Estimator
                  </button>
                </div>
              ) : filteredSaved.length === 0 ? (
                <p>No matching saved estimates found.</p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                    gap: 14,
                  }}
                >
                  {filteredSaved.map((item) => {
                    const summary = calculateEstimate(item.project);
                    const active = item.id === activeSavedId;

                    return (
                      <article
                        key={item.id}
                        style={{
                          ...cardStyle,
                          borderColor: active
                            ? '#67bea1'
                            : '#e1e8ed',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <div>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 15,
                              }}
                            >
                              {item.project.projectName || 'Untitled Project'}
                            </strong>

                            <span
                              style={{
                                fontSize: 11,
                                color: '#7c8a99',
                              }}
                            >
                              {item.project.estimateNumber}
                            </span>
                          </div>

                          {active && (
                            <span className="tag">Open</span>
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: '#65768b',
                            lineHeight: 1.8,
                          }}
                        >
                          <div>
                            Client: {item.project.clientName || '—'}
                          </div>
                          <div>
                            Location: {item.project.location || '—'}
                          </div>
                          <div>
                            Openings: {item.project.openings.length}
                          </div>
                          <div>
                            Assemblies: {summary.totalAssemblies}
                          </div>
                          <div>
                            Last Saved:{' '}
                            {new Date(item.updatedAt).toLocaleString()}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 12,
                            paddingTop: 12,
                            borderTop: '1px solid #e9eef1',
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: 10,
                                color: '#8a98a5',
                              }}
                            >
                              Estimated Cost
                            </span>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 16,
                              }}
                            >
                              {currency(summary.totalCost)}
                            </strong>
                          </div>

                          <div>
                            <span
                              style={{
                                fontSize: 10,
                                color: '#8a98a5',
                              }}
                            >
                              Internal Selling Price
                            </span>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 16,
                                color: '#19866a',
                              }}
                            >
                              {summary.errors.length
                                ? 'Review inputs'
                                : currency(summary.sellingPrice)}
                            </strong>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            gap: 7,
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            className="btn btn-dark"
                            onClick={() => openSavedEstimate(item)}
                          >
                            Open Estimate
                          </button>

                          <button
                            style={smallButtonStyle}
                            onClick={() => duplicateSavedEstimate(item)}
                          >
                            Duplicate
                          </button>

                          <button
                            style={smallButtonStyle}
                            onClick={() => renameSavedEstimate(item)}
                          >
                            Rename
                          </button>

                          <button
                            style={{
                              ...smallButtonStyle,
                              color: '#a83636',
                            }}
                            onClick={() => deleteSavedEstimate(item)}
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

          <footer className="footer">
            <span>Aspect Storefront Estimator · V1.3</span>
            <span>
              Browser-local project library · USD ·
              Preliminary quantities only
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
