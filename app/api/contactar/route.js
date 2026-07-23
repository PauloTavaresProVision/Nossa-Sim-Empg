/**
 * POST /api/contactar — proxy do pedido de contacto (click to call uCall/GoContact)
 *
 * A apikey vive APENAS no servidor, lida da variável de ambiente UCALL_APIKEY
 * (definida no docker-compose / .env, nunca commitada). O browser envia só
 * {nome, telefone}; tudo o resto é fixado aqui.
 *
 * Nota: o limite de pedidos é em memória, por instância — suficiente para um
 * único contentor. Atrás de um reverse proxy (nginx/traefik/caddy), garantir
 * que o header X-Forwarded-For é passado, senão o limite aplica-se globalmente.
 */

import { gerarPdfCotacao } from '../../../lib/cotacao-pdf';

const UCALL_API         = process.env.UCALL_API || 'https://apiservicesgocontact.ucall.co.ao/api/v1/GoContact/LoadContacts';
const UCALL_APIKEY      = process.env.UCALL_APIKEY || '';
const UCALL_DATABASE_ID = Number(process.env.UCALL_DATABASE_ID || 15622);

/* URL pública do site, usada para construir o link do PDF enviado ao call center
   (ex.: https://simulador.exemplo.ao). Sem ela, o field11 segue apenas "website". */
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const MAX_SALARIOS  = 50;
const SALARIO_MAX   = 1e9;

if (!UCALL_APIKEY) {
  console.warn('[contactar] AVISO: UCALL_APIKEY não definida — o botão "Quero Ser Contactado" vai responder 503 até a variável de ambiente ser configurada (.env / docker-compose).');
}
if (!PUBLIC_BASE_URL) {
  console.warn('[contactar] AVISO: PUBLIC_BASE_URL não definida — o PDF da cotação não será gerado e o field11 seguirá apenas "website".');
}

const MAX_PEDIDOS = 5;          // pedidos aceites por IP...
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
  pedidosPorIp.set(ip, registos);
  return registos.length >= MAX_PEDIDOS;
}

function registarPedido(ip) {
  const registos = pedidosPorIp.get(ip) || [];
  registos.push(Date.now());
  pedidosPorIp.set(ip, registos);
}

/* aceita 9xx xxx xxx, com ou sem indicativo 244 */
function normalizarTelefone(valor) {
  let digits = String(valor || '').replace(/\D/g, '');
  if (digits.startsWith('244') && digits.length === 12) digits = digits.slice(3);
  return /^9\d{8}$/.test(digits) ? digits : null;
}

function json(corpo, status) {
  return Response.json(corpo, { status });
}

export async function POST(request) {
  const ip = ipDoPedido(request);
  if (excedeuLimite(ip)) {
    return json({ sucesso: false, mensagem: 'Demasiados pedidos. Tente novamente mais tarde ou ligue para o Contact Center: +244 923 190 860.' }, 429);
  }

  let corpo;
  try { corpo = await request.json(); }
  catch { return json({ sucesso: false, mensagem: 'Pedido inválido.' }, 400); }

  const nome = String(corpo.nome || '').trim();
  const telefone = normalizarTelefone(corpo.telefone);

  if (!nome || nome.length > 100) {
    return json({ sucesso: false, mensagem: 'Indique um nome válido.' }, 422);
  }
  if (!telefone) {
    return json({ sucesso: false, mensagem: 'Indique um telefone válido (9 dígitos, começado por 9).' }, 422);
  }
  if (!UCALL_APIKEY) {
    return json({ sucesso: false, mensagem: 'Serviço temporariamente indisponível.' }, 503);
  }

  /* salários da simulação (opcionais): validados e recalculados no servidor */
  let salarios = Array.isArray(corpo.salarios) ? corpo.salarios : [];
  salarios = salarios
    .map((s) => Number(s))
    .filter((s) => Number.isFinite(s) && s > 0 && s <= SALARIO_MAX)
    .slice(0, MAX_SALARIOS);

  /* gera o PDF da cotação e constrói o link a enviar no field11 */
  let cotacaoUrl = null;
  if (salarios.length && PUBLIC_BASE_URL) {
    try {
      const id = await gerarPdfCotacao({ nome, telefone, salarios });
      cotacaoUrl = PUBLIC_BASE_URL + '/cotacoes/' + id;
    } catch {
      cotacaoUrl = null; // sem PDF o pedido de contacto segue na mesma
    }
  }

  try {
    const resposta = await fetch(UCALL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: UCALL_APIKEY },
      body: JSON.stringify({
        dataBase_Id: UCALL_DATABASE_ID,
        first_Phone: telefone,
        callback: false,
        contact_Name: nome,
        direct_To_Hopper: true,
        field7: 'Website - Pedido de contacto',
        field11: cotacaoUrl || 'website',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const resultado = await resposta.json();

    if (resultado && resultado.succeeded && resultado.data && resultado.data.success) {
      registarPedido(ip); // conta para o limite apenas quando aceite
      return json({ sucesso: true, mensagem: 'Pedido registado com sucesso.', cotacao_url: cotacaoUrl }, 200);
    }
    console.error('[contactar] uCall respondeu mas não aceitou (HTTP ' + resposta.status + '):', JSON.stringify(resultado).slice(0, 400));
    return json({ sucesso: false, mensagem: 'O serviço não aceitou o pedido. Tente novamente.' }, 502);
  } catch (erro) {
    console.error('[contactar] falha na chamada à uCall:', erro && erro.message ? erro.message : erro);
    return json({ sucesso: false, mensagem: 'Não foi possível contactar o serviço. Tente novamente.' }, 502);
  }
}
