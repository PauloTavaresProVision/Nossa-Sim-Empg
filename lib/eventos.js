/**
 * Registo de eventos da campanha (ficheiro JSONL num volume Docker).
 * Tipos: visita, simulacao, esclarecimento (com preferencia), contratacao, pdf.
 * Sem dados pessoais: apenas tipo, instante e, no esclarecimento, a preferência.
 */

import fs from 'fs/promises';
import path from 'path';

export const DADOS_DIR = process.env.DADOS_DIR || path.join(process.cwd(), 'dados');
const FICHEIRO = path.join(DADOS_DIR, 'eventos.jsonl');

export const TIPOS_EVENTO = ['visita', 'simulacao', 'simulacao_inicio', 'esclarecimento', 'contratacao', 'pdf', 'sessao'];

/* classifica a origem de uma visita: o utm_source do link (fiável, usado
   nos links de campanha) tem prioridade; sem ele, cai no referrer, que as
   apps nem sempre enviam (o WhatsApp quase nunca envia) */
export function classificarOrigem(referrer, utmSource) {
  const u = String(utmSource || '').toLowerCase();
  if (u) {
    if (u.includes('google')) return 'google';
    if (u.includes('insta') || u.includes('face') || u.includes('whats') || u.includes('social') || u.includes('linkedin') || u.includes('tiktok') || u.includes('twitter')) return 'social';
    if (u.includes('direto') || u.includes('directo')) return 'direto';
    return 'outros';
  }
  const r = String(referrer || '').toLowerCase();
  if (!r) return 'direto';
  if (r.includes('google')) return 'google';
  if (r.includes('facebook') || r.includes('instagram') || r.includes('fb.') || r.includes('wa.me') || r.includes('whatsapp') || r.includes('linkedin') || r.includes('t.co') || r.includes('twitter') || r.includes('tiktok')) return 'social';
  return 'outros';
}

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

export const FMT_DIA_LUANDA = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Luanda', year: 'numeric', month: '2-digit', day: '2-digit' });

/* agrupa por dia (fuso de Luanda) com tudo o que o dashboard precisa para
   filtrar por período no cliente: contagens por tipo, divisão do
   esclarecimento, origens, dispositivos e sessões (soma/n.º) */
export function agregarPorDia(eventos) {
  const dias = new Map();
  const totais = { visita: 0, simulacao: 0, simulacao_inicio: 0, esclarecimento: 0, esclarecimentoChamada: 0, esclarecimentoEmail: 0, contratacao: 0, pdf: 0 };
  let somaSessao = 0, numSessoes = 0;

  const diaDe = (e) => {
    const dia = FMT_DIA_LUANDA.format(new Date(e.t));
    if (!dias.has(dia)) {
      dias.set(dia, {
        visita: 0, simulacao: 0, sInicio: 0, esclarecimento: 0, eChamada: 0, eEmail: 0,
        contratacao: 0, pdf: 0, sessaoSoma: 0, sessaoNum: 0,
        google: 0, direto: 0, social: 0, outros: 0, movel: 0, computador: 0,
      });
    }
    return dias.get(dia);
  };

  for (const e of eventos) {
    if (!TIPOS_EVENTO.includes(e.tipo)) continue;
    const reg = diaDe(e);
    if (e.tipo === 'sessao') {
      const d = Number(e.duracao);
      if (Number.isFinite(d) && d > 0) {
        somaSessao += d; numSessoes++;
        reg.sessaoSoma += d; reg.sessaoNum++;
      }
      continue;
    }
    if (e.tipo === 'simulacao_inicio') {
      reg.sInicio++; totais.simulacao_inicio++;
      continue;
    }
    reg[e.tipo]++;
    totais[e.tipo]++;
    if (e.tipo === 'esclarecimento') {
      if (e.preferencia === 'email') { totais.esclarecimentoEmail++; reg.eEmail++; }
      else { totais.esclarecimentoChamada++; reg.eChamada++; }
    }
    if (e.tipo === 'visita') {
      reg[['google', 'direto', 'social', 'outros'].includes(e.origem) ? e.origem : 'outros']++;
      if (e.dispositivo === 'movel') reg.movel++;
      else if (e.dispositivo === 'computador') reg.computador++;
    }
  }

  const porDia = [...dias.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dia, contagens]) => ({ dia, ...contagens }));

  return {
    totais,
    porDia,
    tempoMedioSegundos: numSessoes ? Math.round(somaSessao / numSessoes) : 0,
    numSessoes,
  };
}

/* registos para a tabela de actividade do dashboard: todos os eventos
   excepto sessões, do mais recente para o mais antigo, com id sequencial
   por tipo (#V-1, #SIM-3, #COT-2, #PED-4) */
export function listaRegistos(eventos, limite = 500) {
  const contadores = { visita: 0, simulacao: 0, pdf: 0, pedido: 0 };
  const prefixo = { visita: 'V', simulacao: 'SIM', pdf: 'COT', esclarecimento: 'PED', contratacao: 'PED' };
  const comId = [];
  for (const e of eventos) {
    if (e.tipo === 'sessao' || e.tipo === 'simulacao_inicio' || !TIPOS_EVENTO.includes(e.tipo)) continue;
    const chave = e.tipo === 'esclarecimento' || e.tipo === 'contratacao' ? 'pedido' : e.tipo;
    contadores[chave]++;
    comId.push({ ...e, id: '#' + prefixo[e.tipo] + '-' + contadores[chave] });
  }
  return comId.slice(-limite).reverse();
}
