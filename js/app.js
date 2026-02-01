const App = (() => {
  let DEALS = [];
  let GENERATED = [];

  function money(n){
    return Number(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});
  }
  function pct(n){ return (n*100).toFixed(2) + "%"; }
  function fmt(n, digits=2){ return Number(n).toFixed(digits); }

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
    const res = await fetch("./data/deals.json"); // safer for project pages
    DEALS = await res.json();
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

    renderKV(document.getElementById("dealFacts"), [
      { k:"Units", v: deal.units },
      { k:"Purchase Price", v: money(deal.purchasePrice) },
      { k:"In-place Avg Rent", v: money(deal.avgRentInPlace) + "/mo" },
      { k:"Other Income", v: money((deal.otherIncomePerUnitMonthly||0)) + "/unit/mo" },
      { k:"Occupancy", v: Math.round(deal.occupancy*100) + "%" },
      { k:"Opex Ratio", v: Math.round(deal.opexRatio*100) + "%" },
      { k:"Year-1 CapEx", v: money(deal.units * (deal.capexPerUnitYear1||0)) },
      { k:"Default LTV / Rate", v: Math.round(deal.defaultDebt.ltv*100) + "% / " + (deal.defaultDebt.rate*100).toFixed(2) + "%" }
    ]);

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

   function updateResults(){
  const inputs = readInputs();
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
    { k:"T12 NOI", v: money(res.noiYear1) },
    { k:"Pro Forma NOI", v: money(res.noiProForma) }
  ]);

  return res;
}



    updateResults();
    document.getElementById("recalc").addEventListener("click", updateResults);

    let decision = null;
    document.getElementById("btnBuy").addEventListener("click", () => decision = "BUY");
    document.getElementById("btnPass").addEventListener("click", () => decision = "PASS");

    document.getElementById("btnReveal").addEventListener("click", () => {
      const inputs = readInputs();
      updateResults();

      const review = Coach.review(deal, inputs);

      Storage.saveDecision({
        ts: new Date().toISOString(),
        dealId: deal.id,
        dealName: deal.name,
        yourDecision: decision || "UNSET",
        coachDecision: review.recommendation,
        score: review.score,
        irr: review.base.irr,
        minDSCR: review.base.minDSCR,
        thesis: (document.getElementById("thesis").value || "").trim(),
        risk: (document.getElementById("risk").value || "").trim(),
        confidence: Number(document.getElementById("confidence").value || 3)
      });

      const el = document.getElementById("coachOut");
      const flags = review.flags.map(f => `<span class="badge">${f.replaceAll("_"," ")}</span>`).join(" ");
      const truths = review.dealTruths.map(t => `<li>${t}</li>`).join("");
      const levers = review.levers.map(t => `<li>${t}</li>`).join("");
      const notes = review.notes.map(t => `<li>${t}</li>`).join("");
      const drivers = review.topDrivers.map(t => `<li>${t}</li>`).join("");

      el.innerHTML = `
        <div class="kv">
          <div><div class="k">Recommendation</div><div class="v">${review.recommendation}</div></div>
          <div><div class="k">Score</div><div class="v">${review.score} / 100</div></div>
          <div><div class="k">Base IRR</div><div class="v">${pct(review.base.irr)}</div></div>
          <div><div class="k">Min DSCR</div><div class="v">${review.base.minDSCR.toFixed(2)}</div></div>
          <div><div class="k">Exit +100bps IRR</div><div class="v">${pct(review.exitStress.irr)}</div></div>
          <div><div class="k">Vacancy +5% Min DSCR</div><div class="v">${review.vacStress.minDSCR.toFixed(2)}</div></div>
        </div>

        <h3>Why</h3>
        <ul>${drivers}</ul>

        ${notes ? `<h3>Assumption Notes</h3><ul>${notes}</ul>` : ""}

        <h3>Red Flags Triggered</h3>
        <div class="row">${flags || "<span class='muted'>None</span>"}</div>

        <h3>Deal Truths (Answer Key)</h3>
        <ul>${truths || ""}</ul>

        <h3>What would make it a Buy?</h3>
        <ul>${levers}</ul>

        <p class="muted">Saved to Track Record.</p>
      `;

      document.getElementById("coachCard").style.display = "block";
      document.getElementById("coachCard").scrollIntoView({behavior:"smooth"});
    });
  }

  function renderTrackRecord(){
    const rows = Storage.loadDecisions();
    const host = document.getElementById("trackTable");

    if (!rows.length){
      host.innerHTML = `<div class="card"><p class="muted">No decisions yet. Open a deal and click “Reveal Coach Review.”</p></div>`;
      return;
    }

    host.innerHTML = `
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Deal</th><th>You</th><th>Coach</th><th>Score</th><th>IRR</th><th>Min DSCR</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${new Date(r.ts).toLocaleString()}</td>
                <td>${r.dealName}</td>
                <td>${r.yourDecision}</td>
                <td>${r.coachDecision}</td>
                <td>${r.score}</td>
                <td>${(r.irr*100).toFixed(2)}%</td>
                <td>${Number(r.minDSCR).toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
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
