/**
 * GET /admin/relatorio — relatório da campanha (requer sessão de backoffice).
 * Funil: visitas → simulações → pedidos de esclarecimento / contratação,
 * com totais, quebra diária e exportação CSV (/admin/relatorio-csv).
 */

import { sessaoValida } from '../../../lib/admin';
import { lerEventos, agregarPorDia } from '../../../lib/eventos';

function pct(parte, todo) {
  if (!todo) return '-';
  return (100 * parte / todo).toFixed(1).replace('.', ',') + '%';
}

export async function GET(request) {
  if (!sessaoValida(request)) {
    return Response.redirect(new URL('/admin', request.url), 303);
  }

  const { totais, porDia } = agregarPorDia(await lerEventos());
  const geradoEm = new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' });

  const linhasDias = porDia.slice(0, 60).map((d) => `
      <tr>
        <td>${d.dia.split('-').reverse().join('/')}</td>
        <td>${d.visita}</td>
        <td>${d.simulacao}</td>
        <td>${d.pdf}</td>
        <td>${d.esclarecimento}</td>
        <td>${d.contratacao}</td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-AO">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Relatório da Campanha | Simulador NOSSA Seguros</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    background: #F5F7FA; color: #1A2238; font-size: 16px; line-height: 1.5;
  }
  header {
    background: #fff; border-bottom: 1px solid #D6DBE6;
    padding: .9rem 1.25rem;
  }
  .topo { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .topo img { height: 38px; }
  .topo a { font-size: .8rem; color: #3D4660; }
  main { max-width: 1000px; margin: 0 auto; padding: 1.5rem 1.25rem 2.5rem; }
  h1 {
    font-size: .85rem; font-weight: 700; color: #0A1D3F;
    text-transform: uppercase; letter-spacing: .07em;
    border-left: 4px solid #7FBE3D; padding-left: .7rem;
    margin: 1.4rem 0 1rem;
  }
  .gerado { font-size: .75rem; color: #6B7591; margin-top: .4rem; }
  .cartoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr)); gap: .8rem; }
  .cartao {
    background: #fff; border: 1px solid #D6DBE6; border-radius: 8px;
    padding: .9rem 1rem;
  }
  .cartao .rotulo { font-size: .68rem; font-weight: 700; color: #6B7591; text-transform: uppercase; letter-spacing: .06em; }
  .cartao .numero { font-size: 1.7rem; font-weight: 800; color: #0A1D3F; font-variant-numeric: tabular-nums; }
  .cartao .sub { font-size: .72rem; color: #6B7591; }
  .cartao.destaque { background: #0A1D3F; border-color: #0A1D3F; }
  .cartao.destaque .rotulo { color: #A5D468; }
  .cartao.destaque .numero { color: #fff; }
  .cartao.destaque .sub { color: #8FA2C6; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #D6DBE6; border-radius: 8px; overflow: hidden; }
  th, td { padding: .55rem .8rem; font-size: .84rem; text-align: right; border-bottom: 1px solid #E8EBF2; font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  th { background: #0A1D3F; color: #fff; font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
  tr:last-child td { border-bottom: none; }
  .accoes { margin-top: 1rem; display: flex; gap: .7rem; flex-wrap: wrap; }
  .botao {
    display: inline-block; background: #7FBE3D; color: #fff; text-decoration: none;
    font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    padding: .6rem 1.1rem; border-radius: 4px;
  }
  .botao:hover { background: #689E2F; }
  .vazio { font-size: .85rem; color: #6B7591; background: #fff; border: 1px solid #D6DBE6; border-radius: 8px; padding: 1rem; }
  .tabela-scroll { overflow-x: auto; }
</style>
</head>
<body>
<header>
  <div class="topo">
    <img src="/logo-nossa.png" alt="NOSSA Seguros">
    <a href="/api/admin/sair">Terminar sessão</a>
  </div>
</header>
<main>
  <h1>Relatório da Campanha — Seguro de Empregados Domésticos</h1>
  <p class="gerado">Gerado em ${geradoEm} (hora de Luanda). Os dados contam desde a activação das métricas.</p>

  <h1>Funil</h1>
  <div class="cartoes">
    <div class="cartao"><div class="rotulo">Visitas</div><div class="numero">${totais.visita}</div><div class="sub">abriram o simulador</div></div>
    <div class="cartao"><div class="rotulo">Simularam</div><div class="numero">${totais.simulacao}</div><div class="sub">${pct(totais.simulacao, totais.visita)} das visitas</div></div>
    <div class="cartao"><div class="rotulo">Guardaram PDF</div><div class="numero">${totais.pdf}</div><div class="sub">cotações descarregadas</div></div>
    <div class="cartao"><div class="rotulo">Esclarecimento</div><div class="numero">${totais.esclarecimento}</div><div class="sub">${totais.esclarecimentoChamada} chamada · ${totais.esclarecimentoEmail} email</div></div>
    <div class="cartao destaque"><div class="rotulo">Contratação</div><div class="numero">${totais.contratacao}</div><div class="sub">${pct(totais.contratacao, totais.simulacao)} de quem simulou</div></div>
  </div>

  <h1>Por dia</h1>
  ${porDia.length ? `<div class="tabela-scroll"><table>
    <tr><th>Dia</th><th>Visitas</th><th>Simularam</th><th>PDF</th><th>Esclarecimento</th><th>Contratação</th></tr>
    ${linhasDias}
  </table></div>` : '<p class="vazio">Ainda não há eventos registados. Os números aparecem assim que houver actividade no simulador.</p>'}

  <div class="accoes">
    <a class="botao" href="/admin/relatorio-csv">Exportar CSV</a>
  </div>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
