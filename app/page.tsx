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
