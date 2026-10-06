/**
 * Envio de email pelo servidor (nodemailer), partilhado pelos fluxos
 * "Quero Contratar" e "Quero Saber Mais" (preferência Email).
 *
 * Configuração por variáveis de ambiente: SMTP_HOST, SMTP_PORT (465 = TLS
 * implícito), SMTP_USER, SMTP_PASS, SMTP_FROM.
 */

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

export const SMTP_CONFIGURADO = !!SMTP_HOST;

if (!SMTP_HOST) {
  console.warn('[email] AVISO: SMTP_HOST não definido — os envios de email vão falhar até o SMTP ser configurado (.env / docker-compose).');
}

export function enviarEmail({ to, subject, text, attachments, replyTo }) {
  const transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transporte.sendMail({ from: SMTP_FROM, to, subject, text, attachments, replyTo });
}
