/**
 * POST /api/admin/login — valida as credenciais e abre a sessão (cookie).
 */

import { credenciaisValidas, criarToken, cabecalhoSessao } from '../../../../lib/admin';

const MAX_TENTATIVAS = 5;       // tentativas de login por IP...
const JANELA_MS      = 10 * 60e3;

const tentativasPorIp = new Map();

function excedeuLimite(request) {
  const xff = request.headers.get('x-forwarded-for');
  const ip = xff ? xff.split(',')[0].trim() : (request.headers.get('x-real-ip') || 'desconhecido');
  const agora = Date.now();
  const registos = (tentativasPorIp.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  registos.push(agora);
  tentativasPorIp.set(ip, registos);
  return registos.length > MAX_TENTATIVAS;
}

export async function POST(request) {
  if (excedeuLimite(request)) {
    return new Response('Demasiadas tentativas. Tente novamente mais tarde.', { status: 429 });
  }

  let user = '', pass = '';
  try {
    const dados = await request.formData();
    user = String(dados.get('user') || '');
    pass = String(dados.get('pass') || '');
  } catch {
    return Response.redirect(new URL('/admin?erro=1', request.url), 303);
  }

  if (!credenciaisValidas(user, pass)) {
    console.warn('[admin] tentativa de login falhada para o utilizador "' + user.slice(0, 30) + '"');
    return Response.redirect(new URL('/admin?erro=1', request.url), 303);
  }

  const destino = new URL('/admin/relatorio', request.url);
  return new Response(null, {
    status: 303,
    headers: { Location: destino.toString(), 'Set-Cookie': cabecalhoSessao(criarToken()) },
  });
}
