const Calc = (() => {
  function pmt(rateMonthly, nMonths, pv){
    if (rateMonthly === 0) return pv / nMonths;
    const r = rateMonthly;
    return (r * pv) / (1 - Math.pow(1 + r, -nMonths));
  }

  function irr(cashflows){
    let guess = 0.15;
    for (let iter = 0; iter < 60; iter++){
      let npv = 0, d = 0;
      for (let t = 0; t < cashflows.length; t++){
        const cf = cashflows[t];
        const denom = Math.pow(1 + guess, t);
        npv += cf / denom;
        d += -t * cf / (denom * (1 + guess));
      }
      if (Math.abs(npv) < 1e-6) break;
      guess = guess - npv / (d || 1e-9);
      if (guess < -0.95) guess = -0.95;
      if (guess > 2.0) guess = 2.0;
    }
    return guess;
  }

  function sumObj(o){
    return Object.values(o || {}).reduce((a,b)=>a + Number(b || 0), 0);
  }
function _seedFromDeal(deal){
  let seed = 12345;
  const s = String(deal?.id || deal?.name || "deal");
  for (const ch of s) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return seed;
}

function _rng(seed){
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function _sum(obj){
  return Object.values(obj || {}).reduce((a,b)=>a + Number(b || 0), 0);
}

// Split a total expense into realistic line items with mild variation.
// Ensures line items sum exactly to total.
function _splitOpex(total, rand){
  const pct = (base, jitter=0.15) => base * (1 + (rand()-0.5)*2*jitter);

  // Typical-ish multifamily distribution (rough but believable)
  let payroll            = pct(0.08);
  let repairsMaintenance = pct(0.12);
  let contractServices   = pct(0.07);
  let turnoverMakeReady  = pct(0.05);
  let utilities          = pct(0.10);
  let marketing          = pct(0.02);
  let admin              = pct(0.01);
  let other              = pct(0.03);

  const fixed = payroll+repairsMaintenance+contractServices+turnoverMakeReady+utilities+marketing+admin+other;
  const scale = fixed > 0 ? (1 / fixed) : 1;

  payroll            *= scale;
  repairsMaintenance *= scale;
  contractServices   *= scale;
  turnoverMakeReady  *= scale;
  utilities          *= scale;
  marketing          *= scale;
  admin              *= scale;
  other              *= scale;

  const raw = {
    payroll:            Math.round(total * payroll),
    repairsMaintenance: Math.round(total * repairsMaintenance),
    contractServices:   Math.round(total * contractServices),
    turnoverMakeReady:  Math.round(total * turnoverMakeReady),
    utilities:          Math.round(total * utilities),
    marketing:          Math.round(total * marketing),
    admin:              Math.round(total * admin),
    other:              Math.round(total * other)
  };

  // Fix rounding drift
  const drift = Math.round(total) - _sum(raw);
  raw.other += drift;

  return raw;
}

// Auto-generate a believable annual T12 from the deal facts.
// Output matches your existing statement shape.
function _generateT12(deal){
  const rand = _rng(_seedFromDeal(deal));

  const units = Number(deal.units || 0);
  const rent  = Number(deal.avgRentInPlace || 0);
  const occ   = Number(deal.occupancy ?? 0.92);
  const oiPU  = Number(deal.otherIncomePerUnitMonthly || 0);

  const gpr = Math.round(units * rent * 12);
  const vacancyLoss = -Math.round(gpr * (1 - occ));

  // concessions/bad debt small negative line (more in “messy” deals)
  const concBadDebt = -Math.round(gpr * (0.002 + rand()*0.006));

  const otherIncome = Math.round(units * oiPU * 12);

  const income = {
    gpr,
    vacancyLoss,
    concessionsBadDebt: concBadDebt,
    otherIncome
  };

  // Build “NOI margin” from opexRatio, then back into expenses.
  // Effective Gross Income:
  const egi = gpr + vacancyLoss + concBadDebt + otherIncome;

  const opexRatio = Number(deal.opexRatio ?? 0.45);
  let totalOpex = Math.round(egi * opexRatio);

  // Anchor taxes & insurance to purchase price (more legit)
  const price = Number(deal.purchasePrice || 0);

  // property taxes: ~0.9%–1.6% of price depending on randomness
  const taxRate = 0.009 + rand()*0.007;
  const propertyTaxes = Math.round(price * taxRate);

  // insurance: ~0.20%–0.40% of price
  const insRate = 0.002 + rand()*0.002;
  const insurance = Math.round(price * insRate);

  // Remaining opex after carving out taxes/insurance
  const remaining = Math.max(0, totalOpex - propertyTaxes - insurance);
  const split = _splitOpex(remaining, rand);

  const expenses = {
    ...split,
    utilities: split.utilities, // keep explicit
    propertyTaxes,
    insurance
  };

  // Management fee: if you want it in T12, include it (otherwise you can keep it 0)
  const mgmtPct = Number(deal.uw?.managementFeePct ?? 0.05);
  const managementFee = Math.round(Math.max(0, egi) * mgmtPct);

  // Decide whether to include mgmt fee as explicit line
  // If you prefer to keep it in pro forma only, set to 0
  expenses.managementFee = managementFee;

  // Recompute totals to ensure consistency
  const totalIncome = _sum(income);
  const totalExpenses = _sum(expenses);
  const noi = totalIncome - totalExpenses;

  return { income, expenses, totalIncome, totalExpenses, noi };
}

function statementFromT12(deal){
  // If the deal has a hand-entered T12 in JSON, use it
  if (deal && deal.t12 && (deal.t12.income || deal.t12.expenses)){
    const income = deal.t12.income || {};
    const expenses = deal.t12.expenses || {};
    const totalIncome = _sum(income);
    const totalExpenses = _sum(expenses);
    return {
      income,
      expenses,
      totalIncome,
      totalExpenses,
      noi: totalIncome - totalExpenses
    };
  }

  // Otherwise auto-generate
  return _generateT12(deal);
}


  // Pro forma updates with your inputs
  function proformaFromInputs(deal, inputs){
    const t12 = statementFromT12(deal);

    const stabilizedOcc = deal.uw?.stabilizedOccupancy ?? 0.94;
    const vacPF = 1 - stabilizedOcc;

    // Use in-place rent + your rent premium for PF rent
    const baseRentMonthly = Number(deal.avgRentInPlace || 0);
    const premium = Number(inputs.rentPremium || 0);
    const rentMonthlyPF = baseRentMonthly + premium;

    const gprPF = Number(deal.units || 0) * rentMonthlyPF * 12;

    // Other income: start from T12 and grow with rent growth
    const otherIncomeT12 = Number(deal.t12?.income?.otherIncome || 0);
    const otherIncomePF = otherIncomeT12 * (1 + inputs.rentGrowth);

    const vacancyLossPF = -(gprPF * vacPF);
    const concessionsPF = Number(deal.t12?.income?.concessionsBadDebt || 0);

    const incomePF = {
      gpr: gprPF,
      vacancyLoss: vacancyLossPF,
      concessionsBadDebt: concessionsPF,
      otherIncome: otherIncomePF
    };

    const egiPF = sumObj(incomePF);

    // Expenses: grow T12 expenses by expense growth
    const expGrowth = inputs.expGrowth;
    const baseExp = { ...(deal.t12?.expenses || {}) };

    // remove mgmt fee from base; compute as % of EGI
    baseExp.managementFee = 0;

    const grownExp = {};
    for (const [k,v] of Object.entries(baseExp)){
      grownExp[k] = Number(v || 0) * (1 + expGrowth);
    }

    // Step-ups (legit underwriting)
    const taxStep = deal.uw?.taxStepUpPct ?? 0.10;
    const insStep = deal.uw?.insuranceStepUpPct ?? 0.07;
    if (grownExp.propertyTaxes != null) grownExp.propertyTaxes = grownExp.propertyTaxes * (1 + taxStep);
    if (grownExp.insurance != null) grownExp.insurance = grownExp.insurance * (1 + insStep);

    // Management fee
    const mgmtPct = deal.uw?.managementFeePct ?? 0.05;
    grownExp.managementFee = egiPF * mgmtPct;

    const totalExpensesPF = sumObj(grownExp);
    const noiPF = egiPF - totalExpensesPF;

    return {
      income: incomePF,
      expenses: grownExp,
      totalIncome: egiPF,
      totalExpenses: totalExpensesPF,
      noi: noiPF,
      stabilizedOcc,
      rentMonthlyPF
    };
  }

  // Better break-even occupancy using PF numbers:
  // BE Occ ≈ (OpEx + DebtSvc) / (GPR * (1 - OpEx/EGI))
  // We'll compute using PF "margin" (NOI / EGI) which is realistic.
  function breakEvenOccupancy(pfStmt, debtService){
    const gpr = Number(pfStmt.income?.gpr || 0);
    const egi = Number(pfStmt.totalIncome || 0);
    const noi = Number(pfStmt.noi || 0);
    const margin = egi > 0 ? (noi / egi) : 0;

    // If margin is tiny or negative, BE is basically 100%+
    if (gpr <= 0 || margin <= 0.02) return 1.0;

    // Need EGI such that NOI = EGI * margin >= debt service
    const requiredEGI = debtService / margin;
    // EGI = GPR * occupancy + (other items). We approximate using GPR only.
    const occ = requiredEGI / gpr;
    return Math.max(0, Math.min(1.25, occ));
  }

  // ---- Main simulation: Option 1 ----
  // Year 0: equity + year1 capex upfront
  // Year 1 NOI: T12 NOI (today)
  // Year 2 NOI: Pro Forma NOI (updates with your assumptions)
  // Year 3+: grow NOI by (rentGrowth - expGrowth proxy) for simplicity,
  // but we’ll grow PF statement itself (income & expenses) each year.
  function simulate(deal, inputs){
    const hold = inputs.holdYears;

    // Debt
    const ltv = inputs.ltv;
    const loanAmt = deal.purchasePrice * ltv;
    const equity = deal.purchasePrice * (1 - ltv);

    const rateAnnual = inputs.rate;
    const rM = rateAnnual / 12;
    const n = deal.defaultDebt.amortYears * 12;
    const payM = pmt(rM, n, loanAmt);
    const debtServiceYear = payM * 12;

    // Capex
    const capexYear1 = Number(deal.units || 0) * Number(deal.capexPerUnitYear1 || 0);

    // Statements
    const t12 = statementFromT12(deal);
    const pf0 = proformaFromInputs(deal, inputs);

    // Amortize loan annually (approx with 12 monthly steps)
    function balanceAfter12(loanBalance){
      let bal = loanBalance;
      for (let i = 0; i < 12; i++){
        const interest = bal * rM;
        const principal = payM - interest;
        bal = Math.max(0, bal - principal);
      }
      return bal;
    }

    // Cashflows
    const cfs = [];
    cfs.push(-(equity + capexYear1));

    const dscrs = [];
    let loanBal = loanAmt;

    // Year-by-year PF growth (we’ll grow income and expenses separately)
    let pfIncome = { ...pf0.income };
    let pfExpenses = { ...pf0.expenses };

    for (let y = 1; y <= hold; y++){
      let noi;

      if (y === 1){
        // Conservative: Year 1 = T12 NOI (as-is)
        noi = t12.noi;
      } else if (y === 2){
        noi = pf0.noi;
      } else {
        // Grow PF from prior year
        for (const k of Object.keys(pfIncome)){
          pfIncome[k] = Number(pfIncome[k] || 0) * (1 + inputs.rentGrowth);
        }
        for (const k of Object.keys(pfExpenses)){
          // Keep management fee tied to income by recomputing later
          if (k === "managementFee") continue;
          pfExpenses[k] = Number(pfExpenses[k] || 0) * (1 + inputs.expGrowth);
        }

        const egi = sumObj(pfIncome);
        const mgmtPct = deal.uw?.managementFeePct ?? 0.05;
        pfExpenses.managementFee = egi * mgmtPct;

        noi = egi - sumObj(pfExpenses);
      }

      const cf = noi - debtServiceYear;
      cfs.push(cf);

      const dscr = noi / (debtServiceYear || 1e-9);
      dscrs.push(dscr);

      loanBal = balanceAfter12(loanBal);
    }

    // Exit: use last stabilized NOI (we’ll use year hold NOI proxy)
    // For exit NOI, use last year’s NOI before sale:
    const exitNOI = (cfs.length > 1) ? (cfs[cfs.length - 1] + debtServiceYear) : pf0.noi;

    const exitPrice = exitNOI / inputs.exitCap;
    const sellCosts = exitPrice * (deal.sellingCostPct || 0.02);
    const netSale = exitPrice - sellCosts - loanBal;

    cfs[cfs.length - 1] += netSale;

    const irrVal = irr(cfs);
    const totalDist = cfs.slice(1).reduce((a,b)=>a+b,0);
    const eqMult = totalDist / (equity + capexYear1 || 1e-9);

    const avgCoC = (cfs.slice(1, 1 + hold).reduce((a,b)=>a+b,0) / hold) / (equity + capexYear1 || 1e-9);

    const beOcc = breakEvenOccupancy(pf0, debtServiceYear);

    return {
      cashflows: cfs,
      irr: irrVal,
      equityMultiple: eqMult,
      avgCoC,
      minDSCR: Math.min(...dscrs),
      avgDSCR: dscrs.reduce((a,b)=>a+b,0)/dscrs.length,
      breakEvenOccMax: beOcc,
      exitPrice,
      loanBalanceEnd: loanBal,
      noiYear1: t12.noi,
      noiProForma: pf0.noi,
      debtServiceYear,
      t12,
      proforma: pf0
    };
  }

  return {
    simulate,
    statementFromT12,
    proformaFromInputs
  };
})();
