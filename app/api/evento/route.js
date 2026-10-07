/**
 * POST /api/evento — beacon do site para métricas da campanha.
 * Aceita apenas {tipo: 'visita' | 'simulacao'}; os restantes eventos
 * (esclarecimento, contratacao, pdf) são registados no servidor, nas
 * próprias rotas onde acontecem.
 */

import { registarEvento } from '../../../lib/eventos';

const TIPOS_BEACON = ['visita', 'simulacao'];

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

  await registarEvento(corpo.tipo);
  return new Response(null, { status: 204 });
}
