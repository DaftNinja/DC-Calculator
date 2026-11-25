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
let baselineIrrChart = null;

function initChart() {
  const canvas = byId("cashChart") || document.querySelector("canvas");
  if (!canvas || typeof Chart === "undefined") return;
  if (!canvas.parentElement || canvas.parentElement.clientHeight === 0) {
    canvas.style.height = "300px";
  }
  if (cashChart && typeof cashChart.destroy === "function") {
    cashChart.destroy();
  }
  const monthlyLabels = [];
  for (let m = 0; m <= 72; m++) {
    if (m % 12 === 0) {
      monthlyLabels.push("Yr " + (m / 12));
    } else {
      monthlyLabels.push("");
    }
  }
  const monthlyQuarterlyTicksPlugin = {
    id: "monthlyQuarterlyTicksPlugin",
    afterTicksTickDraw: null,
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales && scales.x;
      if (!chartArea || !xScale) return;
      const baseY = chartArea.bottom;
      ctx.save();
      for (let m = 0; m <= 72; m++) {
        const xPos = xScale.getPixelForValue(m);
        if (!isFinite(xPos)) continue;
        const isYear = m % 12 === 0;
        const isQuarter = !isYear && m % 3 === 0;
        const tickLen = isYear ? 9 : (isQuarter ? 7 : 3);
        ctx.beginPath();
        ctx.lineWidth = isYear ? 1.5 : (isQuarter ? 1.2 : 0.8);
        ctx.strokeStyle = isYear
          ? "rgba(148,163,184,0.45)"
          : (isQuarter ? "rgba(148,163,184,0.32)" : "rgba(148,163,184,0.16)");
        ctx.moveTo(xPos, baseY);
        ctx.lineTo(xPos, baseY + tickLen);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  const ctx = canvas.getContext("2d");
  cashChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: monthlyLabels,
      datasets: [
        { label: "Baseline (On-Time)", data: [], borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.12)", tension: 0.25, borderWidth: 2.5, pointRadius: function(c) { return c.dataIndex % 12 === 0 ? 3.5 : 0; } },
        { label: "Phased Power + Staged OFCI", data: [], borderColor: "#34d399", tension: 0.25, borderWidth: 2, pointRadius: function(c) { return c.dataIndex % 12 === 0 ? 3 : 0; } },
        { label: "Phased Power (Upfront OFCI)", data: [], borderColor: "#a78bfa", tension: 0.25, borderWidth: 2, pointRadius: function(c) { return c.dataIndex % 12 === 0 ? 3 : 0; } },
{ label: "100% Pre-Leased (Exit RFS + 9 Mos)", data: [], borderColor: "#fbbf24", tension: 0.25, borderWidth: 2.5, pointRadius: function(c) { return c.dataIndex % 12 === 0 ? 3 : 0; } }
      ]
    },
    plugins: [monthlyQuarterlyTicksPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#cbd5e1", boxWidth: 14 } }
      },
      scales: {
        x: {
          ticks: {
            color: "#94a3b8",
            autoSkip: false,
            maxRotation: 0,
            callback: function(val, idx) {
              return idx % 12 === 0 ? "Yr " + (idx / 12) : "";
            }
          },
          grid: {
            display: false,
            tickLength: 0
          }
        },
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

function computeOfciHallNoi(totalNoi, hallCount, landWks, shellWks, ofciWks, horizonYears) {
  const nHalls = Math.max(1, Math.round(hallCount));
  const ofciStart = Math.max(0, (landWks + shellWks) / 52);
  const ofciSpan = Math.max(0.05, ofciWks / 52);
  const perHallNoi = totalNoi / nHalls;

  // Integrate hall-by-hall NOI across [0, horizonYears]: hall k (1..nHalls) comes live at ofciStart + (k / nHalls) * ofciSpan
  const steps = 200;
  const dt = horizonYears / steps;
  let totalEarned = 0;

  for (let i = 0; i < steps; i++) {
    const tMid = (i + 0.5) * dt;
    if (tMid <= ofciStart) continue;
    let activeHalls = 0;
    for (let k = 1; k <= nHalls; k++) {
      const hallRfsTime = ofciStart + (k / nHalls) * ofciSpan;
      if (tMid >= hallRfsTime) activeHalls += 1;
    }
    totalEarned += activeHalls * perHallNoi * dt;
  }
  return totalEarned;
}

function computeFourMonthPhasedNoi(totalNoi, hallCount, landWks, shellWks, ofciWks, horizonYears) {
  const nHalls = Math.max(1, Math.round(hallCount));
  // First RFS occurs after Land & Power + Shell & Core; subsequent tranches step every 4 months (1/3 yr)
  const firstRfsYears = Math.max(0, (landWks + shellWks) / 52);
  const stepYears = 4 / 12;
  const tranches = Math.max(1, nHalls);
  const steps = 240;
  const dt = horizonYears / steps;
  let earned = 0;

  for (let i = 0; i < steps; i++) {
    const tMid = (i + 0.5) * dt;
    if (tMid < firstRfsYears) continue;
    const elapsedSinceFirstRfs = tMid - firstRfsYears;
    const unlockedTranches = Math.min(tranches, 1 + Math.floor(elapsedSinceFirstRfs / stepYears));
    const activeShare = unlockedTranches / tranches;
    earned += totalNoi * activeShare * dt;
  }
  return earned;
}

function initBaselineIrrChart() {
  const canvas = byId("baselineIrrChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (baselineIrrChart && typeof baselineIrrChart.destroy === "function") {
    baselineIrrChart.destroy();
  }
  const quarterlyLabels = [];
  for (let q = 0; q <= 24; q++) {
    if (q % 4 === 0) {
      quarterlyLabels.push("Yr " + (q / 4));
    } else {
      quarterlyLabels.push("Q" + (q % 4));
    }
  }
  const hurdle16LinePlugin = {
    id: "hurdle16LinePlugin",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales || !scales.y) return;
      const y16 = scales.y.getPixelForValue(16);
      if (!isFinite(y16)) return;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ef4444";
      ctx.moveTo(chartArea.left, y16);
      ctx.lineTo(chartArea.right, y16);
      ctx.stroke();
      ctx.restore();
    }
  };
  const ctx = canvas.getContext("2d");
  baselineIrrChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: quarterlyLabels,
      datasets: [
        {
          label: "Baseline Levered IRR (%)",
          data: [],
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56,189,248,0.14)",
          fill: true,
          tension: 0.25,
          borderWidth: 2.5,
          pointRadius: function(context) {
            return context.dataIndex % 4 === 0 ? 4 : 1.5;
          },
          spanGaps: false
        },
        {
          label: "16% Hurdle",
          data: [],
          borderColor: "#ef4444",
          backgroundColor: "#ef4444",
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    plugins: [hurdle16LinePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "#cbd5e1", boxWidth: 14 } }
      },
      scales: {
        x: {
          stacked: false,
          ticks: {
            color: function(context) {
              return context.index % 4 === 0 ? "#cbd5e1" : "#64748b";
            },
            font: function(context) {
              return { weight: context.index % 4 === 0 ? "700" : "400", size: context.index % 4 === 0 ? 11 : 10 };
            },
            autoSkip: false,
            maxRotation: 0
          },
          grid: {
            color: function(context) {
              return context.index % 4 === 0 ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.08)";
            },
            tickLength: 6
          }
        },
        y: {
          stacked: false,
          ticks: {
            color: "#94a3b8",
            callback: function(v) { return v + "%"; }
          },
          grid: { color: "rgba(148,163,184,0.12)" }
        }
      }
    }
  });
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

  // Sequential stage tranches: Land & Power -> Shell & Core -> OFCI (Fit-Out)
  const tLandYr = landWeeks / 52;
  const tShellYr = (landWeeks + shellWeeks) / 52;
  const tOfciYr = totalWeeks / 52;

  const landCapex = totalCapex * landRatio;
  const shellCapex = totalCapex * shellRatio;
  const ofciCapex = totalCapex * ofciRatio;

  const debtLand = landCapex * (ltcPct / 100);
  const debtShell = shellCapex * (ltcPct / 100);
  const debtOfci = ofciCapex * (ltcPct / 100);

  const eqLand = landCapex - debtLand;
  const eqShell = shellCapex - debtShell;
  const eqOfci = ofciCapex - debtOfci;

  function cumulativeDrawnDebtAt(yr) {
    let drawn = 0;
    if (yr >= 0) {
      const fracLand = tLandYr > 0 ? Math.min(1, Math.max(0, yr / tLandYr)) : 1;
      drawn += debtLand * fracLand;
    }
    if (yr > tLandYr) {
      const durShell = Math.max(0.01, tShellYr - tLandYr);
      const fracShell = Math.min(1, Math.max(0, (yr - tLandYr) / durShell));
      drawn += debtShell * fracShell;
    }
    if (yr > tShellYr) {
      const durOfci = Math.max(0.01, tOfciYr - tShellYr);
      const fracOfci = Math.min(1, Math.max(0, (yr - tShellYr) / durOfci));
      drawn += debtOfci * fracOfci;
    }
    return Math.min(totalDebt, drawn);
  }

  function stageInterestForYear(yrStart, yrEnd, delayExtraYrs) {
    const s = Math.max(0, yrStart + (delayExtraYrs || 0));
    const e = Math.max(s, yrEnd + (delayExtraYrs || 0));
    const midDebt = cumulativeDrawnDebtAt((s + e) / 2);
    return midDebt * debtRate * (e - s);
  }

  // Baseline = Merchant/Flip exit 9 months (0.75 yr) after build completion
  const flipCompletionYr = Math.max(0.25, totalWeeks / 52);
  const flipExitYr = flipCompletionYr + 0.75;
  const flipBucket = Math.max(1, Math.min(6, Math.round(flipExitYr)));

  // Bulk OFCI capex efficiency (6% savings on OFCI capex) when committing OFCI upfront
  const upfrontOfciDiscount = 0.94;
  const upfrontOfciCapex = ofciCapex * upfrontOfciDiscount;
  const upfrontDebtOfci = upfrontOfciCapex * (ltcPct / 100);
  const upfrontEqOfci = upfrontOfciCapex - upfrontDebtOfci;
  const upfrontTotalCapex = landCapex + shellCapex + upfrontOfciCapex;
  const upfrontTotalDebt = debtLand + debtShell + upfrontDebtOfci;
  const upfrontTotalEquity = upfrontTotalCapex - upfrontTotalDebt;
  const upfrontNetExit = grossExit - upfrontTotalDebt;

  const capexYr0 = eqLand + eqShell * Math.min(1, Math.max(0, (1 - tLandYr) / Math.max(0.01, tShellYr - tLandYr)));
  const capexYr1 = Math.max(0, totalEquity - capexYr0);
  const annualInterest = totalDebt * debtRate;
  const intYr2 = stageInterestForYear(2, 3, 0);
  const intYr3 = stageInterestForYear(3, 4, 0);
  const intYr4 = stageInterestForYear(4, 5, 0);
  const intYr5 = stageInterestForYear(5, 6, 0);
  const annualLeveredCash = stabilizedNoi - intYr4;

  // Baseline 9-month post-completion flip cash flows across Yr 0..6
  const flipCarryInterest = (cumulativeDrawnDebtAt(flipCompletionYr) * debtRate * flipCompletionYr) +
    (totalDebt * debtRate * 0.75);
  const flip9mNoi = stabilizedNoi * 0.75 * 0.65;
  const flipNetProceeds = flip9mNoi - flipCarryInterest + netExit;

  const cfBase = [0, 0, 0, 0, 0, 0, 0];
  cfBase[0] = -Math.min(totalEquity, capexYr0);
  if (flipBucket >= 2) {
    cfBase[1] = -Math.max(0, totalEquity - Math.abs(cfBase[0]));
    cfBase[flipBucket] = flipNetProceeds;
  } else {
    cfBase[1] = -(Math.max(0, totalEquity - Math.abs(cfBase[0]))) + flipNetProceeds;
  }

  // Phased Power + Staged OFCI: defers OFCI capital until power/halls advance (lower early carry, staged ramp)
  const stagedFactor = 0.96 + 0.08 * (landRatio + shellRatio);
  const stagedEarlyEq = eqLand * 0.85 + eqShell * 0.35;
  const stagedLateEq = Math.max(0, totalEquity - stagedEarlyEq);
  const stagedCarryInt = ((debtLand * 0.5 + debtShell * 0.35 + debtOfci * 0.15) * debtRate * (flipExitYr));
  const stagedNoi = stabilizedNoi * 0.75 * 0.62 * stagedFactor;
  const stagedExitProceeds = stagedNoi - stagedCarryInt + netExit * 1.01;
  const cfPhasedStaged = [0, 0, 0, 0, 0, 0, 0];
  cfPhasedStaged[0] = -stagedEarlyEq;
  if (flipBucket >= 2) {
    cfPhasedStaged[1] = -stagedLateEq;
    cfPhasedStaged[flipBucket] = stagedExitProceeds;
  } else {
    cfPhasedStaged[1] = -stagedLateEq + stagedExitProceeds;
  }

  // Phased Power (Upfront OFCI): bulk OFCI capex savings + faster early monetization, traded against earlier spend & carry
  const upfrontEarlyEq = Math.min(upfrontTotalEquity, eqLand + eqShell * 0.75 + upfrontEqOfci * 0.65);
  const upfrontLateEq = Math.max(0, upfrontTotalEquity - upfrontEarlyEq);
  const upfrontCarryInt = ((debtLand * 0.6 + debtShell * 0.6 + upfrontDebtOfci * 0.75) * debtRate * flipExitYr);
  const upfrontFastNoi = stabilizedNoi * 0.75 * 0.85;
  const upfrontExitProceeds = upfrontFastNoi - upfrontCarryInt + upfrontNetExit;
  const cfPhasedUpfront = [0, 0, 0, 0, 0, 0, 0];
  cfPhasedUpfront[0] = -upfrontEarlyEq;
  if (flipBucket >= 2) {
    cfPhasedUpfront[1] = -upfrontLateEq;
    cfPhasedUpfront[flipBucket] = upfrontExitProceeds;
  } else {
    cfPhasedUpfront[1] = -upfrontLateEq + upfrontExitProceeds;
  }

  // 12-Mo Grid Delay (Yr 6 Exit): 1-year delay pushes completion and exit out by 12 months
  const delayExitYr = Math.min(6, flipExitYr + 1.0);
  const delayBucket = Math.max(2, Math.min(6, Math.round(delayExitYr)));
  const delayCarryInt = flipCarryInterest + totalDebt * debtRate * 1.0;
  const delayProceeds = flip9mNoi - delayCarryInt + netExit;
  const cfDelay = [0, 0, 0, 0, 0, 0, 0];
  cfDelay[0] = cfBase[0];
  cfDelay[1] = cfBase[1];
  cfDelay[delayBucket] = delayProceeds;

  // RFS occurs strictly during the OFCI phase, hall by hall (1..halls),
  // followed by a 9-month (0.75 yr) post-final-RFS operating window prior to exit.
  const finalRfsYears = Math.max(0.25, totalWeeks / 52);
  const exitYears = finalRfsYears + 0.75;
  const ofciRampNoi = computeOfciHallNoi(stabilizedNoi, halls, landWeeks, shellWeeks, ofciWeeks, finalRfsYears);
  const postRfs9mNoi = stabilizedNoi * 0.75;
  const preLeasedNoi = ofciRampNoi + postRfs9mNoi;
  const avgDrawnDebtPreLeased = (
    debtLand * Math.min(1, exitYears / Math.max(0.01, tLandYr)) +
    debtShell * Math.min(1, Math.max(0, exitYears - tLandYr) / Math.max(0.01, tShellYr - tLandYr)) +
    debtOfci * Math.min(1, Math.max(0, exitYears - tShellYr) / Math.max(0.01, tOfciYr - tShellYr))
  ) / 3;
  const preLeasedInterest = avgDrawnDebtPreLeased * debtRate * exitYears;
  const preLeasedNetProceeds = preLeasedNoi - preLeasedInterest + netExit;
  const irrPreLeased = computeTimedIRR([
    [0, cfBase[0]],
    [1, cfBase[1]],
    [exitYears, preLeasedNetProceeds]
  ]) * 100;

  const exitBucket = Math.max(2, Math.min(6, Math.round(exitYears)));
  const cfPreLeased = [cfBase[0], cfBase[1], 0, 0, 0, 0, 0];
  cfPreLeased[exitBucket] = preLeasedNetProceeds;

  const irrBase = computeTimedIRR([
    [0, cfBase[0]],
    [1, cfBase[1]],
    [flipExitYr, flipNetProceeds]
  ]) * 100;
  const irrStaged = computeTimedIRR([
    [0, cfPhasedStaged[0]],
    [1, cfPhasedStaged[1]],
    [flipExitYr, stagedExitProceeds]
  ]) * 100;
  const irrUpfront = computeTimedIRR([
    [0, cfPhasedUpfront[0]],
    [1, cfPhasedUpfront[1]],
    [flipExitYr, upfrontExitProceeds]
  ]) * 100;
  const irrDelay = computeTimedIRR([
    [0, cfDelay[0]],
    [1, cfDelay[1]],
    [delayExitYr, delayProceeds]
  ]) * 100;

  setText("kpiIrrPreLeased", isFinite(irrPreLeased) ? irrPreLeased.toFixed(1) + "%" : "N/A");
  setText("kpiExitTiming", "OFCI RFS (" + halls + " halls) + 9m · ~" + exitYears.toFixed(2) + " yrs");
  setText("kpiIrrBase", isFinite(irrBase) ? irrBase.toFixed(1) + "%" : "N/A");
  setText("kpiIrrStaged", isFinite(irrStaged) ? "Staged OFCI IRR: " + irrStaged.toFixed(1) + "%" : "Staged OFCI IRR: N/A");
  setText("kpiIrrDelay", isFinite(irrDelay) ? irrDelay.toFixed(1) + "%" : "N/A");
  const dragBps = isFinite(irrBase) && isFinite(irrDelay) ? Math.round((irrDelay - irrBase) * 100) : 0;
  setText("kpiDelayDrag", "Delay Drag: " + (dragBps >= 0 ? "+" : "") + dragBps + " bps");

  if (!baselineIrrChart && byId("baselineIrrChart")) {
    initBaselineIrrChart();
  }
  const irrGateYr = Math.max(2, Math.min(6, Math.ceil(totalWeeks / 52)));
  const irrOverTime = [];
  for (let q = 0; q <= 24; q++) {
    const tYr = q / 4;
    if (tYr < irrGateYr || tYr > flipExitYr + 1e-6) {
      irrOverTime.push(null);
      continue;
    }
    const fullYrs = Math.floor(tYr);
    const fracYr = tYr - fullYrs;
    const windowCfs = [];
    for (let i = 0; i <= Math.min(6, fullYrs); i++) {
      let amt = cfBase[i] || 0;
      if (i === fullYrs && fracYr > 0) {
        const nextCf = cfBase[i + 1] || 0;
        amt = amt + (nextCf - amt) * fracYr;
      }
      if (i === Math.min(6, fullYrs)) {
        if (Math.abs(tYr - 5) < 1e-6) {
          amt = cfBase[5];
        } else if (Math.abs(tYr - 6) < 1e-6) {
          amt = cfBase[5] + cfBase[6];
        } else if (tYr < 5) {
          const rampFactor = tYr <= 2 ? 0.35 : tYr <= 3 ? 0.35 + (tYr - 2) * 0.40 : 0.75 + (tYr - 3) * 0.25;
          const opCash = stabilizedNoi * rampFactor - annualInterest * Math.min(1, tYr / 2);
          amt = opCash + netExit;
        } else {
          amt = cfBase[5] + (cfBase[6] || 0) * ((tYr - 5) / 1);
        }
      }
      windowCfs.push([i === Math.min(6, fullYrs) ? tYr : i, amt]);
    }
    const hasNeg = windowCfs.some(function(p) { return p[1] < 0; });
    const hasPos = windowCfs.some(function(p) { return p[1] > 0; });
    if (!hasNeg || !hasPos) {
      irrOverTime.push(null);
      continue;
    }
    const r = computeTimedIRR(windowCfs);
    irrOverTime.push(isFinite(r) ? +(r * 100).toFixed(1) : null);
  }

  if (baselineIrrChart && baselineIrrChart.data && Array.isArray(baselineIrrChart.data.datasets)) {
    if (baselineIrrChart.data.datasets[0]) baselineIrrChart.data.datasets[0].data = irrOverTime;
    if (baselineIrrChart.data.datasets[1]) baselineIrrChart.data.datasets[1].data = [];
    baselineIrrChart.update("none");
  }
  const lastValidIrrIdx = irrOverTime.reduce(function(acc, val, idx) { return val !== null ? idx : acc; }, -1);
  const exitIrrLabel = lastValidIrrIdx >= 0 ? irrOverTime[lastValidIrrIdx].toFixed(1) + "%" : "N/A";
  setText(
    "baselineIrrTrajectoryNote",
    "16% Hurdle · Flip Exit (~" + flipExitYr.toFixed(2) + " yrs) IRR: " + (isFinite(irrBase) ? irrBase.toFixed(1) + "%" : "N/A") + " · Last Plotted: " + exitIrrLabel
  );

  if (cashChart && cashChart.data && Array.isArray(cashChart.data.datasets)) {
    const buildMonthlyCumulative = function(cfg) {
      const out = [];
      let cum = 0;
      const exitYr = cfg.exitYr;
      const delayShift = cfg.delayShift || 0;
      const noiMult = cfg.noiMult || 1;
      const exitMult = cfg.exitMult || 1;
      const eqMult = cfg.eqMult || 1;
      const eqLandShare = cfg.eqLandShare !== undefined ? cfg.eqLandShare : 0.45;
      const eqShellShare = cfg.eqShellShare !== undefined ? cfg.eqShellShare : 0.35;
      const eqOfciShare = cfg.eqOfciShare !== undefined ? cfg.eqOfciShare : 0.20;

      const stageEqLand = totalEquity * eqMult * eqLandShare;
      const stageEqShell = totalEquity * eqMult * eqShellShare;
      const stageEqOfci = totalEquity * eqMult * eqOfciShare;

      const mLand = Math.max(1, Math.round(landWeeks / (52 / 12)));
      const mShell = Math.max(1, Math.round(shellWeeks / (52 / 12)));
      const mOfci = Math.max(1, Math.round(ofciWeeks / (52 / 12)));
      const mBuildEnd = Math.min(72, mLand + mShell + mOfci);

      for (let m = 0; m <= 72; m++) {
        const tPrev = Math.max(0, (m - 1) / 12);
        const tCurr = m / 12;

        // End the trajectory once sold (no post-exit points)
        if (exitYr !== null && tPrev > exitYr + 1e-6) {
          out.push(null);
          continue;
        }

        let stepCf = 0;

        if (m > 0) {
          // Monthly equity draws across Land & Power -> Shell & Core -> OFCI
          if (m <= mLand) {
            stepCf -= stageEqLand / mLand;
          } else if (m <= mLand + mShell) {
            stepCf -= stageEqShell / mShell;
          } else if (m <= mBuildEnd) {
            stepCf -= stageEqOfci / mOfci;
          }

          // Monthly interest on sequential cumulative drawn debt (shifted if delayed)
          const midYrEff = Math.max(0, ((tPrev + tCurr) / 2) - delayShift);
          const drawnDebt = cumulativeDrawnDebtAt(midYrEff);
          stepCf -= (drawnDebt * debtRate) / 12;

          // Monthly operating NOI once past build/delay up to sale
          const activeToYr = exitYr !== null ? Math.min(tCurr, exitYr) : tCurr;
          if (activeToYr > tPrev) {
            const activeFrac = activeToYr - tPrev;
            if (cfg.isPreLeased) {
              const rfsStartYr = Math.max(0, tOfciYr - (ofciWeeks / 52));
              if (activeToYr > rfsStartYr) {
                const ofciProgress = ofciWeeks > 0 ? Math.min(1, Math.max(0, (activeToYr - rfsStartYr) / (ofciWeeks / 52))) : 1;
                const hallFactor = activeToYr <= tOfciYr ? (0.25 + 0.75 * ofciProgress) : 1.0;
                stepCf += stabilizedNoi * hallFactor * activeFrac;
              }
            } else {
              const effOpYr = activeToYr - delayShift;
              if (effOpYr > 1.5) {
                let ramp = 0;
                if (effOpYr <= 2.5) ramp = 0.35;
                else if (effOpYr <= 3.5) ramp = 0.75;
                else ramp = 1.0;
                stepCf += stabilizedNoi * ramp * noiMult * activeFrac;
              }
            }
          }
        }

        // Terminal net exit proceeds when reaching/crossing exitYr
        if (exitYr !== null && tCurr >= exitYr - 1e-6 && tPrev <= exitYr + 1e-6) {
          stepCf += netExit * exitMult;
        }

        cum += stepCf;
        out.push(+cum.toFixed(2));
      }
      return out;
    };

    const ds = cashChart.data.datasets;
    if (ds[0]) {
      ds[0].data = buildMonthlyCumulative({
        exitYr: Math.min(6, flipExitYr),
        noiMult: 0.65,
        exitMult: 1.0,
        eqLandShare: 0.45,
        eqShellShare: 0.35,
        eqOfciShare: 0.20
      });
    }
    if (ds[1]) {
      ds[1].data = buildMonthlyCumulative({
        exitYr: Math.min(6, flipExitYr),
        noiMult: 0.62 * stagedFactor,
        exitMult: 1.01,
        eqMult: 1.0,
        eqLandShare: 0.40,
        eqShellShare: 0.35,
        eqOfciShare: 0.25
      });
    }
    if (ds[2]) {
      ds[2].data = buildMonthlyCumulative({
        exitYr: Math.min(6, flipExitYr),
        noiMult: 0.85,
        exitMult: upfrontTotalCapex > 0 ? (upfrontNetExit / Math.max(0.01, netExit)) : 1.0,
        eqMult: totalEquity > 0 ? (upfrontTotalEquity / totalEquity) : 1.0,
        eqLandShare: 0.42,
        eqShellShare: 0.33,
        eqOfciShare: 0.25
      });
    }
    if (ds[3]) {
      ds[3].data = buildMonthlyCumulative({
        exitYr: Math.min(6, exitYears),
        isPreLeased: true,
        exitMult: 1.0,
        eqLandShare: 0.45,
        eqShellShare: 0.35,
        eqOfciShare: 0.20
      });
    }
    cashChart.update("none");
  }

  const tbody = byId("ledgerBody") || document.querySelector("#ledgerTable tbody") || document.querySelector("table tbody");
  if (tbody) {
    const rows = [
      { name: "Baseline (9-Mo Post-Build Flip)", cf: cfBase, irr: irrBase },
      { name: "Phased Power + Staged OFCI", cf: cfPhasedStaged, irr: irrStaged },
      { name: "Phased Power (Upfront OFCI)", cf: cfPhasedUpfront, irr: irrUpfront },
      { name: "12-Mo Grid Delay (Yr 6 Exit)", cf: cfDelay, irr: irrDelay },
      { name: "100% Pre-Leased · Exit RFS + 9 Mos", cf: cfPreLeased, irr: irrPreLeased }
    ];

    tbody.innerHTML = rows.map(function(r) {
      const cells = r.cf.map(function(v) {
        let color = "#94a3b8";
        let bg = "transparent";
        if (v < -0.05) {
          color = "#fca5a5";
          bg = "rgba(248,113,113,0.12)";
        } else if (v > 0.05) {
          color = "#6ee7b7";
          bg = "rgba(52,211,153,0.12)";
        }
        return '<td style="color:' + color + ';background:' + bg + ';font-variant-numeric:tabular-nums;">' + fmtLedger(v) + '</td>';
      }).join("");
      const hasIrr = isFinite(r.irr);
      const irrText = hasIrr ? r.irr.toFixed(1) + "%" : "N/A";
      let irrColor = "#cbd5e1";
      let irrBg = "rgba(148,163,184,0.14)";
      if (hasIrr && r.irr >= 25) {
        irrColor = "#6ee7b7";
        irrBg = "rgba(52,211,153,0.18)";
      } else if (hasIrr && r.irr >= 15) {
        irrColor = "#fde68a";
        irrBg = "rgba(251,191,36,0.18)";
      } else if (hasIrr && r.irr < 15) {
        irrColor = "#fca5a5";
        irrBg = "rgba(248,113,113,0.18)";
      }
      const irrBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;color:' + irrColor + ';background:' + irrBg + ';">' + irrText + '</span>';
      return '<tr style="border-bottom:1px solid rgba(148,163,184,0.12);"><td style="color:#f1f5f9;"><strong>' + r.name + '</strong></td>' + cells + '<td>' + irrBadge + '</td></tr>';
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
  if (typeof initBaselineIrrChart === "function") initBaselineIrrChart();
  bindControls();
  update();
});