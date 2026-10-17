/**
 * GET /api/admin/sair — fecha a sessão do backoffice.
 */

import { cabecalhoSair, pedidoHttps } from '../../../../lib/admin';

export async function GET(request) {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin', 'Set-Cookie': cabecalhoSair(pedidoHttps(request)) },
  });
}
