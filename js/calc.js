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

  // ---- Statement builders ----
  function statementFromT12(deal){
    const inc = deal.t12?.income || {};
    const exp = deal.t12?.expenses || {};

    const totalIncome = sumObj(inc);
    const totalExpenses = sumObj(exp);
    const noi = totalIncome - totalExpenses;

    return { income: inc, expenses: exp, totalIncome, totalExpenses, noi };
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
