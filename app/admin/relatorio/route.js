/**
 * GET /admin/relatorio — backoffice do simulador (requer sessão).
 * Layout claro: KPIs, actividade por dia, origem dos acessos, dispositivos,
 * simulações não concluídas e registo de actividade com pesquisa e filtros.
 * Os dados são injectados agregados por dia; o período filtra no cliente.
 */

import { sessaoValida } from '../../../lib/admin';
import { lerEventos, agregarPorDia, listaRegistos, FMT_DIA_LUANDA } from '../../../lib/eventos';

const USER = process.env.ADMIN_USER || 'admin';

export async function GET(request) {
  if (!sessaoValida(request)) {
    return new Response(null, { status: 303, headers: { Location: '/admin' } });
  }

  const eventos = await lerEventos();
  const { porDia } = agregarPorDia(eventos);
  const registos = listaRegistos(eventos).map((e) => ({
    t: e.t, id: e.id, tipo: e.tipo,
    nome: e.nome || null, telefone: e.telefone || null, email: e.email || null,
    preferencia: e.preferencia || null, premioAnual: e.premioAnual ?? null,
    cotacaoUrl: e.cotacaoUrl || null, origem: e.origem || null,
    massaMensal: e.massaMensal ?? null, empregados: e.empregados ?? null,
  }));

  const dados = {
    porDia: [...porDia].reverse(), // ascendente
    registos,
    hoje: FMT_DIA_LUANDA.format(new Date()),
    geradoEm: new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' }),
    iniciais: USER.slice(0, 2).toUpperCase(),
  };
  const dadosJson = JSON.stringify(dados).replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="pt-AO">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Backoffice | Simulador NOSSA Seguros</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  :root {
    --navy: #0A1D3F; --navy-2: #13306B; --azul: #4F79D0; --verde: #7FBE3D;
    --texto: #15233F; --suave: #5E6B85; --apagado: #93A0B8;
    --borda: #E4E8F0; --fundo: #FFFFFF; --cinza: #F4F6FA;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Nunito Sans", ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif;
    background: var(--fundo); color: var(--texto); font-size: 15px; line-height: 1.45;
  }
  header { border-bottom: 1px solid var(--borda); }
  .topo {
    max-width: 1340px; margin: 0 auto; padding: .7rem 1.4rem;
    display: flex; align-items: center; gap: 1rem;
  }
  .topo img { height: 30px; }
  .topo .separador { width: 1px; height: 1.5rem; background: var(--borda); }
  .topo .seccao-nome { font-size: .92rem; font-weight: 700; color: var(--texto); }
  .topo .direita { margin-left: auto; display: flex; align-items: center; gap: 1rem; }
  .ao-vivo { font-size: .76rem; font-weight: 700; color: var(--suave); display: inline-flex; align-items: center; gap: .4rem; }
  .ao-vivo::before { content: ""; width: .5rem; height: .5rem; border-radius: 50%; background: var(--verde); }
  .avatar {
    width: 2.1rem; height: 2.1rem; border-radius: 50%;
    background: var(--cinza); border: 1px solid var(--borda);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: .72rem; font-weight: 800; color: var(--navy);
    text-decoration: none;
  }
  .avatar:hover { background: #E9EDF5; }

  main { max-width: 1340px; margin: 0 auto; padding: 1.4rem 1.4rem 3rem; }
  .cabeca { display: flex; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.2rem; }
  .cabeca h1 { font-size: 1.9rem; font-weight: 900; color: var(--navy); letter-spacing: -.01em; }
  .cabeca p { color: var(--suave); font-size: .95rem; }
  .cabeca .controles { margin-left: auto; display: flex; gap: .6rem; align-items: center; }
  select.periodo, a.exportar {
    height: 2.7rem; border: 1px solid var(--borda); border-radius: 8px;
    background: #fff; color: var(--texto);
    font-family: inherit; font-size: .86rem; font-weight: 700;
    padding: 0 .9rem; cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; gap: .5rem;
  }
  select.periodo:focus { outline: none; border-color: var(--azul); }
  a.exportar:hover, select.periodo:hover { border-color: var(--apagado); }

  .kpis {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    margin: 0 0 1rem;
  }
  .kpi { padding: .7rem 1.2rem .9rem 0; }
  .kpi + .kpi { border-left: 1px solid var(--borda); padding-left: 1.2rem; }
  @media (max-width: 760px) { .kpi + .kpi { border-left: none; padding-left: 0; } }
  .kpi .rotulo { font-size: .86rem; font-weight: 700; color: var(--texto); }
  .kpi .numero { font-size: 2.3rem; font-weight: 900; color: var(--navy); font-variant-numeric: tabular-nums; line-height: 1.15; }
  .kpi .sub { font-size: .74rem; color: var(--apagado); }

  .grelha {
    display: grid; grid-template-columns: 1.9fr .9fr .9fr; gap: 0;
    border: 1px solid var(--borda); border-radius: 12px; overflow: hidden;
    margin-bottom: 1.6rem;
  }
  @media (max-width: 1020px) { .grelha { grid-template-columns: 1fr; } }
  .celula { padding: 1.1rem 1.3rem; }
  .celula + .celula { border-left: 1px solid var(--borda); }
  @media (max-width: 1020px) { .celula + .celula { border-left: none; border-top: 1px solid var(--borda); } }
  .celula h2 { font-size: 1.05rem; font-weight: 800; color: var(--navy); margin-bottom: .8rem; }
  .grafico-caixa { height: 250px; position: relative; }

  .barra-linha { display: grid; grid-template-columns: 6.2rem 1fr 2.8rem; align-items: center; gap: .6rem; margin-bottom: .65rem; font-size: .84rem; color: var(--texto); }
  .barra-fundo { background: var(--cinza); border-radius: 99px; height: .6rem; overflow: hidden; }
  .barra-valor { height: 100%; border-radius: 99px; }
  .barra-linha .pct { text-align: right; font-weight: 700; color: var(--suave); font-size: .8rem; }

  .mini-titulo { font-size: 1.05rem; font-weight: 800; color: var(--navy); margin: 1.1rem 0 .3rem; }
  .numero-grande { font-size: 2rem; font-weight: 900; color: var(--navy); line-height: 1.2; }
  .sub-claro { font-size: .78rem; color: var(--apagado); }

  .registos-cabeca { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .8rem; }
  .registos-cabeca .titulos { margin-right: auto; }
  .registos-cabeca h2 { font-size: 1.35rem; font-weight: 900; color: var(--navy); }
  .registos-cabeca p { font-size: .82rem; color: var(--suave); }
  .pesquisa {
    height: 2.6rem; border: 1px solid var(--borda); border-radius: 8px;
    padding: 0 .9rem 0 2.1rem; font-family: inherit; font-size: .85rem; min-width: 15rem;
    background: #fff url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="%235E6B85" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.6" y2="16.6"/></svg>') .7rem center no-repeat;
  }
  .pesquisa:focus { outline: none; border-color: var(--azul); }
  select.filtro {
    height: 2.6rem; border: 1px solid var(--borda); border-radius: 8px;
    background: #fff; font-family: inherit; font-size: .83rem; font-weight: 700;
    color: var(--texto); padding: 0 .7rem; cursor: pointer;
  }
  button.limpar {
    height: 2.6rem; border: 1px solid var(--borda); border-radius: 8px; background: #fff;
    font-family: inherit; font-size: .83rem; font-weight: 700; color: var(--texto);
    padding: 0 .9rem; cursor: pointer;
  }
  button.limpar:hover { border-color: var(--apagado); }

  .tabela-caixa { border: 1px solid var(--borda); border-radius: 12px; overflow: hidden; }
  .tabela-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: .68rem 1rem; font-size: .84rem; text-align: left; border-bottom: 1px solid var(--borda); white-space: nowrap; }
  th { font-size: .74rem; color: var(--suave); font-weight: 800; background: #FAFBFD; }
  td .nome { font-weight: 800; color: var(--navy); }
  td .linha2 { font-size: .74rem; color: var(--apagado); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  td a { color: var(--azul); font-weight: 800; text-decoration: none; }
  td a:hover { text-decoration: underline; }
  .etq {
    display: inline-block; font-size: .74rem; font-weight: 800;
    padding: .22rem .65rem; border-radius: 7px;
  }
  .etq-visita { background: var(--cinza); color: var(--suave); }
  .etq-sim { background: #E3ECFB; color: #2B55A6; }
  .etq-cot { background: #E9F5DA; color: #4C7A1B; }
  .etq-ped { background: #FFF3D6; color: #8A6410; }
  .etq-con { background: var(--verde); color: #fff; }
  .rodape-tabela {
    display: flex; align-items: center; gap: 1rem; padding: .7rem 1rem;
    font-size: .8rem; color: var(--suave);
  }
  .paginacao { margin-left: auto; display: flex; gap: .3rem; }
  .paginacao button {
    min-width: 2rem; height: 2rem; border: 1px solid var(--borda); border-radius: 7px;
    background: #fff; font-family: inherit; font-weight: 800; font-size: .8rem;
    color: var(--texto); cursor: pointer;
  }
  .paginacao button.activa { border-color: var(--verde); background: #F3FAEB; color: #4C7A1B; }
  .paginacao button:disabled { opacity: .4; cursor: default; }
  .vazio { padding: 1.4rem 1rem; font-size: .86rem; color: var(--apagado); text-align: center; }
</style>
</head>
<body>
<header>
  <div class="topo">
    <img src="/logo-nossa.png" alt="NOSSA Seguros">
    <span class="separador"></span>
    <span class="seccao-nome">Simulador · Backoffice</span>
    <div class="direita">
      <span class="ao-vivo">Dados em directo</span>
      <a class="avatar" href="/api/admin/sair" title="Terminar sessão">${dados.iniciais}</a>
    </div>
  </div>
</header>
<main>
  <div class="cabeca">
    <div>
      <h1>Visitas, simulações e cotações</h1>
      <p>Toda a actividade do simulador num único ecrã.</p>
    </div>
    <div class="controles">
      <select class="periodo" id="periodo">
        <option value="7">Últimos 7 dias</option>
        <option value="30" selected>Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="0">Desde o início</option>
      </select>
      <a class="exportar" href="/admin/relatorio-csv">&#8681; Exportar</a>
    </div>
  </div>

  <div class="kpis" id="kpis"></div>

  <div class="grelha">
    <div class="celula">
      <h2>Actividade por dia</h2>
      <div class="grafico-caixa"><canvas id="g-actividade"></canvas></div>
    </div>
    <div class="celula">
      <h2>Origem dos acessos</h2>
      <div id="origens"></div>
      <div class="mini-titulo">Contactos pedidos</div>
      <div id="contactos-split" class="sub-claro"></div>
    </div>
    <div class="celula">
      <h2>Dispositivos</h2>
      <div id="dispositivos"></div>
      <div class="mini-titulo">Simulações não concluídas</div>
      <div class="numero-grande" id="nao-concluidas">0</div>
      <div class="sub-claro" id="nao-concluidas-sub"></div>
      <div class="mini-titulo">Tempo médio no site</div>
      <div class="numero-grande" id="tempo-medio">—</div>
      <div class="sub-claro" id="tempo-medio-sub"></div>
    </div>
  </div>

  <div class="registos-cabeca">
    <div class="titulos">
      <h2>Registos de actividade</h2>
      <p>Visitas, simulações, cotações e pedidos de contacto.</p>
    </div>
    <input class="pesquisa" id="pesquisa" type="text" placeholder="Pesquisar nome, telefone ou email">
    <select class="filtro" id="filtro-tipo">
      <option value="">Tipo: todas as actividades</option>
      <option value="contratacao">Contratação</option>
      <option value="esclarecimento">Esclarecimento</option>
      <option value="pdf">Cotação PDF</option>
      <option value="simulacao">Simulação</option>
      <option value="visita">Visita</option>
    </select>
    <button class="limpar" id="limpar">Limpar filtros</button>
  </div>
  <div class="tabela-caixa">
    <div class="tabela-scroll">
      <table id="tabela">
        <thead>
          <tr><th>Data / Hora</th><th>Visitante</th><th>Actividade</th><th>Contacto</th><th>Ref.</th><th class="num" style="text-align:right">Prémio anual</th><th>Cotação</th></tr>
        </thead>
        <tbody id="corpo-tabela"></tbody>
      </table>
    </div>
    <div class="rodape-tabela">
      <span id="contagem"></span>
      <div class="paginacao" id="paginacao"></div>
    </div>
  </div>
</main>
<script>
var D = ${dadosJson};
(function () {
  var fmtKz = function (v) {
    if (v == null || !isFinite(Number(v))) return '-';
    var p = Number(v).toFixed(2).split('.');
    return p[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ') + ',' + p[1] + ' Kz';
  };
  var fmtInt = function (n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); };
  var fmtPct = function (parte, todo) { return todo ? (100 * parte / todo).toFixed(1).replace('.', ',') + '%' : '—'; };
  var fmtTel = function (t) { return t ? '(+244) ' + String(t).replace(/(\\d{3})(\\d{3})(\\d{3})/, '$1 $2 $3') : ''; };
  var fmtDur = function (seg) {
    if (!seg) return '—';
    var m = Math.floor(seg / 60), s = Math.round(seg % 60);
    return m ? m + 'm ' + (s < 10 ? '0' : '') + s + 's' : s + 's';
  };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var fmtHora = function (iso) {
    var d = new Date(iso);
    return d.toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.,', ' ·').replace(',', ' ·');
  };

  /* ---------- período ---------- */
  function diasDoPeriodo(n) {
    if (!n) return D.porDia.slice();
    var corte = new Date(Date.now() - (n - 1) * 86400e3).toISOString().slice(0, 10);
    return D.porDia.filter(function (d) { return d.dia >= corte; });
  }
  function dataCorte(n) {
    return n ? new Date(Date.now() - (n - 1) * 86400e3).toISOString().slice(0, 10) : null;
  }
  function soma(dias, chave) {
    return dias.reduce(function (acc, d) { return acc + (d[chave] || 0); }, 0);
  }

  /* ---------- KPIs ---------- */
  function renderKpis(dias) {
    var visitas = soma(dias, 'visita'), sims = soma(dias, 'simulacao'), cots = soma(dias, 'pdf');
    var peds = soma(dias, 'esclarecimento'), cons = soma(dias, 'contratacao');
    var kpis = [
      { r: 'Visitas', n: fmtInt(visitas), s: 'sessões no período' },
      { r: 'Simulações concluídas', n: fmtInt(sims), s: fmtPct(sims, visitas) + ' das visitas' },
      { r: 'Cotações em PDF', n: fmtInt(cots), s: fmtPct(cots, sims) + ' das simulações' },
      { r: 'Pedidos de contacto', n: fmtInt(peds + cons), s: fmtInt(peds) + ' esclarecimento · ' + fmtInt(cons) + ' contratação' },
      { r: 'Conversão em contratação', n: fmtPct(cons, sims), s: 'de quem simulou' }
    ];
    document.getElementById('kpis').innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><div class="rotulo">' + k.r + '</div><div class="numero">' + k.n + '</div><div class="sub">' + k.s + '</div></div>';
    }).join('');
  }

  /* ---------- gráfico ---------- */
  var grafico = null;
  function renderGrafico(dias) {
    var ctx = document.getElementById('g-actividade');
    if (typeof Chart === 'undefined' || !ctx) return;
    var rotulos = dias.map(function (d) { return d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7); });
    var conf = {
      type: 'bar',
      data: {
        labels: rotulos,
        datasets: [
          { label: 'Visitas', data: dias.map(function (d) { return d.visita; }), backgroundColor: '#0A1D3F', borderRadius: 3, maxBarThickness: 26 },
          { label: 'Simulações', data: dias.map(function (d) { return d.simulacao; }), backgroundColor: '#4F79D0', borderRadius: 3, maxBarThickness: 26 },
          { label: 'Cotações', data: dias.map(function (d) { return d.pdf; }), backgroundColor: '#7FBE3D', borderRadius: 3, maxBarThickness: 26 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 11, boxHeight: 11, font: { weight: 700 } } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 14, font: { size: 10.5 } } },
          y: { beginAtZero: true, grid: { color: '#EDF0F6' }, ticks: { precision: 0, font: { size: 10.5 } }, title: { display: true, text: 'Quantidade', font: { size: 10.5 } } }
        }
      }
    };
    if (grafico) { grafico.data = conf.data; grafico.update(); }
    else { grafico = new Chart(ctx, conf); }
  }

  /* ---------- barras de percentagem ---------- */
  function renderBarras(el, linhas, cor) {
    var total = linhas.reduce(function (a, l) { return a + l.valor; }, 0);
    el.innerHTML = linhas.map(function (l, i) {
      var pctN = total ? Math.round(100 * l.valor / total) : 0;
      var c = Array.isArray(cor) ? cor[i % cor.length] : cor;
      return '<div class="barra-linha"><span>' + l.rotulo + '</span>' +
        '<div class="barra-fundo"><div class="barra-valor" style="width:' + pctN + '%;background:' + c + '"></div></div>' +
        '<span class="pct">' + (total ? pctN + '%' : '—') + '</span></div>';
    }).join('') || '<p class="sub-claro">Sem dados no período.</p>';
  }

  function renderPaineis(dias) {
    renderBarras(document.getElementById('origens'), [
      { rotulo: 'Google', valor: soma(dias, 'google') },
      { rotulo: 'Directo', valor: soma(dias, 'direto') },
      { rotulo: 'Redes sociais', valor: soma(dias, 'social') },
      { rotulo: 'Outros', valor: soma(dias, 'outros') }
    ], ['#0A1D3F', '#4F79D0', '#7FBE3D', '#B9C4D8']);

    renderBarras(document.getElementById('dispositivos'), [
      { rotulo: 'Telemóvel', valor: soma(dias, 'movel') },
      { rotulo: 'Computador', valor: soma(dias, 'computador') }
    ], ['#7FBE3D', '#0A1D3F']);

    var iniciadas = soma(dias, 'sInicio'), concluidas = soma(dias, 'simulacao');
    var nao = Math.max(0, iniciadas - concluidas);
    document.getElementById('nao-concluidas').textContent = fmtInt(nao);
    document.getElementById('nao-concluidas-sub').textContent = fmtInt(iniciadas) + ' iniciadas · ' + fmtInt(concluidas) + ' concluídas';

    var sSoma = soma(dias, 'sessaoSoma'), sNum = soma(dias, 'sessaoNum');
    document.getElementById('tempo-medio').textContent = sNum ? fmtDur(sSoma / sNum) : '—';
    document.getElementById('tempo-medio-sub').textContent = fmtInt(sNum) + ' sessões medidas';

    var eCh = soma(dias, 'eChamada'), eEm = soma(dias, 'eEmail');
    document.getElementById('contactos-split').textContent = fmtInt(eCh) + ' por chamada/WhatsApp · ' + fmtInt(eEm) + ' por email';
  }

  /* ---------- registos ---------- */
  var ETQ = {
    visita: ['etq-visita', 'Visita'],
    simulacao: ['etq-sim', 'Simulação'],
    pdf: ['etq-cot', 'Cotação PDF'],
    esclarecimento: ['etq-ped', 'Esclarecimento'],
    contratacao: ['etq-con', 'Contratação']
  };
  var pagina = 1;
  var POR_PAGINA = 10;

  function registosFiltrados() {
    var corte = dataCorte(Number(document.getElementById('periodo').value));
    var tipo = document.getElementById('filtro-tipo').value;
    var termo = document.getElementById('pesquisa').value.trim().toLowerCase();
    return D.registos.filter(function (r) {
      if (corte && r.t.slice(0, 10) < corte) return false;
      if (tipo && r.tipo !== tipo) return false;
      if (termo) {
        var palheiro = [r.nome, r.telefone, r.email, r.id].join(' ').toLowerCase();
        if (palheiro.indexOf(termo) < 0) return false;
      }
      return true;
    });
  }

  function renderTabela() {
    var lista = registosFiltrados();
    var total = lista.length;
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (pagina > paginas) pagina = paginas;
    var fatia = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

    document.getElementById('corpo-tabela').innerHTML = fatia.map(function (r) {
      var etq = ETQ[r.tipo] || ['etq-visita', r.tipo];
      var nome = r.nome ? '<span class="nome">' + esc(r.nome) + '</span>' : '<span class="nome">Visitante ' + esc(r.id) + '</span><div class="linha2">não identificado</div>';
      var contacto = (r.email ? esc(r.email) + '<div class="linha2">' + esc(fmtTel(r.telefone)) + '</div>' : (r.telefone ? esc(fmtTel(r.telefone)) : '–'));
      var extra = r.tipo === 'esclarecimento' && r.preferencia ? '<div class="linha2">prefere ' + (r.preferencia === 'email' ? 'email' : 'chamada/WhatsApp') + '</div>' : '';
      return '<tr>' +
        '<td>' + fmtHora(r.t) + '</td>' +
        '<td>' + nome + '</td>' +
        '<td><span class="etq ' + etq[0] + '">' + etq[1] + '</span>' + extra + '</td>' +
        '<td>' + contacto + '</td>' +
        '<td>' + esc(r.id) + '</td>' +
        '<td class="num">' + fmtKz(r.premioAnual) + '</td>' +
        '<td>' + (r.cotacaoUrl ? '<a href="' + esc(r.cotacaoUrl) + '" target="_blank" rel="noopener">abrir</a>' : '–') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="7" class="vazio">Sem registos para os filtros escolhidos.</td></tr>';

    var inicio = total ? (pagina - 1) * POR_PAGINA + 1 : 0;
    var fim = Math.min(pagina * POR_PAGINA, total);
    document.getElementById('contagem').textContent = 'A mostrar ' + inicio + ' – ' + fim + ' de ' + fmtInt(total);

    var pag = document.getElementById('paginacao');
    var botoes = '<button ' + (pagina <= 1 ? 'disabled' : '') + ' data-p="' + (pagina - 1) + '">&#8249;</button>';
    var mostrar = [];
    for (var p = 1; p <= paginas; p++) {
      if (p === 1 || p === paginas || Math.abs(p - pagina) <= 1) mostrar.push(p);
    }
    var anterior = 0;
    mostrar.forEach(function (p) {
      if (p - anterior > 1) botoes += '<button disabled>…</button>';
      botoes += '<button class="' + (p === pagina ? 'activa' : '') + '" data-p="' + p + '">' + p + '</button>';
      anterior = p;
    });
    botoes += '<button ' + (pagina >= paginas ? 'disabled' : '') + ' data-p="' + (pagina + 1) + '">&#8250;</button>';
    pag.innerHTML = botoes;
    pag.querySelectorAll('button[data-p]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = Number(b.getAttribute('data-p'));
        if (p >= 1 && p <= paginas) { pagina = p; renderTabela(); }
      });
    });
  }

  /* ---------- orquestração ---------- */
  function renderTudo() {
    var dias = diasDoPeriodo(Number(document.getElementById('periodo').value));
    renderKpis(dias);
    renderGrafico(dias);
    renderPaineis(dias);
    pagina = 1;
    renderTabela();
  }

  document.getElementById('periodo').addEventListener('change', renderTudo);
  document.getElementById('filtro-tipo').addEventListener('change', function () { pagina = 1; renderTabela(); });
  document.getElementById('pesquisa').addEventListener('input', function () { pagina = 1; renderTabela(); });
  document.getElementById('limpar').addEventListener('click', function () {
    document.getElementById('pesquisa').value = '';
    document.getElementById('filtro-tipo').value = '';
    pagina = 1; renderTabela();
  });

  renderTudo();
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
