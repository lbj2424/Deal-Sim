[
  {
    "id": "mf_001",
    "name": "12-Unit Value Add – Provo, UT",
    "units": 12,
    "avgRentInPlace": 1450,
    "otherIncomePerUnitMonthly": 35,
    "occupancy": 0.92,
    "opexRatio": 0.42,
    "purchasePrice": 2100000,
    "capexPerUnitYear1": 9000,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.7, "rate": 0.0725, "amortYears": 30 },
    "coach": {
      "profile": "classic_value_add",
      "reasonable": {
        "rentGrowthMin": 0.02,
        "rentGrowthMax": 0.035,
        "exitCapMin": 0.0575,
        "exitCapMax": 0.065,
        "rentPremiumCeilingPerUnit": 225
      },
      "knownFlags": ["tax_reassessment_likely"],
      "dealTruths": [
        "Value is created primarily through rent lift and operations, not cap compression.",
        "Exit cap sensitivity is a key swing factor."
      ]
    }
  },
  {
    "id": "mf_002",
    "name": "48-Unit Stabilized – Mesa, AZ",
    "units": 48,
    "avgRentInPlace": 1625,
    "otherIncomePerUnitMonthly": 50,
    "occupancy": 0.96,
    "opexRatio": 0.45,
    "purchasePrice": 8600000,
    "capexPerUnitYear1": 1200,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.65, "rate": 0.069, "amortYears": 30 },
    "coach": {
      "profile": "yield_stable",
      "reasonable": {
        "rentGrowthMin": 0.018,
        "rentGrowthMax": 0.03,
        "exitCapMin": 0.055,
        "exitCapMax": 0.0625,
        "rentPremiumCeilingPerUnit": 75
      },
      "knownFlags": [],
      "dealTruths": [
        "This is a yield deal: returns come from stability and modest growth.",
        "Overpaying or aggressive exit assumptions will break the deal."
      ]
    }
  },
  {
    "id": "mf_003",
    "name": "96-Unit Heavy Lift – Albuquerque, NM",
    "units": 96,
    "avgRentInPlace": 1225,
    "otherIncomePerUnitMonthly": 25,
    "occupancy": 0.87,
    "opexRatio": 0.50,
    "purchasePrice": 11250000,
    "capexPerUnitYear1": 14500,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.7, "rate": 0.075, "amortYears": 30 },
    "coach": {
      "profile": "heavy_lift",
      "reasonable": {
        "rentGrowthMin": 0.02,
        "rentGrowthMax": 0.035,
        "exitCapMin": 0.0625,
        "exitCapMax": 0.0725,
        "rentPremiumCeilingPerUnit": 185
      },
      "knownFlags": ["capex_execution_risk"],
      "dealTruths": [
        "Execution and occupancy stabilization are the entire thesis.",
        "Conservative underwriting is mandatory; downside shows up quickly."
      ]
    }
  },
  {
    "id": "mf_004",
    "name": "24-Unit Light Value Add – Denver Suburbs, CO",
    "units": 24,
    "avgRentInPlace": 1850,
    "otherIncomePerUnitMonthly": 40,
    "occupancy": 0.94,
    "opexRatio": 0.41,
    "purchasePrice": 5200000,
    "capexPerUnitYear1": 6500,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.7, "rate": 0.071, "amortYears": 30 },
    "coach": {
      "profile": "classic_value_add",
      "reasonable": {
        "rentGrowthMin": 0.02,
        "rentGrowthMax": 0.033,
        "exitCapMin": 0.055,
        "exitCapMax": 0.065,
        "rentPremiumCeilingPerUnit": 160
      },
      "knownFlags": ["property_tax_growth_risk"],
      "dealTruths": [
        "This can work with a realistic rent lift and stable DSCR.",
        "Don’t force returns with aggressive exit cap assumptions."
      ]
    }
  },
  {
    "id": "mf_005",
    "name": "180-Unit Workforce – Kansas City, MO",
    "units": 180,
    "avgRentInPlace": 1180,
    "otherIncomePerUnitMonthly": 30,
    "occupancy": 0.95,
    "opexRatio": 0.48,
    "purchasePrice": 24500000,
    "capexPerUnitYear1": 3000,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.65, "rate": 0.0675, "amortYears": 30 },
    "coach": {
      "profile": "yield_stable",
      "reasonable": {
        "rentGrowthMin": 0.0175,
        "rentGrowthMax": 0.03,
        "exitCapMin": 0.0575,
        "exitCapMax": 0.0675,
        "rentPremiumCeilingPerUnit": 90
      },
      "knownFlags": [],
      "dealTruths": [
        "This is about durable occupancy and moderate rent growth.",
        "Upside exists, but it’s not a renovation story."
      ]
    }
  },
  {
    "id": "mf_006",
    "name": "36-Unit Mismanaged – Salt Lake Fringe, UT",
    "units": 36,
    "avgRentInPlace": 1550,
    "otherIncomePerUnitMonthly": 20,
    "occupancy": 0.90,
    "opexRatio": 0.46,
    "purchasePrice": 6400000,
    "capexPerUnitYear1": 8500,
    "sellingCostPct": 0.02,
    "defaultDebt": { "ltv": 0.7, "rate": 0.073, "amortYears": 30 },
    "coach": {
      "profile": "classic_value_add",
      "reasonable": {
        "rentGrowthMin": 0.02,
        "rentGrowthMax": 0.035,
        "exitCapMin": 0.0575,
        "exitCapMax": 0.0675,
        "rentPremiumCeilingPerUnit": 190
      },
      "knownFlags": ["collections_risk"],
      "dealTruths": [
        "Operations matter: vacancy and expenses are the main risks.",
        "Underwrite conservatively; don’t assume perfect stabilization."
      ]
    }
  }
]
