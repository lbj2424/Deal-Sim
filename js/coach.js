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

  // Map known flag IDs to keywords to look for in a thesis
  const FLAG_KEYWORDS = {
    tax_reassessment_likely:   ["tax", "reassess", "assessed value"],
    capex_execution_risk:      ["capex", "construction", "execution", "contractor", "cost over", "renovation risk"],
    collections_risk:          ["collection", "delinquency", "tenant quality", "eviction", "payment"],
    insurance_cost_surge:      ["insurance", "insur"],
    crime_area_risk:           ["crime", "safety", "neighborhood", "submarket risk"],
    property_tax_growth_risk:  ["property tax", "tax growth", "reassess"],
    market_correction_risk:    ["correction", "softening", "supply", "oversupply", "new delivery"],
    expensive_basis:           ["basis", "overpay", "price", "expensive"],
    soft_demand:               ["demand", "vacancy", "absorption", "softening"],
    coastal_risk:              ["hurricane", "flood", "coastal", "storm"],
  };

  function evaluateThesis(deal, inputs, thesis){
    const { thesisWhat, thesisWhy, thesisExit, thesisKiller } = thesis;
    const r      = deal.coach?.reasonable;
    const profile= deal.coach?.profile;
    const flags  = deal.coach?.knownFlags || [];
    const fb     = []; // feedback array: { field, type, note }
    // type: 'aligned' | 'gap' | 'conflict' | 'missing'

    // ── THESIS: WHY IT PENCILS ───────────────────────────────────────────────
    if (!thesisWhy){
      fb.push({ field:"Why it pencils", type:"missing",
        note:"No upside thesis written. This is the most important field — what specifically makes this deal worth buying at this price?"
      });
    } else {
      const why = thesisWhy.toLowerCase();
      const mentionsLift = /rent.lift|premium|reno|rehab|value.?add|upgrade|unit.improv/i.test(why);
      const mentionsCompression = /cap.compress|cap.rate.compres|compression/i.test(why);
      const mentionsOps = /mis.manag|operational|expense.reduc|management.improv/i.test(why);

      if (mentionsLift && r){
        const applied = inputs.rentPremium || 0;
        const ceiling = r.rentPremiumCeilingPerUnit;
        if (applied < ceiling * 0.40){
          fb.push({ field:"Why it pencils", type:"gap",
            note:`You cited rent lift but only modeled $${applied}/unit — the deal's ceiling is $${ceiling}/unit. Either you're being very conservative (own that) or your model undersells your own thesis.`
          });
        } else if (applied > ceiling){
          fb.push({ field:"Why it pencils", type:"conflict",
            note:`Rent lift thesis but $${applied}/unit exceeds the deal's realistic ceiling of $${ceiling}/unit. Your model is likely overstating the upside.`
          });
        } else {
          fb.push({ field:"Why it pencils", type:"aligned",
            note:`Rent lift thesis ($${applied}/unit) is consistent with your model and within the deal's supportable range. Good.`
          });
        }
      }

      if (mentionsCompression && r){
        if (inputs.exitCap < r.exitCapMin){
          fb.push({ field:"Why it pencils", type:"conflict",
            note:`You're relying on cap rate compression (exit cap ${(inputs.exitCap*100).toFixed(2)}% vs. reasonable min ${(r.exitCapMin*100).toFixed(2)}%). This is an aggressive assumption that must be backed by market data.`
          });
        } else {
          fb.push({ field:"Why it pencils", type:"gap",
            note:`You mentioned cap rate compression but your exit cap of ${(inputs.exitCap*100).toFixed(2)}% is within the normal range — either refine your thesis or your model underreflects it.`
          });
        }
      }

      if (profile === "yield_stable" && mentionsLift && (inputs.rentPremium||0) > 100){
        fb.push({ field:"Why it pencils", type:"conflict",
          note:`This is a yield-stable deal, but your thesis is a rent-lift story. Yield deals return via durable occupancy and modest NOI growth — not renovation premium. Verify the lift is truly achievable.`
        });
      }

      if (!mentionsLift && !mentionsCompression && !mentionsOps){
        fb.push({ field:"Why it pencils", type:"gap",
          note:`Your thesis doesn't clearly name a specific return driver (rent lift, cap compression, or operational improvement). Be explicit — what is the mechanism that creates value?`
        });
      }
    }

    // ── THESIS: EXIT PATH ────────────────────────────────────────────────────
    if (!thesisExit){
      fb.push({ field:"Exit path", type:"missing",
        note:`No exit path written. Who is the buyer? What cap rate do they pay? Your answer should match your model's exit cap of ${(inputs.exitCap*100).toFixed(2)}%.`
      });
    } else {
      const capMatch = thesisExit.match(/(\d+\.?\d*)\s*%/);
      if (capMatch && r){
        const mentionedCap = parseFloat(capMatch[1]) / 100;
        const delta = Math.abs(mentionedCap - inputs.exitCap);
        if (delta > 0.005){
          fb.push({ field:"Exit path", type:"conflict",
            note:`You wrote ${(mentionedCap*100).toFixed(2)}% in your exit path but your model uses ${(inputs.exitCap*100).toFixed(2)}%. Align your written thesis with your model assumption.`
          });
        } else {
          fb.push({ field:"Exit path", type:"aligned",
            note:`Exit cap in your thesis (${(mentionedCap*100).toFixed(2)}%) matches your model. Good alignment.`
          });
        }
      } else {
        fb.push({ field:"Exit path", type:"aligned",
          note:`Exit path documented. Confirm the buyer type and timing match your model's exit cap of ${(inputs.exitCap*100).toFixed(2)}%.`
        });
      }
    }

    // ── THESIS: DEAL KILLER ──────────────────────────────────────────────────
    if (!thesisKiller){
      fb.push({ field:"Deal killer", type:"missing",
        note:"No deal killer identified. Every deal has a most-lethal scenario — what single thing blows up the return?"
      });
    } else {
      const killer = thesisKiller.toLowerCase();
      if (flags.length === 0){
        fb.push({ field:"Deal killer", type:"aligned",
          note:"No pre-flagged known risks on this deal. Your stated killer is your own assessment — make sure it's the most lethal scenario, not a generic placeholder."
        });
      } else {
        const identified = flags.filter(f => {
          const kws = FLAG_KEYWORDS[f] || [f.replaceAll("_"," ")];
          return kws.some(kw => killer.includes(kw));
        });
        const missed = flags.filter(f => !identified.includes(f));

        if (identified.length > 0){
          fb.push({ field:"Deal killer", type:"aligned",
            note:`You correctly identified: ${identified.map(f=>f.replaceAll("_"," ")).join(", ")}. This is one of the known risks for this deal.`
          });
        }
        if (missed.length > 0){
          fb.push({ field:"Deal killer", type:identified.length > 0 ? "gap" : "conflict",
            note:`You missed the following known risks: ${missed.map(f=>f.replaceAll("_"," ")).join(", ")}. These should factor into your thesis.`
          });
        }
      }
    }

    return fb;
  }

  return { review, evaluateThesis };
})();
