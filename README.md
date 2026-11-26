# Data Centre IRR and Cash Flow Explorer

Interactive cash flow, schedule, and leveraged IRR scenario explorer for modular data centre developments anchored to a **4.5 MW Global Reference Design (GRD)** per data hall.

## Features

- **Modular 4.5 MW GRD Scaling:** Adjust data hall count in discrete 4.5 MW multiples alongside cost per MW built (œM/MW) and stabilized net rent (œM/MW/yr).
- **Build Phase Durations (Weeks):** Tailor durations for **Land and Power**, **Shell and Core**, and **OFCI (Fit-Out)** to evaluate total build weeks and schedule sensitivity.
- **Capital Stack and Exit Assumptions:** Model debt leverage (% LTC), interest rate, and exit cap rate to calculate gross exit valuation, yield on cost, and levered equity IRR.
- **Scenario Comparison:** Compare **Baseline (On-Time)**, **Phased Power + Staged OFCI**, **Phased Power (Upfront OFCI)**, and **12-Month Grid Delay** with an interactive cumulative cash flow chart and annual ledger table.

## Local Development

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser.

## Deployment on Railway

1. Connect this repository (`DaftNinja/DC-Calculator`) to a new Railway project.
2. Railway detects Node.js, runs `npm install`, and starts the app via `npm start` on `process.env.PORT`.
3. Generate a public domain under **Settings > Networking > Generate Domain**.
