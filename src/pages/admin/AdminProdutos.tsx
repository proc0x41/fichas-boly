import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Loader2, Trash2, Upload, Download, Pencil, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Produto } from '../../types'
import { PaginationBar } from '../../components/PaginationBar'
import { SearchInput } from '../../components/SearchInput'
import { fixUtf8MojibakeIfNeeded } from '../../lib/fixUtf8Mojibake'
import { normCodigo, parsePreco, getCell } from '../../lib/utils'

const PAGE_SIZE = 50

export default function AdminProdutos() {
  const navigate = useNavigate()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [busca])

  const load = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let query = supabase
      .from('produtos')
      .select('*', { count: 'exact' })
      .order('codigo', { ascending: true })
    if (busca.trim()) {
      query = query.or(`codigo.ilike.%${busca.trim()}%,descricao.ilike.%${busca.trim()}%`)
    }
    const { data, error, count } = await query.range(from, to)
    if (error) {
      toast.error('Erro ao carregar produtos')
      setProdutos([])
      setTotal(0)
    } else {
      setProdutos(
        (data ?? []).map((p) => ({
          ...(p as Produto),
          descricao: fixUtf8MojibakeIfNeeded((p as Produto).descricao),
        })),
      )
      setTotal(count ?? 0)
      if ((data?.length ?? 0) === 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1))
      }
    }
    setLoading(false)
  }, [page, busca])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const excluir = async (id: string) => {
    if (!confirm('Excluir este produto?')) return
    const { error } = await supabase.from('produtos').delete().eq('id', id)
    if (error) toast.error('Erro ao excluir')
    else {
      toast.success('Removido')
      load()
    }
  }

  const importarArquivo = async (f: File) => {
    setImporting(true)
    try {
      const ab = await f.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      // raw: false usa texto formatado da célula — evita "3,50" no CSV virar número 350 (parse US)
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
      let ok = 0
      let err = 0
      for (const row of rows) {
        const c = normCodigo(getCell(row, 'codigo', 'código', 'code', 'sku'))
        if (!c) continue
        const desc = getCell(row, 'descricao', 'descrição', 'produto', 'nome', 'descrição produto')
        const precoRaw =
          row['preco_tabela'] ??
          row['preço_tabela'] ??
          row['preco'] ??
          row['preço'] ??
          row['valor'] ??
          row['preco tabela']
        const pr = parsePreco(precoRaw)
        if (!desc || pr === null) {
          err++
          continue
        }
        const descNorm = fixUtf8MojibakeIfNeeded(desc)
        const { data: exist } = await supabase.from('produtos').select('id').eq('codigo', c).maybeSingle()
        if (exist?.id) {
          const { error } = await supabase
            .from('produtos')
            .update({
              descricao: descNorm,
              preco_tabela: pr,
              ativo: true,
            })
            .eq('id', exist.id)
          if (error) err++
          else ok++
        } else {
          const { error } = await supabase.from('produtos').insert({
            codigo: c,
            descricao: descNorm,
            preco_tabela: pr,
            ativo: true,
          })
          if (error) err++
          else ok++
        }
      }
      toast.success(`Importação: ${ok} linhas OK${err ? `, ${err} ignoradas` : ''}`)
      setPage(1)
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

      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">Produtos (catálogo)</h2>
        <button
          type="button"
          onClick={() => navigate('/admin/produtos/novo')}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Novo produto
        </button>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Usados no PDF do pedido. Na primeira linha use os cabeçalhos: <strong>codigo</strong>, <strong>descricao</strong>,{' '}
        <strong>preco_tabela</strong> (também aceitam nomes como <em>código</em>, <em>preço</em>, <em>valor</em>). Valores
        decimais podem usar vírgula ou ponto.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <a
          href={`${import.meta.env.BASE_URL}planilha-exemplo-produtos.csv`}
          download="planilha-exemplo-produtos.csv"
          className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-800"
        >
          <Download className="h-4 w-4" />
          Baixar planilha de exemplo (CSV)
        </a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importarArquivo(e.target.files[0])} />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar Excel / CSV
        </button>
      </div>

      <div className="mb-4">
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por código ou descrição..." />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-2">
          {produtos.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono font-semibold text-gray-900">{p.codigo}</p>
                  <p className="text-xs text-gray-600">{p.descricao}</p>
                  <p className="text-xs text-gray-400">
                    {Number(p.preco_tabela).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    {!p.ativo && ' · inativo'}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/produtos/${p.id}/editar`)}
                    className="p-2 text-primary-600"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => excluir(p.id)} className="p-2 text-red-500" aria-label="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {produtos.length === 0 && <p className="text-sm text-gray-500">Nenhum produto cadastrado.</p>}
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
