const Generator = (() => {
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function rnd(min,max){ return min + Math.random()*(max-min); }
  function rndi(min,max){ return Math.floor(rnd(min,max+1)); }

  function makeRandomDeal(){
    const markets = [
      {
        city:"Phoenix, AZ", rent:[1450, 2050], cap:[0.055,0.065],
        marketName:"Phoenix Metro, AZ", marketRentMid:1750, vacancy:"6.2%", rentGrowth:"2.0%",
        narrative:"Phoenix metro has absorbed significant new supply. Vacancy has risen from historic lows and rent growth has moderated. Fundamentals remain solid but pro-forma assumptions must reflect current — not 2021 — conditions."
      },
      {
        city:"Dallas, TX", rent:[1350, 1950], cap:[0.055,0.07],
        marketName:"DFW Metroplex, TX", marketRentMid:1650, vacancy:"7.0%", rentGrowth:"2.5%",
        narrative:"DFW is one of the largest apartment markets in the US, with enormous new supply deliveries in recent years. Vacancy is elevated in many submarkets. Workforce housing has held up better than Class A. Rent growth is resuming but not back to pandemic-era pace."
      },
      {
        city:"Kansas City, MO", rent:[1050, 1500], cap:[0.06,0.075],
        marketName:"Kansas City, MO", marketRentMid:1240, vacancy:"5.5%", rentGrowth:"2.8%",
        narrative:"Kansas City is a stable Midwest market with limited new supply and consistent occupancy. Returns come from operational efficiency and durable occupancy — not rent lift stories. A dependable but unexciting market."
      },
      {
        city:"Salt Lake Area, UT", rent:[1500, 2200], cap:[0.055,0.07],
        marketName:"Salt Lake Valley, UT", marketRentMid:1800, vacancy:"5.3%", rentGrowth:"2.7%",
        narrative:"Salt Lake Valley continues to attract in-migration from higher cost western metros. Population and employment growth remain strong. Rents have moderated from peaks but the market maintains positive fundamentals."
      },
      {
        city:"Denver Fringe, CO", rent:[1650, 2400], cap:[0.055,0.07],
        marketName:"Denver Metro Suburbs, CO", marketRentMid:1975, vacancy:"7.1%", rentGrowth:"2.3%",
        narrative:"Denver suburbs have seen vacancy tick up as record new supply deliveries hit the market. Rent growth is positive but muted. Property taxes continue rising as county assessments catch up to elevated purchase prices."
      },
      {
        city:"Atlanta, GA", rent:[1200, 1800], cap:[0.055,0.065],
        marketName:"Atlanta Metro, GA", marketRentMid:1480, vacancy:"6.5%", rentGrowth:"3.0%",
        narrative:"Atlanta is a high-growth Sunbelt market with strong in-migration, though significant new supply has pushed vacancy up across all classes. Workforce housing has held up better than luxury. Strong long-term fundamentals."
      },
      {
        city:"Nashville, TN", rent:[1500, 2200], cap:[0.05,0.06],
        marketName:"Nashville, TN", marketRentMid:1920, vacancy:"6.8%", rentGrowth:"3.2%",
        narrative:"Nashville remains a top-tier migration market with compressed cap rates. Buyers are paying for the growth story upfront — basis discipline is essential. New supply has elevated vacancy but demand drivers remain strong."
      },
      {
        city:"Charlotte, NC", rent:[1400, 2000], cap:[0.0525,0.06],
        marketName:"Charlotte, NC", marketRentMid:1950, vacancy:"5.8%", rentGrowth:"3.0%",
        narrative:"Charlotte benefits from strong financial sector employment and consistent in-migration. A competitive acquisition market. Cap rates are compressed — verify rent comps carefully before underwriting any premium."
      }
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
      market: {
        name: m.marketName,
        avgMarketRent: m.marketRentMid,
        capRateRange: (m.cap[0]*100).toFixed(2) + "% – " + (m.cap[1]*100).toFixed(2) + "%",
        vacancyRate: m.vacancy,
        rentGrowthTrend: m.rentGrowth,
        narrative: m.narrative
      },
      coach: {
        profile,
        reasonable,
        knownFlags,
        dealTruths: [
          profile === "yield_stable"
            ? "This is a yield deal: keep assumptions conservative; returns come from stability."
            : "This is a value-creation deal: returns should survive stress, not depend on a perfect exit.",
          "Exit cap sensitivity is always a key swing factor — stress test at +100bps before committing."
        ]
      }
    };
  }

  return { makeRandomDeal };
})();
