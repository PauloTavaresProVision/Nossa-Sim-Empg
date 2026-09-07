/**
 * POST /api/cotacao-link — gera o PDF da cotação, guarda-o e devolve o link
 * público (usado pelo botão "Quero Contratar" para incluir a cotação no
 * email ao departamento de protocolos). Requer PUBLIC_BASE_URL.
 */

import { gerarPdfCotacao, normalizarEmpregados, normalizarOpcoes } from '../../../lib/cotacao-pdf';

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const MAX_PEDIDOS = 10;         // links por IP...
const JANELA_MS   = 10 * 60e3;  // ...nesta janela (10 minutos)

const pedidosPorIp = new Map();

function ipDoPedido(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'desconhecido';
}

function excedeuLimite(ip) {
  const agora = Date.now();
  const registos = (pedidosPorIp.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  registos.push(agora);
  pedidosPorIp.set(ip, registos);
  return registos.length > MAX_PEDIDOS;
}

export async function POST(request) {
  if (excedeuLimite(ipDoPedido(request))) {
    return Response.json({ sucesso: false, mensagem: 'Demasiados pedidos. Tente novamente mais tarde.' }, { status: 429 });
  }

  let corpo;
  try { corpo = await request.json(); }
  catch { return Response.json({ sucesso: false, mensagem: 'Pedido inválido.' }, { status: 400 }); }

  const nome = String(corpo.nome || '').trim().slice(0, 100);

  let telefone = String(corpo.telefone || '').replace(/\D/g, '');
  if (telefone.startsWith('244') && telefone.length === 12) telefone = telefone.slice(3);
  if (!/^9\d{8}$/.test(telefone)) telefone = null;

  const empregados = normalizarEmpregados(corpo);
  if (!empregados.length) {
    return Response.json({ sucesso: false, mensagem: 'Indique pelo menos um salário.' }, { status: 422 });
  }
  if (!PUBLIC_BASE_URL) {
    return Response.json({ sucesso: false, mensagem: 'Link indisponível.' }, { status: 503 });
  }

  try {
    const id = await gerarPdfCotacao({ nome, telefone, empregados, opcoes: normalizarOpcoes(corpo) });
    return Response.json({ sucesso: true, url: PUBLIC_BASE_URL + '/cotacoes/' + id }, { status: 200 });
  } catch (erro) {
    console.error('[cotacao-link] falha ao gerar o PDF:', erro && erro.message ? erro.message : erro);
    return Response.json({ sucesso: false, mensagem: 'Não foi possível gerar a cotação.' }, { status: 500 });
  }
}
