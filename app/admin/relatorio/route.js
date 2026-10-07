/**
 * GET /admin/relatorio — dashboard da campanha (requer sessão de backoffice).
 * Tema escuro NOSSA, gráficos Chart.js (evolução 30 dias, funil, pedidos por
 * tipo), KPIs, pedidos/cotações identificados e simulações recentes.
 */

import { sessaoValida } from '../../../lib/admin';
import { lerEventos, agregarPorDia, listasRecentes, FMT_DIA_LUANDA } from '../../../lib/eventos';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtKz(v) {
  if (!Number.isFinite(Number(v))) return '-';
  const partes = Number(v).toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + partes[1] + ' Kz';
}

function fmtTel(t) {
  return t ? '(+244) ' + String(t).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : '-';
}

function fmtHora(iso) {
  return new Date(iso).toLocaleString('pt-PT', { timeZone: 'Africa/Luanda', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDuracao(seg) {
  if (!seg) return '—';
  const m = Math.floor(seg / 60), s = seg % 60;
  return m ? m + 'm ' + String(s).padStart(2, '0') + 's' : s + 's';
}

function pct(parte, todo) {
  if (!todo) return '—';
  return (100 * parte / todo).toFixed(1).replace('.', ',') + '%';
}

export async function GET(request) {
  if (!sessaoValida(request)) {
    return new Response(null, { status: 303, headers: { Location: '/admin' } });
  }

  const eventos = await lerEventos();
  const { totais, porDia, tempoMedioSegundos, numSessoes } = agregarPorDia(eventos);
  const { pedidos, simulacoes } = listasRecentes(eventos);
  const geradoEm = new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' });

  /* série dos últimos 30 dias para o gráfico de evolução */
  const mapaDias = new Map(porDia.map((d) => [d.dia, d]));
  const serie = { rotulos: [], visitas: [], simulacoes: [], pedidos: [] };
  const agora = new Date();
  for (let i = 29; i >= 0; i--) {
    const dia = FMT_DIA_LUANDA.format(new Date(agora.getTime() - i * 24 * 60 * 60e3));
    const d = mapaDias.get(dia);
    serie.rotulos.push(dia.slice(8, 10) + '/' + dia.slice(5, 7));
    serie.visitas.push(d ? d.visita : 0);
    serie.simulacoes.push(d ? d.simulacao : 0);
    serie.pedidos.push(d ? d.esclarecimento + d.contratacao : 0);
  }

  const dadosGraficos = {
    serie,
    funil: [totais.visita, totais.simulacao, totais.pdf, totais.esclarecimento, totais.contratacao],
    tipos: [totais.contratacao, totais.esclarecimentoChamada, totais.esclarecimentoEmail, totais.pdf],
  };
  const dadosJson = JSON.stringify(dadosGraficos).replace(/</g, '\\u003c');

  const ETQ = {
    contratacao: '<span class="etq etq-verde">Contratação</span>',
    esclarecimento: '<span class="etq etq-azul">Esclarecimento</span>',
    pdf: '<span class="etq etq-cinza">Cotação PDF</span>',
  };

  const linhasPedidos = pedidos.map((p) => `
      <tr>
        <td>${fmtHora(p.t)}</td>
        <td>${ETQ[p.tipo] || ''}${p.tipo === 'esclarecimento' ? ' <span class="sub">' + (p.preferencia === 'email' ? 'Email' : 'Chamada/WhatsApp') + '</span>' : ''}</td>
        <td class="forte">${esc(p.nome) || '<span class="sub">anónimo</span>'}</td>
        <td>${fmtTel(p.telefone)}</td>
        <td>${esc(p.email) || '-'}</td>
        <td class="num forte">${p.premioAnual != null ? fmtKz(p.premioAnual) : '-'}</td>
        <td>${p.cotacaoUrl ? '<a href="' + esc(p.cotacaoUrl) + '" target="_blank" rel="noopener">abrir</a>' : '-'}</td>
      </tr>`).join('');

  const rotuloTipoSal = { mensal: 'Mensal', anual: 'Anual', semanal: 'Semanal', diario: 'Diário' };
  const linhasSimulacoes = simulacoes.map((s) => `
      <tr>
        <td>${fmtHora(s.t)}</td>
        <td class="num">${s.empregados != null ? s.empregados : '-'}</td>
        <td class="num">${s.massaMensal != null ? fmtKz(s.massaMensal) : '-'}</td>
        <td class="num">${s.nSalarios != null ? String(s.nSalarios).replace('.', ',') : '-'}</td>
        <td>${rotuloTipoSal[s.tipoSalario] || '-'}</td>
        <td class="num forte">${s.premioAnual != null ? fmtKz(s.premioAnual) : '-'}</td>
      </tr>`).join('');

  const linhasDias = porDia.slice(0, 60).map((d) => `
      <tr>
        <td>${d.dia.split('-').reverse().join('/')}</td>
        <td class="num">${d.visita}</td>
        <td class="num">${d.simulacao}</td>
        <td class="num">${d.pdf}</td>
        <td class="num">${d.esclarecimento}</td>
        <td class="num">${d.contratacao}</td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-AO">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Backoffice | Simulador NOSSA Seguros</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  :root {
    --verde: #7FBE3D; --verde-claro: #A5D468;
    --azul: #4F79D0; --azul-claro: #86A9E8;
    --fundo: #081426; --painel: #0E1F3C; --painel-borda: #1C3156;
    --texto: #E8EEF9; --suave: #8FA2C6; --apagado: #5B6E93;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    background: radial-gradient(1200px 500px at 80% -10%, #12294E 0%, var(--fundo) 55%);
    color: var(--texto); font-size: 16px; line-height: 1.5; min-height: 100vh;
  }
  header { border-bottom: 1px solid var(--painel-borda); background: rgba(8,20,38,.6); }
  .topo {
    max-width: 1240px; margin: 0 auto; padding: .75rem 1.25rem;
    display: flex; align-items: center; gap: 1rem;
  }
  .chip-logo { background: #fff; border-radius: 8px; padding: .35rem .6rem; line-height: 0; }
  .chip-logo img { height: 30px; }
  .topo .titulos { flex: 1; min-width: 0; }
  .topo h1 { font-size: .95rem; font-weight: 800; letter-spacing: .01em; }
  .topo .sub-titulo { font-size: .7rem; color: var(--suave); }
  a.sair {
    font-size: .72rem; font-weight: 700; color: var(--suave); text-decoration: none;
    border: 1px solid var(--painel-borda); border-radius: 6px; padding: .4rem .85rem;
    white-space: nowrap;
  }
  a.sair:hover { color: #fff; border-color: var(--suave); }
  main { max-width: 1240px; margin: 0 auto; padding: 1.4rem 1.25rem 3rem; }
  .gerado { font-size: .72rem; color: var(--apagado); margin-bottom: 1rem; }

  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); gap: .8rem; }
  .kpi {
    background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.015));
    border: 1px solid var(--painel-borda); border-radius: 12px;
    padding: .95rem 1.1rem; position: relative; overflow: hidden;
  }
  .kpi::before {
    content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
    background: var(--verde);
  }
  .kpi .rotulo { font-size: .64rem; font-weight: 700; color: var(--suave); text-transform: uppercase; letter-spacing: .1em; }
  .kpi .numero { font-size: 2rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.25; }
  .kpi .delta { font-size: .7rem; color: var(--verde-claro); font-weight: 600; }
  .kpi .delta.neutro { color: var(--suave); font-weight: 400; }
  .kpi.destaque { background: linear-gradient(135deg, rgba(127,190,61,.16), rgba(127,190,61,.05)); border-color: rgba(127,190,61,.4); }
  .kpi.destaque .numero { color: var(--verde-claro); }

  h2 {
    font-size: .74rem; font-weight: 800; color: var(--texto);
    text-transform: uppercase; letter-spacing: .12em;
    display: flex; align-items: center; gap: .55rem;
    margin: 1.7rem 0 .8rem;
  }
  h2::before { content: ""; width: 1.4rem; height: 3px; background: var(--verde); border-radius: 2px; }

  .grelha-graficos { display: grid; grid-template-columns: 1.7fr 1fr; gap: .9rem; }
  @media (max-width: 900px) { .grelha-graficos { grid-template-columns: 1fr; } }
  .painel {
    background: var(--painel);
    border: 1px solid var(--painel-borda); border-radius: 12px;
    padding: 1rem 1.1rem;
  }
  .painel h3 { font-size: .72rem; font-weight: 700; color: var(--suave); text-transform: uppercase; letter-spacing: .08em; margin-bottom: .7rem; }
  .grafico-alto { height: 300px; position: relative; }
  .grafico-medio { height: 136px; position: relative; }
  .coluna { display: flex; flex-direction: column; gap: .9rem; }

  .tabela-scroll { overflow-x: auto; background: var(--painel); border: 1px solid var(--painel-borda); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: .55rem .85rem; font-size: .78rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,.05); white-space: nowrap; color: var(--suave); }
  td.forte { color: var(--texto); font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  th { font-size: .62rem; text-transform: uppercase; letter-spacing: .09em; color: var(--apagado); background: rgba(255,255,255,.025); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,.025); }
  td a { color: var(--verde-claro); font-weight: 700; text-decoration: none; }
  td a:hover { text-decoration: underline; }
  .etq {
    display: inline-block; font-size: .6rem; font-weight: 800;
    text-transform: uppercase; letter-spacing: .06em;
    padding: .16rem .5rem; border-radius: 99px;
  }
  .etq-verde { background: rgba(127,190,61,.18); color: var(--verde-claro); border: 1px solid rgba(127,190,61,.45); }
  .etq-azul { background: rgba(79,121,208,.16); color: var(--azul-claro); border: 1px solid rgba(79,121,208,.45); }
  .etq-cinza { background: rgba(143,162,198,.12); color: var(--suave); border: 1px solid rgba(143,162,198,.35); }
  .sub { font-size: .68rem; color: var(--apagado); }
  .vazio { font-size: .8rem; color: var(--apagado); padding: 1rem 1.1rem; }
  .accoes { margin-top: 1.2rem; }
  .botao {
    display: inline-block; background: var(--verde); color: #06101F; text-decoration: none;
    font-size: .74rem; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
    padding: .65rem 1.2rem; border-radius: 6px;
  }
  .botao:hover { background: var(--verde-claro); }
</style>
</head>
<body>
<header>
  <div class="topo">
    <span class="chip-logo"><img src="/logo-nossa.png" alt="NOSSA Seguros"></span>
    <div class="titulos">
      <h1>Campanha Empregados Domésticos</h1>
      <div class="sub-titulo">Backoffice do simulador · actualizado ${geradoEm} (Luanda)</div>
    </div>
    <a class="sair" href="/api/admin/sair">Terminar sessão</a>
  </div>
</header>
<main>
  <div class="kpis">
    <div class="kpi"><div class="rotulo">Visitas</div><div class="numero">${totais.visita}</div><div class="delta neutro">sessões únicas</div></div>
    <div class="kpi"><div class="rotulo">Tempo médio</div><div class="numero">${fmtDuracao(tempoMedioSegundos)}</div><div class="delta neutro">${numSessoes} sessões medidas</div></div>
    <div class="kpi"><div class="rotulo">Simularam</div><div class="numero">${totais.simulacao}</div><div class="delta">${pct(totais.simulacao, totais.visita)} das visitas</div></div>
    <div class="kpi"><div class="rotulo">Cotações PDF</div><div class="numero">${totais.pdf}</div><div class="delta neutro">descarregadas</div></div>
    <div class="kpi"><div class="rotulo">Esclarecimento</div><div class="numero">${totais.esclarecimento}</div><div class="delta neutro">${totais.esclarecimentoChamada} chamada · ${totais.esclarecimentoEmail} email</div></div>
    <div class="kpi destaque"><div class="rotulo">Contratações</div><div class="numero">${totais.contratacao}</div><div class="delta">${pct(totais.contratacao, totais.simulacao)} de quem simulou</div></div>
  </div>

  <h2>Actividade</h2>
  <div class="grelha-graficos">
    <div class="painel">
      <h3>Evolução · últimos 30 dias</h3>
      <div class="grafico-alto"><canvas id="g-evolucao"></canvas></div>
    </div>
    <div class="coluna">
      <div class="painel">
        <h3>Funil da campanha</h3>
        <div class="grafico-medio"><canvas id="g-funil"></canvas></div>
      </div>
      <div class="painel">
        <h3>Pedidos por tipo</h3>
        <div class="grafico-medio"><canvas id="g-tipos"></canvas></div>
      </div>
    </div>
  </div>

  <h2>Pedidos e cotações identificados</h2>
  <div class="tabela-scroll">
    ${pedidos.length ? `<table>
      <tr><th>Quando</th><th>Tipo</th><th>Nome</th><th>Telefone</th><th>Email</th><th class="num">Prémio anual</th><th>Cotação</th></tr>
      ${linhasPedidos}
    </table>` : '<p class="vazio">Ainda sem pedidos ou cotações identificados.</p>'}
  </div>

  <h2>Simulações recentes</h2>
  <div class="tabela-scroll">
    ${simulacoes.length ? `<table>
      <tr><th>Quando</th><th class="num">Empregados</th><th class="num">Massa mensal</th><th class="num">N.º salários</th><th>Tipo salário</th><th class="num">Prémio anual</th></tr>
      ${linhasSimulacoes}
    </table>` : '<p class="vazio">Ainda sem simulações registadas.</p>'}
  </div>

  <h2>Quebra diária</h2>
  <div class="tabela-scroll">
    ${porDia.length ? `<table>
      <tr><th>Dia</th><th class="num">Visitas</th><th class="num">Simularam</th><th class="num">PDF</th><th class="num">Esclarecimento</th><th class="num">Contratação</th></tr>
      ${linhasDias}
    </table>` : '<p class="vazio">Ainda não há eventos registados.</p>'}
  </div>

  <div class="accoes">
    <a class="botao" href="/admin/relatorio-csv">Exportar CSV</a>
  </div>
</main>
<script>
(function () {
  if (typeof Chart === 'undefined') return; // sem internet para o CDN, o resto do dashboard funciona
  var D = ${dadosJson};
  var SUAVE = '#8FA2C6', GRELHA = 'rgba(255,255,255,.055)';
  Chart.defaults.color = SUAVE;
  Chart.defaults.font.family = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif';
  Chart.defaults.font.size = 11;

  /* evolução: área suave com gradientes */
  var ctx = document.getElementById('g-evolucao').getContext('2d');
  var gradVerde = ctx.createLinearGradient(0, 0, 0, 300);
  gradVerde.addColorStop(0, 'rgba(127,190,61,.34)');
  gradVerde.addColorStop(1, 'rgba(127,190,61,0)');
  var gradAzul = ctx.createLinearGradient(0, 0, 0, 300);
  gradAzul.addColorStop(0, 'rgba(79,121,208,.3)');
  gradAzul.addColorStop(1, 'rgba(79,121,208,0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: D.serie.rotulos,
      datasets: [
        { label: 'Visitas', data: D.serie.visitas, borderColor: '#4F79D0', backgroundColor: gradAzul, fill: true, tension: .4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Simulações', data: D.serie.simulacoes, borderColor: '#7FBE3D', backgroundColor: gradVerde, fill: true, tension: .4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Pedidos', data: D.serie.pedidos, borderColor: '#E8EEF9', borderDash: [4, 4], fill: false, tension: .4, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: GRELHA }, ticks: { precision: 0 } }
      }
    }
  });

  /* funil horizontal */
  new Chart(document.getElementById('g-funil'), {
    type: 'bar',
    data: {
      labels: ['Visitas', 'Simularam', 'PDF', 'Esclarecim.', 'Contratação'],
      datasets: [{ data: D.funil, backgroundColor: ['#2E4F8F', '#4F79D0', '#5E99B8', '#6BB05B', '#7FBE3D'], borderRadius: 4, barThickness: 13 }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: GRELHA }, ticks: { precision: 0 } },
        y: { grid: { display: false } }
      }
    }
  });

  /* pedidos por tipo */
  new Chart(document.getElementById('g-tipos'), {
    type: 'doughnut',
    data: {
      labels: ['Contratação', 'Esclarec. · Chamada', 'Esclarec. · Email', 'Cotação PDF'],
      datasets: [{ data: D.tipos, backgroundColor: ['#7FBE3D', '#4F79D0', '#A5D468', '#5B6E93'], borderColor: '#0E1F3C', borderWidth: 3 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { position: 'right', labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle' } } }
    }
  });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
