-- Aplicar antes de publicar o frontend. Idempotente; não preenche preços antigos.
BEGIN;

ALTER TABLE public.visita_codigos ADD COLUMN IF NOT EXISTS preco_unitario numeric(14,4)
  CHECK (preco_unitario IS NULL OR preco_unitario >= 0);
COMMENT ON COLUMN public.visita_codigos.preco_unitario IS
  'Preço de tabela capturado no servidor na inclusão. NULL = histórico estimado pelo catálogo atual.';

-- Também protege inserções diretas: o cliente não escolhe o preço histórico.
CREATE OR REPLACE FUNCTION public.visita_codigo_preco_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT preco_tabela INTO NEW.preco_unitario FROM public.produtos
      WHERE lower(trim(codigo)) = lower(trim(NEW.codigo));
  ELSE
    IF NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.visita_id IS DISTINCT FROM OLD.visita_id THEN
      RAISE EXCEPTION 'Remova e adicione o item para trocar seu código ou pedido';
    END IF;
    NEW.preco_unitario := OLD.preco_unitario;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_visita_codigo_preco ON public.visita_codigos;
CREATE TRIGGER trg_visita_codigo_preco BEFORE INSERT OR UPDATE ON public.visita_codigos
  FOR EACH ROW EXECUTE FUNCTION public.visita_codigo_preco_historico();

CREATE OR REPLACE FUNCTION public.replace_visita_codigos(p_visita_id uuid, p_codigos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vendedor uuid;
BEGIN
  IF p_codigos IS NULL OR jsonb_typeof(p_codigos) <> 'array' THEN
    RAISE EXCEPTION 'p_codigos deve ser um array JSON';
  END IF;
  -- Serializa edições do mesmo pedido, preservando o preço dos itens mantidos.
  SELECT vendedor_id INTO v_vendedor FROM public.visitas WHERE id = p_visita_id FOR UPDATE;
  IF v_vendedor IS NULL THEN RAISE EXCEPTION 'Visita não encontrada'; END IF;
  IF auth.uid() IS NULL OR (v_vendedor <> auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_codigos) c
    GROUP BY lower(trim(c->>'codigo')) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Códigos duplicados';
  END IF;
  DELETE FROM public.visita_codigos vc WHERE visita_id = p_visita_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_codigos) c
      WHERE lower(trim(c->>'codigo')) = lower(trim(vc.codigo)));
  UPDATE public.visita_codigos vc SET quantidade = (c->>'quantidade')::int,
    desconto_percent_override = (c->>'desconto_percent_override')::numeric
    FROM jsonb_array_elements(p_codigos) c WHERE visita_id = p_visita_id
      AND lower(trim(c->>'codigo')) = lower(trim(vc.codigo));
  INSERT INTO public.visita_codigos (visita_id, codigo, quantidade, desconto_percent_override)
    SELECT p_visita_id, trim(c->>'codigo'), (c->>'quantidade')::int,
      (c->>'desconto_percent_override')::numeric
    FROM jsonb_array_elements(p_codigos) c
    WHERE NOT EXISTS (SELECT 1 FROM public.visita_codigos vc WHERE visita_id = p_visita_id
      AND lower(trim(vc.codigo)) = lower(trim(c->>'codigo')));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_visita_codigos(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_visita_codigos(uuid,jsonb) TO authenticated;

-- Produtos inativos já usados continuam disponíveis para valorar históricos.
DROP POLICY IF EXISTS "vendedor_select_produtos" ON public.produtos;
CREATE POLICY "vendedor_select_produtos" ON public.produtos FOR SELECT TO authenticated
  USING (ativo OR public.is_admin() OR EXISTS (
    SELECT 1 FROM public.visita_codigos vc JOIN public.visitas v ON v.id = vc.visita_id
    WHERE lower(trim(vc.codigo)) = lower(trim(produtos.codigo))
      AND (v.vendedor_id = auth.uid() OR (public.is_representada()
        AND v.tipo_visita = 'pedido' AND v.compartilhado_em IS NOT NULL))
  ));

-- Retorna um objeto JSON: não está sujeito ao limite de linhas do PostgREST.
-- Busca afeta somente a tabela/exportação; participação é sobre todas as vendas.
CREATE OR REPLACE FUNCTION public.admin_metricas(
  p_inicio date, p_fim date, p_busca text DEFAULT '',
  p_ordem text DEFAULT 'quantidade', p_direcao text DEFAULT 'desc',
  p_pagina integer DEFAULT 1, p_tamanho integer DEFAULT 20, p_exportar boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_dias integer; v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso exclusivo ao administrador' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR NOT isfinite(p_inicio) OR NOT isfinite(p_fim)
    OR p_fim < p_inicio OR p_inicio < date '1900-01-01' OR p_fim > date '9999-12-31' THEN
    RAISE EXCEPTION 'Intervalo de datas inválido';
  END IF;
  IF p_ordem IS NULL OR p_ordem NOT IN ('codigo','descricao','quantidade','pedidos','valor','participacao')
    OR p_direcao IS NULL OR p_direcao NOT IN ('asc','desc')
    OR p_pagina IS NULL OR p_pagina < 1 OR p_tamanho IS NULL OR p_tamanho NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Paginação ou ordenação inválida';
  END IF;
  v_dias := p_fim - p_inicio + 1;
  WITH linhas AS MATERIALIZED (
    SELECT v.id, v.cliente_id, v.data_visita, v.tipo_visita, v.valor_frete,
      v.compartilhado_em, v.nota_emitida_em, vc.codigo, vc.quantidade,
      lower(trim(vc.codigo)) AS chave, p.descricao,
      round(coalesce(vc.preco_unitario,p.preco_tabela,0) * coalesce(vc.quantidade,0)
        * (1 - coalesce(vc.desconto_percent_override,v.desconto_percent,0)/100),2) AS valor,
      vc.id IS NOT NULL AND vc.preco_unitario IS NULL AND p.preco_tabela IS NOT NULL AS estimado,
      vc.id IS NOT NULL AND vc.preco_unitario IS NULL AND p.preco_tabela IS NULL AS sem_preco
    FROM public.visitas v LEFT JOIN public.visita_codigos vc ON vc.visita_id = v.id
    LEFT JOIN public.produtos p ON lower(trim(p.codigo)) = lower(trim(vc.codigo))
    WHERE v.data_visita BETWEEN p_inicio - v_dias AND p_fim
      AND v.tipo_visita IN ('pedido','orcamento')
  ), documentos AS MATERIALIZED (
    SELECT id, cliente_id, data_visita, tipo_visita, valor_frete, compartilhado_em, nota_emitida_em,
      sum(valor) AS valor, coalesce(sum(quantidade),0) AS unidades,
      count(*) FILTER (WHERE estimado) AS estimados, count(*) FILTER (WHERE sem_preco) AS sem_preco
    FROM linhas GROUP BY id, cliente_id, data_visita, tipo_visita, valor_frete, compartilhado_em, nota_emitida_em
  ), resumos AS (
    SELECT periodo,
      jsonb_build_object('valor',coalesce(sum(valor),0),'pedidos',count(d.id),
        'ticket',coalesce(round(avg(valor),2),0),'unidades',coalesce(sum(unidades),0),
        'clientes',count(DISTINCT cliente_id),'frete',coalesce(sum(valor_frete),0),
        'estimados',coalesce(sum(estimados),0),'sem_preco',coalesce(sum(sem_preco),0)) AS resumo
    FROM (VALUES ('atual'),('anterior')) periodos(periodo)
    LEFT JOIN documentos d ON d.tipo_visita = 'pedido'
      AND CASE WHEN periodo = 'atual' THEN d.data_visita BETWEEN p_inicio AND p_fim
        ELSE d.data_visita BETWEEN p_inicio - v_dias AND p_inicio - 1 END
    GROUP BY periodo
  ), produtos AS (
    SELECT chave, min(codigo) AS codigo, coalesce(max(descricao),'Não cadastrado') AS descricao,
      sum(quantidade) AS quantidade, count(DISTINCT id) AS pedidos, sum(valor) AS valor,
      count(*) FILTER (WHERE estimado) AS estimados, count(*) FILTER (WHERE sem_preco) AS sem_preco
    FROM linhas WHERE tipo_visita = 'pedido' AND data_visita BETWEEN p_inicio AND p_fim AND codigo IS NOT NULL
    GROUP BY chave
  ), filtrados AS (
    SELECT *, coalesce(round(valor * 100 / nullif((SELECT sum(valor) FROM produtos),0),2),0) AS participacao
    FROM produtos WHERE coalesce(p_busca,'') = ''
      OR strpos(lower(codigo),lower(p_busca)) > 0 OR strpos(lower(descricao),lower(p_busca)) > 0
  ), ordenados AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_direcao = 'asc' THEN CASE p_ordem WHEN 'quantidade' THEN quantidade WHEN 'pedidos' THEN pedidos WHEN 'valor' THEN valor WHEN 'participacao' THEN participacao END END ASC,
      CASE WHEN p_direcao = 'desc' THEN CASE p_ordem WHEN 'quantidade' THEN quantidade WHEN 'pedidos' THEN pedidos WHEN 'valor' THEN valor WHEN 'participacao' THEN participacao END END DESC,
      CASE WHEN p_direcao = 'asc' THEN CASE p_ordem WHEN 'codigo' THEN codigo WHEN 'descricao' THEN descricao END END ASC,
      CASE WHEN p_direcao = 'desc' THEN CASE p_ordem WHEN 'codigo' THEN codigo WHEN 'descricao' THEN descricao END END DESC,
      chave ASC) AS posicao FROM filtrados
  ), buckets AS (
    SELECT generate_series(
      CASE WHEN v_dias <= 90 THEN p_inicio ELSE date_trunc('month',p_inicio::timestamp)::date END,
      p_fim, CASE WHEN v_dias <= 90 THEN interval '1 day' ELSE interval '1 month' END)::date AS data
  ), serie AS (
    SELECT b.data, coalesce(sum(d.valor),0) AS valor, count(d.id) AS pedidos
    FROM buckets b LEFT JOIN documentos d ON d.tipo_visita = 'pedido' AND d.data_visita BETWEEN p_inicio AND p_fim
      AND CASE WHEN v_dias <= 90 THEN d.data_visita ELSE date_trunc('month',d.data_visita::timestamp)::date END = b.data
    GROUP BY b.data
  )
  SELECT jsonb_build_object(
    'inicio',p_inicio,'fim',p_fim,'anterior_inicio',p_inicio-v_dias,'anterior_fim',p_inicio-1,
    'agrupamento',CASE WHEN v_dias <= 90 THEN 'dia' ELSE 'mes' END,
    'resumo',(SELECT resumo FROM resumos WHERE periodo = 'atual'),
    'anterior',(SELECT resumo FROM resumos WHERE periodo = 'anterior'),
    'pendencias',(SELECT jsonb_build_object(
      'orcamentos',count(*) FILTER (WHERE tipo_visita = 'orcamento'),
      'valor_orcamentos',coalesce(sum(valor) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'frete_orcamentos',coalesce(sum(valor_frete) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'estimados',coalesce(sum(estimados) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'sem_preco',coalesce(sum(sem_preco) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'nao_compartilhados',count(*) FILTER (WHERE tipo_visita = 'pedido' AND compartilhado_em IS NULL),
      'aguardando_nota',count(*) FILTER (WHERE tipo_visita = 'pedido' AND compartilhado_em IS NOT NULL AND nota_emitida_em IS NULL))
      FROM documentos WHERE data_visita BETWEEN p_inicio AND p_fim),
    'serie',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY data),'[]'::jsonb) FROM serie s),
    'total_produtos',(SELECT count(*) FROM filtrados),
    'produtos',(SELECT coalesce(jsonb_agg(to_jsonb(o) - 'chave' - 'posicao' ORDER BY posicao),'[]'::jsonb)
      FROM ordenados o WHERE coalesce(p_exportar,false)
        OR (posicao > (p_pagina::bigint-1)*p_tamanho AND posicao <= p_pagina::bigint*p_tamanho))
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_metricas(date,date,text,text,text,integer,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_metricas(date,date,text,text,text,integer,integer,boolean) TO authenticated;
COMMIT;
