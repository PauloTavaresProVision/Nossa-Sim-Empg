/**
 * GET /admin/relatorio — dashboard da campanha (requer sessão de backoffice).
 * Funil, tempo médio na página, gráfico diário (14 dias), pedidos
 * identificados (contratação/esclarecimento), simulações recentes,
 * quebra diária e exportação CSV.
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
  if (!seg) return '-';
  const m = Math.floor(seg / 60), s = seg % 60;
  return m ? m + 'm ' + String(s).padStart(2, '0') + 's' : s + 's';
}

function pct(parte, todo) {
  if (!todo) return '—';
  return (100 * parte / todo).toFixed(1).replace('.', ',') + '%';
}

/* gráfico de barras dos últimos 14 dias (visitas vs simulações), SVG puro */
function grafico(porDia) {
  const dias = [];
  const hoje = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * 24 * 60 * 60e3);
    dias.push(FMT_DIA_LUANDA.format(d));
  }
  const mapa = new Map(porDia.map((d) => [d.dia, d]));
  const serie = dias.map((dia) => ({ dia, v: mapa.get(dia)?.visita || 0, s: mapa.get(dia)?.simulacao || 0 }));
  const maximo = Math.max(1, ...serie.map((p) => Math.max(p.v, p.s)));

  const L = 720, A = 170, base = 140, topo = 14;
  const passo = L / serie.length;
  const altura = (n) => Math.round((base - topo) * n / maximo);

  let barras = '';
  serie.forEach((p, i) => {
    const x = i * passo;
    const lgCurta = p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7);
    const hv = altura(p.v), hs = altura(p.s);
    barras += `<rect x="${(x + passo * 0.16).toFixed(1)}" y="${base - hv}" width="${(passo * 0.3).toFixed(1)}" height="${hv}" rx="2" fill="#102E60"/>`;
    barras += `<rect x="${(x + passo * 0.52).toFixed(1)}" y="${base - hs}" width="${(passo * 0.3).toFixed(1)}" height="${hs}" rx="2" fill="#7FBE3D"/>`;
    if (p.v) barras += `<text x="${(x + passo * 0.31).toFixed(1)}" y="${base - hv - 4}" font-size="9" fill="#3D4660" text-anchor="middle">${p.v}</text>`;
    if (p.s) barras += `<text x="${(x + passo * 0.67).toFixed(1)}" y="${base - hs - 4}" font-size="9" fill="#3D4660" text-anchor="middle">${p.s}</text>`;
    barras += `<text x="${(x + passo / 2).toFixed(1)}" y="${base + 16}" font-size="8.5" fill="#6B7591" text-anchor="middle">${lgCurta}</text>`;
  });

  return `<svg viewBox="0 0 ${L} ${A}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
    <line x1="0" y1="${base}" x2="${L}" y2="${base}" stroke="#D6DBE6" stroke-width="1"/>
    ${barras}
  </svg>`;
}

export async function GET(request) {
  if (!sessaoValida(request)) {
    return new Response(null, { status: 303, headers: { Location: '/admin' } });
  }

  const eventos = await lerEventos();
  const { totais, porDia, tempoMedioSegundos, numSessoes } = agregarPorDia(eventos);
  const { pedidos, simulacoes } = listasRecentes(eventos);
  const geradoEm = new Date().toLocaleString('pt-PT', { timeZone: 'Africa/Luanda' });

  const linhasPedidos = pedidos.map((p) => `
      <tr>
        <td>${fmtHora(p.t)}</td>
        <td>${p.tipo === 'contratacao'
          ? '<span class="etq etq-verde">Contratação</span>'
          : '<span class="etq etq-navy">Esclarecimento</span> <span class="sub">' + (p.preferencia === 'email' ? 'Email' : 'Chamada/WhatsApp') + '</span>'}</td>
        <td>${esc(p.nome) || '-'}</td>
        <td>${fmtTel(p.telefone)}</td>
        <td>${esc(p.email) || '-'}</td>
        <td class="num">${p.premioAnual != null ? fmtKz(p.premioAnual) : '-'}</td>
        <td>${p.cotacaoUrl ? '<a href="' + esc(p.cotacaoUrl) + '" target="_blank" rel="noopener">PDF</a>' : '-'}</td>
      </tr>`).join('');

  const rotuloTipoSal = { mensal: 'Mensal', anual: 'Anual', semanal: 'Semanal', diario: 'Diário' };
  const linhasSimulacoes = simulacoes.map((s) => `
      <tr>
        <td>${fmtHora(s.t)}</td>
        <td class="num">${s.empregados != null ? s.empregados : '-'}</td>
        <td class="num">${s.massaMensal != null ? fmtKz(s.massaMensal) : '-'}</td>
        <td>${s.nSalarios != null ? String(s.nSalarios).replace('.', ',') : '-'}</td>
        <td>${rotuloTipoSal[s.tipoSalario] || '-'}</td>
        <td class="num">${s.premioAnual != null ? fmtKz(s.premioAnual) : '-'}</td>
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
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif;
    background: #EEF1F6; color: #1A2238; font-size: 16px; line-height: 1.5;
  }
  header { background: #fff; border-bottom: 1px solid #D6DBE6; }
  .topo {
    max-width: 1140px; margin: 0 auto; padding: .8rem 1.25rem;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  }
  .topo img { height: 36px; }
  .topo .titulo-topo { font-size: .78rem; font-weight: 700; color: #0A1D3F; text-transform: uppercase; letter-spacing: .08em; }
  .topo .direita { display: flex; align-items: center; gap: 1rem; }
  .topo a.sair {
    font-size: .74rem; font-weight: 700; color: #3D4660; text-decoration: none;
    border: 1px solid #D6DBE6; border-radius: 4px; padding: .35rem .8rem;
  }
  .topo a.sair:hover { border-color: #102E60; color: #102E60; }
  main { max-width: 1140px; margin: 0 auto; padding: 1.4rem 1.25rem 2.5rem; }
  .gerado { font-size: .74rem; color: #6B7591; margin-bottom: 1.1rem; }
  h2 {
    font-size: .8rem; font-weight: 700; color: #0A1D3F;
    text-transform: uppercase; letter-spacing: .07em;
    border-left: 4px solid #7FBE3D; padding-left: .7rem;
    margin: 1.6rem 0 .8rem;
  }
  .cartoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .8rem; }
  .cartao {
    background: #fff; border: 1px solid #D6DBE6; border-radius: 10px;
    padding: .95rem 1.05rem;
    border-top: 3px solid #7FBE3D;
  }
  .cartao .rotulo { font-size: .66rem; font-weight: 700; color: #6B7591; text-transform: uppercase; letter-spacing: .07em; }
  .cartao .numero { font-size: 1.8rem; font-weight: 800; color: #0A1D3F; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .cartao .sub { font-size: .7rem; color: #6B7591; }
  .cartao.navy { background: #0A1D3F; border-color: #0A1D3F; border-top-color: #7FBE3D; }
  .cartao.navy .rotulo { color: #A5D468; }
  .cartao.navy .numero { color: #fff; }
  .cartao.navy .sub { color: #8FA2C6; }
  .painel { background: #fff; border: 1px solid #D6DBE6; border-radius: 10px; padding: 1rem 1.1rem; }
  .legenda { display: flex; gap: 1.2rem; font-size: .72rem; color: #3D4660; margin-bottom: .5rem; }
  .legenda span::before { content: ""; display: inline-block; width: .7rem; height: .7rem; border-radius: 2px; margin-right: .35rem; vertical-align: -1px; }
  .legenda .lv::before { background: #102E60; }
  .legenda .ls::before { background: #7FBE3D; }
  .tabela-scroll { overflow-x: auto; background: #fff; border: 1px solid #D6DBE6; border-radius: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: .5rem .8rem; font-size: .8rem; text-align: left; border-bottom: 1px solid #E8EBF2; white-space: nowrap; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  th { background: #0A1D3F; color: #fff; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; position: sticky; top: 0; }
  tr:nth-child(even) td { background: #FAFBFD; }
  tr:last-child td { border-bottom: none; }
  td a { color: #102E60; font-weight: 700; }
  .etq {
    display: inline-block; font-size: .64rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: .04em;
    padding: .12rem .45rem; border-radius: 3px;
  }
  .etq-verde { background: #7FBE3D; color: #fff; }
  .etq-navy { background: #EAF0FA; color: #102E60; border: 1px solid #C6D4EC; }
  .sub { font-size: .7rem; color: #6B7591; }
  .vazio { font-size: .82rem; color: #6B7591; padding: 1rem 1.1rem; }
  .accoes { margin-top: 1.1rem; }
  .botao {
    display: inline-block; background: #7FBE3D; color: #fff; text-decoration: none;
    font-size: .76rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    padding: .6rem 1.1rem; border-radius: 4px;
  }
  .botao:hover { background: #689E2F; }
</style>
</head>
<body>
<header>
  <div class="topo">
    <img src="/logo-nossa.png" alt="NOSSA Seguros">
    <span class="titulo-topo">Backoffice · Simulador Empregados Domésticos</span>
    <div class="direita"><a class="sair" href="/api/admin/sair">Terminar sessão</a></div>
  </div>
</header>
<main>
  <p class="gerado">Actualizado em ${geradoEm} (hora de Luanda) · os dados contam desde a activação das métricas</p>

  <div class="cartoes">
    <div class="cartao"><div class="rotulo">Visitas</div><div class="numero">${totais.visita}</div><div class="sub">abriram o simulador</div></div>
    <div class="cartao"><div class="rotulo">Tempo médio</div><div class="numero">${fmtDuracao(tempoMedioSegundos)}</div><div class="sub">${numSessoes} sessões medidas</div></div>
    <div class="cartao"><div class="rotulo">Simularam</div><div class="numero">${totais.simulacao}</div><div class="sub">${pct(totais.simulacao, totais.visita)} das visitas</div></div>
    <div class="cartao"><div class="rotulo">Guardaram PDF</div><div class="numero">${totais.pdf}</div><div class="sub">cotações descarregadas</div></div>
    <div class="cartao"><div class="rotulo">Esclarecimento</div><div class="numero">${totais.esclarecimento}</div><div class="sub">${totais.esclarecimentoChamada} chamada · ${totais.esclarecimentoEmail} email</div></div>
    <div class="cartao navy"><div class="rotulo">Contratação</div><div class="numero">${totais.contratacao}</div><div class="sub">${pct(totais.contratacao, totais.simulacao)} de quem simulou</div></div>
  </div>

  <h2>Últimos 14 dias</h2>
  <div class="painel">
    <div class="legenda"><span class="lv">Visitas</span><span class="ls">Simulações</span></div>
    ${grafico(porDia)}
  </div>

  <h2>Pedidos de contratação e esclarecimento</h2>
  <div class="tabela-scroll">
    ${pedidos.length ? `<table>
      <tr><th>Quando</th><th>Tipo</th><th>Nome</th><th>Telefone</th><th>Email</th><th class="num">Prémio anual</th><th>Cotação</th></tr>
      ${linhasPedidos}
    </table>` : '<p class="vazio">Ainda sem pedidos identificados.</p>'}
  </div>

  <h2>Simulações recentes</h2>
  <div class="tabela-scroll">
    ${simulacoes.length ? `<table>
      <tr><th>Quando</th><th class="num">Empregados</th><th class="num">Massa mensal</th><th>N.º salários</th><th>Tipo salário</th><th class="num">Prémio anual</th></tr>
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
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
