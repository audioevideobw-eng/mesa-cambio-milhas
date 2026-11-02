const MILHAS = {"updated": "02/11/2026 13:00", "programs": [{"id": "smiles", "name": "Smiles", "note": "Gol · 150 dias", "best": 20.03, "bestBuyer": "Hotmilhas", "avg": 17.48, "color": "#e8792b"}, {"id": "latam", "name": "Latam Pass", "note": "LATAM · 150 dias", "best": 31.15, "bestBuyer": "Hotmilhas", "avg": 27.9, "color": "#1b4b8f"}, {"id": "azul", "name": "Tudo Azul", "note": "Azul · 150 dias", "best": 18.79, "bestBuyer": "Hotmilhas", "avg": 16.22, "color": "#3f7fc4"}]};
/* Mesa de Câmbio & Milhas — BW */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (v, d = 4) => v == null ? "—" :
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => v == null ? "—" : (v > 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
const cls = v => v == null ? "fl" : v > 0.02 ? "up" : v < -0.02 ? "dn" : "fl";

/* ---------- estado ---------- */
let SER = {};     // codigo -> [[date, v], ...] ordenado asc
let META = {};
let CODES = [];
const decOf = c => (META[c] && META[c].dec) || 4;

/* dataset compacto (eixo de datas + indices) -> SER/META */
function normalize() {
  SER = {}; META = {};
  if (DATA.series) {
    const dates = DATA.dates || [];
    Object.entries(DATA.series).forEach(([c, s]) => {
      SER[c] = s.i.map((ix, k) => [dates[ix], s.v[k]]).sort((a, b) => a[0] < b[0] ? -1 : 1);
      META[c] = { name: s.name, src: s.src, dec: s.dec };
    });
  } else if (DATA.hist) {          // compatibilidade com o formato antigo
    Object.entries(DATA.hist).forEach(([c, arr]) => {
      if (arr && arr.length) SER[c] = arr.slice().sort((a, b) => a[0] < b[0] ? -1 : 1);
    });
    Object.assign(META, DATA.meta || {});
  }
  DATA.meta = META;
  CODES = Object.keys(SER).filter(c => SER[c].length > 5);
}

/* valor de referência: spot de mercado se existir, senão último PTAX */
function ref(c) {
  const spot = DATA.market && DATA.market[c];
  return spot || (SER[c] ? SER[c][SER[c].length - 1][1] : null);
}

/* variação entre o último valor e o mais próximo de N dias atrás */
function chg(c, days) {
  const s = SER[c]; if (!s || s.length < 2) return null;
  const last = s[s.length - 1];
  const lim = new Date(last[0]); lim.setDate(lim.getDate() - days);
  const iso = lim.toISOString().slice(0, 10);
  let best = null;
  for (const p of s) { if (p[0] <= iso) best = p; else break; }
  if (!best) best = s[0];
  if (!best[1]) return null;
  return (last[1] / best[1] - 1) * 100;
}
function range52(c) {
  const s = SER[c]; if (!s) return null;
  const last = s[s.length - 1][0];
  const lim = new Date(last); lim.setDate(lim.getDate() - 365);
  const iso = lim.toISOString().slice(0, 10);
  const win = s.filter(p => p[0] >= iso);
  if (win.length < 3) return null;
  const vals = win.map(p => p[1]);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const cur = ref(c);
  return { mn, mx, pos: mx === mn ? 50 : ((cur - mn) / (mx - mn)) * 100 };
}
function sinal(c) {
  const r = range52(c); if (!r) return ["—", "neu"];
  const ch30 = chg(c, 30);
  if (r.pos <= 25) return ["Bom momento", "buy"];
  if (r.pos >= 75) return ["Caro", "sell"];
  if (ch30 != null && ch30 > 3) return ["Subindo", "neu"];
  if (ch30 != null && ch30 < -3) return ["Cedendo", "buy"];
  return ["Neutro", "neu"];
}

/* ---------- KPIs ---------- */
function kpi(c, label) {
  const v = ref(c), d = chg(c, 1), w = chg(c, 7);
  const r = range52(c);
  return `<div class="kpi">
    <div class="l">${label}</div>
    <div class="v">R$ ${fmt(v, decOf(c))}</div>
    <div class="s"><span class="chg ${cls(d)}">${pct(d)}</span> no dia ·
      <span class="chg ${cls(w)}">${pct(w)}</span> 7d
      ${r ? ` · faixa R$ ${fmt(r.mn, decOf(c) - 1)}–${fmt(r.mx, decOf(c) - 1)}` : ""}</div>
  </div>`;
}
function renderKpis() {
  const list = ["USD", "EUR", "GBP"];
  let html = list.filter(c => SER[c]).map(c => kpi(c, DATA.meta[c]?.name || c)).join("");
  let best = null;
  ["USD", "EUR", "GBP"].filter(c => SER[c]).forEach(c => {
    const r = range52(c); if (r && (!best || r.pos < best.pos)) best = { c, ...r };
  });
  if (best) {
    html += `<div class="kpi" style="cursor:pointer" onclick="pick('${best.c}')">
      <div class="l">Melhor entrada · principais</div>
      <div class="v">${best.c} <span style="font-size:15px;color:var(--mut)">R$ ${fmt(ref(best.c), decOf(best.c))}</span></div>
      <div class="s">${best.pos.toFixed(0)}% da faixa de 12 meses · mín R$ ${fmt(best.mn, decOf(best.c))}</div>
    </div>`;
  }
  $("#kpis").innerHTML = html;
}

/* ---------- tabela ---------- */
function renderTable() {
  const tb = $("#fxTable tbody");
  tb.innerHTML = CODES.map(c => {
    const r = range52(c), [sg, sk] = sinal(c);
    const d1 = chg(c, 1), d7 = chg(c, 7), d30 = chg(c, 30), d365 = chg(c, 365);
    return `<tr data-c="${c}">
      <td><div class="cc"><div class="flag">${c}</div>
        <div><b style="font-weight:600">${c}/BRL</b><small>${DATA.meta[c]?.name || ""}</small></div></div></td>
      <td>${fmt(SER[c][SER[c].length - 1][1], decOf(c))}</td>
      <td>${fmt(DATA.market ? DATA.market[c] : null, decOf(c))}</td>
      <td><span class="chg ${cls(d1)}">${pct(d1)}</span></td>
      <td><span class="chg ${cls(d7)}">${pct(d7)}</span></td>
      <td><span class="chg ${cls(d30)}">${pct(d30)}</span></td>
      <td><span class="chg ${cls(d365)}">${pct(d365)}</span></td>
      <td>${r ? `R$ ${fmt(r.mn, decOf(c))} – ${fmt(r.mx, decOf(c))}` : "—"}</td>
      <td>${r ? barMini(r.pos) : "—"}</td>
      <td><span class="tag ${sk}">${sg}</span></td>
    </tr>`;
  }).join("");
  tb.querySelectorAll("tr").forEach(tr => tr.onclick = () => pick(tr.dataset.c));
}
function barMini(pos) {
  const p = Math.max(0, Math.min(100, pos));
  const col = p <= 25 ? "var(--up)" : p >= 75 ? "var(--dn)" : "var(--warn)";
  return `<span style="display:inline-flex;align-items:center;gap:7px">
    <span style="width:58px;height:5px;border-radius:3px;background:var(--navy3);display:inline-block;overflow:hidden">
      <span style="display:block;height:100%;width:${p}%;background:${col};border-radius:3px"></span></span>
    <span style="font-size:11px;color:var(--mut);min-width:30px">${p.toFixed(0)}%</span></span>`;
}

/* ---------- gráfico ---------- */
let CUR = "USD", RANGE = 90;
function pick(c) {
  CUR = c; RANGE = 90;
  $$("#rng button").forEach(b => b.classList.toggle("on", +b.dataset.d === 90));
  renderChart();
  $$("#fxTable tbody tr").forEach(tr => tr.classList.toggle("sel", tr.dataset.c === c));
  $("#chTitle").innerHTML = `${DATA.meta[c]?.name || c} <small>R$ / ${c}</small>`;
  renderAdvice();
  $("#calc").scrollIntoView({ behavior: "smooth", block: "start" });
}
window.pick = pick;

function renderChart() {
  const s = SER[CUR]; if (!s) return;
  const last = s[s.length - 1][0];
  const lim = new Date(last); lim.setDate(lim.getDate() - RANGE);
  const iso = lim.toISOString().slice(0, 10);
  const win = s.filter(p => p[0] >= iso);
  if (win.length < 2) { $("#chart").innerHTML = ""; return; }

  const W = 1000, H = 320, ml = 62, mr = 16, mt = 14, mb = 34;
  const vals = win.map(p => p[1]);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  const pad = (mx - mn) * 0.12 || mx * 0.01;
  mn -= pad; mx += pad;
  const X = i => ml + (i / (win.length - 1)) * (W - ml - mr);
  const Y = v => mt + (1 - (v - mn) / (mx - mn)) * (H - mt - mb);

  const ma = win.map((p, i) => {
    const a = Math.max(0, i - 6);
    const sl = win.slice(a, i + 1);
    return [X(i), Y(sl.reduce((t, x) => t + x[1], 0) / sl.length)];
  });

  const line = win.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const area = `${line}L${X(win.length - 1).toFixed(1)},${H - mb}L${ml},${H - mb}Z`;
  const maPath = ma.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");

  let grid = "", yl = "";
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const v = mn + (mx - mn) * (i / steps), y = Y(v);
    grid += `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${W - mr}" y2="${y.toFixed(1)}" stroke="#1e2c42" stroke-width="1"/>`;
    yl += `<text x="${ml - 9}" y="${(y + 3.5).toFixed(1)}" fill="#8fa2bd" font-size="10.5" text-anchor="end" font-family="ui-monospace,monospace">${fmt(v, decOf(CUR))}</text>`;
  }
  let xl = "";
  const nx = Math.min(6, win.length);
  for (let i = 0; i < nx; i++) {
    const idx = Math.round(i * (win.length - 1) / (nx - 1 || 1));
    const d = win[idx][0].slice(5).split("-").reverse().join("/");
    xl += `<text x="${X(idx).toFixed(1)}" y="${H - mb + 17}" fill="#8fa2bd" font-size="10.5"
      text-anchor="${i === 0 ? "start" : i === nx - 1 ? "end" : "middle"}">${d}</text>`;
  }
  let hov = "";
  const step = Math.max(1, Math.floor(win.length / 120));
  win.forEach((p, i) => {
    if (i % step) return;
    hov += `<rect x="${(X(i) - 3).toFixed(1)}" y="${mt}" width="6" height="${H - mt - mb}" fill="transparent">
      <title>${p[0].split("-").reverse().join("/")} — R$ ${fmt(p[1], decOf(CUR))}</title></rect>`;
  });

  $("#chart").setAttribute("viewBox", `0 0 ${W} ${H}`);
  $("#chart").innerHTML = `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d4a94a" stop-opacity=".28"/>
      <stop offset="100%" stop-color="#d4a94a" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#g)"/>
    <path d="${maPath}" fill="none" stroke="#5b7db1" stroke-width="1.4" stroke-dasharray="4 3"/>
    <path d="${line}" fill="none" stroke="#d4a94a" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${X(win.length - 1).toFixed(1)}" cy="${Y(win[win.length - 1][1]).toFixed(1)}" r="4" fill="#d4a94a"/>
    ${yl}${xl}${hov}`;

  const first = win[0][1], lastV = win[win.length - 1][1];
  const v = (lastV / first - 1) * 100;
  $("#chStats").innerHTML = `no período: <b class="${cls(v)}">${pct(v)}</b> · mín ${fmt(Math.min(...vals), decOf(CUR))} · máx ${fmt(Math.max(...vals), decOf(CUR))}`;
}

$$("#rng button").forEach(b => b.onclick = () => {
  RANGE = +b.dataset.d;
  $$("#rng button").forEach(x => x.classList.toggle("on", x === b));
  renderChart();
});

/* ---------- conselho ---------- */
function renderAdvice() {
  const r = range52(CUR), v = ref(CUR);
  if (!r) { $("#cAdvice").innerHTML = "<p>Série curta para leitura.</p>"; return; }
  const d30 = chg(CUR, 30), d365 = chg(CUR, 365);
  const pos = r.pos;
  let tone = "v-mid", head = "Zona neutra", body = "";
  if (pos <= 25) { tone = "v-ok"; head = "Boa janela de compra"; body = "A moeda está perto do fundo dos últimos 12 meses. Historicamente, comprar nessa faixa custou menos do que esperar."; }
  else if (pos >= 75) { tone = "v-bad"; head = "Preço esticado"; body = "Está perto da máxima do ano. Se a compra não é urgente, comprar em partes (ex.: 1/3 por mês) reduz o risco de pegar o topo."; }
  else { tone = "v-mid"; head = "Sem vantagem clara"; body = "Está no meio da faixa. Vale mais olhar o custo total (spread + IOF) do que tentar acertar o timing."; }
  $("#cAdvice").innerHTML = `
    <div class="out" style="margin-top:0">
      <div class="row"><span>Cotado agora</span><b>R$ ${fmt(v, decOf(CUR))}</b></div>
      <div class="row"><span>Mínima 12m</span><b>R$ ${fmt(r.mn, decOf(CUR))}</b></div>
      <div class="row"><span>Máxima 12m</span><b>R$ ${fmt(r.mx, decOf(CUR))}</b></div>
      <div class="row"><span>Posição na faixa</span><b>${pos.toFixed(0)}%</b></div>
      <div class="row"><span>Variação 30d</span><b class="${cls(d30)}">${pct(d30)}</b></div>
      <div class="row"><span>Variação 12m</span><b class="${cls(d365)}">${pct(d365)}</b></div>
    </div>
    <div class="verdict ${tone}">${head}<div style="font-weight:400;color:var(--txt);margin-top:5px;line-height:1.55">${body}</div></div>`;
}

/* ---------- opções ---------- */
function fillSelects() {
  const opts = CODES.map(c => `<option value="${c}">${c} — ${DATA.meta[c]?.name || ""}</option>`).join("");
  ["#cCur", "#aCur"].forEach(s => { const el = $(s); if (el) el.innerHTML = opts; });
  const mp = MILHAS.programs.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  $("#mProg").innerHTML = mp;
  $("#rProg").innerHTML = mp;
  $("#cCur").value = "USD";
}

/* ---------- calculadora ---------- */
$("#cGo").onclick = () => {
  const c = $("#cCur").value, val = +$("#cVal").value, dir = $("#cDir").value;
  const sp = +$("#cSpread").value / 100, iof = +$("#cIof").value / 100;
  const base = ref(c), d = decOf(c);
  if (!base || !val) return;
  let html = "";
  if (dir === "brl") {
    const unit = base * (1 + sp);
    const fx = val / unit;
    const total = val + val * iof;
    html = `<div class="row"><span>Taxa com spread ${(sp * 100).toFixed(2)}%</span><b>R$ ${fmt(unit, d)}</b></div>
      <div class="row"><span>Você entrega</span><b>R$ ${fmt(val, 2)}</b></div>
      <div class="row"><span>IOF ${(iof * 100).toFixed(2)}%</span><b>R$ ${fmt(val * iof, 2)}</b></div>
      <div class="row"><span>Custo total</span><b>R$ ${fmt(total, 2)}</b></div>
      <div class="row" style="padding-top:8px"><span>Você recebe</span>
        <span class="big">${fmt(fx, 2)} ${c}</span></div>
      <div class="row"><span>Taxa efetiva (com IOF)</span><b>R$ ${fmt(total / fx, d)} / ${c}</b></div>
      <div class="row"><span>Sobra vs. PTAX puro</span>
        <b>${(((total / fx) / base - 1) * 100).toFixed(2)}% mais caro</b></div>`;
  } else {
    const unit = base * (1 - sp);
    const brl = val * unit;
    html = `<div class="row"><span>Taxa com spread ${(sp * 100).toFixed(2)}%</span><b>R$ ${fmt(unit, d)}</b></div>
      <div class="row"><span>Você entrega</span><b>${fmt(val, 2)} ${c}</b></div>
      <div class="row" style="padding-top:8px"><span>Você recebe</span>
        <span class="big">R$ ${fmt(brl, 2)}</span></div>
      <div class="row"><span>Se tivesse vendido na PTAX</span><b>R$ ${fmt(val * base, 2)}</b></div>
      <div class="row"><span>Custo do spread</span><b class="dn">R$ ${fmt(val * base - brl, 2)}</b></div>`;
  }
  $("#cOut").innerHTML = html;
};

/* ---------- milhas ---------- */
function renderMilhas() {
  const max = Math.max(...MILHAS.programs.map(p => p.best));
  $("#mUpd").textContent = "Cotações de " + MILHAS.updated + " · valores por 1.000 milhas";
  $("#mProgs").innerHTML = MILHAS.programs.map(p => `
    <div class="prog">
      <span class="dot" style="background:${p.color}"></span>
      <span class="nm">${p.name}<small>${p.note}</small></span>
      <span class="bar"><i style="width:${(p.best / max * 100).toFixed(0)}%;background:${p.color}"></i></span>
      <span class="pr"><b>R$ ${p.best.toFixed(2)}</b><small>média R$ ${p.avg.toFixed(2)}</small></span>
    </div>`).join("") + `
    <div class="note">Referências de valor-alvo 2026 (Melhores Destinos): Smiles R$ 16 · Latam Pass R$ 26 · Azul R$ 13.
    Acima disso, comprar milha é caro; abaixo, é oportunidade.</div>`;
}

function prog(id) { return MILHAS.programs.find(p => p.id === id); }

$("#mGo").onclick = () => {
  const p = prog($("#mProg").value), qtd = +$("#mQtd").value;
  const prazo = +$("#mPrazo").value, custo = +$("#mCusto").value;
  if (!p || !qtd) return;
  const mil = qtd / 1000;
  const bruto = mil * p.best;
  const liq = mil * p.avg;
  const custoTotal = mil * custo;
  const lucro = liq - custoTotal;
  const margem = custoTotal ? (lucro / custoTotal) * 100 : 0;
  let tone = "v-mid", txt = "";
  if (margem > 25) { tone = "v-ok"; txt = `Vender rende ${margem.toFixed(0)}% sobre o custo de repor. Vale executar.`; }
  else if (margem > 5) { tone = "v-mid"; txt = `Ganho moderado (${margem.toFixed(0)}%). Só compense se você não for usar as milhas.`; }
  else { tone = "v-bad"; txt = `Margem de ${margem.toFixed(0)}%: vender agora destrói valor. Melhor guardar para resgate.`; }
  $("#mOut").innerHTML = `
    <div class="row"><span>Melhor cotação (${p.bestBuyer}, ${prazo}d)</span><b>R$ ${p.best.toFixed(2)}/mil</b></div>
    <div class="row"><span>Média de mercado</span><b>R$ ${p.avg.toFixed(2)}/mil</b></div>
    <div class="row"><span>Receita no melhor preço</span><b>R$ ${fmt(bruto, 2)}</b></div>
    <div class="row"><span>Receita na média</span><b>R$ ${fmt(liq, 2)}</b></div>
    <div class="row"><span>Custo de repor ${qtd.toLocaleString("pt-BR")} milhas</span><b>R$ ${fmt(custoTotal, 2)}</b></div>
    <div class="row" style="padding-top:8px"><span>Resultado</span>
      <span class="big ${lucro > 0 ? "" : "dn"}">R$ ${fmt(lucro, 2)}</span></div>
    <div class="verdict ${tone}">${txt}</div>`;
};

$("#rGo").onclick = () => {
  const mil = +$("#rMil").value / 1000, tax = +$("#rTax").value;
  const cash = +$("#rCash").value, custo = +$("#rCusto").value;
  const p = prog($("#rProg").value);
  const valorMilhas = mil * custo;
  const totalMilhas = valorMilhas + tax;
  const economia = cash - totalMilhas;
  const cpmReal = mil ? (cash - tax) / mil : 0;
  const tone = economia > 0 ? "v-ok" : "v-bad";
  $("#rOut").innerHTML = `
    <div class="row"><span>Valor das milhas usadas</span><b>R$ ${fmt(valorMilhas, 2)}</b></div>
    <div class="row"><span>Taxas de embarque</span><b>R$ ${fmt(tax, 2)}</b></div>
    <div class="row"><span>Custo total do resgate</span><b>R$ ${fmt(totalMilhas, 2)}</b></div>
    <div class="row"><span>Tarifa paga em dinheiro</span><b>R$ ${fmt(cash, 2)}</b></div>
    <div class="row" style="padding-top:8px"><span>${economia > 0 ? "Economia" : "Prejuízo"}</span>
      <span class="big ${economia > 0 ? "" : "dn"}">R$ ${fmt(Math.abs(economia), 2)}</span></div>
    <div class="row"><span>Valor implícito do milheiro</span><b>R$ ${fmt(cpmReal, 2)}</b></div>
    <div class="verdict ${tone}">${economia > 0
      ? `O resgate paga R$ ${fmt(cpmReal, 2)} por mil — acima do seu custo de R$ ${fmt(custo, 2)}. Use as milhas.`
      : `O resgate paga só R$ ${fmt(cpmReal, 2)} por mil, abaixo do custo. Pague em dinheiro e guarde as milhas.`}</div>`;
};

/* ---------- alertas ---------- */
const AKEY = "bw_fx_alerts_v1";
function loadAlerts() { try { return JSON.parse(localStorage.getItem(AKEY)) || []; } catch { return []; } }
function saveAlerts(a) { try { localStorage.setItem(AKEY, JSON.stringify(a)); } catch { } }
function renderAlerts() {
  const al = loadAlerts();
  const hit = al.filter(a => {
    const v = ref(a.c);
    return (a.buy && v <= a.buy) || (a.sel && v >= a.sel);
  });
  let html = "";
  hit.forEach(a => {
    const v = ref(a.c);
    html += `<div class="alert" style="border-color:rgba(212,169,74,.45);background:rgba(212,169,74,.08)">
      <span class="tag ${a.buy && v <= a.buy ? "buy" : "sell"}">ALVO</span>
      <span><b>${a.c}</b> está em R$ ${fmt(v, decOf(a.c))} — ${a.buy && v <= a.buy ? "abaixo do seu alvo de compra" : "acima do seu alvo de venda"}.</span>
      <button class="x" onclick="delAlert(${a.id})">×</button></div>`;
  });
  al.forEach(a => {
    html += `<div class="alert">
      <span class="tag ${a.buy && ref(a.c) <= a.buy ? "buy" : "neu"}">${a.c}</span>
      <span>Comprar ≤ R$ ${fmt(a.buy, decOf(a.c))} · Vender ≥ R$ ${fmt(a.sel, decOf(a.c))}
        <span style="color:var(--mut)"> · agora R$ ${fmt(ref(a.c), decOf(a.c))}</span></span>
      <button class="x" onclick="delAlert(${a.id})">×</button></div>`;
  });
  $("#aList").innerHTML = html || `<div class="note">Nenhum alerta criado.</div>`;
}
window.delAlert = id => { saveAlerts(loadAlerts().filter(a => a.id !== id)); renderAlerts(); };
$("#aGo").onclick = () => {
  const c = $("#aCur").value, buy = +$("#aBuy").value || null, sel = +$("#aSel").value || null;
  if (!buy && !sel) return;
  const al = loadAlerts(); al.push({ id: Date.now(), c, buy, sel }); saveAlerts(al);
  $("#aBuy").value = ""; $("#aSel").value = ""; renderAlerts();
};
$("#aCur").onchange = () => {
  const v = ref($("#aCur").value), d = decOf($("#aCur").value);
  $("#aBuy").value = (v * 0.97).toFixed(d); $("#aSel").value = (v * 1.03).toFixed(d);
};

/* ---------- atualização ao vivo ---------- */
async function refresh() {
  const btn = $("#refresh"); if (btn) btn.innerHTML = `<span class="spin"></span> atualizando`;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
    const j = await r.json();
    if (j.result === "success") {
      const brl = j.rates.BRL;
      DATA.market = DATA.market || {};
      Object.keys(DATA.market).forEach(c => {
        if (j.rates[c]) DATA.market[c] = +(brl / j.rates[c]).toFixed(6);
      });
      DATA.market.USD = +brl.toFixed(6);
      DATA.market_updated = j.time_last_update_utc;
      renderKpis(); renderTable(); renderChart(); renderAdvice(); renderAlerts(); stamp();
    }
  } catch (e) { console.warn("sem conexão", e); }
  try { await refreshPtax(); } catch (e) { console.warn("PTAX indisponível", e); }
  if (btn) btn.innerHTML = "↻ Atualizar";
}

function stamp() {
  $("#stPtax").textContent = DATA.ptax_date ? DATA.ptax_date.split("-").reverse().join("/") : "—";
  const u = DATA.market_updated;
  $("#stSpot").textContent = u ? new Date(u).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  $("#stSrc").textContent = "BCB PTAX + mercado";
  const f = $("#fPtax"); if (f) f.textContent = DATA.ptax_date ? DATA.ptax_date.split("-").reverse().join("/") : "—";
  const mu = $("#mktUp"); if (mu) mu.textContent = u ? new Date(u).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  if ($("#aCur")) $("#aCur").onchange();
}

/* ---------- boot ---------- */
function init() {
  normalize();
  fillSelects();
  renderKpis(); renderTable(); renderChart(); renderAdvice();
  renderMilhas(); renderAlerts(); stamp();
  $("#rProg").onchange = () => {
    const p = prog($("#rProg").value);
    if (p) $("#rCusto").value = p.avg.toFixed(2);
  };
  $("#rProg").onchange();
  const rb = $("#refresh"); if (rb) rb.onclick = refresh;
  window.addEventListener("resize", () => { clearTimeout(window.__rz); window.__rz = setTimeout(renderChart, 180); });
  $("#cGo").click(); $("#mGo").click(); $("#rGo").click();
}

(async function boot() {
  let DATA_OBJ = null;
  try {
    const r = await fetch("data.json", { cache: "no-store" });
    DATA_OBJ = await r.json();
  } catch (e) {
    try { DATA_OBJ = JSON.parse(document.getElementById("dataset").textContent); } catch (e2) {}
  }
  if (!DATA_OBJ) {
    document.querySelector(".wrap").insertAdjacentHTML("afterbegin",
      '<div class="out" style="border-color:#f2686b">Não foi possível carregar os dados.</div>');
    return;
  }
  DATA = DATA_OBJ;
  init();
})();
