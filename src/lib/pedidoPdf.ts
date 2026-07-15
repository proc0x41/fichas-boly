import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Cliente, VisitaCodigo } from '../types'
import logoPdfUrl from '../assets/logo_pdf.jpeg'
import {
  REPRESENTADA_CNPJ,
  REPRESENTADA_EMAIL,
  REPRESENTADA_NOME,
  REPRESENTADA_TELEFONE,
} from './pedidoPdfConfig'
import { fixUtf8MojibakeIfNeeded } from './fixUtf8Mojibake'
import { normCodigo, formatCNPJ } from './utils'

export interface ProdutoCatalogo {
  codigo: string
  descricao: string
  preco_tabela: number
}

export interface PedidoPdfVendedor {
  nome: string
  telefone: string | null
}

export interface PedidoPdfInput {
  numeroPedido: number
  dataEmissao: Date
  /** Tipo do documento exibido no cabeçalho do PDF. */
  tipoVisita?: 'pedido' | 'orcamento'
  cliente: Cliente
  visita: {
    condicoes_pagamento: string | null
    observacao: string | null
    valor_frete: number
    /** Desconto único do pedido em % sobre preço de tabela (0–100). */
    desconto_percent: number
  }
  codigos: VisitaCodigo[]
  /** Mapa codigo normalizado (lower trim) -> produto */
  produtosPorCodigo: Map<string, ProdutoCatalogo>
  vendedor: PedidoPdfVendedor
}

const MARGIN = 7
const COL_GRID: [number, number, number] = [200, 200, 200]
const COL_HEADER: [number, number, number] = [41, 55, 73]
const COL_HEADER_TEXT: [number, number, number] = [255, 255, 255]
const COL_ZEBRA: [number, number, number] = [248, 250, 252]
const COL_TOTAL_BG: [number, number, number] = [236, 241, 247]

/** Helvetica é a fonte nativa mais legível em PDF para texto misto (pt-BR, números, tabela). */
const FONT_MAIN = 'helvetica' as const

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function clampPct(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(100, n)
}

function fmtPct(p: number): string {
  const x = clampPct(p)
  return `${x.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 0 })}%`
}

function getClienteContatos(cliente: Cliente): { telefones: string[]; emails: string[] } {
  const contatos = [...(cliente.contatos ?? [])].sort((a, b) => {
    if (a.tipo === b.tipo) return a.ordem - b.ordem
    return a.tipo === 'telefone' ? -1 : 1
  })

  const telefones = contatos
    .filter((contato) => contato.tipo === 'telefone')
    .map((contato) => contato.valor.trim())
    .filter(Boolean)

  const emails = contatos
    .filter((contato) => contato.tipo === 'email')
    .map((contato) => contato.valor.trim())
    .filter(Boolean)

  if (telefones.length === 0 && cliente.telefone?.trim()) {
    telefones.push(cliente.telefone.trim())
  }

  if (emails.length === 0 && cliente.email?.trim()) {
    emails.push(cliente.email.trim())
  }

  return { telefones, emails }
}

function pageInnerWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - MARGIN * 2
}

/** Se não couber `needMm` na página, abre nova e devolve Y inicial útil. */
function ensureVerticalSpace(doc: jsPDF, y: number, needMm: number): number {
  const h = doc.internal.pageSize.getHeight()
  if (y + needMm > h - MARGIN) {
    doc.addPage()
    return MARGIN
  }
  return y
}

export function buildPedidoPdfBlob(input: PedidoPdfInput): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const innerW = pageInnerWidth(doc)
  let y = MARGIN

  // Cabeçalho compacto
  doc.setFont(FONT_MAIN, 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 24, 31)
  const tipoLabel = input.tipoVisita === 'orcamento' ? 'Orçamento' : 'Pedido'
  doc.text('Boly Encartelados', MARGIN, y + 4)
  const nomeClienteCab = input.cliente.fantasia?.trim() || input.cliente.razao_social?.trim() || ''
  const tituloCab = nomeClienteCab
    ? `${tipoLabel} nº ${input.numeroPedido} · ${nomeClienteCab}`
    : `${tipoLabel} nº ${input.numeroPedido}`
  const cabMaxW = pageW - MARGIN * 2 - 4
  let cabSize = 11
  while (cabSize > 7.5 && doc.getTextWidth(tituloCab) > cabMaxW) {
    cabSize -= 0.5
    doc.setFontSize(cabSize)
  }
  let tituloFinal = tituloCab
  if (doc.getTextWidth(tituloFinal) > cabMaxW) {
    const baseCab = `${tipoLabel} nº ${input.numeroPedido} · `
    let nomeCorte = nomeClienteCab
    while (nomeCorte.length > 1 && doc.getTextWidth(baseCab + nomeCorte + '…') > cabMaxW) {
      nomeCorte = nomeCorte.slice(0, -1)
    }
    tituloFinal = baseCab + nomeCorte + (nomeCorte.length < nomeClienteCab.length ? '…' : '')
  }
  doc.text(tituloFinal, pageW - MARGIN, y + 4, { align: 'right' })
  doc.setFontSize(11)
  y += 6
  doc.setDrawColor(COL_GRID[0], COL_GRID[1], COL_GRID[2])
  doc.setLineWidth(0.35)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += 3

  // Linhas em branco para reservar espaço da logo dentro da célula (~18 mm)
  const LOGO_CELL_H = 18
  const emitente = [
    '', '', '', '', '',
    REPRESENTADA_NOME,
    `CNPJ ${REPRESENTADA_CNPJ}  ·  ${REPRESENTADA_TELEFONE}  ·  ${REPRESENTADA_EMAIL}`,
  ].join('\n')

  const enderecoCliente = [input.cliente.endereco, input.cliente.numero].filter(Boolean).join(', ')
  const { telefones, emails } = getClienteContatos(input.cliente)
  const cliente = [
    input.cliente.razao_social ?? '—',
    input.cliente.fantasia ? `Nome fantasia: ${input.cliente.fantasia}` : null,
                `CNPJ ${formatCNPJ(input.cliente.cnpj) ?? '—'}`,
    enderecoCliente || null,
    [input.cliente.bairro, input.cliente.cep ? `CEP ${input.cliente.cep}` : null].filter(Boolean).join('  ·  ') || null,
    [input.cliente.cidade, input.cliente.estado].filter(Boolean).join(' / ') || null,
    telefones.length > 0 ? `Telefones: ${telefones.join('  ·  ')}` : null,
    emails.length > 0 ? `E-mails: ${emails.join('  ·  ')}` : null,
    input.cliente.comprador ? `Contato: ${input.cliente.comprador}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  autoTable(doc, {
    startY: y,
    head: [['Emitente / Representada', 'Cliente']],
    body: [[emitente, cliente]],
    theme: 'grid',
    styles: {
      font: FONT_MAIN,
      fontSize: 9,
      cellPadding: 2,
      lineColor: COL_GRID,
      lineWidth: 0.15,
      valign: 'top',
      textColor: [33, 37, 41],
    },
    headStyles: {
      font: FONT_MAIN,
      fillColor: COL_HEADER,
      textColor: COL_HEADER_TEXT,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 1.4,
    },
    columnStyles: {
      0: { cellWidth: innerW * 0.48 },
      1: { cellWidth: innerW * 0.52 },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: innerW,
    didDrawCell(data) {
      // Desenha logo_pdf à esquerda na célula body da coluna 0 (emitente)
      if (data.section === 'body' && data.column.index === 0) {
        const logoW2 = LOGO_CELL_H * (1320 / 660)
        const x = data.cell.x + 2
        const y2 = data.cell.y + 2
        doc.addImage(logoPdfUrl, 'JPEG', x, y2, logoW2, LOGO_CELL_H)
      }
    },
  })

  y = ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 4

  const pctGlobal = clampPct(input.visita.desconto_percent ?? 0)

  const rows: string[][] = []
  let totalTabela = 0
  let totalLiquido = 0
  let temOverride = false
  input.codigos.forEach((vc, idx) => {
    const p = input.produtosPorCodigo.get(normCodigo(vc.codigo))
    const preco = p?.preco_tabela ?? 0
    const subTabela = preco * vc.quantidade
    totalTabela += subTabela
    // Override = desconto específico desta linha; null/undefined = usa o global.
    const override = vc.desconto_percent_override
    const pctEfetivo = override !== null && override !== undefined ? clampPct(Number(override)) : pctGlobal
    if (override !== null && override !== undefined && Number(override) !== pctGlobal) {
      temOverride = true
    }
    const fator = 1 - pctEfetivo / 100
    const precoLiq = preco * fator
    const subLiq = precoLiq * vc.quantidade
    totalLiquido += subLiq
    rows.push([
      String(idx + 1),
      vc.codigo.trim(),
      p?.descricao ? fixUtf8MojibakeIfNeeded(p.descricao) : 'Não cadastrado',
      String(vc.quantidade),
      fmtBRL(preco),
      fmtPct(pctEfetivo),
      fmtBRL(precoLiq),
      fmtBRL(subLiq),
    ])
  })

  const w = innerW
  // Colunas curtas ('wrap') ajustam à maior célula (header ou linha); a coluna
  // Produto ('auto') absorve o espaço restante até preencher `tableWidth`.
  autoTable(doc, {
    startY: y,
    head: [['#', 'Cód.', 'Produto', 'Qtd', 'P. tabela', 'Desc.', 'P. líquido', 'Subtotal']],
    body: rows,
    theme: 'grid',
    styles: {
      font: FONT_MAIN,
      fontSize: 8,
      cellPadding: 1.1,
      lineColor: COL_GRID,
      lineWidth: 0.12,
      valign: 'middle',
      minCellHeight: 4.8,
      textColor: [33, 37, 41],
    },
    headStyles: {
      font: FONT_MAIN,
      fillColor: COL_HEADER,
      textColor: COL_HEADER_TEXT,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 1.2,
      halign: 'center',
    },
    bodyStyles: { font: FONT_MAIN, fontSize: 8 },
    alternateRowStyles: { fillColor: COL_ZEBRA },
    columnStyles: {
      0: { cellWidth: 'wrap', halign: 'center' },
      1: { cellWidth: 'wrap', font: FONT_MAIN, fontStyle: 'normal', halign: 'left' },
      2: { cellWidth: 'auto', halign: 'left' },
      3: { cellWidth: 'wrap', halign: 'center' },
      4: { cellWidth: 'wrap', halign: 'right' },
      5: { cellWidth: 'wrap', halign: 'center' },
      6: { cellWidth: 'wrap', halign: 'right' },
      7: { cellWidth: 'wrap', halign: 'right', fontStyle: 'normal' },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: w,
    showHead: 'everyPage',
  })

  let ty = ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) + 2

  const frete = input.visita.valor_frete ?? 0
  const valorDesconto = Math.max(0, totalTabela - totalLiquido)
  const total = totalLiquido + frete

  ty = ensureVerticalSpace(doc, ty, 42)

  const labelDesconto = temOverride
    ? 'Desconto (descontos por item)'
    : `Desconto (${fmtPct(pctGlobal)})`

  autoTable(doc, {
    startY: ty,
    body: [
      ['Total (preço de tabela)', fmtBRL(totalTabela)],
      [labelDesconto, fmtBRL(valorDesconto)],
      ['Frete', fmtBRL(frete)],
      ['Valor total', fmtBRL(total)],
    ],
    theme: 'grid',
    styles: {
      font: FONT_MAIN,
      fontSize: 9,
      cellPadding: { top: 1.1, bottom: 1.1, left: 2.2, right: 2.2 },
      lineColor: COL_GRID,
      lineWidth: 0.12,
    },
    columnStyles: {
      0: { cellWidth: w * 0.55, fontStyle: 'normal', textColor: [60, 64, 70] },
      1: { cellWidth: w * 0.45, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: w,
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 3) {
        data.cell.styles.fillColor = COL_TOTAL_BG
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fontSize = 10.5
        data.cell.styles.textColor = [20, 24, 31]
      }
    },
  })

  ty = ((doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? ty) + 4

  const condPg = input.visita.condicoes_pagamento?.trim() || '—'
  const obs = input.visita.observacao?.trim() || '—'
  const telVend = input.vendedor.telefone?.trim() || '—'
  const dataStr = input.dataEmissao.toLocaleDateString('pt-BR')
  const vendedorLinha = `${input.vendedor.nome}${telVend !== '—' ? `  ·  ${telVend}` : ''}`

  ty = ensureVerticalSpace(doc, ty, 48)

  const labelW = 44
  autoTable(doc, {
    startY: ty,
    head: [[{ content: 'Informações do pedido', colSpan: 2 }]],
    body: [
      ['Condições de pagamento', condPg],
      ['Data de emissão', dataStr],
      ['Vendedor', vendedorLinha],
      ['Observações', obs],
    ],
    theme: 'grid',
    styles: {
      font: FONT_MAIN,
      fontSize: 9,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2.2, right: 2.2 },
      lineColor: COL_GRID,
      lineWidth: 0.12,
      valign: 'top',
      textColor: [33, 37, 41],
      overflow: 'linebreak',
    },
    headStyles: {
      font: FONT_MAIN,
      fillColor: COL_HEADER,
      textColor: COL_HEADER_TEXT,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 1.3,
      halign: 'left',
    },
    columnStyles: {
      0: {
        cellWidth: labelW,
        fontStyle: 'bold',
        fillColor: [248, 249, 251],
        textColor: [55, 60, 68],
      },
      1: { cellWidth: w - labelW, fontStyle: 'normal', halign: 'left' },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: w,
  })

  return doc.output('blob')
}
