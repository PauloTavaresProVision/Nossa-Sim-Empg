/**
 * Geração do PDF da cotação (Seguro de Acidentes de Trabalho, Empregados Domésticos).
 *
 * O PDF é gerado no servidor com os valores RECALCULADOS a partir dos salários
 * (nunca com os números vindos do browser), guardado em COTACOES_DIR com um ID
 * aleatório, e servido em GET /cotacoes/[id].
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/* mesmos parâmetros do modelo usados no front-end */
export const TAXA_SIMPLES = 0.02;
export const MESES_ANO = 13;

export const COTACOES_DIR = process.env.COTACOES_DIR || path.join(process.cwd(), 'cotacoes');
const TTL_DIAS = Number(process.env.COTACOES_TTL_DIAS || 90);

const NAVY  = rgb(10 / 255, 29 / 255, 63 / 255);
const VERDE = rgb(104 / 255, 158 / 255, 47 / 255);
const CINZA = rgb(0.42, 0.46, 0.55);
const TEXTO = rgb(0.10, 0.13, 0.22);

function formatAOA(v) {
  const partes = v.toFixed(2).split('.');
  return partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + partes[1];
}

export function calcularPremios(salarios) {
  const massaMensal = salarios.reduce((soma, s) => soma + s, 0);
  const massaAnual = massaMensal * MESES_ANO;
  const premioAnual = massaAnual * TAXA_SIMPLES;
  return {
    massaMensal,
    massaAnual,
    premioAnual,
    premioSemestral: premioAnual / 2,
    premioTrimestral: premioAnual / 4,
    premioMensal: premioAnual / 12,
  };
}

/* apaga cotações antigas para o directório não crescer indefinidamente */
async function limparAntigas() {
  try {
    const limite = Date.now() - TTL_DIAS * 24 * 60 * 60e3;
    for (const nome of await fs.readdir(COTACOES_DIR)) {
      if (!nome.endsWith('.pdf')) continue;
      const caminho = path.join(COTACOES_DIR, nome);
      const info = await fs.stat(caminho);
      if (info.mtimeMs < limite) await fs.unlink(caminho);
    }
  } catch { /* limpeza é oportunista, nunca falha o pedido */ }
}

function quebrarLinhas(texto, fonte, tamanho, larguraMax) {
  const palavras = texto.split(' ');
  const linhas = [];
  let linha = '';
  for (const palavra of palavras) {
    const tentativa = linha ? linha + ' ' + palavra : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > larguraMax && linha) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = tentativa;
    }
  }
  if (linha) linhas.push(linha);
  return linhas;
}

/* devolve os bytes do PDF, sem gravar nada em disco (usado no download directo) */
export async function gerarPdfBytes({ nome, telefone, salarios }) {
  const calculo = calcularPremios(salarios);

  const doc = await PDFDocument.create();
  doc.setTitle('Cotação - Seguro de Empregados Domésticos - NOSSA Seguros');
  const pagina = doc.addPage([595.28, 841.89]); // A4
  const { width } = pagina.getSize();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  const margem = 50;
  const larguraUtil = width - margem * 2;
  let y = 780;

  /* logótipo */
  try {
    const logoBytes = await fs.readFile(path.join(process.cwd(), 'public', 'logo-nossa.png'));
    const logo = await doc.embedPng(logoBytes);
    const escala = 150 / logo.width;
    pagina.drawImage(logo, { x: margem, y, width: 150, height: logo.height * escala });
  } catch { /* sem logótipo o PDF continua válido */ }

  y -= 40;
  pagina.drawText('Cotação de Seguro de Acidentes de Trabalho', { x: margem, y, size: 15, font: negrito, color: NAVY });
  y -= 18;
  pagina.drawText('Empregados Domésticos', { x: margem, y, size: 12, font: fonte, color: CINZA });
  y -= 8;
  pagina.drawLine({ start: { x: margem, y }, end: { x: width - margem, y }, thickness: 2, color: VERDE });

  /* dados do cliente (nome e telefone são opcionais) */
  y -= 26;
  const dataTexto = new Date().toLocaleDateString('pt-PT', { timeZone: 'Africa/Luanda' });
  if (nome) {
    pagina.drawText('Tomador do Seguro: ' + nome, { x: margem, y, size: 10, font: fonte, color: TEXTO });
  }
  const dataLargura = fonte.widthOfTextAtSize('Data: ' + dataTexto, 10);
  pagina.drawText('Data: ' + dataTexto, { x: width - margem - dataLargura, y, size: 10, font: fonte, color: TEXTO });
  if (telefone) {
    y -= 15;
    pagina.drawText('Telefone: ' + telefone.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3'), { x: margem, y, size: 10, font: fonte, color: TEXTO });
  }

  /* resumo da simulação */
  y -= 30;
  pagina.drawText('RESULTADO DA SIMULAÇÃO', { x: margem, y, size: 10, font: negrito, color: NAVY });
  y -= 6;
  pagina.drawLine({ start: { x: margem, y }, end: { x: width - margem, y }, thickness: 0.75, color: rgb(0.84, 0.86, 0.9) });

  const linhaValor = (rotulo, valor, bold) => {
    y -= 20;
    const f = bold ? negrito : fonte;
    pagina.drawText(rotulo, { x: margem, y, size: 10, font: fonte, color: CINZA });
    const w = f.widthOfTextAtSize(valor, 10);
    pagina.drawText(valor, { x: width - margem - w, y, size: 10, font: f, color: TEXTO });
  };

  linhaValor('N.º de empregados', String(salarios.length), true);
  salarios.forEach((s, i) => linhaValor('Salário mensal (empregado ' + (i + 1) + ')', formatAOA(s) + ' AOA', false));
  linhaValor('Massa salarial mensal', formatAOA(calculo.massaMensal) + ' AOA', true);
  linhaValor('Massa salarial anual (13 salários)', formatAOA(calculo.massaAnual) + ' AOA', true);
  linhaValor('Taxa simples aplicada', (TAXA_SIMPLES * 100).toLocaleString('pt-PT') + '%', true);

  /* prémio anual em destaque */
  y -= 34;
  pagina.drawRectangle({ x: margem, y: y - 12, width: larguraUtil, height: 34, color: NAVY });
  pagina.drawRectangle({ x: margem, y: y - 12, width: 4, height: 34, color: VERDE });
  pagina.drawText('PRÉMIO ANUAL', { x: margem + 14, y: y - 1, size: 10, font: negrito, color: VERDE });
  const premioTexto = formatAOA(calculo.premioAnual) + ' AOA';
  const premioLargura = negrito.widthOfTextAtSize(premioTexto, 14);
  pagina.drawText(premioTexto, { x: width - margem - premioLargura - 14, y: y - 3, size: 14, font: negrito, color: rgb(1, 1, 1) });

  y -= 16;
  linhaValor('Prémio semestral (2 pagamentos)', formatAOA(calculo.premioSemestral) + ' AOA', true);
  linhaValor('Prémio trimestral (4 pagamentos)', formatAOA(calculo.premioTrimestral) + ' AOA', true);
  linhaValor('Prémio mensal (12 pagamentos)', formatAOA(calculo.premioMensal) + ' AOA', true);

  /* riscos cobertos (resumo) */
  y -= 34;
  pagina.drawText('RISCOS COBERTOS', { x: margem, y, size: 10, font: negrito, color: NAVY });
  y -= 6;
  pagina.drawLine({ start: { x: margem, y }, end: { x: width - margem, y }, thickness: 0.75, color: rgb(0.84, 0.86, 0.9) });
  y -= 6;

  const coberturas = [
    'Riscos traumatológicos no âmbito da actividade laboral e no trajecto entre a residência e o local de trabalho, e doenças profissionais (Decreto n.º 53/05, de 15 de Agosto).',
    'Incapacidade Temporária Absoluta: 65% da remuneração de referência a partir do 1.º dia.',
    'Incapacidade Permanente Absoluta: pensão mensal de 80% (todo e qualquer trabalho) ou 70% (trabalho habitual) da remuneração de referência.',
    'Incapacidade Permanente Parcial: pensão mensal igual a 70% da redução sofrida na capacidade geral de ganho.',
    'Prestações por Morte: cônjuge 30% (40% após idade de reforma); filhos 20%, 40% ou 60% consoante sejam um, dois ou três ou mais.',
    'Despesas de Funeral até dois salários; toda a assistência médica no âmbito do sinistro.',
  ];
  for (const item of coberturas) {
    const linhas = quebrarLinhas(item, fonte, 8.5, larguraUtil - 14);
    y -= 6;
    pagina.drawText('•', { x: margem, y: y - 8.5, size: 8.5, font: fonte, color: VERDE });
    for (const l of linhas) {
      y -= 12;
      pagina.drawText(l, { x: margem + 14, y, size: 8.5, font: fonte, color: TEXTO });
    }
  }

  /* nota legal e rodapé */
  y -= 26;
  const nota = 'Esta simulação tem carácter meramente informativo e não constitui proposta contratual. Os valores apresentados resultam da aplicação da taxa em vigor à massa salarial indicada e poderão ser ajustados na emissão da apólice. Prémios exclusivamente em AOA.';
  for (const l of quebrarLinhas(nota, fonte, 8, larguraUtil)) {
    pagina.drawText(l, { x: margem, y, size: 8, font: fonte, color: CINZA });
    y -= 11;
  }

  pagina.drawLine({ start: { x: margem, y: 60 }, end: { x: width - margem, y: 60 }, thickness: 0.75, color: rgb(0.84, 0.86, 0.9) });
  pagina.drawText('NOSSA Seguros · Nova Sociedade de Seguros de Angola, S.A.', { x: margem, y: 46, size: 8, font: negrito, color: NAVY });
  pagina.drawText('Contact Center: +244 923 190 860 · www.nossaseguros.ao', { x: margem, y: 34, size: 8, font: fonte, color: CINZA });

  return await doc.save();
}

/* gera o PDF, grava-o em disco e devolve o id (usado no link do field11) */
export async function gerarPdfCotacao({ nome, telefone, salarios }) {
  const bytes = await gerarPdfBytes({ nome, telefone, salarios });
  await fs.mkdir(COTACOES_DIR, { recursive: true });
  const id = randomUUID();
  await fs.writeFile(path.join(COTACOES_DIR, id + '.pdf'), bytes);
  limparAntigas(); // sem await: corre em segundo plano
  return id;
}
