-- Corrige descrições de produtos com mojibake (UTF-8 lido como Latin-1), ex.: "aÃ§o" → "ação".
-- Faça backup antes. Só altera linhas que contêm o padrão típico "Ã".

UPDATE produtos
SET descricao = convert_from(convert_to(descricao, 'LATIN1'), 'UTF8')
WHERE descricao LIKE '%Ã%';
