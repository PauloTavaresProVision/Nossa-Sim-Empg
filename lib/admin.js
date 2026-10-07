/**
 * Autenticação do backoffice (user + password do .env, sessão por cookie).
 *
 * ADMIN_USER / ADMIN_PASS definem as credenciais. A sessão é um token
 * HMAC assinado com um segredo gerado no arranque do processo: reiniciar
 * o contentor invalida as sessões (volta-se a fazer login), nada persiste.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const SEGREDO = randomBytes(32);
const SESSAO_HORAS = 12;

export const COOKIE_NOME = 'nossa_admin';
export const ADMIN_CONFIGURADO = !!(ADMIN_USER && ADMIN_PASS);

if (!ADMIN_CONFIGURADO) {
  console.warn('[admin] AVISO: ADMIN_USER/ADMIN_PASS não definidos — o backoffice /admin fica inacessível até serem configurados (.env / docker-compose).');
}

function igualSeguro(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    /* compara na mesma, contra timing attacks, mas falha sempre */
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function credenciaisValidas(user, pass) {
  if (!ADMIN_CONFIGURADO) return false;
  const userOk = igualSeguro(user, ADMIN_USER);
  const passOk = igualSeguro(pass, ADMIN_PASS);
  return userOk && passOk;
}

function assinar(validade) {
  return createHmac('sha256', SEGREDO).update(String(validade)).digest('hex');
}

export function criarToken() {
  const validade = Date.now() + SESSAO_HORAS * 60 * 60e3;
  return assinar(validade) + '.' + validade;
}

export function tokenValido(token) {
  if (!token) return false;
  const [assinatura, validade] = String(token).split('.');
  if (!assinatura || !validade || Number(validade) < Date.now()) return false;
  return igualSeguro(assinatura, assinar(validade));
}

export function sessaoValida(request) {
  const cookies = request.headers.get('cookie') || '';
  const par = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE_NOME + '='));
  return tokenValido(par ? par.slice(COOKIE_NOME.length + 1) : null);
}

export function cabecalhoSessao(token) {
  return COOKIE_NOME + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (SESSAO_HORAS * 3600);
}

export function cabecalhoSair() {
  return COOKIE_NOME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
