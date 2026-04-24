import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { SearchInput } from '../../components/SearchInput'
import { PaginationBar } from '../../components/PaginationBar'
import { ArrowLeft, Loader2, Upload, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { unmask, validateCNPJ } from '../../lib/masks'

const PAGE_SIZE = 25

interface ClienteAdmin {
  id: string
  fantasia: string
  bairro: string | null
  cidade: string | null
  telefone: string | null
  ativo: boolean
  vendedor: { nome: string } | null
}

interface VendedorOpt {
  user_id: string
  nome: string
  role: 'vendedor' | 'admin'
}

function getCell(row: Record<string, unknown>, ...aliases: string[]): string {
  const keys = Object.keys(row)
  for (const alias of aliases) {
    const a = alias.trim().toLowerCase()
    for (const k of keys) {
      if (k.trim().toLowerCase() === a) {
        const val = row[k]
        if (val === null || val === undefined) return ''
        return String(val).trim()
      }
    }
  }
  return ''
}

function parseOptionalNonNegInt(v: string, fallback: number): number {
  const t = v.replace(/\D/g, '')
  if (!t) return fallback
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function parseClienteDesde(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return null
}

export default function AdminClientes() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState<ClienteAdmin[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [vendedores, setVendedores] = useState<VendedorOpt[]>([])
  const [vendedoresCarregados, setVendedoresCarregados] = useState(false)
  const [vendedorImportId, setVendedorImportId] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void supabase
      .from('perfis')
      .select('user_id, nome, role')
      .in('role', ['vendedor', 'admin'])
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          toast.error(error.message || 'Erro ao carregar responsáveis')
          setVendedores([])
        } else {
          const list = (data ?? []) as VendedorOpt[]
          setVendedores(list)
          setVendedorImportId((prev) => (prev ? prev : list[0]?.user_id ?? ''))
        }
        setVendedoresCarregados(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let clientesQuery = supabase
      .from('clientes')
      .select('id, fantasia, bairro, cidade, telefone, ativo, vendedor_id', { count: 'exact' })
      .order('fantasia')
      .range(from, to)

    if (search.trim()) {
      const q = search.trim()
      clientesQuery = clientesQuery.or(`fantasia.ilike.%${q}%,cnpj.ilike.%${q}%,bairro.ilike.%${q}%`)
    }

    const [{ data: rows, count, error: cErr }, { data: perfisRows, error: pErr }] = await Promise.all([
      clientesQuery,
      supabase.from('perfis').select('user_id, nome').in('role', ['vendedor', 'admin']),
    ])

    if (cErr || pErr) {
      toast.error('Erro ao carregar clientes')
      setClientes([])
      setTotal(0)
    } else {
      const nomePorUser = new Map((perfisRows ?? []).map((p) => [p.user_id as string, p.nome as string]))
      const mapped: ClienteAdmin[] = (rows ?? []).map((r) => ({
        id: r.id as string,
        fantasia: r.fantasia as string,
        bairro: (r.bairro as string | null) ?? null,
        cidade: (r.cidade as string | null) ?? null,
        telefone: (r.telefone as string | null) ?? null,
        ativo: Boolean(r.ativo),
        vendedor: { nome: nomePorUser.get(r.vendedor_id as string) ?? '—' },
      }))
      setClientes(mapped)
      setTotal(count ?? 0)
      if ((rows?.length ?? 0) === 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1))
      }
    }
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    void load()
  }, [load])

  const upsertContatos = async (
    clienteId: string,
    telefones: string[],
    emails: string[],
    clientesComContatosJa: Set<string>,
  ) => {
    if (clientesComContatosJa.has(clienteId)) return
    const contatos: { cliente_id: string; tipo: string; valor: string; rotulo: null; ordem: number }[] = []
    telefones.forEach((tel, i) => contatos.push({ cliente_id: clienteId, tipo: 'telefone', valor: tel, rotulo: null, ordem: i }))
    emails.forEach((email, i) => contatos.push({ cliente_id: clienteId, tipo: 'email', valor: email, rotulo: null, ordem: telefones.length + i }))
    if (contatos.length === 0) return
    await supabase.from('cliente_contatos').insert(contatos)
  }

  const importarArquivo = async (f: File) => {
    if (!vendedorImportId) {
      toast.error('Selecione o responsável pela importação')
      return
    }
    setImporting(true)
    try {
      const ab = await f.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })

      // Pré-processa todas as linhas da planilha (validação + parse)
      type RowParsed = {
        payload: Record<string, unknown>
        cnpjRaw: string
        fantasia: string
        telefones: string[]
        emails: string[]
      }
      const validas: RowParsed[] = []
      let parseErr = 0
      const erroLinhas: string[] = []

      for (const row of rows) {
        const fantasia = getCell(row, 'fantasia', 'nome fantasia', 'nome_fantasia', 'fant')
        if (!fantasia) continue

        const cnpjRaw = unmask(getCell(row, 'cnpj', 'cnpj cliente'))
        if (cnpjRaw.length > 0 && cnpjRaw.length !== 14) { parseErr++; erroLinhas.push(`${fantasia} (CNPJ inválido)`); continue }
        if (cnpjRaw.length === 14 && !validateCNPJ(cnpjRaw)) { parseErr++; erroLinhas.push(`${fantasia} (CNPJ inválido)`); continue }

        const estadoRaw = getCell(row, 'estado', 'uf').toUpperCase().slice(0, 2) || null
        const cepRaw = unmask(getCell(row, 'cep'))
        const ieRaw = unmask(getCell(row, 'inscricao_estadual', 'ie', 'inscrição estadual', 'inscricao estadual'))

        // Suporta múltiplos valores separados por vírgula ou ponto-e-vírgula numa célula,
        // além das colunas telefone2/telefone3 separadas.
        const splitMultiple = (v: string) =>
          v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)

        const telefones = [
          ...splitMultiple(getCell(row, 'telefone', 'fone', 'tel', 'telefones')),
          ...splitMultiple(getCell(row, 'telefone2', 'fone2', 'tel2')),
          ...splitMultiple(getCell(row, 'telefone3', 'fone3', 'tel3')),
        ].map((v) => unmask(v)).filter((v) => v.length >= 10)

        const emails = [
          ...splitMultiple(getCell(row, 'email', 'e-mail', 'emails', 'e-mails')),
          ...splitMultiple(getCell(row, 'email2', 'e-mail2')),
          ...splitMultiple(getCell(row, 'email3', 'e-mail3')),
        ].map((v) => v.trim()).filter(Boolean)

        validas.push({
          cnpjRaw,
          fantasia,
          telefones,
          emails,
          payload: {
            vendedor_id: vendedorImportId,
            fantasia,
            razao_social: getCell(row, 'razao_social', 'razão social', 'razao', 'razão') || null,
            cnpj: cnpjRaw.length === 14 ? cnpjRaw : null,
            inscricao_estadual: ieRaw || null,
            endereco: getCell(row, 'endereco', 'endereço', 'logradouro') || null,
            numero: getCell(row, 'numero', 'número', 'num') || null,
            bairro: getCell(row, 'bairro') || null,
            cidade: getCell(row, 'cidade', 'município', 'municipio') || null,
            estado: estadoRaw,
            cep: cepRaw.length === 8 ? cepRaw : null,
            comprador: getCell(row, 'comprador', 'contato') || null,
            dia_compras: getCell(row, 'dia_compras', 'dia compras', 'dia de compras') || null,
            cliente_desde: parseClienteDesde(getCell(row, 'cliente_desde', 'desde', 'data cadastro')),
            is_cliente: true,
            display_chao: parseOptionalNonNegInt(getCell(row, 'display_chao', 'display chão', 'display chao'), 0),
            display_balcao: parseOptionalNonNegInt(getCell(row, 'display_balcao', 'display balcão', 'display balcao'), 0),
            display_parede: parseOptionalNonNegInt(getCell(row, 'display_parede', 'display parede'), 0),
            ativo: true,
          },
        })
      }

      if (validas.length === 0) {
        toast.error('Nenhuma linha válida encontrada')
        setImporting(false)
        return
      }

      // 1 request: busca todos os clientes existentes do vendedor de uma vez
      const cnpjs = validas.map((r) => r.cnpjRaw).filter((c) => c.length === 14)
      const fantasias = validas.filter((r) => r.cnpjRaw.length !== 14).map((r) => r.fantasia)

      const [{ data: existintesPorCnpj }, { data: existentesPorFantasia }] = await Promise.all([
        cnpjs.length > 0
          ? supabase.from('clientes').select('id, cnpj').eq('vendedor_id', vendedorImportId).in('cnpj', cnpjs)
          : Promise.resolve({ data: [] }),
        fantasias.length > 0
          ? supabase.from('clientes').select('id, fantasia').eq('vendedor_id', vendedorImportId).in('fantasia', fantasias)
          : Promise.resolve({ data: [] }),
      ])

      const mapCnpj = new Map((existintesPorCnpj ?? []).map((c) => [c.cnpj as string, c.id as string]))
      const mapFantasia = new Map((existentesPorFantasia ?? []).map((c) => [c.fantasia as string, c.id as string]))

      // 1 request: busca quais clientes existentes já têm contatos
      const idsExistentes = [...mapCnpj.values(), ...mapFantasia.values()]
      const clientesComContatos = new Set<string>()
      if (idsExistentes.length > 0) {
        const { data: comContatos } = await supabase
          .from('cliente_contatos')
          .select('cliente_id')
          .in('cliente_id', idsExistentes)
        ;(comContatos ?? []).forEach((r) => clientesComContatos.add(r.cliente_id as string))
      }

      // Separa novos vs existentes
      const novos: typeof validas = []
      const existentes: (typeof validas[0] & { id: string })[] = []

      for (const r of validas) {
        const existingId =
          r.cnpjRaw.length === 14
            ? (mapCnpj.get(r.cnpjRaw) ?? null)
            : (mapFantasia.get(r.fantasia) ?? null)
        if (existingId) {
          existentes.push({ ...r, id: existingId })
        } else {
          novos.push(r)
        }
      }

      let ok = 0
      let err = parseErr

      // Batch insert novos (1 request)
      if (novos.length > 0) {
        const { data: inseridos, error } = await supabase
          .from('clientes')
          .insert(novos.map((r) => r.payload))
          .select('id, cnpj, fantasia')
        if (error) {
          err += novos.length
          novos.forEach((r) => erroLinhas.push(r.fantasia))
        } else {
          ok += novos.length
          // Insere contatos dos novos em paralelo
          const contatosNovos = (inseridos ?? []).flatMap((c) => {
            const row = novos.find(
              (r) => (r.cnpjRaw.length === 14 ? r.cnpjRaw === c.cnpj : r.fantasia === c.fantasia),
            )
            if (!row || (row.telefones.length === 0 && row.emails.length === 0)) return []
            const base = row.telefones.map((tel, i) => ({
              cliente_id: c.id as string, tipo: 'telefone', valor: tel, rotulo: null, ordem: i,
            }))
            row.emails.forEach((email, i) =>
              base.push({ cliente_id: c.id as string, tipo: 'email', valor: email, rotulo: null, ordem: row.telefones.length + i }),
            )
            return base
          })
          if (contatosNovos.length > 0) {
            await supabase.from('cliente_contatos').insert(contatosNovos)
          }
        }
      }

      // Updates dos existentes em paralelo (máx 10 simultâneos para não sobrecarregar)
      const BATCH = 10
      for (let i = 0; i < existentes.length; i += BATCH) {
        await Promise.all(
          existentes.slice(i, i + BATCH).map(async (r) => {
            const { payload: p } = r
            const { error } = await supabase
              .from('clientes')
              .update({
                fantasia: p.fantasia,
                razao_social: p.razao_social,
                cnpj: p.cnpj,
                inscricao_estadual: p.inscricao_estadual,
                endereco: p.endereco,
                numero: p.numero,
                bairro: p.bairro,
                cidade: p.cidade,
                estado: p.estado,
                cep: p.cep,
                comprador: p.comprador,
                dia_compras: p.dia_compras,
                cliente_desde: p.cliente_desde,
                display_chao: p.display_chao,
                display_balcao: p.display_balcao,
                display_parede: p.display_parede,
              })
              .eq('id', r.id)
            if (error) { err++; erroLinhas.push(r.fantasia); return }
            ok++
            await upsertContatos(r.id, r.telefones, r.emails, clientesComContatos)
          }),
        )
      }

      if (erroLinhas.length > 0) {
        console.warn('Clientes não importados:', erroLinhas)
        const nomes = erroLinhas.slice(0, 5).join(', ') + (erroLinhas.length > 5 ? ` e mais ${erroLinhas.length - 5}...` : '')
        toast.error(`${erroLinhas.length} não importado(s): ${nomes}`, { duration: 8000 })
      }
      if (ok > 0) {
        toast.success(`${ok} cliente(s) importado(s) com sucesso`)
      }      setPage(1)
      void load()
    } catch {
      toast.error('Arquivo inválido')
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-2 text-lg font-bold text-gray-900">Todos os Clientes</h2>
      <p className="mb-4 text-xs text-gray-500">
        Importação CSV/Excel: use os cabeçalhos da{' '}
        <a
          href={`${import.meta.env.BASE_URL}planilha-exemplo-clientes.csv`}
          download="planilha-exemplo-clientes.csv"
          className="font-medium text-primary-700 underline"
        >
          planilha de exemplo
        </a>
        . Escolha o <strong>responsável</strong> (vendedor ou admin ativo) ao qual os novos clientes serão vinculados;
        linhas com mesmo CNPJ (ou mesma fantasia sem CNPJ) para esse utilizador serão <strong>atualizadas</strong>.
      </p>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Responsável (importação)</label>
          <select
            value={vendedorImportId}
            onChange={(e) => setVendedorImportId(e.target.value)}
            disabled={!vendedoresCarregados || vendedores.length === 0}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          >
            {!vendedoresCarregados ? (
              <option value="">Carregando…</option>
            ) : vendedores.length === 0 ? (
              <option value="">Nenhum vendedor ou admin ativo</option>
            ) : (
              vendedores.map((v) => (
                <option key={v.user_id} value={v.user_id}>
                  {v.nome}
                  {v.role === 'admin' ? ' (admin)' : ''}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${import.meta.env.BASE_URL}planilha-exemplo-clientes.csv`}
            download="planilha-exemplo-clientes.csv"
            className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800"
          >
            <Download className="h-4 w-4" />
            Baixar exemplo (CSV)
          </a>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && void importarArquivo(e.target.files[0])}
          />
          <button
            type="button"
            disabled={importing || !vendedorImportId}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar Excel / CSV
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente..." />

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            {clientes.map((c) => (
              <Link
                key={c.id}
                to={`/clientes/${c.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-primary-200 hover:bg-primary-50/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{c.fantasia}</p>
                    <p className="text-xs text-gray-500">{[c.bairro, c.cidade].filter(Boolean).join(', ')}</p>
                  </div>
                  {!c.ativo && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inativo</span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>Vendedor: {c.vendedor?.nome ?? '—'}</span>
                  {c.telefone && <span>{c.telefone}</span>}
                </div>
              </Link>
            ))}
            {clientes.length === 0 && <p className="text-sm text-gray-500">Nenhum cliente encontrado.</p>}
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
