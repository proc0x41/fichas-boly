import { useEffect, useState, useId, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft } from 'lucide-react'
import { maskCNPJ, maskCEP, maskTelefone, maskIE, unmask, validateCNPJ } from '../lib/masks'
import toast from 'react-hot-toast'

const emptyForm = {
  fantasia: '',
  razao_social: '',
  cnpj: '',
  inscricao_estadual: '',
  endereco: '',
  numero: '',
  bairro: '',
  cidade: '',
  cep: '',
  telefone: '',
  email: '',
  comprador: '',
  dia_compras: '',
  cliente_desde: '',
  display_chao: 0,
  display_balcao: 0,
  display_parede: 0,
}

export default function ClienteForm() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(isEditing)

  useEffect(() => {
    if (isEditing && id) {
      supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data) {
            setForm({
              fantasia: data.fantasia ?? '',
              razao_social: data.razao_social ?? '',
              cnpj: data.cnpj ? maskCNPJ(data.cnpj) : '',
              inscricao_estadual: data.inscricao_estadual ?? '',
              endereco: data.endereco ?? '',
              numero: data.numero ?? '',
              bairro: data.bairro ?? '',
              cidade: data.cidade ?? '',
              cep: data.cep ? maskCEP(data.cep) : '',
              telefone: data.telefone ? maskTelefone(data.telefone) : '',
              email: data.email ?? '',
              comprador: data.comprador ?? '',
              dia_compras: data.dia_compras ?? '',
              cliente_desde: data.cliente_desde ?? '',
              display_chao: data.display_chao ?? 0,
              display_balcao: data.display_balcao ?? 0,
              display_parede: data.display_parede ?? 0,
            })
          }
          setLoadingData(false)
        })
    }
  }, [id, isEditing])

  const set = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const total = form.display_chao + form.display_balcao + form.display_parede

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.fantasia.trim()) {
      toast.error('Nome fantasia é obrigatório')
      return
    }

    const cnpjRaw = unmask(form.cnpj)
    if (cnpjRaw && !validateCNPJ(cnpjRaw)) {
      toast.error('CNPJ inválido — verifique os dígitos')
      return
    }

    const cepRaw = unmask(form.cep)
    if (cepRaw && cepRaw.length !== 8) {
      toast.error('CEP deve ter 8 dígitos')
      return
    }

    const telRaw = unmask(form.telefone)
    if (telRaw && telRaw.length < 10) {
      toast.error('Telefone deve ter 10 ou 11 dígitos')
      return
    }

    setLoading(true)

    const payload = {
      fantasia: form.fantasia.trim(),
      razao_social: form.razao_social || null,
      cnpj: cnpjRaw || null,
      inscricao_estadual: unmask(form.inscricao_estadual) || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      cep: cepRaw || null,
      telefone: telRaw || null,
      email: form.email || null,
      comprador: form.comprador || null,
      dia_compras: form.dia_compras || null,
      cliente_desde: form.cliente_desde || null,
      display_chao: form.display_chao,
      display_balcao: form.display_balcao,
      display_parede: form.display_parede,
    }

    let error
    if (isEditing) {
      ;({ error } = await supabase.from('clientes').update(payload).eq('id', id))
    } else {
      ;({ error } = await supabase.from('clientes').insert({ ...payload, vendedor_id: user!.id }))
    }

    setLoading(false)
    if (error) {
      toast.error('Erro ao salvar cliente')
    } else {
      toast.success(isEditing ? 'Cliente atualizado' : 'Cliente cadastrado')
      navigate(isEditing ? `/clientes/${id}` : '/clientes', { replace: true })
    }
  }

  if (loadingData) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-4 text-lg font-bold text-gray-900">
        {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nome Fantasia *" value={form.fantasia} onChange={(v) => set('fantasia', v)} autoComplete="organization" />
        <Field label="Razão Social" value={form.razao_social} onChange={(v) => set('razao_social', v)} />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="CNPJ"
            value={form.cnpj}
            onChange={(v) => set('cnpj', maskCNPJ(v))}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
          <Field
            label="Inscrição Estadual"
            value={form.inscricao_estadual}
            onChange={(v) => set('inscricao_estadual', maskIE(v))}
            inputMode="numeric"
            maxLength={14}
          />
        </div>

        <Field label="Endereço" value={form.endereco} onChange={(v) => set('endereco', v)} autoComplete="street-address" />

        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Número"
            value={form.numero}
            onChange={(v) => set('numero', v)}
            inputMode="numeric"
          />
          <Field label="Bairro" value={form.bairro} onChange={(v) => set('bairro', v)} className="col-span-2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade" value={form.cidade} onChange={(v) => set('cidade', v)} autoComplete="address-level2" />
          <Field
            label="CEP"
            value={form.cep}
            onChange={(v) => set('cep', maskCEP(v))}
            inputMode="numeric"
            placeholder="00000-000"
            maxLength={9}
            autoComplete="postal-code"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Telefone"
            value={form.telefone}
            onChange={(v) => set('telefone', maskTelefone(v))}
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            maxLength={15}
            autoComplete="tel"
          />
          <Field label="E-mail" value={form.email} onChange={(v) => set('email', v)} type="email" autoComplete="email" />
        </div>

        <Field label="Comprador" value={form.comprador} onChange={(v) => set('comprador', v)} />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Dia de Compras"
            value={form.dia_compras}
            onChange={(v) => set('dia_compras', v)}
            placeholder="Ex: Segunda"
          />
          <Field
            label="Cliente Desde"
            value={form.cliente_desde}
            onChange={(v) => set('cliente_desde', v)}
            type="date"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Displays</p>
          <div className="grid grid-cols-3 gap-3">
            <NumField label="Chão" value={form.display_chao} onChange={(v) => set('display_chao', v)} />
            <NumField label="Balcão" value={form.display_balcao} onChange={(v) => set('display_balcao', v)} />
            <NumField label="Parede" value={form.display_parede} onChange={(v) => set('display_parede', v)} />
          </div>
          <p className="mt-1 text-sm text-gray-500">Total: {total}</p>
        </div>

        <LoadingButton type="submit" loading={loading} className="w-full">
          {isEditing ? 'Salvar Alterações' : 'Cadastrar Cliente'}
        </LoadingButton>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  maxLength,
  autoComplete,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url'
  placeholder?: string
  maxLength?: number
  autoComplete?: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
      />
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
      />
    </div>
  )
}
