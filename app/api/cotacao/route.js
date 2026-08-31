/**
 * POST /api/cotacao — gera e devolve o PDF da cotação para download directo
 * (botão "Guardar Cotação" do simulador). Não grava nada em disco e não
 * contacta a uCall; apenas recalcula os prémios no servidor e devolve o PDF.
 */

import { gerarPdfBytes, normalizarEmpregados, normalizarOpcoes } from '../../../lib/cotacao-pdf';

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

  /* telefone é opcional no download; se vier válido, entra no PDF */
  let telefone = String(corpo.telefone || '').replace(/\D/g, '');
  if (telefone.startsWith('244') && telefone.length === 12) telefone = telefone.slice(3);
  if (!/^9\d{8}$/.test(telefone)) telefone = null;

  const empregados = normalizarEmpregados(corpo);
  if (!empregados.length) {
    return Response.json({ sucesso: false, mensagem: 'Indique pelo menos um salário para gerar a cotação.' }, { status: 422 });
  }

  try {
    const bytes = await gerarPdfBytes({ nome, telefone, empregados, opcoes: normalizarOpcoes(corpo) });
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="cotacao-nossa-seguros.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (erro) {
    console.error('[cotacao] falha ao gerar o PDF:', erro && erro.message ? erro.message : erro);
    return Response.json({ sucesso: false, mensagem: 'Não foi possível gerar a cotação. Tente novamente.' }, { status: 500 });
  }
}
