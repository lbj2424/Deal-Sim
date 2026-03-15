const App = (() => {
  let DEALS = [];
  let GENERATED = [];

  function money(n){
    return Number(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});
  }
  function pct(n){ return (n*100).toFixed(2) + "%"; }
  function fmt(n, digits=2){ return Number(n).toFixed(digits); }

  function irrBucket(irrVal){
    const p = (irrVal || 0) * 100;
    if (p >= 16) return "16+";
    if (p >= 13) return "13-16";
    if (p >= 10) return "10-13";
    return "<10";
  }

  function titleCase(s){
    return String(s).replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim();
  }

  function renderStatementTable(stmt){
    const rows = (obj) => Object.entries(obj || {}).map(([k,v]) => `
      <tr><td>${titleCase(k)}</td><td>${money(v)}</td></tr>
    `).join("");

    return `
      <table>
        <tbody>${rows(stmt.income)}</tbody>
        <tr><th>Total Income</th><th>${money(stmt.totalIncome)}</th></tr>
      </table>

      <div style="height:12px;"></div>

      <table>
        <tbody>${rows(stmt.expenses)}</tbody>
        <tr><th>Total Expenses</th><th>${money(stmt.totalExpenses)}</th></tr>
      </table>

      <div style="height:12px;"></div>
      <div class="row">
        <span class="badge">NOI: ${money(stmt.noi)}</span>
      </div>
    `;
  }
function allocMonthly(total, seed=1, smooth=0.12){
  smooth = Math.min(0.20, Math.max(0, smooth)); // clamp

  let x = seed;
  const rand = () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };

  const w = [];
  for (let i = 0; i < 12; i++){
    const noise = (rand() - 0.5) * 2 * smooth; // [-smooth, +smooth]
    w.push(Math.max(0.01, 1/12 + noise));
  }

  const wSum = w.reduce((a,b)=>a+b,0);
  const raw = w.map(v => (v / wSum) * total);

  const rounded = raw.map(v => Math.round(v));
  const drift = Math.round(total) - rounded.reduce((a,b)=>a+b,0);
  rounded[11] += drift;

  return rounded;
}

function buildT12Monthly(deal){
  const t12 = Calc.statementFromT12(deal);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Use deal id to seed so each deal looks different but stays consistent
  let seed = 1;
  for (const ch of String(deal.id || "mf_000")) seed += ch.charCodeAt(0);

  // Income monthly
  const incMonthly = {};
  for (const [k,v] of Object.entries(t12.income || {})){
    // income can be negative (vacancy loss). allocate based on absolute then reapply sign
    const sign = v < 0 ? -1 : 1;
    incMonthly[k] = allocMonthly(Math.abs(v), seed + k.length, 0.10).map(n => n * sign);
  }

  // Expense monthly
  const expMonthly = {};
  for (const [k,v] of Object.entries(t12.expenses || {})){
    expMonthly[k] = allocMonthly(v, seed + k.length + 99, 0.08);
  }

  return { months, incMonthly, expMonthly };
}

function renderMonthlyT12Table(t12m){
  const { months, incMonthly, expMonthly } = t12m;

  function row(label, arr){
    const total = arr.reduce((a,b)=>a+b,0);
    return `
      <tr>
        <td>${label === "NOI" ? "NOI" : titleCase(label)}</td>
        ${arr.map(v => `<td>${money(v)}</td>`).join("")}
        <td><b>${money(total)}</b></td>
      </tr>
    `;
  }

  function section(title, obj){
    const keys = Object.keys(obj);
    const rowsHTML = keys.map(k => row(k, obj[k])).join("");
    return `
      <h3 style="margin:10px 0 6px;">${title}</h3>
      <div style="overflow:auto;">
        <table>
          <thead>
            <tr>
              <th style="min-width:180px;">Line Item</th>
              ${months.map(m => `<th>${m}</th>`).join("")}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHTML}
          </tbody>
        </table>
      </div>
    `;
  }

  const incomeKeys = Object.keys(incMonthly);
  const expKeys = Object.keys(expMonthly);

  const incomeByMonth = Array(12).fill(0).map((_,i)=> incomeKeys.reduce((s,k)=>s + (incMonthly[k][i]||0), 0));
  const expByMonth = Array(12).fill(0).map((_,i)=> expKeys.reduce((s,k)=>s + (expMonthly[k][i]||0), 0));
  const noiByMonth = incomeByMonth.map((v,i)=> v - expByMonth[i]);

  const noiRow = `
    <h3 style="margin:12px 0 6px;">NOI</h3>
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th style="min-width:180px;">Line Item</th>
            ${months.map(m => `<th>${m}</th>`).join("")}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${row("NOI", noiByMonth)}
        </tbody>
      </table>
    </div>
  `;

  return section("Income", incMonthly) + section("Expenses", expMonthly) + noiRow;
}


  async function loadDeals(){
    if (DEALS.length) return DEALS;
    try {
      const res = await fetch("./data/deals.json");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      DEALS = await res.json();
    } catch(e) {
      const grid = document.getElementById("dealGrid");
      if (grid) grid.innerHTML = `<p style="color:#e07070;padding:14px;">
        Could not load deals.json (${e.message}).<br>
        Open this app through a web server — e.g. VS Code Live Server or GitHub Pages.
        File:// URLs block fetch requests.
      </p>`;
    }
    return DEALS;
  }

  function dealCardHTML(d){
    const tag = d.coach?.profile?.replaceAll("_"," ") || "multifamily";
    return `
      <div class="dealCard">
        <h3>${d.name}</h3>
        <div class="muted">
          <span class="badge">${tag}</span>
        </div>
        <div class="muted" style="margin-top:8px;">Units: <b>${d.units}</b></div>
        <div class="muted">Price: <b>${money(d.purchasePrice)}</b></div>
        <div class="muted">Occ: <b>${Math.round(d.occupancy*100)}%</b> | Opex: <b>${Math.round(d.opexRatio*100)}%</b></div>
        <div class="row" style="margin-top:10px;">
          <a class="btn" href="deal.html?id=${encodeURIComponent(d.id)}">Open</a>
        </div>
      </div>
    `;
  }

  async function renderDealFeed(){
    const deals = await loadDeals();
    const grid = document.getElementById("dealGrid");
    grid.innerHTML = deals.map(dealCardHTML).join("") +
                     GENERATED.map(dealCardHTML).join("");
  }

  function addGeneratedDealToFeed(d){
    GENERATED.unshift(d);
    renderDealFeed();
  }

  function getQueryParam(key){
    const u = new URL(window.location.href);
    return u.searchParams.get(key);
  }

  function renderKV(el, items){
    el.innerHTML = items.map(x => `
      <div><div class="k">${x.k}</div><div class="v">${x.v}</div></div>
    `).join("");
  }

  async function initDealPage(){
    const id = getQueryParam("id");
    const deals = await loadDeals();
    const all = [...deals, ...GENERATED];
    const deal = all.find(d => d.id === id) || deals[0];

    document.getElementById("dealTitle").textContent = deal.name;

    // Deal facts — show in-place vs market rent delta if market data exists
    const mkt = deal.market;
    const rentDelta = mkt ? Math.round(((deal.avgRentInPlace / mkt.avgMarketRent) - 1) * 100) : null;
    const rentDeltaStr = rentDelta !== null
      ? ` <span style="color:${rentDelta < 0 ? '#6fe0a0' : '#e07070'};">(${rentDelta > 0 ? '+' : ''}${rentDelta}% vs market)</span>`
      : "";

    const factItems = [
      { k:"Units", v: deal.units },
      { k:"Purchase Price", v: money(deal.purchasePrice) },
      { k:"Price / Unit", v: money(Math.round(deal.purchasePrice / deal.units)) },
      { k:"In-place Avg Rent", v: money(deal.avgRentInPlace) + "/mo" + rentDeltaStr },
      { k:"Other Income", v: money((deal.otherIncomePerUnitMonthly||0)) + "/unit/mo" },
      { k:"Occupancy", v: Math.round(deal.occupancy*100) + "%" },
      { k:"Opex Ratio", v: Math.round(deal.opexRatio*100) + "%" },
      { k:"Year-1 CapEx", v: money(deal.units * (deal.capexPerUnitYear1||0)) },
      { k:"Default LTV / Rate", v: Math.round(deal.defaultDebt.ltv*100) + "% / " + (deal.defaultDebt.rate*100).toFixed(2) + "%" }
    ];

    if (mkt) {
      factItems.push(
        { k:"Market Avg Rent", v: money(mkt.avgMarketRent) + "/mo" },
        { k:"Market Cap Range", v: mkt.capRateRange },
        { k:"Market Vacancy", v: mkt.vacancyRate },
        { k:"Market Rent Growth", v: mkt.rentGrowthTrend + " (trailing 12mo)" }
      );
    }

    renderKV(document.getElementById("dealFacts"), factItems);

    if (mkt) {
      const narrativeEl = document.createElement("div");
      narrativeEl.className = "marketNarrative";
      narrativeEl.textContent = mkt.narrative;
      document.getElementById("dealFacts").appendChild(narrativeEl);
    }

    // Sketch card — show teaser facts (price/unit, rent, occ, capex/unit)
    const sketchFacts = document.getElementById("sketchFacts");
    if (sketchFacts) {
      const profile = deal.coach?.profile?.replaceAll("_"," ") || "multifamily";
      sketchFacts.innerHTML = `
        <span class="badge">${profile}</span>
        <span class="sketchFact"><b>${deal.units}</b> units</span>
        <span class="sketchFact">${money(Math.round(deal.purchasePrice/deal.units))}<span class="sketchFactLabel">/unit</span></span>
        <span class="sketchFact">${money(deal.avgRentInPlace)}<span class="sketchFactLabel">/mo in-place</span></span>
        <span class="sketchFact">${Math.round(deal.occupancy*100)}%<span class="sketchFactLabel"> occ</span></span>
        <span class="sketchFact">${Math.round(deal.opexRatio*100)}%<span class="sketchFactLabel"> opex</span></span>
        <span class="sketchFact">${money(deal.capexPerUnitYear1||0)}<span class="sketchFactLabel">/unit capex</span></span>
        ${mkt ? `<span class="sketchFact">${mkt.capRateRange}<span class="sketchFactLabel"> mkt caps</span></span>` : ""}
      `;
    }

    // Sketch submit: record answers, collapse card, reveal analysis
    let sketchAnswers = null;

    document.getElementById("btnStartAnalysis").addEventListener("click", () => {
      const skType = document.querySelector('input[name="skType"]:checked')?.value || null;
      const skIRR  = document.querySelector('input[name="skIRR"]:checked')?.value  || null;
      const skLean = document.querySelector('input[name="skLean"]:checked')?.value || null;

      sketchAnswers = { type: skType, irr: skIRR, lean: skLean };

      // Collapse sketch card to a summary strip
      const sketchCard = document.getElementById("sketchCard");
      sketchCard.innerHTML = `
        <div class="sketchSummary">
          <span class="muted">First Look:</span>
          <span class="badge">${skType?.replaceAll("_"," ") || "—"}</span>
          <span class="badge">${skIRR ? "IRR " + skIRR + "%" : "—"}</span>
          <span class="badge">${skLean || "—"}</span>
        </div>`;

      document.getElementById("analysisBody").style.display = "block";
      document.getElementById("analysisBody").scrollIntoView({ behavior:"smooth" });
    });

    // defaults
    document.getElementById("ltv").value = Math.round(deal.defaultDebt.ltv*100);
    document.getElementById("rate").value = (deal.defaultDebt.rate*100).toFixed(2);

    function readInputs(){
      return {
        holdYears: Number(document.getElementById("holdYears").value),
        rentGrowth: Number(document.getElementById("rentGrowth").value)/100,
        expGrowth: Number(document.getElementById("expGrowth").value)/100,
        vacancy: Number(document.getElementById("vacancy").value)/100,
        rentPremium: Number(document.getElementById("rentPremium").value),
        exitCap: Number(document.getElementById("exitCap").value)/100,
        ltv: Number(document.getElementById("ltv").value)/100,
        rate: Number(document.getElementById("rate").value)/100
      };
    }

    function validateInputs(inputs){
      const errors = [];
      const warnings = [];

      if (!Number.isInteger(inputs.holdYears) || inputs.holdYears < 1 || inputs.holdYears > 30)
        errors.push("Hold period must be a whole number between 1 and 30 years.");
      if (inputs.rentGrowth < -0.05 || inputs.rentGrowth > 0.15)
        errors.push("Rent growth must be between -5% and 15%.");
      else if (inputs.rentGrowth > 0.04)
        warnings.push("Rent growth above 4% is aggressive for most markets.");
      if (inputs.expGrowth < 0 || inputs.expGrowth > 0.15)
        errors.push("Expense growth must be between 0% and 15%.");
      if (inputs.vacancy < 0 || inputs.vacancy > 0.50)
        errors.push("Vacancy must be between 0% and 50%.");
      else if (inputs.vacancy < 0.03)
        warnings.push("Vacancy below 3% is very optimistic — most markets run 5–8%.");
      if (inputs.rentPremium < 0 || inputs.rentPremium > 2000)
        errors.push("Rent premium must be between $0 and $2,000/unit.");
      if (inputs.exitCap < 0.02 || inputs.exitCap > 0.15)
        errors.push("Exit cap rate must be between 2% and 15%.");
      if (inputs.ltv < 0 || inputs.ltv >= 1.0)
        errors.push("LTV must be between 0% and 99%.");
      else if (inputs.ltv > 0.80)
        warnings.push("LTV above 80% is high leverage — DSCR will be tight.");
      if (inputs.rate < 0.005 || inputs.rate > 0.25)
        errors.push("Interest rate must be between 0.5% and 25%.");

      return { errors, warnings };
    }

    function showValidationMessages(errors, warnings){
      const el = document.getElementById("inputWarnings");
      if (!el) return;
      if (!errors.length && !warnings.length){
        el.innerHTML = "";
        return;
      }
      const errHTML = errors.map(e => `<div class="warn-error">&#9888; ${e}</div>`).join("");
      const warnHTML = warnings.map(w => `<div class="warn-warning">&#9432; ${w}</div>`).join("");
      el.innerHTML = errHTML + warnHTML;
    }

   function colorCodeInputs(inputs){
  const r = deal.coach?.reasonable;

  function setColor(id, status){
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("input-ok","input-warn","input-bad");
    if (status) el.classList.add("input-" + status);
  }

  if (r){
    if (inputs.rentGrowth >= r.rentGrowthMin && inputs.rentGrowth <= r.rentGrowthMax)
      setColor("rentGrowth","ok");
    else if (inputs.rentGrowth <= r.rentGrowthMax + 0.0075)
      setColor("rentGrowth","warn");
    else
      setColor("rentGrowth","bad");

    if (inputs.exitCap >= r.exitCapMin && inputs.exitCap <= r.exitCapMax)
      setColor("exitCap","ok");
    else if (inputs.exitCap >= r.exitCapMin - 0.0025)
      setColor("exitCap","warn");
    else
      setColor("exitCap","bad");

    if (inputs.rentPremium <= r.rentPremiumCeilingPerUnit)
      setColor("rentPremium","ok");
    else if (inputs.rentPremium <= r.rentPremiumCeilingPerUnit * 1.10)
      setColor("rentPremium","warn");
    else
      setColor("rentPremium","bad");
  }

  // General rules for the rest
  if (inputs.vacancy >= 0.05 && inputs.vacancy <= 0.12) setColor("vacancy","ok");
  else if (inputs.vacancy < 0.03 || inputs.vacancy > 0.15) setColor("vacancy","bad");
  else setColor("vacancy","warn");

  if (inputs.ltv <= 0.70) setColor("ltv","ok");
  else if (inputs.ltv <= 0.80) setColor("ltv","warn");
  else setColor("ltv","bad");
}

  function irrHeat(irr){
    const p = irr * 100;
    if (p >= 18) return { bg:"#173324", text:"#6fe0a0" };
    if (p >= 14) return { bg:"#1e3020", text:"#90d890" };
    if (p >= 12) return { bg:"#2c3510", text:"#c8d870" };
    if (p >= 10) return { bg:"#352e10", text:"#e0c860" };
    return       { bg:"#361010", text:"#e07070" };
  }

  function buildSensitivityTable(inputs){
    const rgSteps = [-0.01, 0, 0.01].map(d => inputs.rentGrowth + d);
    const ecSteps = [-0.005, 0, 0.005].map(d => inputs.exitCap + d);

    let html = `<div style="overflow:auto;"><table class="sensTable"><thead><tr>
      <th>Exit Cap \\ Rent Growth</th>
      ${rgSteps.map((rg, i) => `<th${i===1?' class="sens-highlight"':''}>${(rg*100).toFixed(1)}%${i===1?' ★':''}</th>`).join("")}
    </tr></thead><tbody>`;

    for (let ri = 0; ri < ecSteps.length; ri++){
      const ec = ecSteps[ri];
      html += `<tr><th${ri===1?' class="sens-highlight"':''}>${(ec*100).toFixed(2)}%${ri===1?' ★':''}</th>`;
      for (let ci = 0; ci < rgSteps.length; ci++){
        const res = Calc.simulate(deal, { ...inputs, exitCap: ec, rentGrowth: rgSteps[ci] });
        const { bg, text } = irrHeat(res.irr);
        const isBase = ri===1 && ci===1;
        html += `<td style="background:${bg};color:${text};${isBase?"border:2px solid #c0d0ff;font-weight:700;":""}">${(res.irr*100).toFixed(1)}%</td>`;
      }
      html += `</tr>`;
    }

    html += `</tbody></table></div>
    <p class="muted" style="font-size:12px;margin-top:8px;">
      ★ = your inputs &nbsp;|&nbsp;
      <span style="color:#6fe0a0;">&#9632;</span> ≥18% &nbsp;
      <span style="color:#90d890;">&#9632;</span> ≥14% &nbsp;
      <span style="color:#c8d870;">&#9632;</span> ≥12% &nbsp;
      <span style="color:#e0c860;">&#9632;</span> ≥10% &nbsp;
      <span style="color:#e07070;">&#9632;</span> &lt;10%
    </p>`;

    return html;
  }

  function renderAssumptionComparison(inputs){
    const r = deal.coach?.reasonable;
    if (!r) return "";

    const rows = [
      {
        label: "Rent Growth",
        yours: (inputs.rentGrowth*100).toFixed(1) + "%",
        range: (r.rentGrowthMin*100).toFixed(1) + "% – " + (r.rentGrowthMax*100).toFixed(1) + "%",
        status: inputs.rentGrowth <= r.rentGrowthMax ? "ok"
               : inputs.rentGrowth <= r.rentGrowthMax + 0.0075 ? "warn" : "bad"
      },
      {
        label: "Exit Cap",
        yours: (inputs.exitCap*100).toFixed(2) + "%",
        range: (r.exitCapMin*100).toFixed(2) + "% – " + (r.exitCapMax*100).toFixed(2) + "%",
        status: inputs.exitCap >= r.exitCapMin ? "ok"
               : inputs.exitCap >= r.exitCapMin - 0.0025 ? "warn" : "bad"
      },
      {
        label: "Rent Premium",
        yours: "$" + inputs.rentPremium + "/unit",
        range: "≤ $" + r.rentPremiumCeilingPerUnit + "/unit",
        status: inputs.rentPremium <= r.rentPremiumCeilingPerUnit ? "ok"
               : inputs.rentPremium <= r.rentPremiumCeilingPerUnit * 1.10 ? "warn" : "bad"
      }
    ];

    const icon  = { ok:"✓ In range", warn:"⚠ Slightly aggressive", bad:"✗ Outside range" };
    const style = { ok:"color:#6fe0a0;", warn:"color:#e0c860;", bad:"color:#e07070;" };

    return `
      <h3>Your Assumptions vs. Reasonable Range</h3>
      <table>
        <thead><tr><th>Assumption</th><th>Your Input</th><th>Reasonable Range</th><th>Assessment</th></tr></thead>
        <tbody>
          ${rows.map(r=>`
            <tr>
              <td>${r.label}</td>
              <td>${r.yours}</td>
              <td>${r.range}</td>
              <td style="${style[r.status]}">${icon[r.status]}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  // ── WATERFALL ────────────────────────────────────────────────────────────
  function readWaterfallInputs(){
    return {
      lpShare:   Number(document.getElementById("wfLPShare")?.value  || 80) / 100,
      prefRate:  Number(document.getElementById("wfPref")?.value     || 8)  / 100,
      promote:   Number(document.getElementById("wfPromote")?.value  || 20) / 100,
      hurdle2:   Number(document.getElementById("wfHurdle2")?.value  || 0)  / 100,
      promote2:  Number(document.getElementById("wfPromote2")?.value || 30) / 100,
    };
  }

  function calcWaterfall(simResult, wf){
    const { cashflows } = simResult;
    const { lpShare, prefRate, promote, hurdle2, promote2 } = wf;
    const gpShare = 1 - lpShare;

    const totalEquity = -cashflows[0];
    const lpEquity    = totalEquity * lpShare;
    const gpEquity    = totalEquity * gpShare;

    let lpUnreturned  = lpEquity;
    let gpUnreturned  = gpEquity;
    let lpPrefAccrued = 0;

    const lpCfs = [-lpEquity];
    const gpCfs = [-gpEquity];

    for (let y = 1; y < cashflows.length; y++){
      let rem = cashflows[y];
      let lpD = 0, gpD = 0;

      if (rem <= 0){
        // Negative CF year — each party absorbs their share; pref still accrues
        lpCfs.push(rem * lpShare);
        gpCfs.push(rem * gpShare);
        lpPrefAccrued += lpUnreturned * prefRate;
        continue;
      }

      // Accrue pref on unreturned LP capital (simple, annual)
      lpPrefAccrued += lpUnreturned * prefRate;

      // Tier 1: LP preferred return (catch up all accrued arrears)
      if (rem > 0 && lpPrefAccrued > 0){
        const pmt = Math.min(rem, lpPrefAccrued);
        lpD += pmt; lpPrefAccrued -= pmt; rem -= pmt;
      }

      // Tier 2: Return LP capital
      if (rem > 0 && lpUnreturned > 0){
        const ret = Math.min(rem, lpUnreturned);
        lpD += ret; lpUnreturned -= ret; rem -= ret;
      }

      // Tier 3: Return GP capital
      if (rem > 0 && gpUnreturned > 0){
        const ret = Math.min(rem, gpUnreturned);
        gpD += ret; gpUnreturned -= ret; rem -= ret;
      }

      // Tier 4: Split per promote (with optional second hurdle)
      if (rem > 0){
        // Determine which promote tier applies based on simple LP IRR proxy
        // (For simplicity we use the single promote for all; second hurdle adds more GP upside)
        const usePromote2 = hurdle2 > 0 && promote2 > 0 && Calc.irr(lpCfs) >= hurdle2;
        const gpCut = usePromote2 ? promote2 : promote;
        lpD += rem * (1 - gpCut);
        gpD += rem * gpCut;
      }

      lpCfs.push(lpD);
      gpCfs.push(gpD);
    }

    const lpIRR   = Calc.irr(lpCfs);
    const gpIRR   = gpEquity > 0 ? Calc.irr(gpCfs) : null;
    const lpDist  = lpCfs.slice(1).reduce((a,b) => a+b, 0);
    const gpDist  = gpCfs.slice(1).reduce((a,b) => a+b, 0);
    const lpEM    = lpDist  / (lpEquity  || 1e-9);
    const gpEM    = gpEquity > 0 ? gpDist / gpEquity : null;
    const prefCovered = lpPrefAccrued <= 1; // ≤$1 floating point tolerance

    return { lpEquity, gpEquity, lpIRR, gpIRR, lpEM, gpEM,
             lpDist, gpDist, prefCovered, lpPrefOutstanding: lpPrefAccrued };
  }

  function renderWaterfallOutput(simResult, wf){
    const w   = calcWaterfall(simResult, wf);
    const gpShare = 1 - wf.lpShare;
    const prefStr = (wf.prefRate * 100).toFixed(1) + "% pref";
    const promStr = (wf.promote  * 100).toFixed(0) + "% promote";
    const h2str   = wf.hurdle2 > 0
      ? ` → ${(wf.promote2*100).toFixed(0)}% above ${(wf.hurdle2*100).toFixed(0)}% hurdle`
      : "";

    const prefIcon = w.prefCovered
      ? `<span style="color:#6fe0a0;">✓ Fully covered</span>`
      : `<span style="color:#e07070;">✗ $${money(w.lpPrefOutstanding)} outstanding at exit</span>`;

    return `
      <p class="muted" style="margin:0 0 12px;">
        Structure: ${Math.round(wf.lpShare*100)}% LP / ${Math.round(gpShare*100)}% GP &nbsp;·&nbsp;
        ${prefStr} &nbsp;·&nbsp; ${promStr}${h2str}
      </p>
      <div class="wfGrid">
        <div class="wfSide">
          <div class="wfLabel">Limited Partner (LP)</div>
          <div class="wfKV">
            <div><div class="k">Equity Invested</div><div class="v">${money(w.lpEquity)}</div></div>
            <div><div class="k">Total Distributions</div><div class="v">${money(w.lpDist)}</div></div>
            <div><div class="k">Equity Multiple</div><div class="v">${w.lpEM.toFixed(2)}x</div></div>
            <div><div class="k">IRR</div><div class="v">${pct(w.lpIRR)}</div></div>
            <div><div class="k">Preferred Return</div><div class="v">${prefIcon}</div></div>
          </div>
        </div>
        <div class="wfSide">
          <div class="wfLabel">General Partner (GP)</div>
          <div class="wfKV">
            <div><div class="k">Equity Invested</div><div class="v">${money(w.gpEquity)}</div></div>
            <div><div class="k">Total Distributions</div><div class="v">${money(w.gpDist)}</div></div>
            <div><div class="k">Equity Multiple</div><div class="v">${w.gpEM !== null ? w.gpEM.toFixed(2)+"x" : "—"}</div></div>
            <div><div class="k">IRR</div><div class="v">${w.gpIRR !== null ? pct(w.gpIRR) : "—"}</div></div>
            <div><div class="k">Promote Earned</div><div class="v">${money(w.gpDist - w.gpEquity)}</div></div>
          </div>
        </div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:10px;">
        LP IRR (${pct(w.lpIRR)}) vs. deal IRR (${pct(simResult.irr)}) — the gap is the promote cost to LP.
        GP IRR is amplified by promote${gpShare < 0.15 ? " (small co-invest)" : ""}.
      </p>
    `;
  }

  // ── THESIS FEEDBACK ───────────────────────────────────────────────────────
  function renderThesisFeedback(thesisFeedback){
    if (!thesisFeedback || !thesisFeedback.length) return "";

    const typeStyle = {
      aligned:  { icon:"✓", color:"#6fe0a0", bg:"#0a1f10" },
      gap:      { icon:"⚠", color:"#e0c860", bg:"#1a1a08" },
      conflict: { icon:"✗", color:"#e07070", bg:"#1f0a0a" },
      missing:  { icon:"○", color:"#9fb0c6", bg:"#0c1320" },
    };

    const rows = thesisFeedback.map(fb => {
      const s = typeStyle[fb.type] || typeStyle.missing;
      return `
        <div class="thesisFbRow" style="background:${s.bg};border-left:3px solid ${s.color};">
          <div class="thesisFbField" style="color:${s.color};">${s.icon} ${fb.field}</div>
          <div class="thesisFbNote">${fb.note}</div>
        </div>`;
    }).join("");

    return `<h3>Thesis Evaluation</h3><div class="thesisFbList">${rows}</div>`;
  }

  // ── COACH'S UNDERWRITE ────────────────────────────────────────────────────
  function buildCoachUnderwrite(deal, userInputs, userReview){
    const r = deal.coach?.reasonable;
    if (!r) return `<p class="muted">No reasonable-range data available for this deal — coach underwrite requires deal calibration data.</p>`;

    const coachInputs = {
      ...userInputs,
      rentGrowth:  (r.rentGrowthMin  + r.rentGrowthMax)  / 2,
      exitCap:     (r.exitCapMin     + r.exitCapMax)      / 2,
      rentPremium: Math.round(r.rentPremiumCeilingPerUnit * 0.80),
    };

    const coachSim    = Calc.simulate(deal, coachInputs);
    const coachReview = Coach.review(deal, coachInputs);

    const diffColor = (yours, coach) => {
      const d = yours - coach;
      if (Math.abs(d) < 0.001) return "";
      return d > 0 ? "color:#6fe0a0;" : "color:#e07070;";
    };

    const recStyle = rec => rec === "BUY" ? "color:#6fe0a0;"
                          : rec === "PASS" ? "color:#e07070;" : "color:#e0c860;";

    return `
      <table>
        <thead>
          <tr><th>Metric</th><th>Your Underwrite</th><th>Coach's Underwrite</th></tr>
        </thead>
        <tbody>
          <tr><td>Rent Growth</td>
              <td>${(userInputs.rentGrowth*100).toFixed(1)}%</td>
              <td>${(coachInputs.rentGrowth*100).toFixed(1)}%</td></tr>
          <tr><td>Exit Cap</td>
              <td>${(userInputs.exitCap*100).toFixed(2)}%</td>
              <td>${(coachInputs.exitCap*100).toFixed(2)}%</td></tr>
          <tr><td>Rent Premium</td>
              <td>$${userInputs.rentPremium}/unit</td>
              <td>$${coachInputs.rentPremium}/unit</td></tr>
          <tr style="border-top:2px solid #233244;">
              <td>IRR</td>
              <td>${pct(userReview.base.irr)}</td>
              <td style="${diffColor(coachSim.irr, userReview.base.irr)}">${pct(coachSim.irr)}</td></tr>
          <tr><td>Min DSCR</td>
              <td>${userReview.base.minDSCR.toFixed(2)}</td>
              <td style="${diffColor(coachSim.minDSCR, userReview.base.minDSCR)}">${coachSim.minDSCR.toFixed(2)}</td></tr>
          <tr><td>Equity Multiple</td>
              <td>${userReview.base.equityMultiple.toFixed(2)}x</td>
              <td style="${diffColor(coachSim.equityMultiple, userReview.base.equityMultiple)}">${coachSim.equityMultiple.toFixed(2)}x</td></tr>
          <tr><td>Exit Stress IRR (+100bps)</td>
              <td>${pct(userReview.exitStress.irr)}</td>
              <td>${pct(coachReview.exitStress.irr)}</td></tr>
          <tr style="border-top:2px solid #233244;">
              <td>Score</td>
              <td>${userReview.score} / 100</td>
              <td style="${diffColor(coachReview.score, userReview.score)}">${coachReview.score} / 100</td></tr>
          <tr><td>Recommendation</td>
              <td style="${recStyle(userReview.recommendation)}">${userReview.recommendation}</td>
              <td style="${recStyle(coachReview.recommendation)}">${coachReview.recommendation}</td></tr>
        </tbody>
      </table>
      <p class="muted" style="font-size:12px;margin-top:8px;">
        Coach's underwrite uses reasonable-range midpoints for rent growth, exit cap, and rent premium.
        All other inputs (hold, LTV, rate, vacancy, expense growth) remain as yours.
      </p>
    `;
  }

   function updateResults(){
  const inputs = readInputs();
  const { errors, warnings } = validateInputs(inputs);
  showValidationMessages(errors, warnings);
  colorCodeInputs(inputs);
  if (errors.length) return; // block calculation if inputs are invalid
  const res = Calc.simulate(deal, inputs);

  // show T12 + Pro Forma tables (updates on recalc)
  const t12 = Calc.statementFromT12(deal);
  const pf  = Calc.proformaFromInputs(deal, inputs);

  const t12El = document.getElementById("t12Table");
  if (t12El) t12El.innerHTML = renderStatementTable(t12);

  const pfEl = document.getElementById("pfTable");
  if (pfEl) pfEl.innerHTML = renderStatementTable(pf);

  // NEW: monthly T12 (12 months)
  const t12m = buildT12Monthly(deal);
  const t12MonthEl = document.getElementById("t12MonthTable");
  if (t12MonthEl) t12MonthEl.innerHTML = renderMonthlyT12Table(t12m);

  renderKV(document.getElementById("results"), [
    { k:"IRR", v: pct(res.irr) },
    { k:"Equity Multiple", v: fmt(res.equityMultiple, 2) + "x" },
    { k:"Avg Cash-on-Cash", v: pct(res.avgCoC) },
    { k:"Min DSCR", v: fmt(res.minDSCR, 2) },
    { k:"Worst Break-even Occ", v: Math.round(res.breakEvenOccMax*100) + "%" },
    { k:"Exit Price", v: money(res.exitPrice) },
    { k:"T12 NOI", v: money(t12.noi) },
{ k:"Pro Forma NOI", v: money(pf.noi) }
  ]);

  const sensEl = document.getElementById("sensitivityTable");
  if (sensEl) sensEl.innerHTML = buildSensitivityTable(inputs);

  // Waterfall (re-renders with current deal simulation)
  const wfOut = document.getElementById("waterfallOut");
  if (wfOut) wfOut.innerHTML = renderWaterfallOutput(res, readWaterfallInputs());

  return res;
}



    updateResults();
    document.getElementById("recalc").addEventListener("click", updateResults);

    // Color-code inputs live as the user types (no recalc needed)
    ["holdYears","rentGrowth","expGrowth","vacancy","rentPremium","exitCap","ltv","rate"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => colorCodeInputs(readInputs()));
    });

    // Waterfall inputs: live re-render when changed
    ["wfLPShare","wfPref","wfPromote","wfHurdle2","wfPromote2"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", () => {
        const lastRes = Calc.simulate(deal, readInputs());
        const wfOut   = document.getElementById("waterfallOut");
        if (wfOut) wfOut.innerHTML = renderWaterfallOutput(lastRes, readWaterfallInputs());
      });
    });

    let decision = null;

const btnBuy = document.getElementById("btnBuy");
const btnPass = document.getElementById("btnPass");

function setDecision(val){
  decision = val;

  btnBuy.classList.toggle("active", val === "BUY");
  btnPass.classList.toggle("active", val === "PASS");
}

btnBuy.addEventListener("click", () => setDecision("BUY"));
btnPass.addEventListener("click", () => setDecision("PASS"));

    document.getElementById("btnReveal").addEventListener("click", () => {
      const inputs = readInputs();
      updateResults();

      const review = Coach.review(deal, inputs);

      Storage.saveDecision({
        ts: new Date().toISOString(),
        dealId:       deal.id,
        dealName:     deal.name,
        dealProfile:  deal.coach?.profile || null,
        yourDecision: decision || "UNSET",
        coachDecision: review.recommendation,
        score:        review.score,
        // Core outputs
        irr:              review.base.irr,
        minDSCR:          review.base.minDSCR,
        equityMultiple:   review.base.equityMultiple,
        avgCoC:           review.base.avgCoC,
        breakEvenOcc:     review.base.breakEvenOccMax,
        exitStressIRR:    review.exitStress.irr,
        vacStressMinDSCR: review.vacStress.minDSCR,
        flags:            review.flags,
        // User's assumptions (for bias tracking)
        inputRentGrowth:  inputs.rentGrowth,
        inputExitCap:     inputs.exitCap,
        inputRentPremium: inputs.rentPremium,
        inputVacancy:     inputs.vacancy,
        inputLTV:         inputs.ltv,
        inputHoldYears:   inputs.holdYears,
        // Deal's reasonable ranges (for bias calculation)
        reasonableRentGrowthMax:     deal.coach?.reasonable?.rentGrowthMax     || null,
        reasonableExitCapMin:        deal.coach?.reasonable?.exitCapMin        || null,
        reasonableRentPremiumCeiling:deal.coach?.reasonable?.rentPremiumCeilingPerUnit || null,
        // Thesis fields
        thesisWhat:   (document.getElementById("thesisWhat").value   || "").trim(),
        thesisWhy:    (document.getElementById("thesisWhy").value    || "").trim(),
        thesisExit:   (document.getElementById("thesisExit").value   || "").trim(),
        thesisKiller: (document.getElementById("thesisKiller").value || "").trim(),
        confidence:   Number(document.getElementById("confidence").value || 3),
        // Sketch
        sketchType: sketchAnswers?.type  || null,
        sketchIRR:  sketchAnswers?.irr   || null,
        sketchLean: sketchAnswers?.lean  || null
      });

      const el = document.getElementById("coachOut");
      const flags = review.flags.map(f => `<span class="badge">${f.replaceAll("_"," ")}</span>`).join(" ");
      const truths = review.dealTruths.map(t => `<li>${t}</li>`).join("");
      const levers = review.levers.map(t => `<li>${t}</li>`).join("");
      const notes = review.notes.map(t => `<li>${t}</li>`).join("");
      const drivers = review.topDrivers.map(t => `<li>${t}</li>`).join("");

      const assumptionCompare = renderAssumptionComparison(inputs);

      // Thesis evaluation
      const thesisFeedback = Coach.evaluateThesis(deal, inputs, {
        thesisWhat:   (document.getElementById("thesisWhat").value   || "").trim(),
        thesisWhy:    (document.getElementById("thesisWhy").value    || "").trim(),
        thesisExit:   (document.getElementById("thesisExit").value   || "").trim(),
        thesisKiller: (document.getElementById("thesisKiller").value || "").trim(),
      });
      const thesisFeedbackHTML = renderThesisFeedback(thesisFeedback);

      // First-look comparison
      let firstLookHTML = "";
      if (sketchAnswers) {
        const actualProfile = deal.coach?.profile || "—";
        const actualIRRBucket = irrBucket(review.base.irr);
        const typeMatch  = sketchAnswers.type === actualProfile;
        const irrMatch   = sketchAnswers.irr  === actualIRRBucket;

        const check = (ok) => ok
          ? `<span style="color:#6fe0a0;">✓</span>`
          : `<span style="color:#e07070;">✗</span>`;

        firstLookHTML = `
          <h3>First Look vs. Actual</h3>
          <table>
            <thead><tr><th>Dimension</th><th>Your First Read</th><th>Actual</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td>Deal Type</td>
                <td>${sketchAnswers.type?.replaceAll("_"," ") || "—"}</td>
                <td>${actualProfile.replaceAll("_"," ")}</td>
                <td>${check(typeMatch)}</td>
              </tr>
              <tr>
                <td>IRR Range</td>
                <td>${sketchAnswers.irr ? sketchAnswers.irr + "%" : "—"}</td>
                <td>${actualIRRBucket}% (${pct(review.base.irr)})</td>
                <td>${check(irrMatch)}</td>
              </tr>
              <tr>
                <td>Initial Lean</td>
                <td>${sketchAnswers.lean || "—"}</td>
                <td>${review.recommendation}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        `;
      }

      el.innerHTML = `
        <div class="kv">
          <div><div class="k">Recommendation</div><div class="v rec-${review.recommendation.toLowerCase()}">${review.recommendation}</div></div>
          <div><div class="k">Score</div><div class="v">${review.score} / 100</div></div>
          <div><div class="k">Base IRR</div><div class="v">${pct(review.base.irr)}</div></div>
          <div><div class="k">Min DSCR</div><div class="v">${review.base.minDSCR.toFixed(2)}</div></div>
          <div><div class="k">Exit +100bps IRR</div><div class="v">${pct(review.exitStress.irr)}</div></div>
          <div><div class="k">Vacancy +5% Min DSCR</div><div class="v">${review.vacStress.minDSCR.toFixed(2)}</div></div>
        </div>

        ${firstLookHTML}

        <h3>Top Scoring Drivers</h3>
        <ul>${drivers}</ul>

        ${thesisFeedbackHTML}

        ${assumptionCompare}

        ${notes.length ? `<h3>Assumption Notes</h3><ul>${notes}</ul>` : ""}

        <h3>Red Flags</h3>
        <div class="row">${flags || "<span class='muted'>None</span>"}</div>

        <h3>Deal Truths (Answer Key)</h3>
        <ul>${truths || "<li class='muted'>No specific deal truths recorded.</li>"}</ul>

        <h3>What would make it a Buy?</h3>
        <ul>${levers}</ul>

        <div style="margin-top:18px;">
          <button id="btnCoachUnderwrite" class="btn secondary">Show Coach&#39;s Underwrite &#8594;</button>
          <div id="coachUnderwriteOut" style="display:none;margin-top:14px;"></div>
        </div>

        <p class="muted" style="margin-top:14px;">Saved to Track Record.</p>
      `;

      document.getElementById("coachCard").style.display = "block";
      document.getElementById("coachCard").scrollIntoView({behavior:"smooth"});

      // Wire coach underwrite button (rendered inside el.innerHTML above)
      document.getElementById("btnCoachUnderwrite").addEventListener("click", function(){
        const out = document.getElementById("coachUnderwriteOut");
        out.style.display = "block";
        this.style.display = "none";
        out.innerHTML = buildCoachUnderwrite(deal, inputs, review);
      });
    });
  }

  function renderTrackRecord(){
    const rows = Storage.loadDecisions();
    const host = document.getElementById(“trackTable”);

    if (!rows.length){
      host.innerHTML = `<div class=”card”><p class=”muted”>No decisions yet. Open a deal and click “Reveal Coach Review.”</p></div>`;
      return;
    }

    const N = rows.length;
    const TYPE_LABELS = {
      yield_stable: “Yield Stable”,
      classic_value_add: “Value Add”,
      heavy_lift: “Heavy Lift”
    };

    // --- Decision alignment ---
    // Aligned = direction matches: BUY ≈ BUY/BORDERLINE, PASS ≈ PASS/BORDERLINE
    function isAligned(r){
      const y = r.yourDecision, c = r.coachDecision;
      if (!y || y === “UNSET”) return null;
      if (y === “BUY”  && (c === “BUY”  || c === “BORDERLINE”)) return true;
      if (y === “PASS” && (c === “PASS” || c === “BORDERLINE”)) return true;
      return false;
    }
    const decided = rows.filter(r => isAligned(r) !== null);
    const alignedRows = decided.filter(r => isAligned(r) === true);
    const alignPct = decided.length ? Math.round(alignedRows.length / decided.length * 100) : null;

    const avgScore = Math.round(rows.reduce((s,r) => s + (r.score||0), 0) / N);
    const avgIRR   = rows.reduce((s,r) => s + (r.irr||0), 0) / N;

    const coachDist = { BUY:0, BORDERLINE:0, PASS:0 };
    for (const r of rows) if (coachDist[r.coachDecision] != null) coachDist[r.coachDecision]++;

    // --- By deal type ---
    const byType = {};
    for (const p of Object.keys(TYPE_LABELS)) byType[p] = { total:0, aligned:0, scores:[], irrs:[] };
    for (const r of rows){
      const t = r.dealProfile;
      if (!t || !byType[t]) continue;
      byType[t].total++;
      if (isAligned(r) === true) byType[t].aligned++;
      byType[t].scores.push(r.score || 0);
      byType[t].irrs.push(r.irr || 0);
    }

    // --- Assumption bias ---
    const withInputs = rows.filter(r => r.inputRentGrowth != null);
    let biasSectionHTML = “”;
    if (withInputs.length >= 2){
      const avgRG = withInputs.reduce((s,r) => s + r.inputRentGrowth, 0) / withInputs.length;
      const avgEC = withInputs.reduce((s,r) => s + r.inputExitCap,    0) / withInputs.length;
      const aggressiveRG   = withInputs.filter(r => r.inputRentGrowth  > (r.reasonableRentGrowthMax     || 0.035)).length;
      const aggressiveEC   = withInputs.filter(r => r.inputExitCap     < (r.reasonableExitCapMin        || 0.055)).length;
      const overPremCeiling= withInputs.filter(r => r.inputRentPremium > (r.reasonableRentPremiumCeiling|| Infinity)).length;

      const biasStatus = (count, total) => count > total * 0.4
        ? `<span style=”color:#e0c860;”>⚠ ${count}/${total} times</span>`
        : `<span style=”color:#6fe0a0;”>✓ ${count}/${total} times</span>`;

      biasSectionHTML = `
        <div class=”card”>
          <h3>Assumption Tendencies</h3>
          <p class=”muted” style=”margin:4px 0 12px;”>Based on ${withInputs.length} deal${withInputs.length>1?”s”:””} with saved assumption data. “Aggressive” means outside the deal's reasonable range.</p>
          <table>
            <thead><tr><th>Assumption</th><th>Your Average</th><th>Aggressive</th><th>Assessment</th></tr></thead>
            <tbody>
              <tr>
                <td>Rent Growth</td>
                <td>${(avgRG*100).toFixed(1)}%</td>
                <td>${biasStatus(aggressiveRG, withInputs.length)}</td>
                <td>${aggressiveRG > withInputs.length * 0.4 ? “Tends aggressive — common source of IRR inflation” : “Reasonable range”}</td>
              </tr>
              <tr>
                <td>Exit Cap Rate</td>
                <td>${(avgEC*100).toFixed(2)}%</td>
                <td>${biasStatus(aggressiveEC, withInputs.length)}</td>
                <td>${aggressiveEC > withInputs.length * 0.4 ? “Tends aggressive (too low) — overstates exit price” : “Reasonable range”}</td>
              </tr>
              <tr>
                <td>Rent Premium</td>
                <td>—</td>
                <td>${biasStatus(overPremCeiling, withInputs.length)}</td>
                <td>${overPremCeiling > withInputs.length * 0.4 ? “Often above ceiling — verify with comps” : “Usually in range”}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    // --- Sketch calibration ---
    const withSketch = rows.filter(r => r.sketchType || r.sketchIRR);
    let sketchSectionHTML = “”;
    if (withSketch.length >= 2){
      const withType  = withSketch.filter(r => r.sketchType);
      const withIRR   = withSketch.filter(r => r.sketchIRR);
      const typeRight = withType.filter(r => r.sketchType === r.dealProfile).length;
      const irrRight  = withIRR.filter(r => r.sketchIRR === irrBucket(r.irr)).length;
      const typePct   = withType.length ? Math.round(typeRight / withType.length * 100) : null;
      const irrPct    = withIRR.length  ? Math.round(irrRight  / withIRR.length  * 100) : null;

      sketchSectionHTML = `
        <div class=”card”>
          <h3>First Look Calibration</h3>
          <p class=”muted” style=”margin:4px 0 12px;”>How well does your pre-analysis intuition match the model?</p>
          <table>
            <thead><tr><th>Guess</th><th>Correct</th><th>Attempts</th><th>Accuracy</th><th></th></tr></thead>
            <tbody>
              <tr>
                <td>Deal Type</td>
                <td>${typeRight}</td><td>${withType.length}</td>
                <td>${typePct !== null ? typePct + “%” : “—“}</td>
                <td>${typePct !== null ? (typePct >= 60 ? '<span style=”color:#6fe0a0;”>Good</span>' : '<span style=”color:#e0c860;”>Needs work</span>') : “”}</td>
              </tr>
              <tr>
                <td>IRR Bucket</td>
                <td>${irrRight}</td><td>${withIRR.length}</td>
                <td>${irrPct !== null ? irrPct + “%” : “—“}</td>
                <td>${irrPct !== null ? (irrPct >= 50 ? '<span style=”color:#6fe0a0;”>Good</span>' : '<span style=”color:#e0c860;”>Needs work</span>') : “”}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    // --- Stress profile ---
    const withStress = rows.filter(r => r.exitStressIRR != null);
    let stressSectionHTML = “”;
    if (withStress.length >= 2){
      const avgExitStress = withStress.reduce((s,r) => s + r.exitStressIRR, 0)     / withStress.length;
      const withVac       = withStress.filter(r => r.vacStressMinDSCR != null);
      const avgVacStress  = withVac.length ? withVac.reduce((s,r) => s + r.vacStressMinDSCR, 0) / withVac.length : null;
      const fragileCount  = withStress.filter(r => r.exitStressIRR < 0.12).length;

      stressSectionHTML = `
        <div class=”card”>
          <h3>Deal Fragility Profile</h3>
          <p class=”muted” style=”margin:4px 0 12px;”>How well do your analyzed deals hold up under stress?</p>
          <div class=”kv” style=”margin-bottom:12px;”>
            <div><div class=”k”>Avg Exit +100bps IRR</div><div class=”v”>${pct(avgExitStress)}</div></div>
            ${avgVacStress !== null ? `<div><div class=”k”>Avg Vacancy +5% DSCR</div><div class=”v”>${avgVacStress.toFixed(2)}</div></div>` : “”}
            <div><div class=”k”>Fragile to cap expansion (&lt;12% stressed IRR)</div><div class=”v”>${fragileCount} / ${withStress.length}</div></div>
          </div>
          ${fragileCount > withStress.length * 0.4
            ? `<p class=”insightWarning”>&#9888; More than 40% of your deals break under a +100bps exit cap stress. Look for deals with wider return cushion or lower entry basis.</p>`
            : `<p class=”insightNote” style=”color:#6fe0a0;”>&#9432; Your deals generally hold up under exit cap stress — good margin discipline.</p>`}
        </div>`;
    }

    // --- Pattern insight callouts ---
    const insights = [];
    if (alignPct !== null && alignPct < 60)
      insights.push(`Your decision alignment with the coach is ${alignPct}% — you're diverging more than 40% of the time. Review the deals where you went BUY and the coach said PASS (or vice versa) and look for the common thread.`);
    if (withInputs.length >= 3){
      const aggressiveRG = withInputs.filter(r => r.inputRentGrowth > (r.reasonableRentGrowthMax || 0.035)).length;
      if (aggressiveRG > withInputs.length * 0.4){
        const avgRG = withInputs.reduce((s,r) => s + r.inputRentGrowth, 0) / withInputs.length;
        insights.push(`You've been underwriting rent growth aggressively (avg ${(avgRG*100).toFixed(1)}%, above the deal's range ${aggressiveRG}/${withInputs.length} times). In most markets 2–3.5% is the defensible range — aggressive rent growth is one of the most common ways to inflate an IRR that isn't really there.`);
      }
      const aggressiveEC = withInputs.filter(r => r.inputExitCap < (r.reasonableExitCapMin || 0.055)).length;
      if (aggressiveEC > withInputs.length * 0.4)
        insights.push(`Your exit cap assumptions have been below the deal's reasonable minimum ${aggressiveEC}/${withInputs.length} times. An overly low exit cap overstates the exit price and is one of the most common sources of fabricated IRR.`);
    }
    if (withSketch.length >= 4){
      const irrRight  = withSketch.filter(r => r.sketchIRR && r.sketchIRR === irrBucket(r.irr)).length;
      const irrPct    = Math.round(irrRight / withSketch.length * 100);
      if (irrPct < 40)
        insights.push(`Your IRR range prediction has been correct only ${irrPct}% of the time. Before running the model, practice estimating: Price/unit ÷ market cap rate gives you a rough entry NOI/unit, then adjust for your assumptions. This builds the mental math you need for quick deal screening.`);
    }

    const insightSectionHTML = insights.length ? `
      <div class=”card insightCard”>
        <h3>&#9432; Pattern Insights</h3>
        ${insights.map(i => `<p class=”insightNote”>${i}</p>`).join(“”)}
      </div>` : “”;

    // --- By deal type table ---
    const typeRows = Object.entries(byType)
      .filter(([,d]) => d.total > 0)
      .map(([p,d]) => {
        const avgSc = Math.round(d.scores.reduce((a,b)=>a+b,0) / d.scores.length);
        const avgIr = d.irrs.reduce((a,b)=>a+b,0) / d.irrs.length;
        const alPct = d.total ? Math.round(d.aligned / d.total * 100) : “—“;
        return `<tr>
          <td><span class=”badge”>${TYPE_LABELS[p]||p}</span></td>
          <td>${d.total}</td>
          <td>${alPct}%</td>
          <td>${avgSc} / 100</td>
          <td>${pct(avgIr)}</td>
        </tr>`;
      }).join(“”);

    // --- History table rows ---
    const historyRows = rows.map(r => {
      const al = isAligned(r);
      const alignIcon = al === true  ? `<span style=”color:#6fe0a0;”>✓</span>`
                      : al === false ? `<span style=”color:#e07070;”>✗</span>` : `<span class=”muted”>—</span>`;
      const recStyle = r.coachDecision === “BUY”        ? “color:#6fe0a0;”
                     : r.coachDecision === “PASS”       ? “color:#e07070;”
                     : “color:#e0c860;”;
      const yourStyle = r.yourDecision === “BUY”  ? “color:#6fe0a0;”
                      : r.yourDecision === “PASS” ? “color:#e07070;” : “”;
      return `<tr>
        <td class=”muted” style=”font-size:12px;”>${new Date(r.ts).toLocaleDateString()}</td>
        <td>
          ${r.dealName}
          ${r.dealProfile ? `<br><span class=”muted” style=”font-size:11px;”>${TYPE_LABELS[r.dealProfile]||r.dealProfile}</span>` : “”}
        </td>
        <td style=”${yourStyle}”>${r.yourDecision}</td>
        <td style=”${recStyle}”>${r.coachDecision}</td>
        <td>${alignIcon}</td>
        <td>${r.score}</td>
        <td>${((r.irr||0)*100).toFixed(1)}%</td>
        <td>${Number(r.minDSCR||0).toFixed(2)}</td>
        <td>${r.exitStressIRR != null ? ((r.exitStressIRR*100).toFixed(1) + “%”) : “—“}</td>
      </tr>`;
    }).join(“”);

    // --- Assemble page ---
    host.innerHTML = `
      <div class=”card”>
        <h3>Overview</h3>
        <div class=”kv”>
          <div><div class=”k”>Deals Analyzed</div><div class=”v”>${N}</div></div>
          <div><div class=”k”>Decision Alignment</div><div class=”v”>${alignPct !== null ? alignPct + “%” : “—“}</div></div>
          <div><div class=”k”>Average Score</div><div class=”v”>${avgScore} / 100</div></div>
          <div><div class=”k”>Average IRR</div><div class=”v”>${pct(avgIRR)}</div></div>
          <div><div class=”k”>Coach: BUY / BORDERLINE / PASS</div><div class=”v”>${coachDist.BUY} / ${coachDist.BORDERLINE} / ${coachDist.PASS}</div></div>
        </div>
      </div>

      ${insightSectionHTML}

      ${typeRows ? `
      <div class=”card”>
        <h3>Performance by Deal Type</h3>
        <table>
          <thead><tr><th>Type</th><th>Deals</th><th>Alignment</th><th>Avg Score</th><th>Avg IRR</th></tr></thead>
          <tbody>${typeRows}</tbody>
        </table>
      </div>` : “”}

      ${biasSectionHTML}
      ${sketchSectionHTML}
      ${stressSectionHTML}

      <div class=”card”>
        <h3>Deal History</h3>
        <div style=”overflow:auto;”>
          <table>
            <thead>
              <tr><th>Date</th><th>Deal</th><th>You</th><th>Coach</th><th>✓</th><th>Score</th><th>IRR</th><th>DSCR</th><th>Exit Stress</th></tr>
            </thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  return {
    renderDealFeed,
    initDealPage,
    renderTrackRecord,
    addGeneratedDealToFeed
  };
})();
