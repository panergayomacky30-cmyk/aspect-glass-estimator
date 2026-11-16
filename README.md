# Aspect Glasswork — Storefront Estimator V1

A **complete storefront estimating website**, built with Next.js + React + TypeScript. Designed to be developed in **VS Code on your own Windows PC**, previewed at `http://localhost:3000`, and optionally published using GitHub + Vercel.

**You do not need GitHub, Vercel, or a database to begin.** The downloadable ZIP contains all the source code. Don't run `create-next-app` or paste code into an unrelated starter project; this is already a complete Next.js application.

> **Estimator prototype, not a verified supplier quote or fabrication tool.** All rates in the sample are placeholders (USD), not confirmed Aspect or vendor rates. Verify dimensions, systems, specified assemblies, glass cut sizes, supplier inclusions, labor assumptions, and allowances before any business use. The first version has no shared database or user login.

## PART A — RUN LOCALLY USING VS CODE

### 1. Install Node.js (once)

- Open https://nodejs.org/en/download and install the **LTS** version for Windows using the official installer.
- If you installed Node.js while VS Code was open, **close and reopen VS Code**.
- In VS Code, choose **Terminal → New Terminal**. Prefer **Command Prompt** on Windows (Terminal dropdown → **Select Default Profile → Command Prompt**) so PowerShell execution-policy restrictions cannot interfere.
- Run:

```bat
node -v
npm -v
```

Both commands must return version numbers. Next.js requires a supported Node.js version (20.9 or higher for the versions used here).

### 2. Download and extract the complete project ZIP

- Download `Aspect_Storefront_Estimator_V1_VSCode.zip` from the ChatGPT response.
- In File Explorer, right-click → **Extract All…**.
- You should now have a folder named `aspect-storefront-estimator-vscode` with `package.json`, `app`, `lib` and `tests` directly inside it.
- **Do not open an extra outer folder:** `package.json` must be directly in the folder VS Code opens.

### 3. Open the project in VS Code

- Select **File → Open Folder…**.
- Choose the extracted `aspect-storefront-estimator-vscode` folder.
- Open **Terminal → New Terminal**.
- The terminal prompt should be inside the folder with `package.json`.

### 4. Install packages

Run once, with an internet connection:

```bat
npm install
```

This downloads the Next.js / React / TypeScript packages. It does not upload your project to GitHub.

### 5. Run all calculation tests

```bat
npm test
```

You should see **6 passing tests**. These test fractions, area, framing length, pricing, door allowances, and input validation.

### 6. Start your local website

```bat
npm run dev
```

Wait for a `Ready` message in the terminal. Open this address in Chrome, Edge, or Firefox:

**http://localhost:3000**

The website is on **your own computer**. It does not need Vercel or GitHub, and other people cannot access this localhost address from outside your computer.

To stop the local website, return to the terminal and press **Ctrl + C**. To start it again, run `npm run dev` from the project folder. Every time you save source-code changes in VS Code, Next.js reloads the website.

### 7. Try your first estimate

1. **Storefront estimate:** Enter project name, client, number, address, framing system and finish.
2. Edit the sample opening: mark, quantity, width, height, glass construction and glazing columns/rows.
3. Click **Add opening** to create more marks.
4. Go to **Pricing & rates**. Replace all sample rates, labor hours, door allowances, freight, overhead, risk and desired gross margin with appropriate **verified** values.
5. Review the live breakdown and selling-price estimate.
6. Open **Customer quote** and click **Print / Save as PDF**. In your browser's print dialog, select **Save as PDF**.
7. Use **Backup** to save the estimate to a JSON file. Use **Import** to open it later. You can also export a takeoff CSV for Excel.

**Storage:** V1 automatically saves ONE active project to this browser's local storage. The app does not create a shared multi-user database. Before clearing browser data, changing browsers, or changing computers, export a JSON backup. Project drafts on localhost won't automatically appear on a later Vercel website.

### 8. Check for production build errors (recommended)

Stop `npm run dev` using Ctrl + C, then:

```bat
npm run typecheck
npm run build
```

To simulate the production server after a successful build:

```bat
npm run start
```

Then open http://localhost:3000. Stop with Ctrl + C.

## PART B — UPLOAD TO GITHUB WHEN READY

You can complete Part A first, with no GitHub account needed.

1. Install **Git for Windows** from https://git-scm.com/downloads/win if VS Code asks for Git.
2. Sign in to your GitHub account at https://github.com.
3. In VS Code's left sidebar select **Source Control**.
4. Choose **Initialize Repository**, if needed.
5. Choose **Publish Branch / Publish to GitHub**; authorize GitHub if prompted.
6. Choose **Publish to GitHub private repository** and name it `aspect-glass-estimator`.
7. Verify that your uploaded GitHub repository includes `package.json`, `app/`, `lib/`, and `tests/`.

Alternatively, after creating an empty private repo on GitHub, you can use Git commands in VS Code, but don't separately initialize a conflicting README on GitHub and locally unless you know how to merge them.

If you prefer CLI for a repo that has no remote yet:

```bat
git init
git add .
git commit -m "Initial storefront estimator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/aspect-glass-estimator.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your own GitHub username. The first push requires authentication and the destination repo to exist. The VS Code **Publish to GitHub** flow is easier for beginners.

## PART C — MAKE IT AN INDEPENDENT WEBSITE LATER

1. Visit https://vercel.com/new.
2. Sign in with GitHub; authorize access only to the estimator repository if appropriate.
3. Import `aspect-glass-estimator`.
4. Choose **Next.js**. Keep **Root Directory** as `.` (the folder with `package.json`).
5. Click **Deploy**.
6. Vercel will generate a normal public website URL, for example `https://your-project.vercel.app`. Employees can open it in a browser **without GitHub installed or a GitHub account**.
7. To update the live website, edit code in VS Code, commit and push changes to GitHub.

**Security:** A public deployment of V1 is *not* a protected employee application. It has no login and saves drafts separately in each user's browser. Use a private development environment or fictional test data until authentication, role-based access, and a central database have been added. For actual company/commercial use, choose a hosting plan that permits commercial activity.

## WHAT IS INCLUDED

```text
aspect-storefront-estimator-vscode/
├── app/
│   ├── globals.css           Responsive design and print/PDF styles
│   ├── layout.tsx             Root layout and page metadata
│   └── page.tsx               Website, form, estimate, quote, JSON/CSV export
├── lib/
│   ├── calculations.ts       Imperial dimension parsing and pricing formulas
│   ├── defaults.ts           Demo project, sample rates, backup validation
│   └── types.ts              TypeScript project and opening definitions
├── tests/
│   └── calculations.test.mjs Six automated math/validation tests
├── .gitignore
├── next.config.ts
├── next-env.d.ts
├── tsconfig.json
├── package.json
├── FULL_SOURCE_CODE.md       Every project code file as copyable text
└── README.md                 These VS Code-first instructions
```

## FORMULAS (PRELIMINARY ESTIMATES)

Enter **overall opening** width `W` and height `H` in inches, quantity `Q`, glazing columns `C` and glazing rows `R`:

```
Gross opening area (SF) = W × H / 144 × Q
Purchased glass SF = Gross SF × (1 + Glass allowance % / 100)
Glass cost = Purchased SF × Glass rate ($ / SF)

Approx. framing LF = [2(W + H) + (C - 1)H + (R - 1)W] × Q / 12
Purchased framing LF = Approx. framing LF × (1 + Frame allowance % / 100)
Frame cost = Purchased framing LF × Frame rate ($ / LF)

Door package allowance = Quantity × package price (if selected)
Extra hardware = Quantity × hardware allowance per opening
Labor = Quantity × labor hours per opening × hourly labor rate
Direct cost = Glass + Framing + Door packages + Extra hardware
            + Labor + Freight + Equipment + Miscellaneous + Allocated overhead
Contingency = Chosen basis (glass or direct) × contingency percentage
Total cost = Direct cost + contingency

Selling price = Total cost / [1 - (target margin + commission + card fee) / 100]
```

**Do not confuse markup with margin.** Example: $10,000 cost at 20% target margin and 0% selling fees results in $12,500 quoted price. Fees are modeled as a percentage of selling price, not purchase cost. Taxes, permits, compliance, engineering, local conditions, and subcontract costs must be included explicitly where applicable.

**Important scope limitation:** Overall opening area and simplified extrusion length are budgeting quantities; they are **not exact individual glass panel cut sizes** or a manufacturer-specific extrusion BOM. Full-span grids may not describe doors or asymmetric systems. A vendor-supplied door package may already include glazing/framing/hardware and could be double-counted if allowances are not adjusted.

## TROUBLESHOOTING

- **`'node' is not recognized` / `'npm' is not recognized`:** Install Node.js LTS, close/reopen VS Code, then run `node -v` and `npm -v` again.
- **`npm.ps1 cannot be loaded`:** In VS Code choose Terminal dropdown → Select Default Profile → **Command Prompt**, reopen terminal, then run `npm install` again. Or use `npm.cmd install` in PowerShell.
- **`ENOENT: no such file package.json`:** In VS Code, open the actual extracted project folder, not its parent.
- **`Cannot find module next`:** Run `npm install` in the project folder.
- **Port 3000 is in use:** Close the other local server, or follow the alternate port shown in the Next.js terminal (e.g., `http://localhost:3001`).
- **Blank screen or error:** Read the first error in the VS Code terminal; run `npm run typecheck` and share the error text when asking for help.
- **Can't find old estimate:** Drafts live in local browser storage. Use the same browser and address, or import your saved JSON backup.
- **Shared website does not share saved projects:** That's expected in V1; shared storage and staff accounts are future features.

**Official references:** https://nextjs.org/docs/app/getting-started/installation, https://nodejs.org/en/download, https://vercel.com/docs/git
