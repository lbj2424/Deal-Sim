const Storage = (() => {
  const KEY = "deal_sim_decisions_v1";

  function loadDecisions(){
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }

  function saveDecision(row){
    const all = loadDecisions();
    all.unshift(row);
    localStorage.setItem(KEY, JSON.stringify(all));
  }

  function clearDecisions(){
    localStorage.removeItem(KEY);
  }

  return { loadDecisions, saveDecision, clearDecisions };
})();
