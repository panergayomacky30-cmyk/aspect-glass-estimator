# Complete Source Code — Aspect Storefront Estimator V1

All code for the VS Code website, in the same paths as the runnable project. The ZIP already contains these as real files; copying from this document is optional.

For setup, refer to README.md.

---

## `package.json`

```json
{
  "name": "aspect-storefront-estimator",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --hostname 0.0.0.0",
    "build": "next build",
    "start": "next start --hostname 0.0.0.0",
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-strip-types --test tests/*.test.mjs"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.5.0"
  },
  "engines": { "node": ">=20.9.0" }
}
```

---

## `app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aspect | Storefront Estimator',
  description: 'Storefront glazing budget estimating workspace',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
```

---

## `app/page.tsx`

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { calculateEstimate, calculateOpening, currency, decimal, formatOpeningType } from '../lib/calculations';
import { newOpening, newProject, normalizeProject } from '../lib/defaults';
import { GLASS_TYPES } from '../lib/types';
import type { EstimateProject, PricingRules, StorefrontOpening } from '../lib/types';

type Tab = 'estimate' | 'pricing' | 'quote';
const STORAGE_KEY = 'aspect-storefront-estimator-v1';

function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'estimate';
}

function csvValue(value: string | number): string {
  let str = String(value);
  // Prevent spreadsheet programs from treating imported user text as a formula.
  if (/^[\s]*[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (value: string) => void; placeholder?: string; type?: string;
}) {
  return <input className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function NumberInput({ value, onChange, step = 0.01, min = 0, max }: {
  value: number; onChange: (value: number) => void; step?: number; min?: number; max?: number;
}) {
  return <input className="input number-input" type="number" min={min} max={max} step={step}
    value={Number.isFinite(value) ? value : ''}
    onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />;
}

function Stat({ title, value, help, hero = false }: { title: string; value: string; help?: string; hero?: boolean }) {
  return (
    <div className={`stat ${hero ? 'stat-hero' : ''}`}>
      <span className="stat-title">{title}</span>
      <strong className="stat-value">{value}</strong>
      {help && <span className="stat-help">{help}</span>}
    </div>
  );
}

export default function Home() {
  const [project, setProject] = useState<EstimateProject>(() => newProject());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('estimate');
  const [savedAt, setSavedAt] = useState('');
  const [alertText, setAlertText] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed = normalizeProject(JSON.parse(existing));
        if (parsed) setProject(parsed);
      }
    } catch {
      // Storage can be unavailable (private browser / blocked third-party storage).
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch {
      setSavedAt('Storage unavailable — export a backup');
    }
  }, [project, loaded]);

  const totals = useMemo(() => calculateEstimate(project), [project]);
  const valid = totals.errors.length === 0;
  const p = project.pricing;

  function updateProject<K extends keyof EstimateProject>(key: K, value: EstimateProject[K]) {
    setProject((old) => ({ ...old, [key]: value }));
  }
  function updatePricing<K extends keyof PricingRules>(key: K, value: PricingRules[K]) {
    setProject((old) => ({ ...old, pricing: { ...old.pricing, [key]: value } }));
  }
  function updateOpening(id: string, patch: Partial<StorefrontOpening>) {
    setProject((old) => ({ ...old,
      openings: old.openings.map((opening) => opening.id === id ? { ...opening, ...patch } : opening),
    }));
  }
  function addOpening() {
    setProject((old) => {
      const marks = new Set(old.openings.map((x) => x.mark));
      let index = old.openings.length + 1;
      while (marks.has(`SF-${String(index).padStart(2, '0')}`)) index += 1;
      return { ...old, openings: [...old.openings, newOpening(index)] };
    });
  }
  function removeOpening(id: string) {
    if (!window.confirm('Remove this opening from the estimate?')) return;
    setProject((old) => ({ ...old, openings: old.openings.filter((x) => x.id !== id) }));
  }
  function resetProject() {
    if (!window.confirm('Create a new estimate? Export a JSON backup first if you need to keep this project.')) return;
    setProject(newProject());
    setTab('estimate');
    setAlertText('Created a fresh sample estimate. Replace the sample information and rates.');
  }
  function exportJSON() {
    downloadFile(`${safeFilename(project.estimateNumber)}.json`, JSON.stringify(project, null, 2), 'application/json');
    setAlertText('Project backup exported. Keep this file somewhere secure.');
  }
  function exportCSV() {
    const header = ['Mark', 'Opening type', 'Qty', 'Width (in)', 'Height (in)', 'Glass',
      'Columns', 'Rows', 'Gross glass SF', 'Frame LF', 'Glass cost', 'Frame cost',
      'Door package', 'Other hardware', 'Labor cost', 'Line cost'];
    const rows = totals.lines.map((l) => [l.opening.mark, formatOpeningType(l.opening.openingType),
      l.opening.quantity, l.widthInches, l.heightInches, l.opening.glassType,
      l.opening.columns, l.opening.rows, l.grossSF.toFixed(3), l.netFrameLF.toFixed(3),
      l.glassCost.toFixed(2), l.frameCost.toFixed(2), l.doorPackageCost.toFixed(2),
      l.hardwareAllowanceCost.toFixed(2), l.laborCost.toFixed(2), l.total.toFixed(2)]);
    const csv = [header, ...rows].map((r) => r.map(csvValue).join(',')).join('\r\n');
    downloadFile(`${safeFilename(project.estimateNumber)}-takeoff.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
  }
  async function importJSON(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setAlertText('The file is too large for a project backup.'); return; }
    try {
      const data = JSON.parse(await file.text());
      const loadedProject = normalizeProject(data);
      if (!loadedProject) { setAlertText('Invalid project backup.'); return; }
      if (!window.confirm('Replace the current estimate with this imported backup?')) return;
      setProject(loadedProject);
      setTab('estimate');
      setAlertText('Project backup imported successfully. Check all costs and dimensions.');
    } catch {
      setAlertText('Could not open the JSON file.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  return (
    <div className="app-root">
      <header className="topbar no-print">
        <div className="brand">
          <span className="brand-mark">A<span>.</span></span>
          <span className="brand-names"><strong>ASPECT GLASSWORK</strong><small>ESTIMATING STUDIO</small></span>
        </div>
        <div className="topbar-right">
          <span className="top-pill"><span className="green-dot" /> Browser-based · V1</span>
          <span className="autosave">{loaded ? (savedAt ? `Saved at ${savedAt}` : 'Autosaving locally') : 'Loading draft...'}</span>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar no-print">
          <p className="sidebar-label">WORKSPACE</p>
          <button className={`navitem ${tab === 'estimate' ? 'active' : ''}`} onClick={() => setTab('estimate')}><span>▦</span> Storefront estimate</button>
          <button className={`navitem ${tab === 'pricing' ? 'active' : ''}`} onClick={() => setTab('pricing')}><span>◫</span> Pricing & rates</button>
          <button className={`navitem ${tab === 'quote' ? 'active' : ''}`} onClick={() => setTab('quote')}><span>▤</span> Customer quote</button>
          <div className="sidebar-spacer" />
          <div className="sidebar-help"><strong>Estimator V1</strong><p>Estimates are stored in this browser, not a shared database. Export a backup before changing computers.</p></div>
          <a href="https://www.aspectglasswork.com/" target="_blank" rel="noreferrer" className="sidebar-link">Aspect Glasswork website ↗</a>
        </aside>
        <main className="main">
          <div className="page-toolbar no-print">
            <div>
              <div className="eyebrow">COMMERCIAL GLAZING / STOREFRONTS</div>
              <h1>{tab === 'estimate' ? 'Storefront Estimator' : tab === 'pricing' ? 'Pricing & Cost Rules' : 'Customer Quotation'}</h1>
              <p className="page-desc">{tab === 'estimate' ? 'Create an estimate, manage openings, and review project costs in one place.' :
                tab === 'pricing' ? 'Adjust your material rates, labor assumptions, risk, and profit targets.' :
                'Review the customer-facing proposal before printing or saving as a PDF.'}</p>
            </div>
            <div className="toolbar-actions">
              <input type="file" ref={importRef} accept=".json,application/json" hidden onChange={(e) => void importJSON(e.target.files?.[0])} />
              <button className="btn btn-quiet" onClick={() => importRef.current?.click()}>↑ Import</button>
              <button className="btn btn-quiet" onClick={exportJSON}>↓ Backup</button>
              <button className="btn btn-dark" onClick={resetProject}>+ New estimate</button>
            </div>
          </div>
          {alertText && <div className="toast no-print" role="status">{alertText}<button aria-label="Dismiss message" onClick={() => setAlertText('')}>×</button></div>}
          <div className="nav-mobile no-print">
            {([['estimate', 'Estimate'], ['pricing', 'Pricing'], ['quote', 'Quotation']] as [Tab, string][]).map(([key, name]) => (
              <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{name}</button>
            ))}
          </div>
          <div className="sample-notice no-print"><strong>Sample pricing only</strong> — Replace all example rates with verified supplier quotes and Aspect-approved labor assumptions before using any result for business decisions.</div>
          {totals.errors.length > 0 && (
            <div className="validation no-print" role="alert"><strong>Review before quoting ({totals.errors.length})</strong>
              <ul>{totals.errors.slice(0, 10).map((e, i) => <li key={`${i}-${e}`}>{e}</li>)}</ul>
            </div>
          )}

          {tab === 'estimate' && <div className="workspace-columns">
            <div className="content-column">
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">01 / PROJECT DETAILS</span><h2>Project information</h2></div><span className="tag">Draft estimate</span></div>
                <div className="form-grid">
                  <Field label="Project name"><TextInput value={project.projectName} onChange={(v) => updateProject('projectName', v)} placeholder="e.g. 573 Route 17M" /></Field>
                  <Field label="Estimate number"><TextInput value={project.estimateNumber} onChange={(v) => updateProject('estimateNumber', v)} /></Field>
                  <Field label="Client / contractor"><TextInput value={project.clientName} onChange={(v) => updateProject('clientName', v)} placeholder="Client name" /></Field>
                  <Field label="Project address"><TextInput value={project.location} onChange={(v) => updateProject('location', v)} placeholder="City, state" /></Field>
                  <Field label="Estimator"><TextInput value={project.estimator} onChange={(v) => updateProject('estimator', v)} placeholder="Prepared by" /></Field>
                  <Field label="Estimate date"><TextInput value={project.date} onChange={(v) => updateProject('date', v)} type="date" /></Field>
                  <Field label="Framing system"><TextInput value={project.framingSystem} onChange={(v) => updateProject('framingSystem', v)} placeholder="System and series" /></Field>
                  <Field label="Frame finish"><select className="input" value={project.finish} onChange={(e) => updateProject('finish', e.target.value)}>
                    {['Dark Bronze Anodized', 'Clear Anodized', 'Black', 'Mill Finish', 'Custom / Other'].map((value) => <option key={value}>{value}</option>)}
                  </select></Field>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">02 / TAKEOFF SCHEDULE</span><h2>Storefront openings <span className="title-count">{project.openings.length}</span></h2></div><button className="btn btn-outline" onClick={addOpening}>+ Add opening</button></div>
                <p className="panel-subtitle">Enter opening dimensions in inches; mixed fractions such as <code>59 1/4</code> and feet such as <code>5' 3 1/2"</code> are supported. Areas are preliminary <em>opening areas</em>, not glass cut sizes.</p>
                {project.openings.map((opening, index) => {
                  const line = calculateOpening(opening, p);
                  return <div className="opening-card" key={opening.id}>
                    <div className="opening-heading">
                      <div className="opening-identity"><span className="opening-index">{String(index + 1).padStart(2, '0')}</span><strong>{opening.mark || 'Unmarked opening'}</strong><span className="opening-category">{formatOpeningType(opening.openingType)}</span></div>
                      <button className="remove-btn" title="Remove opening" aria-label={`Remove ${opening.mark}`} onClick={() => removeOpening(opening.id)}>×</button>
                    </div>
                    <div className="form-grid opening-grid">
                      <Field label="Opening mark"><TextInput value={opening.mark} onChange={(v) => updateOpening(opening.id, { mark: v })} /></Field>
                      <Field label="Type"><select className="input" value={opening.openingType} onChange={(e) => updateOpening(opening.id, { openingType: e.target.value as StorefrontOpening['openingType'] })}>
                        <option value="fixed">Fixed glazing</option><option value="single-door">Single-door entrance</option><option value="double-door">Double-door entrance</option>
                      </select></Field>
                      <Field label="Width (inches)"><TextInput value={opening.width} onChange={(v) => updateOpening(opening.id, { width: v })} placeholder="59 1/4" /></Field>
                      <Field label="Height (inches)"><TextInput value={opening.height} onChange={(v) => updateOpening(opening.id, { height: v })} placeholder="85 5/16" /></Field>
                      <Field label="Quantity"><NumberInput step={1} min={1} value={opening.quantity} onChange={(v) => updateOpening(opening.id, { quantity: v })} /></Field>
                      <Field label="Glass specification"><select className="input" value={opening.glassType} onChange={(e) => updateOpening(opening.id, { glassType: e.target.value as StorefrontOpening['glassType'] })}>
                        {GLASS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select></Field>
                      <Field label="Glazing columns"><NumberInput step={1} min={1} value={opening.columns} onChange={(v) => updateOpening(opening.id, { columns: v })} /></Field>
                      <Field label="Glazing rows"><NumberInput step={1} min={1} value={opening.rows} onChange={(v) => updateOpening(opening.id, { rows: v })} /></Field>
                      <Field label="Custom glass $/SF" hint={`Blank uses ${currency(p.glassRates[opening.glassType])}/SF`}><input className="input" type="number" min="0" step="0.01" placeholder="Use default rate" value={opening.glassRateOverride ?? ''}
                        onChange={(e) => updateOpening(opening.id, { glassRateOverride: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                      <Field label="Custom frame $/LF" hint={`Blank uses ${currency(p.framingRatePerLF)}/LF`}><input className="input" type="number" min="0" step="0.01" placeholder="Use default rate" value={opening.frameRateOverride ?? ''}
                        onChange={(e) => updateOpening(opening.id, { frameRateOverride: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
                      <Field label="Extra hardware $ / assembly"><NumberInput value={opening.hardwareAllowance} onChange={(v) => updateOpening(opening.id, { hardwareAllowance: v })} /></Field>
                      <Field label="Labor hours / assembly"><NumberInput value={opening.laborHoursPerAssembly} onChange={(v) => updateOpening(opening.id, { laborHoursPerAssembly: v })} /></Field>
                    </div>
                    <Field label="Opening notes / inclusions"><TextInput value={opening.note} onChange={(v) => updateOpening(opening.id, { note: v })} placeholder="Optional description or assumptions" /></Field>
                    <div className="opening-result">
                      <div><span>Glass area</span><strong>{line ? `${decimal(line.grossSF)} SF` : '—'}</strong></div>
                      <div><span>Framing length</span><strong>{line ? `${decimal(line.netFrameLF)} LF` : '—'}</strong></div>
                      <div><span>Estimated line cost</span><strong>{line ? currency(line.total) : '—'}</strong></div>
                    </div>
                    {opening.openingType !== 'fixed' && <div className="note-line">Door package is an allowance in addition to the modeled glazed-opening area and frame length; adjust to avoid double-counting supplier inclusions.</div>}
                  </div>;
                })}
                <button className="add-bottom" onClick={addOpening}>+ Add another storefront opening</button>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">03 / NOTES</span><h2>Scope & exclusions</h2></div></div>
                <textarea className="textarea" rows={4} value={project.scopeNotes} onChange={(e) => updateProject('scopeNotes', e.target.value)} placeholder="Add exclusions, schedule assumptions and other project notes." />
              </section>
            </div>
            <aside className="summary-column no-print">
              <section className="summary-card">
                <div className="summary-header"><div><span className="section-label light-label">LIVE CALCULATION</span><h2>Estimate overview</h2></div><span className="summary-indicator" /></div>
                <div className="summary-hero"><span>Suggested selling price</span><strong>{valid ? currency(totals.sellingPrice) : 'Review inputs'}</strong><small>With {decimal(p.targetMarginPct, 1)}% targeted margin after included costs and fees</small></div>
                <div className="summary-stats">
                  <div><span>Assemblies</span><strong>{totals.totalAssemblies}</strong></div>
                  <div><span>Gross glass area</span><strong>{decimal(totals.totalGlassSF)} SF</strong></div>
                  <div><span>Net framing length</span><strong>{decimal(totals.totalFrameLF)} LF</strong></div>
                </div>
                <div className="summary-breakdown">
                  <div><span>Glass</span><strong>{currency(totals.glassCost)}</strong></div>
                  <div><span>Frames</span><strong>{currency(totals.frameCost)}</strong></div>
                  <div><span>Door packages & extra hardware</span><strong>{currency(totals.doorPackageCost + totals.additionalHardwareCost)}</strong></div>
                  <div><span>Installation labor</span><strong>{currency(totals.laborCost)}</strong></div>
                  <div><span>Freight, equipment, misc. & overhead</span><strong>{currency(totals.freight + totals.equipment + totals.miscellaneous + totals.overhead)}</strong></div>
                  <div><span>Contingency</span><strong>{currency(totals.contingency)}</strong></div>
                  <div className="summary-total"><span>Total estimated cost</span><strong>{currency(totals.totalCost)}</strong></div>
                  <div><span>Estimated commissions & processing</span><strong>{currency(totals.commissionFee + totals.paymentFee)}</strong></div>
                  <div className="summary-profit"><span>Projected profit after included costs/fees</span><strong>{valid ? currency(totals.projectedProfit) : '—'}</strong></div>
                </div>
                <button className="summary-button" onClick={() => setTab('quote')} disabled={!valid}>Review customer quotation →</button>
                <button className="summary-secondary" onClick={exportCSV} disabled={!valid}>Export takeoff CSV ↗</button>
              </section>
              <p className="summary-disclaimer">Quantities are budgeting assumptions. This is not a fabrication takeoff, engineering check, or verified vendor quotation.</p>
            </aside>
          </div>}

          {tab === 'pricing' && <div className="pricing-layout">
            <div className="pricing-main">
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">01 / MATERIAL RATES</span><h2>Glass & framing</h2></div><span className="tag tag-orange">Illustrative defaults</span></div>
                <p className="panel-subtitle">These rates are placeholder amounts in USD. Enter your current vendor cost rates. A line-item rate override takes precedence over these defaults.</p>
                <div className="form-grid">
                  {GLASS_TYPES.map((glass) => <Field key={glass} label={`${glass} — $ / SF`}><NumberInput value={p.glassRates[glass]} onChange={(v) => updatePricing('glassRates', { ...p.glassRates, [glass]: v })} /></Field>)}
                  <Field label="Framing cost — $ / LF"><NumberInput value={p.framingRatePerLF} onChange={(v) => updatePricing('framingRatePerLF', v)} /></Field>
                  <Field label="Labor rate — $ / hour"><NumberInput value={p.laborRatePerHour} onChange={(v) => updatePricing('laborRatePerHour', v)} /></Field>
                  <Field label="Glass material allowance %"><NumberInput value={p.glassWastePct} max={100} onChange={(v) => updatePricing('glassWastePct', v)} /></Field>
                  <Field label="Frame material allowance %"><NumberInput value={p.frameWastePct} max={100} onChange={(v) => updatePricing('frameWastePct', v)} /></Field>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">02 / ENTRANCE PACKAGES</span><h2>Door cost allowances</h2></div></div>
                <div className="form-grid">
                  <Field label="Single-door package $ / assembly"><NumberInput value={p.singleDoorPackage} onChange={(v) => updatePricing('singleDoorPackage', v)} /></Field>
                  <Field label="Double-door package $ / assembly"><NumberInput value={p.doubleDoorPackage} onChange={(v) => updatePricing('doubleDoorPackage', v)} /></Field>
                </div>
                <div className="note-line">These are optional cost allowances for entrance leaves, hardware, or supplier scope. They are not certified door BOMs and may overlap with other quoted items.</div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">03 / PROJECT EXPENSES</span><h2>Additional job costs</h2></div></div>
                <div className="form-grid">
                  <Field label="Freight / deliveries $"><NumberInput value={p.freight} onChange={(v) => updatePricing('freight', v)} /></Field>
                  <Field label="Equipment / lifts $"><NumberInput value={p.equipment} onChange={(v) => updatePricing('equipment', v)} /></Field>
                  <Field label="Miscellaneous $"><NumberInput value={p.miscellaneous} onChange={(v) => updatePricing('miscellaneous', v)} /></Field>
                  <Field label="Allocated overhead $"><NumberInput value={p.overheadAllowance} onChange={(v) => updatePricing('overheadAllowance', v)} /></Field>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><span className="section-label">04 / PROFIT POLICY</span><h2>Contingency & margins</h2></div></div>
                <div className="form-grid">
                  <Field label="Contingency %"><NumberInput value={p.contingencyPct} max={100} onChange={(v) => updatePricing('contingencyPct', v)} /></Field>
                  <Field label="Contingency based on"><select className="input" value={p.contingencyBasis} onChange={(e) => updatePricing('contingencyBasis', e.target.value as PricingRules['contingencyBasis'])}><option value="glass">Glass material cost</option><option value="direct">All direct project costs</option></select></Field>
                  <Field label="Target profit margin %"><NumberInput value={p.targetMarginPct} max={100} onChange={(v) => updatePricing('targetMarginPct', v)} /></Field>
                  <Field label="Sales commission % of sales"><NumberInput value={p.salesCommissionPct} max={100} onChange={(v) => updatePricing('salesCommissionPct', v)} /></Field>
                  <Field label="Payment-processing % of sales"><NumberInput value={p.paymentProcessingPct} max={100} onChange={(v) => updatePricing('paymentProcessingPct', v)} /></Field>
                </div>
                <div className="formula-panel"><strong>Pricing formula</strong><code>Sell = Total Cost ÷ [1 − (Margin% + Commission% + Processing%)/100]</code><p>This is a target margin calculation, not a markup calculation. The fees are treated as a percentage of selling price.</p></div>
              </section>
            </div>
            <div className="pricing-side"><section className="panel sticky-panel">
              <span className="section-label">LIVE PROFIT MODEL</span><h2>Pricing result</h2>
              <div className="pricing-totals">
                <Stat title="Estimated project cost" value={currency(totals.totalCost)} />
                <Stat title="Suggested selling price" value={valid ? currency(totals.sellingPrice) : 'Review inputs'} hero />
                <Stat title="Projected profit" value={valid ? currency(totals.projectedProfit) : '—'} />
                <Stat title="Projected margin" value={valid ? `${decimal(totals.projectedMarginPct, 1)}%` : '—'} />
              </div>
              <button className="btn btn-dark wide" onClick={() => setTab('estimate')}>← Back to estimate</button>
            </section></div>
          </div>}

          {tab === 'quote' && <div className="quote-stage">
            <div className="quote-actions no-print">
              <div><strong>Customer-facing proposal</strong><p>Cost breakdowns, internal supplier rates, and margins are excluded.</p></div>
              <div><button className="btn btn-quiet" onClick={() => setTab('estimate')}>← Edit estimate</button><button className="btn btn-dark" disabled={!valid} onClick={() => window.print()}>Print / Save as PDF</button></div>
            </div>
            {valid ? <article className="quote-paper">
              <div className="quote-top"><div><div className="quote-logo">A<span>.</span></div><h2>ASPECT GLASSWORK</h2><p>Commercial glazing · Preliminary quotation</p></div><div className="quote-top-right"><div className="quote-document">QUOTATION</div><p><strong>{project.estimateNumber}</strong><br />{project.date || 'Date not entered'}</p></div></div>
              <div className="quote-rule" />
              <div className="quote-meta"><div><span>PREPARED FOR</span><strong>{project.clientName || 'Client to be confirmed'}</strong><p>{project.location || 'Project address to be confirmed'}</p></div><div><span>PROJECT</span><strong>{project.projectName}</strong><p>{project.estimator ? `Prepared by ${project.estimator}` : 'Preliminary estimate'}</p></div></div>
              <h3>Proposed storefront scope</h3>
              <div className="quote-table-scroll"><table className="quote-table"><thead><tr><th>Mark</th><th>Qty</th><th>Opening W × H</th><th>Configuration / glass</th></tr></thead><tbody>{project.openings.map((opening) => <tr key={opening.id}><td><strong>{opening.mark}</strong></td><td>{opening.quantity}</td><td>{opening.width}" × {opening.height}"</td><td>{formatOpeningType(opening.openingType)} · {opening.glassType}{opening.note ? <><br /><span className="quote-note">{opening.note}</span></> : null}</td></tr>)}</tbody></table></div>
              <div className="quote-details"><div><strong>Framing system</strong><p>{project.framingSystem}</p></div><div><strong>Finish</strong><p>{project.finish}</p></div></div>
              <div className="quote-price"><span>PROPOSED PROJECT PRICE</span><strong>{currency(totals.sellingPrice)}</strong><small>USD · Budgetary proposal; final price subject to scope and vendor verification</small></div>
              <div className="quote-terms"><h3>Scope notes & assumptions</h3><p>{project.scopeNotes || 'Subject to verification of site measurements, glass specifications, project scope, and supplier quotations.'}</p><p>Estimate excludes items not expressly described. Final contract terms, taxes, permits, engineering requirements, schedule, and payment terms to be confirmed separately.</p></div>
              <div className="quote-footer"><span>ASPECT GLASSWORK</span><span>Preliminary estimate · Not an approved fabrication document</span></div>
            </article> : <div className="panel"><h2>Complete the estimate first</h2><p>Correct the validation messages above before generating a customer-facing quotation.</p><button className="btn btn-dark" onClick={() => setTab('estimate')}>Return to estimate</button></div>}
          </div>}
          <footer className="footer no-print"><span>Aspect Storefront Estimator · V1.0</span><span>Browser-local draft · USD · Preliminary quantities only</span></footer>
        </main>
      </div>
    </div>
  );
}
```

---

## `app/globals.css`

```css
:root{--ink:#152338;--muted:#687689;--line:#e7ebf0;--surface:#fff;--page:#f5f7fa;--accent:#2a8e71;--accent-light:#ecf7f2;--navy:#12243c;--orange:#b9642f}

*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100%}
body{font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--page);font-size:14px;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
button:disabled{cursor:not-allowed;opacity:.48}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #7ac3af;outline-offset:2px}

a{color:inherit;text-decoration:none}
.app-root{min-height:100vh}
.topbar{height:76px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 34px;position:sticky;top:0;z-index:10}
.brand{display:flex;align-items:center;gap:13px}
.brand-mark{font-size:32px;font-weight:900;letter-spacing:-3px;color:var(--navy)}
.brand-mark span,.quote-logo span{color:var(--accent)}
.brand-names{display:flex;flex-direction:column;gap:4px}
.brand-names strong{font-size:12px;letter-spacing:1.5px}
.brand-names small{color:#8d99a9;font-size:9px;letter-spacing:2px;font-weight:700}
.topbar-right{display:flex;align-items:center;gap:24px}
.top-pill{background:#f1f7f4;color:#377962;border:1px solid #d9e9e2;padding:9px 13px;border-radius:20px;font-size:11px;font-weight:700}
.green-dot,.summary-indicator{display:inline-block;width:7px;height:7px;background:#28b67f;border-radius:50%;margin-right:5px}
.autosave{font-size:11px;color:var(--muted)}
.shell{display:flex;min-height:calc(100vh - 76px)}
.sidebar{width:250px;flex-shrink:0;background:#fff;border-right:1px solid var(--line);padding:28px 15px;display:flex;flex-direction:column;min-height:calc(100vh - 76px)}
.sidebar-label{font-size:10px;color:#9da7b5;letter-spacing:2px;font-weight:700;margin:0 15px 18px}
.navitem{border:0;background:none;width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:14px 13px;color:#617084;font-weight:600;font-size:12px;border-radius:10px;margin-bottom:5px}
.navitem span{font-size:20px;width:24px;text-align:center;font-weight:400}
.navitem:hover{background:#f5f7f9}
.navitem.active{color:#1c7059;background:#e9f5ef}
.sidebar-spacer{flex:1;min-height:40px}
.sidebar-help{background:#f5f8fa;border-radius:12px;padding:17px 15px;margin-top:25px}
.sidebar-help strong{font-size:12px}
.sidebar-help p{font-size:11px;line-height:1.65;color:#778394;margin-bottom:0}
.sidebar-link{padding:20px 15px 0;font-size:11px;color:#62768c}
.main{flex:1;min-width:0;padding:36px 37px 30px;max-width:1750px;margin:0 auto}
.page-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:26px}
.eyebrow,.section-label{font-size:10px;font-weight:800;letter-spacing:1.8px;color:#399278}
.page-toolbar h1{font-size:30px;letter-spacing:-1px;margin:7px 0 6px;line-height:1.1}
.page-desc{margin:0;color:#8190a1;font-size:12px;line-height:1.6}
.toolbar-actions,.quote-actions>div:last-child{display:flex;align-items:center;gap:9px}
.btn{border:1px solid transparent;padding:11px 15px;white-space:nowrap;border-radius:9px;font-size:12px;font-weight:700;transition:background .14s,transform .14s}
.btn:active{transform:translateY(1px)}
.btn-quiet{border-color:#e6eaf0;background:#fff;color:#52637a}
.btn-quiet:hover,.btn-outline:hover{background:#f6f9fb}
.btn-dark{color:#fff;background:var(--navy)}
.btn-dark:hover{background:#24415f}
.btn-outline{background:#fff;border-color:#d8e3de;color:#25886a}
.wide{width:100%;margin-top:18px}
.nav-mobile{display:none}
.sample-notice{background:#fffaf0;border:1px solid #f5e6c6;border-radius:10px;padding:13px 17px;color:#8b6631;font-size:11px;line-height:1.55;margin-bottom:20px}
.sample-notice strong{color:#89531c}
.toast{display:flex;justify-content:space-between;gap:12px;margin-bottom:18px;padding:12px 15px;background:#eaf7f0;color:#287a5d;border-radius:10px;font-size:12px}
.toast button{border:0;background:none;font-size:18px;color:#287a5d}
.validation{background:#fff1ed;border:1px solid #f0cdc3;color:#9c402f;border-radius:10px;padding:14px 18px;margin-bottom:20px}
.validation strong{font-size:12px}
.validation ul{padding-left:20px;font-size:11px;line-height:1.8;margin:8px 0 0}
.workspace-columns{display:grid;grid-template-columns:minmax(0,1.95fr) minmax(285px,.9fr);align-items:start;gap:22px}
.content-column,.pricing-main{display:flex;flex-direction:column;gap:22px;min-width:0}
.panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:25px 27px;box-shadow:0 4px 18px rgba(25,44,65,.025)}
.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:22px}
.panel h2,.summary-card h2{font-size:17px;letter-spacing:-.4px;margin:8px 0 0}
.tag{font-size:10px;font-weight:700;padding:8px 11px;background:#ecf7f2;color:#2c8d6f;border-radius:7px;white-space:nowrap}
.tag-orange{background:#fcf3e9;color:#b17b45}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.field{display:flex;flex-direction:column;gap:7px;min-width:0;margin-bottom:0}
.field-label{font-size:11px;color:#4a5a6c;font-weight:700}
.input,.textarea{background:#fff;border:1px solid #dfe6ec;border-radius:8px;width:100%;color:#26364a;padding:11px 12px;min-width:0;line-height:1.3;outline:0}
.input:hover,.textarea:hover{border-color:#b5c4d1}
.input:focus,.textarea:focus{border-color:#56ad91;box-shadow:0 0 0 3px #e7f7f1}
.input::placeholder,.textarea::placeholder{color:#afb8c3}
.field-hint{font-size:10px;color:#8e9cab;margin-top:1px}
.number-input{font-variant-numeric:tabular-nums}
.panel-subtitle{margin:-12px 0 24px;font-size:11px;line-height:1.7;color:#8190a0}
.panel-subtitle code{background:#f1f4f7;border-radius:4px;padding:2px 4px;color:#455568}
.title-count{color:#8b9cac;font-size:12px;font-weight:500;margin-left:5px}
.opening-card{border:1px solid #e1e8ed;border-radius:12px;overflow:hidden;margin:19px 0;background:#fff}
.opening-heading{display:flex;align-items:center;justify-content:space-between;background:#f7f9fa;padding:14px 17px;border-bottom:1px solid #ebeff2}
.opening-identity{display:flex;align-items:center;gap:11px;min-width:0}
.opening-identity strong{font-size:13px}
.opening-index{background:#e9f2ef;border:1px solid #d7e9e1;padding:8px 9px;font-weight:700;color:#397d68;font-size:10px;border-radius:6px}
.opening-category{font-size:10px;color:#94a0ad}
.remove-btn{border:0;background:#fff;color:#9dabb6;font-size:23px;width:27px;height:27px;line-height:25px;border-radius:5px}
.remove-btn:hover{background:#feeeee;color:#b94b43}
.opening-grid{padding:21px 19px 17px;gap:15px 17px}
.opening-card>.field{padding:0 19px 19px}
.opening-result{border-top:1px solid #e8eef1;display:grid;grid-template-columns:1fr 1fr 1.2fr;background:#f9fbfc;padding:15px 19px;gap:10px}
.opening-result>div{display:flex;flex-direction:column;gap:7px}
.opening-result span{font-size:10px;color:#8b98a8}
.opening-result strong{font-size:13px;white-space:nowrap}
.opening-result>div:last-child strong{color:#168467}
.note-line{background:#f5f7fa;margin:15px 0 0;border-left:3px solid #a4b5c8;padding:10px 12px;color:#6b7c8d;font-size:11px;line-height:1.6}
.opening-card>.note-line{margin:0 19px 17px}
.add-bottom{width:100%;border:1px dashed #bbd4ca;background:#f7fbf9;color:#218263;padding:14px;font-size:12px;font-weight:700;border-radius:9px;margin-top:10px}
.add-bottom:hover{background:#eaf7ef}
.textarea{resize:vertical;line-height:1.65}
.summary-column{min-width:0;position:sticky;top:96px}
.summary-card{background:var(--navy);color:#fff;border-radius:14px;padding:23px 24px 22px;box-shadow:0 13px 38px rgba(14,42,69,.14)}
.summary-header{display:flex;justify-content:space-between;align-items:center}
.summary-header h2{margin-top:9px;font-size:17px}
.light-label{color:#87cbb6}
.summary-indicator{margin:0}
.summary-hero{display:flex;flex-direction:column;border-bottom:1px solid #33445c;padding:28px 0 22px}
.summary-hero>span{color:#a9bdce;font-size:11px}
.summary-hero strong{font-size:31px;letter-spacing:-1px;margin:10px 0 8px}
.summary-hero small{font-size:10px;color:#8fa5bc;line-height:1.6}
.summary-stats{padding:19px 0;border-bottom:1px solid #33445c;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.summary-stats div{display:flex;flex-direction:column;gap:9px}
.summary-stats span{color:#91a7bc;font-size:10px;line-height:1.4}
.summary-stats strong{color:#fff;font-size:13px}
.summary-breakdown{padding:18px 0}
.summary-breakdown>div{display:flex;gap:15px;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.summary-breakdown span{font-size:10px;line-height:1.5;color:#a8bace}
.summary-breakdown strong{font-size:11px;white-space:nowrap}
.summary-breakdown .summary-total{border-top:1px solid #324961;margin-top:15px;padding-top:18px}
.summary-breakdown .summary-total span,.summary-breakdown .summary-total strong{color:#fff;font-weight:700;font-size:12px}
.summary-breakdown .summary-profit{border-top:1px solid #324961;margin-top:15px;padding-top:17px}
.summary-breakdown .summary-profit strong{color:#61d7ad}
.summary-button{width:100%;border:0;border-radius:8px;padding:14px 10px;background:#39b78c;color:#092e25;font-weight:800;font-size:12px}
.summary-button:hover{background:#54c99f}
.summary-secondary{background:none;color:#b0c5d8;border:0;font-size:11px;width:100%;padding:15px 10px 0}
.summary-disclaimer{color:#94a2ae;line-height:1.7;font-size:10px;padding:10px 7px;margin:0}
.pricing-layout{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(250px,.8fr);gap:22px;align-items:start}
.pricing-side{position:sticky;top:96px}
.sticky-panel{padding:25px}
.pricing-totals{display:grid;gap:17px;margin-top:20px}
.stat{display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--line);padding-bottom:17px}
.stat-title{font-size:11px;color:#718094}
.stat-value{font-size:23px;letter-spacing:-.7px}
.stat-help{font-size:10px;color:#96a2ae}
.stat-hero .stat-value{color:#218b6c}
.formula-panel{border-radius:10px;background:#f3f8f6;padding:20px;margin-top:25px}
.formula-panel strong{display:block;font-size:12px;margin-bottom:11px}
.formula-panel code{display:block;font-size:11px;white-space:normal;color:#176748;line-height:1.7}
.formula-panel p{font-size:11px;color:#6d817c;line-height:1.6;margin-bottom:0}
.quote-stage{max-width:1000px;margin:0 auto}
.quote-actions{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 22px}
.quote-actions strong{font-size:13px}
.quote-actions p{font-size:11px;color:#8290a0;margin:6px 0 0}
.quote-paper{background:#fff;border:1px solid var(--line);border-radius:14px;padding:56px 60px;box-shadow:0 10px 40px rgba(15,34,53,.05)}
.quote-top{display:flex;justify-content:space-between;align-items:flex-start}
.quote-logo{font-weight:900;font-size:48px;letter-spacing:-6px;line-height:1;color:var(--navy)}
.quote-top h2{font-size:13px;letter-spacing:2px;margin:15px 0 6px}
.quote-top p{font-size:11px;color:#8090a0;line-height:1.6}
.quote-top-right{text-align:right}
.quote-document{font-size:22px;letter-spacing:3px;font-weight:700;color:#203651}
.quote-rule{height:3px;background:#2b9b78;margin:32px 0}
.quote-meta{display:grid;grid-template-columns:1fr 1fr;gap:35px;margin-bottom:37px}
.quote-meta>div{display:flex;flex-direction:column;gap:8px}
.quote-meta span{font-size:10px;color:#7c8d9d;letter-spacing:1.4px;font-weight:700}
.quote-meta strong{font-size:15px}
.quote-meta p{font-size:11px;color:#728092;margin:0;line-height:1.6}
.quote-paper h3{font-size:14px;margin:0 0 19px}
.quote-table-scroll{width:100%;overflow-x:auto}
.quote-table{border-collapse:collapse;width:100%;font-size:11px}
.quote-table th{text-align:left;font-size:10px;color:#6b7e90;background:#f3f6f8;padding:13px 12px}
.quote-table td{padding:15px 12px;vertical-align:top;border-bottom:1px solid #ecf0f2}
.quote-note{color:#8694a0;font-size:10px}
.quote-details{display:grid;grid-template-columns:1fr 1fr;gap:25px;margin-top:25px}
.quote-details strong{font-size:11px}
.quote-details p{color:#758397;font-size:11px;line-height:1.5}
.quote-price{background:#eef7f3;padding:23px 27px;display:flex;flex-direction:column;align-items:flex-end;gap:9px;border-radius:9px;margin-top:28px}
.quote-price span{color:#52866f;font-size:10px;letter-spacing:1.6px;font-weight:800}
.quote-price strong{color:#1d7055;font-size:32px;letter-spacing:-1px}
.quote-price small{color:#638171;font-size:10px}
.quote-terms{margin-top:36px}
.quote-terms h3{margin-bottom:13px}
.quote-terms p{font-size:11px;color:#6c7b8c;line-height:1.8;white-space:pre-wrap}
.quote-footer{border-top:1px solid #e4ebef;margin-top:42px;padding-top:15px;display:flex;justify-content:space-between;gap:14px;color:#9aa7b3;font-size:9px}
.footer{display:flex;justify-content:space-between;gap:20px;font-size:10px;color:#a1acb8;padding:30px 0 0}


@media(max-width:1300px){.sidebar{width:210px}
.main{padding:32px 24px}
.workspace-columns{grid-template-columns:minmax(0,1.5fr) minmax(270px,.9fr)}
.summary-card{padding:21px 18px}
.panel{padding:22px}
.quote-paper{padding:48px}
}


@media(max-width:1050px){.sidebar{display:none}
.main{padding:28px;max-width:none}
.nav-mobile{display:flex;background:#fff;border-radius:10px;padding:5px;margin-bottom:20px;border:1px solid var(--line)}
.nav-mobile button{flex:1;border:0;background:none;padding:11px;border-radius:8px;font-size:12px;font-weight:700;color:#8190a0}
.nav-mobile button.selected{background:#eaf6f0;color:#218164}
.topbar{padding:0 28px}
.workspace-columns{grid-template-columns:minmax(0,1.5fr) minmax(255px,.85fr)}
}


@media(max-width:760px){.topbar{height:66px;padding:0 17px}
.brand-names strong{font-size:10px}
.brand-names small{font-size:8px}
.top-pill{display:none}
.autosave{font-size:10px}
.main{padding:24px 15px}
.page-toolbar{align-items:flex-start;flex-direction:column}
.page-toolbar h1{font-size:25px}
.toolbar-actions{flex-wrap:wrap}
.workspace-columns,.pricing-layout{display:block}
.content-column,.pricing-main{gap:16px}
.panel{padding:18px;margin-bottom:16px}
.summary-column,.pricing-side{position:static;margin-top:16px}
.form-grid{gap:14px}
.opening-grid{padding:17px 14px}
.opening-card>.field{padding:0 14px 16px}
.opening-result{padding:13px;grid-template-columns:repeat(3,minmax(0,1fr))}
.opening-result strong{font-size:11px;white-space:normal}
.opening-category{display:none}
.quote-actions{align-items:flex-start;flex-direction:column}
.quote-actions>div:last-child{flex-wrap:wrap}
.quote-paper{padding:24px 17px}
.quote-document{font-size:15px}
.quote-price strong{font-size:25px}
.footer{flex-direction:column;gap:6px}
}


@media(max-width:440px){.form-grid{grid-template-columns:1fr}
.opening-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.opening-grid .field{min-width:0}
.opening-result{grid-template-columns:1fr}
.opening-result>div{flex-direction:row;justify-content:space-between}
.topbar-right{max-width:110px}
.autosave{text-align:right}
.brand-mark{font-size:27px}
.quote-meta,.quote-details{grid-template-columns:1fr}
}


@media print{@page{size:letter;margin:13mm}
html,body{background:#fff!important;color:#18293d!important}
.topbar,.sidebar,.no-print,.page-toolbar,.sample-notice,.validation,.toast,.footer{display:none!important}
.shell,.main,.quote-stage{display:block!important;width:100%!important;padding:0!important;max-width:none!important;margin:0!important}
.quote-paper{border:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important}
.quote-table-scroll{overflow:visible}
.quote-table{page-break-inside:auto}
.quote-table tr{break-inside:avoid}
.quote-price{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.quote-footer{margin-top:24px}
}
```

---

## `lib/types.ts`

```typescript
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
```

---

## `lib/defaults.ts`

```typescript
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
```

---

## `lib/calculations.ts`

```typescript
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
```

---

## `tests/calculations.test.mjs`

```javascript
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
```

---

## `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

---

## `next-env.d.ts`

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// This file should not be edited.
```

---

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## `.gitignore`

```text
node_modules/
.next/
out/
build/
.vercel/
*.log
*.tsbuildinfo
.env
.env.*
!.env.example
.DS_Store
```

---
