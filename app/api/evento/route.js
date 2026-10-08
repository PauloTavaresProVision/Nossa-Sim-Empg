/**
 * POST /api/evento — beacon do site para métricas da campanha.
 * Aceita apenas {tipo: 'visita' | 'simulacao'}; os restantes eventos
 * (esclarecimento, contratacao, pdf) são registados no servidor, nas
 * próprias rotas onde acontecem.
 */

import { registarEvento, classificarOrigem } from '../../../lib/eventos';

const TIPOS_BEACON = ['visita', 'simulacao', 'simulacao_inicio', 'sessao'];

const MAX_PEDIDOS = 60;         // beacons por IP...
const JANELA_MS   = 10 * 60e3;  // ...nesta janela

const pedidosPorIp = new Map();

function excedeuLimite(request) {
  const xff = request.headers.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'desconhecido');
  const agora = Date.now();
  const registos = (pedidosPorIp.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  registos.push(agora);
  pedidosPorIp.set(ip, registos);
  return registos.length > MAX_PEDIDOS;
}

export async function POST(request) {
  if (excedeuLimite(request)) return new Response(null, { status: 429 });

  let corpo;
  try { corpo = await request.json(); }
  catch { return new Response(null, { status: 400 }); }

  if (!TIPOS_BEACON.includes(corpo.tipo)) return new Response(null, { status: 400 });

  /* dados adicionais, saneados por tipo (apenas números/valores esperados) */
  const extra = {};
  if (corpo.tipo === 'visita') {
    extra.origem = classificarOrigem(corpo.referrer, corpo.utm);
    extra.dispositivo = corpo.dispositivo === 'movel' ? 'movel' : 'computador';
  } else if (corpo.tipo === 'simulacao') {
    const num = (v, max) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : null);
    if (num(corpo.empregados, 50) !== null) extra.empregados = Number(corpo.empregados);
    if (num(corpo.massaMensal, 1e10) !== null) extra.massaMensal = Number(corpo.massaMensal);
    if (num(corpo.premioAnual, 1e10) !== null) extra.premioAnual = Number(corpo.premioAnual);
    if ([12, 13, 13.5, 14].includes(Number(corpo.nSalarios))) extra.nSalarios = Number(corpo.nSalarios);
    if (['mensal', 'anual', 'semanal', 'diario'].includes(corpo.tipoSalario)) extra.tipoSalario = corpo.tipoSalario;
  } else if (corpo.tipo === 'sessao') {
    const d = Number(corpo.duracao);
    if (!Number.isFinite(d) || d < 3 || d > 7200) return new Response(null, { status: 400 });
    extra.duracao = Math.round(d);
  }

  await registarEvento(corpo.tipo, extra);
  return new Response(null, { status: 204 });
}
