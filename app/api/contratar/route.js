/**
 * POST /api/contratar — pedido de contratação (botão "Quero Contratar").
 * Gera a cotação em PDF e envia-a POR EMAIL, do servidor, para o departamento
 * de protocolos da NOSSA Seguros, com os dados do tomador no corpo.
 *
 * Configuração por variáveis de ambiente (.env / docker-compose):
 *   SMTP_HOST, SMTP_PORT (587 por omissão; 465 = TLS implícito),
 *   SMTP_USER, SMTP_PASS, SMTP_FROM (remetente),
 *   EMAIL_PROTOCOLOS (destino; por omissão dep.protocolos@nossaseguros.ao)
 */

import nodemailer from 'nodemailer';
import { gerarPdfBytes, calcularPremios, normalizarEmpregados, normalizarOpcoes, FORMAS_PAGAMENTO } from '../../../lib/cotacao-pdf';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const EMAIL_PROTOCOLOS = process.env.EMAIL_PROTOCOLOS || 'dep.protocolos@nossaseguros.ao';

const MAX_PEDIDOS = 5;          // pedidos aceites por IP...
const JANELA_MS   = 10 * 60e3;  // ...nesta janela (10 minutos)

if (!SMTP_HOST) {
  console.warn('[contratar] AVISO: SMTP_HOST não definido — o botão "Quero Contratar" vai responder 503 até o SMTP ser configurado (.env / docker-compose).');
}

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

function json(corpo, status) {
  return Response.json(corpo, { status });
}

function formatAOA(v) {
  const partes = v.toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + partes[1];
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
  if (!nome || nome.length > 100) {
    return json({ sucesso: false, mensagem: 'Indique um nome válido.' }, 422);
  }

  let telefone = String(corpo.telefone || '').replace(/\D/g, '');
  if (telefone.startsWith('244') && telefone.length === 12) telefone = telefone.slice(3);
  if (!/^9\d{8}$/.test(telefone)) {
    return json({ sucesso: false, mensagem: 'Indique um telefone válido (9 dígitos, começado por 9).' }, 422);
  }

  const empregados = normalizarEmpregados(corpo);
  if (!empregados.length) {
    return json({ sucesso: false, mensagem: 'Indique pelo menos um salário para gerar a cotação.' }, 422);
  }

  if (!SMTP_HOST) {
    return json({ sucesso: false, mensagem: 'Serviço temporariamente indisponível.' }, 503);
  }

  const opcoes = normalizarOpcoes(corpo);
  const calculo = calcularPremios(empregados.map((e) => e.salario), opcoes);
  const telFormatado = '(+244) ' + telefone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');

  try {
    const pdf = await gerarPdfBytes({ nome, telefone, empregados, opcoes });

    const linhas = [
      'Pedido de contratação recebido através do simulador do site.',
      '',
      'Tomador do Seguro: ' + nome,
      'Telefone: ' + telFormatado,
      'N.º de empregados: ' + empregados.length,
      'Forma de pagamento: ' + FORMAS_PAGAMENTO[opcoes.formaPagamento],
    ];
    if (opcoes.inicio) linhas.push('Início pretendido: ' + opcoes.inicio.split('-').reverse().join('/'));
    linhas.push(
      'Massa salarial anual: ' + formatAOA(calculo.massaAnual) + ' Kz',
      'Prémio Total Anual: ' + formatAOA(calculo.premioAnual) + ' Kz',
      'Prémio Total Semestral: ' + formatAOA(calculo.premioSemestral) + ' Kz',
      '',
      'A cotação segue em anexo.'
    );

    const transporte = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });

    await transporte.sendMail({
      from: SMTP_FROM,
      to: EMAIL_PROTOCOLOS,
      subject: 'Pedido de Contratação - Seguro Empregados Domésticos - ' + nome,
      text: linhas.join('\n'),
      attachments: [{ filename: 'cotacao-nossa-seguros.pdf', content: Buffer.from(pdf) }],
    });

    /* conta para o limite apenas quando o email sai */
    const registos = pedidosPorIp.get(ip) || [];
    registos.push(Date.now());
    pedidosPorIp.set(ip, registos);

    return json({ sucesso: true, mensagem: 'Pedido enviado com sucesso.' }, 200);
  } catch (erro) {
    console.error('[contratar] falha no envio do email:', erro && erro.message ? erro.message : erro);
    return json({ sucesso: false, mensagem: 'Não foi possível enviar o pedido. Tente novamente ou ligue para o Contact Center: +244 923 190 860.' }, 502);
  }
}
