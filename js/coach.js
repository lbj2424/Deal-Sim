const Coach = (() => {
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

  function scoreIRR(irr){
    const p = irr * 100;
    if (p >= 18) return 35;
    if (p >= 16) return 30;
    if (p >= 14) return 24;
    if (p >= 12) return 16;
    if (p >= 10) return 8;
    return 0;
  }

  function scoreEqMult(m){
    if (m >= 2.0) return 10;
    if (m >= 1.8) return 8;
    if (m >= 1.6) return 6;
    if (m >= 1.4) return 4;
    return 0;
  }

  function scoreCoC(coc){
    const p = coc * 100;
    if (p >= 8) return 5;
    if (p >= 6) return 4;
    if (p >= 4) return 2;
    return 0;
  }

  function scoreMinDSCR(x){
    if (x >= 1.35) return 15;
    if (x >= 1.25) return 12;
    if (x >= 1.15) return 7;
    if (x >= 1.05) return 3;
    return 0;
  }

  function scoreBEOcc(beOccMax){
    // beOccMax is the worst (highest) break-even occupancy observed
    // lower is better. (80% means 0.80)
    if (beOccMax <= 0.80) return 5;
    if (beOccMax <= 0.85) return 4;
    if (beOccMax <= 0.90) return 2;
    return 0;
  }

  function scoreExitSensitivity(irrStress){
    const p = irrStress * 100;
    if (p >= 14) return 10;
    if (p >= 12) return 7;
    if (p >= 10) return 4;
    return 0;
  }

  function scoreVacancySensitivity(minDSCRStress){
    if (minDSCRStress >= 1.15) return 5;
    if (minDSCRStress >= 1.05) return 2;
    return 0;
  }

  function scoreRealism(deal, inputs){
    const r = deal.coach?.reasonable;
    if (!r) return { points: 15, notes: [], flags: [] };

    let pts = 0;
    const notes = [];
    const flags = [];

    // rent growth
    if (inputs.rentGrowth >= r.rentGrowthMin && inputs.rentGrowth <= r.rentGrowthMax) pts += 5;
    else if (inputs.rentGrowth <= r.rentGrowthMax + 0.0075) { pts += 2; notes.push("Rent growth slightly optimistic vs deal range."); }
    else { flags.push("optimistic_rent_growth"); notes.push("Rent growth is aggressive vs deal range."); }

    // exit cap
    if (inputs.exitCap >= r.exitCapMin && inputs.exitCap <= r.exitCapMax) pts += 5;
    else if (inputs.exitCap >= r.exitCapMin - 0.0025) { pts += 2; notes.push("Exit cap slightly aggressive vs deal range."); }
    else { flags.push("aggressive_exit_cap"); notes.push("Exit cap is overly aggressive vs deal range."); }

    // rent premium ceiling
    const prem = inputs.rentPremium || 0;
    if (prem <= r.rentPremiumCeilingPerUnit) pts += 5;
    else if (prem <= r.rentPremiumCeilingPerUnit * 1.10) { pts += 2; notes.push("Rent lift slightly above the deal’s likely ceiling."); }
    else { flags.push("rent_lift_unrealistic"); notes.push("Rent lift is above what this deal likely supports."); }

    return { points: pts, notes, flags };
  }

  function pickTopDrivers(drivers, n=3){
    return drivers.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,n);
  }

  function review(deal, inputs){
    // Base case
    const base = Calc.simulate(deal, inputs);

    // Stress 1: exit cap +100 bps
    const exitStressInputs = { ...inputs, exitCap: inputs.exitCap + 0.01 };
    const exitStress = Calc.simulate(deal, exitStressInputs);

    // Stress 2: vacancy +5%
    const vacStressInputs = { ...inputs, vacancy: clamp(inputs.vacancy + 0.05, 0, 0.25) };
    const vacStress = Calc.simulate(deal, vacStressInputs);

    // Score pieces
    const s1 = scoreIRR(base.irr);
    const s2 = scoreEqMult(base.equityMultiple);
    const s3 = scoreCoC(base.avgCoC);

    const s4 = scoreMinDSCR(base.minDSCR);
    const s5 = scoreBEOcc(base.breakEvenOccMax);
    const s6 = scoreExitSensitivity(exitStress.irr);
    const s7 = scoreVacancySensitivity(vacStress.minDSCR);

    const realism = scoreRealism(deal, inputs);

    const total = s1 + s2 + s3 + s4 + s5 + s6 + s7 + realism.points;

    // Flags
    const flags = new Set([...(deal.coach?.knownFlags || []), ...realism.flags]);

    if (base.minDSCR < 1.05) flags.add("dscr_critical");
    if (base.breakEvenOccMax > 0.90) flags.add("break_even_too_high");
    if (exitStress.irr < 0.10) flags.add("exit_risk_high");
    if (vacStress.minDSCR < 1.05) flags.add("cashflow_fragile");

    // Recommendation rules (conservative)
    let rec = "PASS";
    if (total >= 80 && base.minDSCR >= 1.20 && exitStress.irr >= 0.12) rec = "BUY";
    else if (total >= 60) rec = "BORDERLINE";

    // Drivers (helpful explanation)
    const drivers = [
      { label: "Base IRR", delta: s1 - 16 }, // anchor near mid
      { label: "Equity multiple", delta: s2 - 6 },
      { label: "Min DSCR", delta: s4 - 7 },
      { label: "Exit cap stress", delta: s6 - 7 },
      { label: "Vacancy stress", delta: s7 - 2 },
      { label: "Assumption realism", delta: realism.points - 10 },
      { label: "Break-even occupancy", delta: s5 - 2 }
    ];

    const top = pickTopDrivers(drivers, 3);

    // “What would make it a buy?” levers
    const levers = [];
    if (rec !== "BUY"){
      if (flags.has("aggressive_exit_cap")) levers.push("Use a more conservative exit cap (within the deal’s range).");
      if (flags.has("rent_lift_unrealistic")) levers.push("Reduce your rent lift to something the deal can support (or justify comps).");
      if (base.minDSCR < 1.20) levers.push("Lower leverage, lower price, or reduce Year 1 CapEx to improve DSCR.");
      if (exitStress.irr < 0.12) levers.push("Target a lower basis (purchase price) so returns survive cap rate expansion.");
      if (levers.length < 2) levers.push("Negotiate better basis or find operational savings to build cushion.");
    }

    return {
      recommendation: rec,
      score: Math.round(total),
      base,
      exitStress,
      vacStress,
      notes: realism.notes,
      topDrivers: top.map(t => t.label),
      flags: Array.from(flags),
      dealTruths: deal.coach?.dealTruths || [],
      levers
    };
  }

  return { review };
})();
