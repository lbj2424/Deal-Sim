const Generator = (() => {
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function rnd(min,max){ return min + Math.random()*(max-min); }
  function rndi(min,max){ return Math.floor(rnd(min,max+1)); }

  function makeRandomDeal(){
    const markets = [
      { city:"Phoenix, AZ", rent:[1450, 2050], cap:[0.055,0.065] },
      { city:"Dallas, TX", rent:[1350, 1950], cap:[0.055,0.07] },
      { city:"Kansas City, MO", rent:[1050, 1500], cap:[0.06,0.075] },
      { city:"Salt Lake Area, UT", rent:[1500, 2200], cap:[0.055,0.07] },
      { city:"Denver Fringe, CO", rent:[1650, 2400], cap:[0.055,0.07] }
    ];
    const m = pick(markets);

    const units = pick([12, 16, 24, 36, 48, 72, 96, 120, 180]);
    const profile = pick(["classic_value_add","yield_stable","heavy_lift"]);

    const occupancy = profile === "heavy_lift" ? rnd(0.82, 0.91) : rnd(0.92, 0.97);
    const opexRatio = profile === "yield_stable" ? rnd(0.44, 0.52) : rnd(0.38, 0.50);

    const avgRentInPlace = rndi(m.rent[0], m.rent[1]);
    const otherIncome = rndi(10, 60);

    // Rough NOI from income * (1-opex)
    const gpr = units * (avgRentInPlace + otherIncome) * 12;
    const vac = 1 - occupancy;
    const egi = gpr * (1 - vac);
    const noi = egi * (1 - opexRatio);

    // Choose an entry cap in market band; price = NOI / cap
    const entryCap = rnd(m.cap[0], m.cap[1]);
    const purchasePrice = Math.round(noi / entryCap / 1000) * 1000;

    const capexPerUnitYear1 =
      profile === "yield_stable" ? rndi(500, 2500) :
      profile === "classic_value_add" ? rndi(4000, 11000) :
      rndi(9000, 18000);

    const reasonable = {
      rentGrowthMin: 0.018,
      rentGrowthMax: profile === "yield_stable" ? 0.03 : 0.035,
      exitCapMin: entryCap + 0.0025,
      exitCapMax: entryCap + 0.0125,
      rentPremiumCeilingPerUnit:
        profile === "yield_stable" ? rndi(40, 110) :
        profile === "classic_value_add" ? rndi(120, 240) :
        rndi(90, 210)
    };

    const knownFlags = [];
    if (profile === "heavy_lift") knownFlags.push("capex_execution_risk");
    if (Math.random() < 0.35) knownFlags.push("tax_reassessment_likely");

    const adjectives = ["Cedar","Sage","River","Juniper","Mesa","Pioneer","Canyon","Aspen","Sunset","Summit"];
    const name = `${pick(adjectives)} Apartments – ${m.city}`;

    return {
      id: "gen_" + Math.random().toString(16).slice(2),
      name,
      units,
      avgRentInPlace,
      otherIncomePerUnitMonthly: otherIncome,
      occupancy,
      opexRatio,
      purchasePrice,
      capexPerUnitYear1,
      sellingCostPct: 0.02,
      defaultDebt: { ltv: 0.70, rate: 0.0725, amortYears: 30 },
      coach: {
        profile,
        reasonable,
        knownFlags,
        dealTruths: [
          profile === "yield_stable"
            ? "This is a yield deal: keep assumptions conservative; returns come from stability."
            : "This is a value-creation deal: returns should survive stress, not depend on a perfect exit.",
          "Exit cap sensitivity is always a key swing factor."
        ]
      }
    };
  }

  return { makeRandomDeal };
})();
