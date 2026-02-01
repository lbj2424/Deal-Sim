const Calc = (() => {
  function sumObj(o){
  return Object.values(o || {}).reduce((a,b)=>a + Number(b || 0), 0);
}

function statementFromT12(deal){
  const inc = deal.t12?.income || {};
  const exp = deal.t12?.expenses || {};

  const totalIncome = sumObj(inc);
  const totalExpenses = sumObj(exp);
  const noi = totalIncome - totalExpenses;

  return {
    income: inc,
    expenses: exp,
    totalIncome,
    totalExpenses,
    noi
  };
}

function proformaFromInputs(deal, inputs){
  const t12 = statementFromT12(deal);

  // derive "market/stabilized" GPR from in-place avg rent + rent premium
  const baseRentMonthly = deal.avgRentInPlace; // in-place
  const premium = Number(inputs.rentPremium || 0);
  const rentMonthlyPF = baseRentMonthly + premium;

  const gprPF =
    deal.units * rentMonthlyPF * 12;

  // Other income: start from T12 per-unit monthly and let it grow with rent growth
  const otherIncomeT12 = (deal.t12?.income?.otherIncome || 0);
  const otherIncomePF = otherIncomeT12 * (1 + inputs.rentGrowth);

  const stabilizedOcc = deal.uw?.stabilizedOccupancy ?? 0.94;
  const vacPF = 1 - stabilizedOcc;

  const vacancyLossPF = -(gprPF * vacPF);

  const concessionsPF = deal.t12?.income?.concessionsBadDebt || 0; // keep as-is for MVP

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

  // Remove managementFee from base; we will compute as % of EGI (more legit)
  baseExp.managementFee = 0;

  const grownExp = {};
  for (const [k,v] of Object.entries(baseExp)){
    grownExp[k] = Number(v || 0) * (1 + expGrowth);
  }

  // Tax + insurance step-ups (common underwriting)
  const taxStep = deal.uw?.taxStepUpPct ?? 0.10;
  const insStep = deal.uw?.insuranceStepUpPct ?? 0.07;

  if (grownExp.propertyTaxes != null) grownExp.propertyTaxes = grownExp.propertyTaxes * (1 + taxStep);
  if (grownExp.insurance != null) grownExp.insurance = grownExp.insurance * (1 + insStep);

  // Management fee as % of EGI
  const mgmtPct = deal.uw?.managementFeePct ?? 0.05;
  const managementFee = -(egiPF * 0) + (egiPF * mgmtPct); // keep positive expense number
  grownExp.managementFee = managementFee;

  const totalExpensesPF = sumObj(grownExp);
  const noiPF = egiPF - totalExpensesPF;

  return {
    income: incomePF,
    expenses: grownExp,
    totalIncome: egiPF,
    totalExpenses: totalExpensesPF,
    noi: noiPF,
    rentMonthlyPF,
    stabilizedOcc
  };
}

  function pmt(rateMonthly, nMonths, pv){
    if (rateMonthly === 0) return pv / nMonths;
    const r = rateMonthly;
    return (r * pv) / (1 - Math.pow(1 + r, -nMonths));
  }

  function irr(cashflows){
    // Newton-Raphson (simple). cashflows[0] is negative equity.
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

  function simulate(deal, inputs){
    const hold = inputs.holdYears;

    // Income in year 1 (in-place)
    const gprYear1 =
      deal.units * deal.avgRentInPlace * 12 +
      deal.units * (deal.otherIncomePerUnitMonthly || 0) * 12;

    const vac = inputs.vacancy;
    const egiYear1 = gprYear1 * (1 - vac);
    const opexYear1 = egiYear1 * deal.opexRatio;
    const noiYear1 = egiYear1 - opexYear1;

    // Debt
    const ltv = inputs.ltv;
    const loanAmt = deal.purchasePrice * ltv;
    const equity = deal.purchasePrice * (1 - ltv);

    const rateAnnual = inputs.rate;
    const rM = rateAnnual / 12;
    const n = deal.defaultDebt.amortYears * 12;
    const payM = pmt(rM, n, loanAmt);
    const debtServiceYear = payM * 12;

    // Year 1 capex
    const capexYear1 = deal.units * (deal.capexPerUnitYear1 || 0);

    // Stabilized rent premium: we apply it starting Year 2 (simple)
    const rentPremAnnual = deal.units * (inputs.rentPremium || 0) * 12;

    // Build yearly cashflows
    const cfs = [];
    cfs.push(-(equity + capexYear1)); // Year 0 equity + Year 1 capex upfront (conservative)

    let noi = noiYear1;
    let gpr = gprYear1;
    let loanBal = loanAmt;

    // amortization schedule yearly (approx: compute balance after 12 months)
    function balanceAfter12(loanBalance){
      let bal = loanBalance;
      for (let i = 0; i < 12; i++){
        const interest = bal * rM;
        const principal = payM - interest;
        bal = Math.max(0, bal - principal);
      }
      return bal;
    }

    const expGrowth = inputs.expGrowth;
    const rentGrowth = inputs.rentGrowth;

    // Compute DSCR each year + BE occupancy
    const dscrs = [];
    const beOccs = [];

    for (let y = 1; y <= hold; y++){
      // Income growth
      gpr = gpr * (1 + rentGrowth);

      // add stabilized premium starting year 2
      const premium = (y >= 2) ? rentPremAnnual : 0;

      const egi = (gpr + premium) * (1 - vac);
      const opex = (y === 1) ? (egi * deal.opexRatio) : ( (egi * deal.opexRatio) * Math.pow(1 + expGrowth, y - 1) );
      noi = egi - opex;

      // recurring capex (simple: none beyond year 1 for MVP)
      const recurringCapex = 0;

      const cf = noi - debtServiceYear - recurringCapex;
      cfs.push(cf);

      const dscr = noi / (debtServiceYear || 1e-9);
      dscrs.push(dscr);

      // Break-even occupancy approximation:
      // Need occupancy such that NOI >= debt service. NOI = (GPR*(1-occ))* (1-opexRatio) roughly.
      const noiMargin = (1 - deal.opexRatio);
      const beOcc = 1 - (debtServiceYear / ((gpr + premium) * noiMargin || 1e-9));
      beOccs.push(beOcc);
      loanBal = balanceAfter12(loanBal);
    }

    // Exit: sale price based on final year NOI / exit cap
    const exitPrice = noi / inputs.exitCap;
    const sellCosts = exitPrice * (deal.sellingCostPct || 0.02);
    const netSale = exitPrice - sellCosts - loanBal;

    cfs[cfs.length - 1] += netSale;

    const irrVal = irr(cfs);
    const totalDist = cfs.slice(1).reduce((a,b)=>a+b,0);
    const eqMult = (totalDist / (equity + capexYear1 || 1e-9));

    const avgCoC = (cfs.slice(1, 1 + hold).reduce((a,b)=>a+b,0) / hold) / (equity + capexYear1 || 1e-9);

    return {
      cashflows: cfs,
      irr: irrVal,
      equityMultiple: eqMult,
      avgCoC,
      minDSCR: Math.min(...dscrs),
      avgDSCR: dscrs.reduce((a,b)=>a+b,0)/dscrs.length,
      breakEvenOccMax: Math.max(...beOccs),
      exitPrice,
      loanBalanceEnd: loanBal,
      noiYear1,
      debtServiceYear
    };
  }

  return { simulate };
})();
