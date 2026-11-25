const GRD_MW = 4.5;
const DEFAULTS = {
  halls: 7,
  costPerMw: 14.67,
  rentPerMw: 1.35,
  landWeeks: 26,
  shellWeeks: 40,
  ofciWeeks: 38,
  ltc: 60,
  debtRate: 0,
  exitCap: 5.5
};

const els = {
  halls: document.getElementById("halls"),
  costPerMw: document.getElementById("costPerMw"),
  rentPerMw: document.getElementById("rentPerMw"),
  landWeeks: document.getElementById("landWeeks"),
  shellWeeks: document.getElementById("shellWeeks"),
  ofciWeeks: document.getElementById("ofciWeeks"),
  ltc: document.getElementById("ltc"),
  debtRate: document.getElementById("debtRate"),
  exitCap: document.getElementById("exitCap")
};

function computeIRR(cf) {
  let r = 0.15;
  for (let i = 0; i < 100; i++) {
    let n = 0, d = 0;
    for (let t = 0; t < cf.length; t++) {
      const p = Math.pow(1 + r, t);
      n += cf[t] / p;
      if (t > 0) d -= (t * cf[t]) / Math.pow(1 + r, t + 1);
    }
    if (Math.abs(n) < 1e-6) return r;
    if (Math.abs(d) < 1e-9) break;
    r -= n / d;
    if (r <= -0.95) r = -0.5;
  }
  return isFinite(r) ? r : NaN;
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
      { label: "12-Mo Grid Delay (Yr 6 Exit)", data: [], borderColor: "#f87171", tension: 0.25, borderWidth: 2.5, borderDash: [6, 4] }
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

function update() {
  const halls = +els.halls.value;
  const costPerMw = +els.costPerMw.value;
  const rentPerMw = +els.rentPerMw.value;
  const landWeeks = +els.landWeeks.value;
  const shellWeeks = +els.shellWeeks.value;
  const ofciWeeks = +els.ofciWeeks.value;
  const ltc = +els.ltc.value / 100;
  const debtRate = +els.debtRate.value / 100;
  const exitCap = +els.exitCap.value / 100;

  const totalMw = halls * GRD_MW;
  const totalCapex = totalMw * costPerMw;
  const totalDebt = totalCapex * ltc;
  const totalEquity = totalCapex - totalDebt;
  const annualDebtService = totalDebt * debtRate;
  const stabilizedNoi = totalMw * rentPerMw;
  const yoc = (stabilizedNoi / totalCapex) * 100;
  const grossExit = stabilizedNoi / exitCap;
  const netExit = grossExit - totalDebt;

  const totalWeeks = landWeeks + shellWeeks + ofciWeeks;
  const buildYears = totalWeeks / 52;
  const scheduleDragFactor = Math.max(0.5, Math.min(1.5, 104 / totalWeeks));

  document.getElementById("valHalls").textContent = `${halls} ${halls === 1 ? "hall" : "halls"} (${totalMw.toFixed(1)} MW)`;
  document.getElementById("valCostPerMw").textContent = `£${costPerMw.toFixed(2)}M/MW`;
  document.getElementById("valRentPerMw").textContent = `£${rentPerMw.toFixed(2)}M/MW/yr`;
  document.getElementById("valLandWeeks").textContent = `${landWeeks} wks`;
  document.getElementById("valShellWeeks").textContent = `${shellWeeks} wks`;
  document.getElementById("valOfciWeeks").textContent = `${ofciWeeks} wks`;
  document.getElementById("valLtc").textContent = `${(ltc * 100).toFixed(0)}%`;
  document.getElementById("valDebtRate").textContent = `${(debtRate * 100).toFixed(2)}%`;
  document.getElementById("valExitCap").textContent = `${(exitCap * 100).toFixed(2)}%`;
  document.getElementById("headerSummary").textContent = `${halls} Halls · ${totalMw.toFixed(1)} MW · £${totalCapex.toFixed(1)}M Capex`;

  const landShellShare = (landWeeks + shellWeeks) / totalWeeks;
  const ofciShare = ofciWeeks / totalWeeks;
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

  const irrBase = computeIRR(cfBase.slice(0, 6)) * 100;
  const irrDelay = computeIRR(cfDelay) * 100;
  const irrPhasedUp = computeIRR(cfPhasedUpfront.slice(0, 6)) * 100;
  const irrPhasedOfci = computeIRR(cfPhasedOfci.slice(0, 6)) * 100;

  document.getElementById("kpiCapex").textContent = `£${totalCapex.toFixed(1)}M`;
  document.getElementById("kpiYoc").textContent = `Yield on Cost: ${yoc.toFixed(2)}%`;
  document.getElementById("kpiWeeks").textContent = `${totalWeeks} wks`;
  document.getElementById("kpiYears").textContent = `${buildYears.toFixed(2)} yrs total phases`;
  document.getElementById("kpiExit").textContent = `£${grossExit.toFixed(1)}M`;
  document.getElementById("kpiNoi").textContent = `Stabilized NOI: £${stabilizedNoi.toFixed(1)}M/yr`;
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
  chart.update("none");

  const rows = [
    { name: "Baseline (On-Time, Yr 5 Exit)", cf: [...cfBase.slice(0, 6), null], irr: irrBase },
    { name: "Phased Power + Staged OFCI", cf: [...cfPhasedOfci.slice(0, 6), null], irr: irrPhasedOfci },
    { name: "Phased Power (Upfront OFCI)", cf: [...cfPhasedUpfront.slice(0, 6), null], irr: irrPhasedUp },
    { name: "12-Mo Grid Delay (Yr 6 Exit)", cf: cfDelay, irr: irrDelay }
  ];

  document.getElementById("ledgerBody").innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.name}</strong></td>
      ${r.cf.map(v => `<td class="${v === null ? "" : v >= 0 ? "pos" : "neg"}">${fmtM(v)}</td>`).join("")}
      <td><strong>${isFinite(r.irr) ? r.irr.toFixed(1) + "%" : "N/A"}</strong></td>
    </tr>
  `).join("");
}

Object.values(els).forEach(el => el.addEventListener("input", update));
document.getElementById("resetBtn").addEventListener("click", () => {
  Object.entries(DEFAULTS).forEach(([k, v]) => { els[k].value = v; });
  update();
});

update();
