"use strict";

const DEFAULTS = {
  grdMw: 2.5,
  halls: 4,
  costPerMw: 14.67,
  rentPerMw: 112.5,
  lockNoi: false,
  targetNoi: 12.0,
  landWeeks: 26,
  landPct: 20,
  shellWeeks: 40,
  shellPct: 45,
  ofciWeeks: 38,
  ofciPct: 35,
  ltc: 0,
  debtRate: 0.0,
  yocInput: 9.2
};

let phaseBudgets = {
  land: DEFAULTS.landPct,
  shell: DEFAULTS.shellPct,
  ofci: DEFAULTS.ofciPct
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = byId(id);
  if (el) el.textContent = text;
}

function fmtM(val) {
  if (!isFinite(val)) return "£0.0M";
  const sign = val < 0 ? "-" : "";
  return sign + "£" + Math.abs(val).toFixed(1) + "M";
}

function fmtLedger(val) {
  if (!isFinite(val)) return "£0.0M";
  const sign = val < 0 ? "-" : "+";
  return sign + "£" + Math.abs(val).toFixed(1) + "M";
}

function rebalanceBudgets(changed) {
  const landEl = byId("landPct");
  const shellEl = byId("shellPct");
  const ofciEl = byId("ofciPct");
  if (!landEl || !shellEl || !ofciEl) return;

  let land = +landEl.value || 0;
  let shell = +shellEl.value || 0;
  let ofci = +ofciEl.value || 0;

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
    land = Math.max(0, Math.min(100, land));
    shell = Math.max(0, Math.min(100 - land, shell));
    ofci = 100 - land - shell;
  } else if (changed === "ofci") {
    land = Math.max(0, Math.min(100, land));
    ofci = Math.max(0, Math.min(100 - land, ofci));
    shell = 100 - land - ofci;
  }

  phaseBudgets = { land: land, shell: shell, ofci: ofci };
  landEl.value = land;
  shellEl.value = shell;
  ofciEl.value = ofci;
}

function computeTimedIRR(timedCfs) {
  const valid = timedCfs.filter(function(pair) { return isFinite(pair[1]) && Math.abs(pair[1]) > 1e-9; });
  if (valid.length < 2) return NaN;
  const hasNeg = valid.some(function(pair) { return pair[1] < 0; });
  const hasPos = valid.some(function(pair) { return pair[1] > 0; });
  if (!hasNeg || !hasPos) return NaN;

  function npvAt(r) {
    return valid.reduce(function(acc, pair) { return acc + pair[1] / Math.pow(1 + r, pair[0]); }, 0);
  }
  let lo = -0.5;
  let hi = 3.0;
  if (npvAt(lo) < 0 || npvAt(hi) > 0) return NaN;

  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function cumulative(cf) {
  const out = [];
  let run = 0;
  for (let i = 0; i < cf.length; i++) {
    run += cf[i];
    out.push(+run.toFixed(2));
  }
  return out;
}

let cashChart = null;

function initChart() {
  const canvas = byId("cashChart");
  if (!canvas || typeof Chart === "undefined") return;
  const ctx = canvas.getContext("2d");
  cashChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Yr 0", "Yr 1", "Yr 2", "Yr 3", "Yr 4", "Yr 5", "Yr 6"],
      datasets: [
        { label: "Baseline (On-Time)", data: [], borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.12)", tension: 0.25, borderWidth: 2.5 },
        { label: "Phased Power + Staged OFCI", data: [], borderColor: "#34d399", tension: 0.25, borderWidth: 2 },
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
        legend: { labels: { color: "#cbd5e1", boxWidth: 14 } }
      },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } },
        y: {
          ticks: {
            color: "#94a3b8",
            callback: function(v) { return "£" + v + "M"; }
          },
          grid: { color: "rgba(148,163,184,0.12)" }
        }
      }
    }
  });
}

function numVal(id, fallback) {
  const el = byId(id);
  return el ? +el.value : fallback;
}

function update() {
  const grdMw = numVal("grdMw", DEFAULTS.grdMw);
  const halls = numVal("halls", DEFAULTS.halls);
  const costPerMw = numVal("costPerMw", DEFAULTS.costPerMw);
  const ltcPct = numVal("ltc", DEFAULTS.ltc);
  const debtRatePct = numVal("debtRate", DEFAULTS.debtRate);
  const yocPct = numVal("yocInput", DEFAULTS.yocInput);

  const landWeeks = numVal("landWeeks", DEFAULTS.landWeeks);
  const shellWeeks = numVal("shellWeeks", DEFAULTS.shellWeeks);
  const ofciWeeks = numVal("ofciWeeks", DEFAULTS.ofciWeeks);

  const landRatio = phaseBudgets.land / 100;
  const shellRatio = phaseBudgets.shell / 100;
  const ofciRatio = phaseBudgets.ofci / 100;

  const totalMw = halls * grdMw;
  const totalCapex = totalMw * costPerMw;
  const totalDebt = totalCapex * (ltcPct / 100);
  const totalEquity = totalCapex - totalDebt;
  const debtRate = debtRatePct / 100;
  const yocRatio = yocPct / 100;
  const exitCap = 0.055;

  // Stabilized NOI can either be derived from Capacity x Rent (Auto) or locked to a target £M/yr
  // (when locked, implied Net Rent in £/kW/mo is back-solved so MW, Rent, and NOI stay consistent).
  const lockEl = byId("lockNoi");
  const rentEl = byId("rentPerMw");
  const targetEl = byId("targetNoi");
  const isNoiLocked = !!(lockEl && lockEl.checked);

  let rentPerMw = rentEl ? +rentEl.value : DEFAULTS.rentPerMw;
  let stabilizedNoi;

  const targetWrap = byId("targetNoiWrap");
  const modeComment = byId("noiModeComment");
  if (targetWrap) targetWrap.style.display = isNoiLocked ? "block" : "none";

  if (isNoiLocked) {
    stabilizedNoi = targetEl ? +targetEl.value : DEFAULTS.targetNoi;
    rentPerMw = totalMw > 0 ? stabilizedNoi / (totalMw * 0.012) : 0;
    if (rentEl) rentEl.disabled = true;
    setText("valTargetNoi", "£" + stabilizedNoi.toFixed(1) + "M/yr");
    if (modeComment) {
      modeComment.textContent = "Target NOI locked at £" + stabilizedNoi.toFixed(1) + "M/yr; implied Net Rent is back-solved to £" + rentPerMw.toFixed(2) + "/kW/mo.";
    }
  } else {
    if (rentEl) rentEl.disabled = false;
    stabilizedNoi = totalMw * rentPerMw * 0.012;
    if (targetEl) {
      const minVal = +targetEl.min || 5;
      const maxVal = +targetEl.max || 250;
      const clampedNoi = Math.max(minVal, Math.min(maxVal, +stabilizedNoi.toFixed(1)));
      targetEl.value = clampedNoi;
      setText("valTargetNoi", "£" + stabilizedNoi.toFixed(1) + "M/yr");
    }
    if (modeComment) {
      modeComment.textContent = "Auto mode: Stabilized NOI is calculated from Capacity (MW) × Rent (£/kW/mo) × 0.012.";
    }
  }

  setText("valGrdMw", grdMw.toFixed(1) + " MW");
  setText("labelHalls", "GRD Data Halls (" + grdMw.toFixed(1) + " MW each)");
  setText("pageTitle", grdMw.toFixed(1) + " MW GRD Data Centre IRR & Cash Flow Explorer");
  setText("pageSubtitle", "Modular Data Hall Scaling (" + grdMw.toFixed(1) + " MW GRD), Phase Durations (Weeks), Leverage & Yield on Cost");
  setText("valHalls", halls + " halls (" + totalMw.toFixed(1) + " MW)");
  setText("valCostPerMw", "£" + costPerMw.toFixed(2) + "M/MW");
  setText("valRentPerMw", "£" + rentPerMw.toFixed(2) + "/kW/mo");

  setText("valLandWeeks", landWeeks + " wks");
  setText("valLandPct", phaseBudgets.land + "% (£" + (totalCapex * landRatio).toFixed(1) + "M)");
  setText("valShellWeeks", shellWeeks + " wks");
  setText("valShellPct", phaseBudgets.shell + "% (£" + (totalCapex * shellRatio).toFixed(1) + "M)");
  setText("valOfciWeeks", ofciWeeks + " wks");
  setText("valOfciPct", phaseBudgets.ofci + "% (£" + (totalCapex * ofciRatio).toFixed(1) + "M)");

  setText("valLtc", ltcPct + "%");
  setText("valDebtRate", debtRatePct.toFixed(2) + "%");
  setText("valYoc", yocPct.toFixed(2) + "%");

  const totalWeeks = landWeeks + shellWeeks + ofciWeeks;
  const buildYears = totalWeeks / 52;
  const grossExit = (totalCapex * yocRatio) / exitCap;
  const netExit = grossExit - totalDebt;

  setText("headerSummary", halls + " Halls · " + totalMw.toFixed(1) + " MW · " + fmtM(totalCapex) + " Capex");
  setText("kpiCapex", fmtM(totalCapex));
  setText("kpiYoc", "Yield on Cost: " + yocPct.toFixed(2) + "%");
  setText("kpiSchedule", totalWeeks + " wks");
  setText("kpiScheduleSub", buildYears.toFixed(2) + " yrs total phases");
  setText("kpiExit", fmtM(grossExit));
  setText("kpiNoi", "Stabilized NOI: £" + stabilizedNoi.toFixed(1) + "M/yr (" + (isNoiLocked ? "Locked" : "Auto") + ")");

  const capexYr0 = totalEquity * 0.5;
  const capexYr1 = totalEquity * 0.5;
  const annualInterest = totalDebt * debtRate;
  const annualLeveredCash = stabilizedNoi - annualInterest;

  const cfBase = [
    -capexYr0,
    -capexYr1,
    stabilizedNoi * 0.35 - annualInterest,
    stabilizedNoi * 0.75 - annualInterest,
    annualLeveredCash,
    annualLeveredCash + netExit,
    0
  ];

  const stagedFactor = 0.96 + 0.08 * (landRatio + shellRatio);
  const cfPhasedStaged = [
    -capexYr0 * (0.85 + 0.15 * landRatio),
    -capexYr1 * (0.90 + 0.10 * shellRatio),
    stabilizedNoi * 0.45 * stagedFactor - annualInterest,
    stabilizedNoi * 0.85 * stagedFactor - annualInterest,
    annualLeveredCash * 1.03,
    annualLeveredCash * 1.03 + netExit * 1.02,
    0
  ];

  const cfPhasedUpfront = [
    -capexYr0 * (0.95 + 0.05 * ofciRatio),
    -capexYr1 * (1.0 + 0.05 * ofciRatio),
    stabilizedNoi * 0.42 - annualInterest,
    stabilizedNoi * 0.80 - annualInterest,
    annualLeveredCash,
    annualLeveredCash + netExit,
    0
  ];

  const cfDelay = [
    -capexYr0,
    -capexYr1,
    -annualInterest,
    stabilizedNoi * 0.35 - annualInterest,
    stabilizedNoi * 0.75 - annualInterest,
    annualLeveredCash,
    annualLeveredCash + netExit
  ];

  const rfsYears = Math.max(0.5, totalWeeks / 52);
  const exitYears = rfsYears + 0.75;
  const preLeasedNoi = stabilizedNoi * 0.75;
  const preLeasedInterest = totalDebt * debtRate * 0.75;
  const preLeasedNetProceeds = preLeasedNoi - preLeasedInterest + netExit;
  const irrPreLeased = computeTimedIRR([
    [0, cfBase[0]],
    [1, cfBase[1]],
    [exitYears, preLeasedNetProceeds]
  ]) * 100;

  const exitBucket = Math.max(2, Math.min(6, Math.round(exitYears)));
  const cfPreLeased = [cfBase[0], cfBase[1], 0, 0, 0, 0, 0];
  cfPreLeased[exitBucket] = preLeasedNetProceeds;

  const irrBase = computeTimedIRR(cfBase.slice(0, 6).map(function(v, idx) { return [idx, v]; })) * 100;
  const irrStaged = computeTimedIRR(cfPhasedStaged.slice(0, 6).map(function(v, idx) { return [idx, v]; })) * 100;
  const irrUpfront = computeTimedIRR(cfPhasedUpfront.slice(0, 6).map(function(v, idx) { return [idx, v]; })) * 100;
  const irrDelay = computeTimedIRR(cfDelay.map(function(v, idx) { return [idx, v]; })) * 100;

  setText("kpiIrrPreLeased", isFinite(irrPreLeased) ? irrPreLeased.toFixed(1) + "%" : "N/A");
  setText("kpiExitTiming", "Exit ~" + exitYears.toFixed(2) + " yrs");
  setText("kpiIrrBase", isFinite(irrBase) ? irrBase.toFixed(1) + "%" : "N/A");
  setText("kpiIrrStaged", isFinite(irrStaged) ? "Staged OFCI IRR: " + irrStaged.toFixed(1) + "%" : "Staged OFCI IRR: N/A");
  setText("kpiIrrDelay", isFinite(irrDelay) ? irrDelay.toFixed(1) + "%" : "N/A");
  const dragBps = isFinite(irrBase) && isFinite(irrDelay) ? Math.round((irrDelay - irrBase) * 100) : 0;
  setText("kpiDelayDrag", "Delay Drag: " + (dragBps >= 0 ? "+" : "") + dragBps + " bps");

  if (cashChart && cashChart.data && Array.isArray(cashChart.data.datasets)) {
    const ds = cashChart.data.datasets;
    if (ds[0]) ds[0].data = cumulative(cfBase);
    if (ds[1]) ds[1].data = cumulative(cfPhasedStaged);
    if (ds[2]) ds[2].data = cumulative(cfPhasedUpfront);
    if (ds[3]) ds[3].data = cumulative(cfDelay);
    if (ds[4]) ds[4].data = cumulative(cfPreLeased);
    cashChart.update("none");
  }

  const tbody = byId("ledgerBody") || document.querySelector("#ledgerTable tbody") || document.querySelector("table tbody");
  if (tbody) {
    const rows = [
      { name: "Baseline (On-Time, Yr 5 Exit)", cf: cfBase, irr: irrBase },
      { name: "Phased Power + Staged OFCI", cf: cfPhasedStaged, irr: irrStaged },
      { name: "Phased Power (Upfront OFCI)", cf: cfPhasedUpfront, irr: irrUpfront },
      { name: "12-Mo Grid Delay (Yr 6 Exit)", cf: cfDelay, irr: irrDelay },
      { name: "100% Pre-Leased · Exit RFS + 9 Mos", cf: cfPreLeased, irr: irrPreLeased }
    ];

    tbody.innerHTML = rows.map(function(r) {
      const cells = r.cf.map(function(v) { return "<td>" + fmtLedger(v) + "</td>"; }).join("");
      const irrText = isFinite(r.irr) ? r.irr.toFixed(1) + "%" : "N/A";
      return "<tr><td><strong>" + r.name + "</strong></td>" + cells + "<td><strong>" + irrText + "</strong></td></tr>";
    }).join("");
  }
}

function resetDefaults() {
  phaseBudgets = {
    land: DEFAULTS.landPct,
    shell: DEFAULTS.shellPct,
    ofci: DEFAULTS.ofciPct
  };

  Object.keys(DEFAULTS).forEach(function(k) {
    const el = byId(k);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(DEFAULTS[k]);
    else el.value = DEFAULTS[k];
  });

  update();
}

function bindControls() {
  [
    "grdMw", "halls", "costPerMw", "rentPerMw", "lockNoi", "targetNoi",
    "landWeeks", "shellWeeks", "ofciWeeks", "ltc", "debtRate", "yocInput"
  ].forEach(function(id) {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  const landPctEl = byId("landPct");
  if (landPctEl) {
    landPctEl.addEventListener("input", function() { rebalanceBudgets("land"); update(); });
    landPctEl.addEventListener("change", function() { rebalanceBudgets("land"); update(); });
  }

  const shellPctEl = byId("shellPct");
  if (shellPctEl) {
    shellPctEl.addEventListener("input", function() { rebalanceBudgets("shell"); update(); });
    shellPctEl.addEventListener("change", function() { rebalanceBudgets("shell"); update(); });
  }

  const ofciPctEl = byId("ofciPct");
  if (ofciPctEl) {
    ofciPctEl.addEventListener("input", function() { rebalanceBudgets("ofci"); update(); });
    ofciPctEl.addEventListener("change", function() { rebalanceBudgets("ofci"); update(); });
  }

  const resetBtn = byId("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetDefaults);
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initChart();
  bindControls();
  update();
});