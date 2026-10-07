/**
 * GET /admin/relatorio-csv — exportação da quebra diária (requer sessão).
 */

import { sessaoValida } from '../../../lib/admin';
import { lerEventos, agregarPorDia } from '../../../lib/eventos';

export async function GET(request) {
  if (!sessaoValida(request)) {
    return new Response(null, { status: 303, headers: { Location: '/admin' } });
  }

  const { porDia } = agregarPorDia(await lerEventos());
  const linhas = ['dia;visitas;simularam;pdf;esclarecimento;contratacao'];
  for (const d of [...porDia].reverse()) {
    linhas.push([d.dia, d.visita, d.simulacao, d.pdf, d.esclarecimento, d.contratacao].join(';'));
  }

  return new Response('﻿' + linhas.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="relatorio-simulador-empregados-domesticos.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
