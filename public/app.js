const DEFAULTS = {
  grdMw: 4.5,
  halls: 7,
  costPerMw: 14.67,
  rentPerMw: 112.5,
  landWeeks: 26,
  landPct: 20,
  shellWeeks: 40,
  shellPct: 45,
  ofciWeeks: 38,
  ofciPct: 35,
  ltc: 0,
  debtRate: 0,
  yocInput: 9.20
};

const els = {
  grdMw: document.getElementById("grdMw"),
  halls: document.getElementById("halls"),
  costPerMw: document.getElementById("costPerMw"),
  rentPerMw: document.getElementById("rentPerMw"),
  landWeeks: document.getElementById("landWeeks"),
  landPct: document.getElementById("landPct"),
  shellWeeks: document.getElementById("shellWeeks"),
  shellPct: document.getElementById("shellPct"),
  ofciWeeks: document.getElementById("ofciWeeks"),
  ofciPct: document.getElementById("ofciPct"),
  ltc: document.getElementById("ltc"),
  debtRate: document.getElementById("debtRate"),
  yocInput: document.getElementById("yocInput")
};

function computeTimedIRR(timedCfs) {
  const valid = timedCfs.filter(([, amt]) => Math.abs(amt) > 1e-9);
  if (valid.length < 2) return NaN;
  let lo = -0.5, hi = 3.0;
  const npvAt = r => valid.reduce((acc, [t, amt]) => acc + amt / Math.pow(1 + r, t), 0);
  if (npvAt(lo) < 0 || npvAt(hi) > 0) return NaN;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function cumulative(a) {
  let s = 0;
  return a.map(v => +(s += v).toFixed(1));
}

function fmtM(v) {
  if (v === null || v === undefined) return "—";
  return `${v < 0 ? "-" : ""}£${Math.abs(v).toFixed(1)}M`;
}

const chart = new Chart(document.getElementById("cfChart").getContext("2d"), {
  type: "line",
  data: {
    labels: ["Yr 0", "Yr 1", "Yr 2", "Yr 3", "Yr 4", "Yr 5", "Yr 6"],
    datasets: [
      { label: "Baseline (On-Time)", data: [], borderColor: "#38bdf8", tension: 0.25, borderWidth: 2.5 },
      { label: "Phased Power + Staged OFCI", data: [], borderColor: "#34d399", tension: 0.25, borderWidth: 2.5 },
      { label: "Phased Power (Upfront OFCI)", data: [], borderColor: "#a78bfa", tension: 0.25, borderWidth: 2 },
      { label: "12-Mo Grid Delay (Yr 6 Exit)", data: [], borderColor: "#f87171", tension: 0.25, borderWidth: 2.5, borderDash: [6, 4] },
      { label: "100% Pre-Leased (Exit RFS + 9 Mos)", data: [], borderColor: "#fbbf24", tension: 0.25, borderWidth: 2.5 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#f8fafc" } },
      tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtM(c.parsed.y)}` } }
    },
    scales: {
      x: { ticks: { color: "#94a3b8" }, grid: { color: "#334155" } },
      y: { ticks: { color: "#94a3b8", callback: v => `£${v}M` }, grid: { color: "#334155" } }
    }
  }
});

let phaseBudgets = { land: 20, shell: 45, ofci: 35 };

function rebalanceBudgets(changed) {
  let land = +els.landPct.value;
  let shell = +els.shellPct.value;
  let ofci = +els.ofciPct.value;

  if (changed === "land") {
    land = Math.max(0, Math.min(100, land));
    const rem = 100 - land;
    const prevRem = phaseBudgets.shell + phaseBudgets.ofci;
    if (prevRem <= 0) {
      shell = Math.round(rem * 0.56);
      ofci = rem - shell;
    } else {
      shell = Math.round((phaseBudgets.shell / prevRem) * rem);
      ofci = rem - shell;
    }
  } else if (changed === "shell") {
    shell = Math.max(0, Math.min(100 - land, shell));
    ofci = 100 - land - shell;
  } else if (changed === "ofci") {
    ofci = Math.max(0, Math.min(100 - land, ofci));
    shell = 100 - land - ofci;
  }

  phaseBudgets = { land, shell, ofci };
  els.landPct.value = land;
  els.shellPct.value = shell;
  els.ofciPct.value = ofci;
}

function update() {
  const grdMw = +els.grdMw.value;
  const halls = +els.halls.value;
  const costPerMw = +els.costPerMw.value;
  const rentPerMw = +els.rentPerMw.value;
  const landWeeks = +els.landWeeks.value;
  const landRatio = phaseBudgets.land / 100;
  const shellWeeks = +els.shellWeeks.value;
  const shellRatio = phaseBudgets.shell / 100;
  const ofciWeeks = +els.ofciWeeks.value;
  const ofciRatio = phaseBudgets.ofci / 100;
  const ltc = +els.ltc.value / 100;
  const debtRate = +els.debtRate.value / 100;
  const yoc = +els.yocInput.value;
  const yocRatio = yoc / 100;
  const exitCap = 0.055;

  const totalMw = halls * grdMw;
  const totalCapex = totalMw * costPerMw;
  const totalDebt = totalCapex * ltc;
  const totalEquity = totalCapex - totalDebt;
  const annualDebtService = totalDebt * debtRate;
  const stabilizedNoi = totalMw * rentPerMw * 0.012;
  // Yield on Cost driven directly by yocInput slider
  const grossExit = (totalCapex * yocRatio) / exitCap;
  const netExit = grossExit - totalDebt;

  const totalWeeks = landWeeks + shellWeeks + ofciWeeks;
  const buildYears = totalWeeks / 52;
  const scheduleDragFactor = Math.max(0.5, Math.min(1.5, 104 / totalWeeks));

  document.getElementById("valGrdMw").textContent = `${grdMw.toFixed(1)} MW`;
  document.getElementById("labelHalls").textContent = `GRD Data Halls (${grdMw.toFixed(1)} MW each)`;
  document.getElementById("pageTitle").textContent = `${grdMw.toFixed(1)} MW GRD Data Centre IRR & Cash Flow Explorer`;
  document.getElementById("pageSubtitle").textContent = `Modular Data Hall Scaling (${grdMw.toFixed(1)} MW GRD), Phase Durations (Weeks), Leverage & Yield on Cost`;
  document.getElementById("valHalls").textContent = `${halls} ${halls === 1 ? "hall" : "halls"} (${totalMw.toFixed(1)} MW)`;
  document.getElementById("valCostPerMw").textContent = `£${costPerMw.toFixed(2)}M/MW`;
  document.getElementById("valRentPerMw").textContent = `£${rentPerMw.toFixed(2)}/kW/mo`;
  document.getElementById("valLandWeeks").textContent = `${landWeeks} wks`;
  document.getElementById("valLandPct").textContent = `${phaseBudgets.land}% (£${(totalCapex * landRatio).toFixed(1)}M)`;
  document.getElementById("valShellWeeks").textContent = `${shellWeeks} wks`;
  document.getElementById("valShellPct").textContent = `${phaseBudgets.shell}% (£${(totalCapex * shellRatio).toFixed(1)}M)`;
  document.getElementById("valOfciWeeks").textContent = `${ofciWeeks} wks`;
  document.getElementById("valOfciPct").textContent = `${phaseBudgets.ofci}% (£${(totalCapex * ofciRatio).toFixed(1)}M)`;
  document.getElementById("valLtc").textContent = `${(ltc * 100).toFixed(0)}%`;
  document.getElementById("valDebtRate").textContent = `${(debtRate * 100).toFixed(2)}%`;
  document.getElementById("valYoc").textContent = `${yoc.toFixed(2)}%`;
  document.getElementById("headerSummary").textContent = `${halls} Halls · ${totalMw.toFixed(1)} MW · £${totalCapex.toFixed(1)}M Capex`;

  const landShellShare = landRatio + shellRatio;
  const ofciShare = ofciRatio;
  const yr2Ramp = Math.min(0.65, 0.3 * scheduleDragFactor);
  const yr3Ramp = Math.min(1, 0.8 * scheduleDragFactor);

  const cfBase = [
    -(totalEquity * landShellShare) - totalDebt * landShellShare * 0.5 * debtRate,
    -(totalEquity * ofciShare) - totalDebt * (landShellShare + ofciShare * 0.5) * debtRate,
    stabilizedNoi * yr2Ramp - annualDebtService,
    stabilizedNoi * yr3Ramp - annualDebtService,
    stabilizedNoi - annualDebtService,
    stabilizedNoi - annualDebtService + netExit,
    0
  ];

  const siteCarry = totalMw * 0.05;
  const cfDelay = [
    cfBase[0],
    cfBase[1],
    -annualDebtService - siteCarry,
    stabilizedNoi * yr2Ramp - annualDebtService,
    stabilizedNoi * yr3Ramp - annualDebtService,
    stabilizedNoi - annualDebtService,
    stabilizedNoi - annualDebtService + netExit
  ];

  const phase1Halls = Math.max(1, Math.round(halls / 3));
  const phase1Share = phase1Halls / halls;
  const yr2PhasedNoi = stabilizedNoi * phase1Share;
  const yr3PhasedNoi = stabilizedNoi * (phase1Share + (1 - phase1Share) * 0.5 * scheduleDragFactor);

  const cfPhasedUpfront = [
    cfBase[0],
    cfBase[1],
    yr2PhasedNoi - annualDebtService - siteCarry * 0.5,
    yr3PhasedNoi - annualDebtService,
    stabilizedNoi - annualDebtService,
    stabilizedNoi - annualDebtService + netExit,
    0
  ];

  const phase2OfciCapex = totalCapex * ofciShare * (1 - phase1Share);
  const phase1OfciCapex = totalCapex * ofciShare * phase1Share;
  const yr1DebtEnd = totalDebt * landShellShare + phase1OfciCapex * ltc;

  const cfPhasedOfci = [
    cfBase[0],
    -(phase1OfciCapex * (1 - ltc)) - (totalDebt * landShellShare + yr1DebtEnd) * 0.5 * debtRate,
    yr2PhasedNoi - (phase2OfciCapex * (1 - ltc)) - (yr1DebtEnd + totalDebt) * 0.5 * debtRate,
    yr3PhasedNoi - annualDebtService,
    stabilizedNoi - annualDebtService,
    stabilizedNoi - annualDebtService + netExit,
    0
  ];

  const rfsYears = totalWeeks / 52;
  const exitYears = rfsYears + 0.75;
  const preLeasedNoi = stabilizedNoi * 0.75;
  const preLeasedInterest = totalDebt * debtRate * 0.75;
  const preLeasedNetProceeds = preLeasedNoi - preLeasedInterest + netExit;
  const preLeasedTimedCfs = [
    [0, cfBase[0]],
    [1, cfBase[1]],
    [exitYears, preLeasedNetProceeds]
  ];
  const irrPreLeased = computeTimedIRR(preLeasedTimedCfs) * 100;

  // Map RFS + 9m cash flow onto annual Yr 0..6 buckets for chart/ledger display
  const exitBucket = Math.max(2, Math.min(6, Math.round(exitYears)));
  const cfPreLeased = [cfBase[0], cfBase[1], 0, 0, 0, 0, 0];
  cfPreLeased[exitBucket] = preLeasedNetProceeds;

  const irrBase = computeTimedIRR(cfBase.slice(0, 6).map((v, idx) => [idx, v])) * 100;
  const irrDelay = computeTimedIRR(cfDelay.map((v, idx) => [idx, v])) * 100;
  const irrPhasedUp = computeTimedIRR(cfPhasedUpfront.slice(0, 6).map((v, idx) => [idx, v])) * 100;
  const irrPhasedOfci = computeTimedIRR(cfPhasedOfci.slice(0, 6).map((v, idx) => [idx, v])) * 100;

  document.getElementById("kpiCapex").textContent = `£${totalCapex.toFixed(1)}M`;
  document.getElementById("kpiYoc").textContent = `Yield on Cost: ${yoc.toFixed(2)}%`;
  document.getElementById("kpiWeeks").textContent = `${totalWeeks} wks`;
  document.getElementById("kpiYears").textContent = `${buildYears.toFixed(2)} yrs total phases`;
  document.getElementById("kpiExit").textContent = `£${grossExit.toFixed(1)}M`;
  document.getElementById("kpiNoi").textContent = `Stabilized NOI: £${stabilizedNoi.toFixed(1)}M/yr`;
  document.getElementById("kpiIrrPreLeased").textContent = isFinite(irrPreLeased) ? `${irrPreLeased.toFixed(1)}%` : "N/A";
  document.getElementById("kpiExitTiming").textContent = `Exit ~${exitYears.toFixed(2)} yrs`;
  document.getElementById("kpiIrrBase").textContent = `${irrBase.toFixed(1)}%`;
  document.getElementById("kpiIrrPhased").textContent = `Staged OFCI IRR: ${irrPhasedOfci.toFixed(1)}%`;
  document.getElementById("kpiIrrDelay").textContent = `${irrDelay.toFixed(1)}%`;
  document.getElementById("kpiIrrSpread").textContent = `Delay Drag: ${Math.round((irrDelay - irrBase) * 100)} bps`;

  const cumBase = cumulative(cfBase.slice(0, 6)); cumBase.push(cumBase[5]);
  const cumPhasedOfci = cumulative(cfPhasedOfci.slice(0, 6)); cumPhasedOfci.push(cumPhasedOfci[5]);
  const cumPhasedUp = cumulative(cfPhasedUpfront.slice(0, 6)); cumPhasedUp.push(cumPhasedUp[5]);
  const cumDelay = cumulative(cfDelay);

  chart.data.datasets[0].data = cumBase;
  chart.data.datasets[1].data = cumPhasedOfci;
  chart.data.datasets[2].data = cumPhasedUp;
  chart.data.datasets[3].data = cumDelay;
  chart.data.datasets[4].data = cumulative(cfPreLeased);
  chart.update("none");

  const rows = [
    { name: "Baseline (On-Time, Yr 5 Exit)", cf: [...cfBase.slice(0, 6), null], irr: irrBase },
    { name: "Phased Power + Staged OFCI", cf: [...cfPhasedOfci.slice(0, 6), null], irr: irrPhasedOfci },
    { name: "Phased Power (Upfront OFCI)", cf: [...cfPhasedUpfront.slice(0, 6), null], irr: irrPhasedUp },
    { name: "12-Mo Grid Delay (Yr 6 Exit)", cf: cfDelay, irr: irrDelay },
    { name: "100% Pre-Leased · Exit RFS + 9 Mos", cf: cfPreLeased, irr: irrPreLeased }
  ];

  document.getElementById("ledgerBody").innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.name}</strong></td>
      ${r.cf.map(v => `<td class="${v === null ? "" : v >= 0 ? "pos" : "neg"}">${fmtM(v)}</td>`).join("")}
      <td><strong>${isFinite(r.irr) ? r.irr.toFixed(1) + "%" : "N/A"}</strong></td>
    </tr>
  `).join("");
}

els.landPct.addEventListener("input", () => { rebalanceBudgets("land"); update(); });
els.shellPct.addEventListener("input", () => { rebalanceBudgets("shell"); update(); });
els.ofciPct.addEventListener("input", () => { rebalanceBudgets("ofci"); update(); });
[els.grdMw, els.halls, els.costPerMw, els.rentPerMw, els.landWeeks, els.shellWeeks, els.ofciWeeks, els.ltc, els.debtRate, els.yocInput].forEach(el => {
  if (el) el.addEventListener("input", update);
});
document.getElementById("resetBtn").addEventListener("click", () => {
  phaseBudgets = { land: DEFAULTS.landPct, shell: DEFAULTS.shellPct, ofci: DEFAULTS.ofciPct };
  Object.entries(DEFAULTS).forEach(([k, v]) => { if (els[k]) els[k].value = v; });
  update();
});

update();
