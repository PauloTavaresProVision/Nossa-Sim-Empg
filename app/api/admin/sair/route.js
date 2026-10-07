/**
 * GET /api/admin/sair — fecha a sessão do backoffice.
 */

import { cabecalhoSair } from '../../../../lib/admin';

export async function GET(request) {
  const destino = new URL('/admin', request.url);
  return new Response(null, {
    status: 303,
    headers: { Location: destino.toString(), 'Set-Cookie': cabecalhoSair() },
  });
}
