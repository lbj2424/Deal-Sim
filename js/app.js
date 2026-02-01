const App = (() => {
  let DEALS = [];
  let GENERATED = [];

  function money(n){
    return Number(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});
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

  function pct(n){ return (n*100).toFixed(2) + "%"; }
  function fmt(n, digits=2){ return Number(n).toFixed(digits); }

  async function loadDeals(){
    if (DEALS.length) return DEALS;
    const res = await fetch("data/deals.json");
    DEALS = await res.json();
    return DEALS;
  }

  function dealCardHTML(d){
    const inPlaceCap = (d.units * d.avgRentInPlace * 12 * (1 - d.occupancy) === 0)
      ? null
      : null; // we’ll keep cap out of the feed for now (less noise)

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
    { k:"T12 NOI", v: money(res.noiYear1) },
{ k:"Pro Forma NOI", v: money(res.noiProForma) },

  }
  const t12 = Calc.statementFromT12(deal);
const pf = Calc.proformaFromInputs(deal, inputs);

const t12El = document.getElementById("t12Table");
if (t12El) t12El.innerHTML = renderStatementTable(t12);

const pfEl = document.getElementById("pfTable");
if (pfEl) pfEl.innerHTML = renderStatementTable(pf);


  async function initDealPage(){
    const id = getQueryParam("id");
    const deals = await loadDeals();
    const all = [...deals, ...GENERATED];
    const deal = all.find(d => d.id === id) || deals[0];

    document.getElementById("dealTitle").textContent = deal.name;

    const facts = document.getElementById("dealFacts");
    renderKV(facts, [
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
      const t12 = Calc._statementFromT12(deal);
const pf = Calc._proformaFromInputs(deal, inputs);

App._renderStatement("t12Table", t12);
App._renderStatement("pfTable", pf);

      renderKV(document.getElementById("results"), [
        { k:"IRR", v: pct(res.irr) },
        { k:"Equity Multiple", v: fmt(res.equityMultiple, 2) + "x" },
        { k:"Avg Cash-on-Cash", v: pct(res.avgCoC) },
        { k:"Min DSCR", v: fmt(res.minDSCR, 2) },
        { k:"Worst Break-even Occ", v: Math.round(res.breakEvenOccMax*100) + "%" },
        { k:"Exit Price", v: money(res.exitPrice) }
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
      const base = updateResults();

      const review = Coach.review(deal, inputs);

      // Save decision row
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

      // Render coach output
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
function renderStatementTable(stmt){
  const rows = (obj) => Object.entries(obj).map(([k,v]) => `
    <tr><td>${k}</td><td>${money(v)}</td></tr>
  `).join("");

  return `
    <div class="card" style="margin:0;">
      <h3>Income</h3>
      <table>
        <tbody>${rows(stmt.income)}</tbody>
        <tfoot><tr><th>Total Income</th><th>${money(stmt.totalIncome)}</th></tr></tfoot>
      </table>

      <h3 style="margin-top:12px;">Expenses</h3>
      <table>
        <tbody>${rows(stmt.expenses)}</tbody>
        <tfoot><tr><th>Total Expenses</th><th>${money(stmt.totalExpenses)}</th></tr></tfoot>
      </table>

      <h3 style="margin-top:12px;">NOI</h3>
      <div class="badge">${money(stmt.noi)}</div>
    </div>
  `;
}
  function _renderStatement(id, stmt){
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = renderStatementTable(stmt);
}
return { renderDealFeed, initDealPage, renderTrackRecord, addGeneratedDealToFeed, _renderStatement };


  return {
    renderDealFeed,
    initDealPage,
    renderTrackRecord,
    addGeneratedDealToFeed
  };
})();
