/**
 * Registo de eventos da campanha (ficheiro JSONL num volume Docker).
 * Tipos: visita, simulacao, esclarecimento (com preferencia), contratacao, pdf.
 * Sem dados pessoais: apenas tipo, instante e, no esclarecimento, a preferência.
 */

import fs from 'fs/promises';
import path from 'path';

export const DADOS_DIR = process.env.DADOS_DIR || path.join(process.cwd(), 'dados');
const FICHEIRO = path.join(DADOS_DIR, 'eventos.jsonl');

export const TIPOS_EVENTO = ['visita', 'simulacao', 'esclarecimento', 'contratacao', 'pdf'];

export async function registarEvento(tipo, extra = {}) {
  try {
    await fs.mkdir(DADOS_DIR, { recursive: true });
    const linha = JSON.stringify({ t: new Date().toISOString(), tipo, ...extra }) + '\n';
    await fs.appendFile(FICHEIRO, linha, 'utf8');
  } catch (erro) {
    /* o registo de métricas nunca pode falhar um pedido do cliente */
    console.error('[eventos] falha ao registar ' + tipo + ':', erro && erro.message ? erro.message : erro);
  }
}

export async function lerEventos() {
  try {
    const conteudo = await fs.readFile(FICHEIRO, 'utf8');
    return conteudo
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return []; // ficheiro ainda não existe
  }
}

/* agrupa por dia (fuso de Luanda) e totaliza por tipo */
export function agregarPorDia(eventos) {
  const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dias = new Map();
  const totais = { visita: 0, simulacao: 0, esclarecimento: 0, esclarecimentoChamada: 0, esclarecimentoEmail: 0, contratacao: 0, pdf: 0 };

  for (const e of eventos) {
    if (!TIPOS_EVENTO.includes(e.tipo)) continue;
    const dia = fmt.format(new Date(e.t));
    if (!dias.has(dia)) {
      dias.set(dia, { visita: 0, simulacao: 0, esclarecimento: 0, contratacao: 0, pdf: 0 });
    }
    dias.get(dia)[e.tipo]++;
    totais[e.tipo]++;
    if (e.tipo === 'esclarecimento') {
      if (e.preferencia === 'email') totais.esclarecimentoEmail++;
      else totais.esclarecimentoChamada++;
    }
  }

  const porDia = [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, contagens]) => ({ dia, ...contagens }));

  return { totais, porDia };
}
