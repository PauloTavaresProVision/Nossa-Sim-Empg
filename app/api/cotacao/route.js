/**
 * POST /api/cotacao — gera e devolve o PDF da cotação para download directo
 * (botão "Guardar Cotação" do simulador). Não grava nada em disco e não
 * contacta a uCall; apenas recalcula os prémios no servidor e devolve o PDF.
 */

import { gerarPdfBytes } from '../../../lib/cotacao-pdf';

const MAX_SALARIOS = 50;
const SALARIO_MAX  = 1e9;

const MAX_PEDIDOS = 20;         // downloads por IP...
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

  let salarios = Array.isArray(corpo.salarios) ? corpo.salarios : [];
  salarios = salarios
    .map((s) => Number(s))
    .filter((s) => Number.isFinite(s) && s > 0 && s <= SALARIO_MAX)
    .slice(0, MAX_SALARIOS);

  if (!salarios.length) {
    return Response.json({ sucesso: false, mensagem: 'Indique pelo menos um salário para gerar a cotação.' }, { status: 422 });
  }

  try {
    const bytes = await gerarPdfBytes({ nome, telefone: null, salarios });
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="cotacao-nossa-seguros.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json({ sucesso: false, mensagem: 'Não foi possível gerar a cotação. Tente novamente.' }, { status: 500 });
  }
}
