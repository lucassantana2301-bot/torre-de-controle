-- =====================================================================================================================
-- ArkTransp — esquema do banco de dados (PostgreSQL 15+)
--
-- Substitui o armazenamento no navegador (localStorage + IndexedDB) por um banco central.
-- Organização:
--   1. Tipos (enums)
--   2. Acesso: usuários, sessões, preferências e auditoria
--   3. Cadastros de referência: UF/região, feriados, transportadoras, tipos de nota
--   4. Importações (cada planilha enviada vira um registro rastreável)
--   5. Dados das fontes: Alloca07, Intelipost, transportadoras, expedição, Zendesk, planilha base
--   6. Resultados apurados: conciliação Alloca07 × Intelipost, situação de entrega/SLA por NF
--   7. Trabalho da equipe: tratativas, ocorrências da Torre de Controle, fechamento diário
--   8. Visões (views) usadas pelas telas
--   9. Carga inicial dos cadastros
--
-- Convenções:
--   * Número de NF e de ticket são guardados como bigint, sem zeros à esquerda ("000235084" = 235084).
--   * Datas sem hora (emissão, previsão, entrega) são `date`; momentos (importação, login) são `timestamptz`.
--   * Dados das planilhas guardam a importação de origem (`importacao_id`) para rastreabilidade.
-- =====================================================================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS ark;
SET search_path TO ark, public;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TYPE perfil_usuario AS ENUM ('admin', 'operador', 'consulta');

CREATE TYPE fonte_importacao AS ENUM (
  'alloca07',               -- Protheus, relatório Alloca07
  'intelipost_envios',      -- Intelipost, relatório de envios (cruzamento)
  'intelipost_transacoes',  -- Intelipost, transactions_*.xlsx (entregas de todas as transportadoras)
  'spfly',
  'jamef',
  'certex',
  'planilha_base',          -- planilha base da tela Entregas
  'zendesk_tickets',        -- Explore, relatório "Aging"
  'zendesk_nf_romaneio',    -- planilha interna de NF dos romaneios (aba Base_Dados)
  'zendesk_nf_manual',      -- planilha de NFs informadas à mão por ticket
  'expedicao'               -- Relatório de Expedição
);

CREATE TYPE status_importacao AS ENUM ('processando', 'sucesso', 'erro');

CREATE TYPE regiao AS ENUM ('Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte');

CREATE TYPE tipo_transportadora AS ENUM ('parceira', 'modal_proprio', 'outra');

CREATE TYPE status_conciliacao AS ENUM (
  'integrada',              -- NF da Alloca07 encontrada na Intelipost (direta ou pela triangular)
  'nao_integrada',          -- NF da Alloca07 sem correspondente na Intelipost
  'so_intelipost',          -- NF da Intelipost que não é principal nem triangular de nenhuma nota da Alloca07
  'fora_remanejamento',     -- tipo REMANEJAMENTO FISCAL: fora do cruzamento
  'fora_dia_corrente'       -- emitida/criada no dia útil corrente: ainda não teve tempo de integrar
);

CREATE TYPE validacao_conciliacao AS ENUM ('direta', 'triangular');

CREATE TYPE situacao_entrega AS ENUM ('entregue', 'mesmo_dia', 'devolvida', 'em_transito', 'sem_rastreio');

CREATE TYPE status_sla AS ENUM ('no_prazo', 'atrasada', 'vencida', 'em_transito', 'devolvida', 'sem_previsao');

CREATE TYPE aba_zendesk AS ENUM ('em_rota', 'aguardando_expedicao');

CREATE TYPE origem_vinculo_nf AS ENUM (
  'romaneio',               -- planilha de NF dos romaneios
  'manual_planilha',        -- planilha de NFs informadas à mão
  'manual_tela'             -- vínculo feito na tela Baixa Zendesk
);

CREATE TYPE tipo_ocorrencia AS ENUM ('vencida', 'gap_intelipost', 'sem_rastreio', 'nao_integrada');

CREATE TYPE prioridade_ocorrencia AS ENUM ('critica', 'alta', 'media');

CREATE TYPE status_ocorrencia AS ENUM ('aberta', 'em_andamento', 'resolvida', 'descartada');

-- Mantém `atualizado_em` sempre correto nas tabelas que têm a coluna.
CREATE FUNCTION tocar_atualizado_em() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Acesso
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE usuario (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome               text NOT NULL CHECK (btrim(nome) <> ''),
  email              text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  senha_hash         text NOT NULL,                       -- argon2id/bcrypt; nunca a senha em texto
  setor              text,
  perfil             perfil_usuario NOT NULL DEFAULT 'operador',
  ativo              boolean NOT NULL DEFAULT true,
  trocar_senha       boolean NOT NULL DEFAULT true,       -- obriga a troca no primeiro acesso
  tentativas_falhas  smallint NOT NULL DEFAULT 0 CHECK (tentativas_falhas >= 0),
  bloqueado_ate      timestamptz,
  ultimo_login_em    timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuario_email_uk ON usuario (lower(email));
CREATE TRIGGER usuario_atualizado_em BEFORE UPDATE ON usuario FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TABLE sessao (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id          uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  refresh_token_hash  text NOT NULL UNIQUE,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  expira_em           timestamptz NOT NULL,
  revogada_em         timestamptz,
  ip                  inet,
  user_agent          text,
  CHECK (expira_em > criada_em)
);
CREATE INDEX sessao_ativa_idx ON sessao (usuario_id) WHERE revogada_em IS NULL;

-- Tema, menu aberto, tipos de nota ocultos, período de emissão… (antes no localStorage de cada navegador).
CREATE TABLE usuario_preferencia (
  usuario_id     uuid NOT NULL REFERENCES usuario (id) ON DELETE CASCADE,
  chave          text NOT NULL,
  valor          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, chave)
);

-- Quem fez o quê: login, importação, tratativa, exportação, vínculo manual de NF…
CREATE TABLE auditoria (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id   uuid REFERENCES usuario (id) ON DELETE SET NULL,
  acao         text NOT NULL,
  entidade     text,
  entidade_id  text,
  detalhes     jsonb,
  ip           inet,
  em           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_em_idx ON auditoria (em DESC);
CREATE INDEX auditoria_entidade_idx ON auditoria (entidade, entidade_id);
CREATE INDEX auditoria_usuario_idx ON auditoria (usuario_id, em DESC);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Cadastros de referência
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE uf (
  sigla   char(2) PRIMARY KEY CHECK (sigla ~ '^[A-Z]{2}$'),
  nome    text NOT NULL,
  regiao  regiao NOT NULL
);

-- Ainda não usado nas regras (hoje dia útil = segunda a sexta); pronto para entrar no cálculo de SLA.
CREATE TABLE feriado (
  id         int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data       date NOT NULL,
  uf         char(2) REFERENCES uf (sigla),             -- nulo = feriado nacional
  descricao  text NOT NULL
);
CREATE UNIQUE INDEX feriado_uk ON feriado (data, coalesce(uf, 'BR'));

CREATE TABLE transportadora (
  id                smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo            text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9_]+$'),
  nome              text NOT NULL,
  tipo              tipo_transportadora NOT NULL,
  planilha_propria  boolean NOT NULL DEFAULT false,      -- SPfly, Jamef, Certex: têm relatório de entrega próprio
  ativa             boolean NOT NULL DEFAULT true
);

-- Nome como aparece nas planilhas (Intelipost, expedição) → transportadora cadastrada.
CREATE TABLE transportadora_alias (
  nome_normalizado   text PRIMARY KEY,                    -- minúsculo, sem acento, espaços simples
  transportadora_id  smallint NOT NULL REFERENCES transportadora (id) ON DELETE CASCADE
);

CREATE TABLE tipo_nota (
  nome                text PRIMARY KEY,                   -- "Tp. Previsão" da Alloca07
  fora_do_cruzamento  boolean NOT NULL DEFAULT false,     -- ex.: REMANEJAMENTO FISCAL
  oculto_por_padrao   boolean NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Importações
-- ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE importacao (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte             fonte_importacao NOT NULL,
  arquivo_nome      text NOT NULL,
  arquivo_sha256    char(64) NOT NULL CHECK (arquivo_sha256 ~ '^[0-9a-f]{64}$'),
  arquivo_bytes     bigint NOT NULL CHECK (arquivo_bytes >= 0),
  arquivo_caminho   text,                                 -- cópia do original no armazenamento de arquivos (opcional)
  status            status_importacao NOT NULL DEFAULT 'processando',
  usuario_id        uuid REFERENCES usuario (id) ON DELETE SET NULL,
  iniciada_em       timestamptz NOT NULL DEFAULT now(),
  concluida_em      timestamptz,
  linhas_total      int CHECK (linhas_total >= 0),
  linhas_validas    int CHECK (linhas_validas >= 0),
  linhas_ignoradas  int CHECK (linhas_ignoradas >= 0),   -- reversas, retornos ao CD de Itapevi, canceladas…
  linhas_sem_nf     int CHECK (linhas_sem_nf >= 0),
  periodo_de        date,
  periodo_ate       date,
  periodo_tipo      text CHECK (periodo_tipo IN ('emissao', 'entrega', 'criacao')),
  resumo            jsonb NOT NULL DEFAULT '[]',          -- números exibidos na prévia/histórico da importação
  erro              text,
  CHECK (status <> 'erro' OR erro IS NOT NULL),
  CHECK (status = 'processando' OR concluida_em IS NOT NULL),
  CHECK (periodo_de IS NULL OR periodo_ate IS NULL OR periodo_de <= periodo_ate)
);
CREATE INDEX importacao_fonte_idx ON importacao (fonte, iniciada_em DESC);
CREATE INDEX importacao_arquivo_idx ON importacao (fonte, arquivo_sha256);   -- avisa "esse arquivo já foi enviado"

-- Linhas da planilha que não puderam ser lidas, com o motivo (qualidade de dados).
CREATE TABLE importacao_rejeicao (
  importacao_id  uuid NOT NULL REFERENCES importacao (id) ON DELETE CASCADE,
  linha          int NOT NULL CHECK (linha > 0),
  motivo         text NOT NULL,
  dados          jsonb,
  PRIMARY KEY (importacao_id, linha)
);

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Dados das fontes
-- ---------------------------------------------------------------------------------------------------------------------

-- Alloca07 (Protheus): uma linha por NF.
CREATE TABLE nota_fiscal (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero                  bigint NOT NULL CHECK (numero > 0),
  serie                   text NOT NULL DEFAULT '',
  nf_triangular           bigint CHECK (nf_triangular > 0),
  tipo_nota               text REFERENCES tipo_nota (nome) ON UPDATE CASCADE,
  contrato                text,
  termo                   text,
  pedido                  text,
  romaneio                text,
  cliente                 text,
  cidade                  text,
  uf                      char(2) REFERENCES uf (sigla),
  emissao                 date,
  previsao_entrada        date,
  chave_acesso            char(44) UNIQUE CHECK (chave_acesso ~ '^[0-9]{44}$'),
  linhas_alloca           int NOT NULL DEFAULT 1 CHECK (linhas_alloca > 0),
  primeira_importacao_id  uuid NOT NULL REFERENCES importacao (id),
  ultima_importacao_id    uuid NOT NULL REFERENCES importacao (id),
  criado_em               timestamptz NOT NULL DEFAULT now(),
  atualizado_em           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (numero, serie),
  CHECK (nf_triangular IS DISTINCT FROM numero)
);
CREATE INDEX nota_fiscal_numero_idx ON nota_fiscal (numero);
CREATE INDEX nota_fiscal_triangular_idx ON nota_fiscal (nf_triangular) WHERE nf_triangular IS NOT NULL;
CREATE INDEX nota_fiscal_emissao_idx ON nota_fiscal (emissao);
CREATE TRIGGER nota_fiscal_atualizado_em BEFORE UPDATE ON nota_fiscal FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

-- Intelipost, relatório de envios: usado no cruzamento com a Alloca07.
CREATE TABLE envio_intelipost (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nf_numero             bigint NOT NULL CHECK (nf_numero > 0),
  rastreio              text NOT NULL DEFAULT '',
  transportadora_nome   text,
  transportadora_id     smallint REFERENCES transportadora (id),
  metodo                text,
  status                text,
  situacao              text,
  performance           text,
  destinatario          text,
  cidade                text,
  uf                    char(2) REFERENCES uf (sigla),
  pedido                text,
  pedido_venda          text,
  criado_na_intelipost  timestamptz,
  despacho_em           timestamptz,
  entrega_em            timestamptz,
  previsao              date,
  url                   text,
  mensagem              text,
  importacao_id         uuid NOT NULL REFERENCES importacao (id),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nf_numero, rastreio)
);
CREATE TRIGGER envio_intelipost_atualizado_em BEFORE UPDATE ON envio_intelipost FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

-- Eventos de entrega: transações da Intelipost e planilhas das transportadoras (SPfly, Jamef, Certex).
-- Uma NF pode ter vários eventos (vários envios, reentregas com CT-e diferente).
CREATE TABLE evento_entrega (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nf_numero            bigint NOT NULL CHECK (nf_numero > 0),
  fonte                fonte_importacao NOT NULL
                         CHECK (fonte IN ('intelipost_transacoes', 'spfly', 'jamef', 'certex')),
  chave_origem         text NOT NULL,                     -- identifica a linha na fonte (CT-e, rastreio/pedido…)
  transportadora_id    smallint REFERENCES transportadora (id),
  transportadora_nome  text,
  ultimo_status        text NOT NULL DEFAULT '',
  data_status          date,
  previsao             date,
  data_entrega         date,
  recebedor            text,
  destinatario         text,
  cidade               text,
  uf                   char(2) REFERENCES uf (sigla),
  base                 text,                              -- "Hub (Agência)" das transações
  cte                  text,
  data_cte             date,
  valor_reentrega      numeric(12, 2) CHECK (valor_reentrega >= 0),
  cancelado            boolean NOT NULL DEFAULT false,
  importacao_id        uuid NOT NULL REFERENCES importacao (id),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fonte, nf_numero, chave_origem)
);
CREATE INDEX evento_entrega_nf_idx ON evento_entrega (nf_numero);
CREATE INDEX evento_entrega_cte_idx ON evento_entrega (nf_numero, data_cte) WHERE cte IS NOT NULL;   -- reentregas
CREATE TRIGGER evento_entrega_atualizado_em BEFORE UPDATE ON evento_entrega FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

-- Relatório de Expedição: quando e como a NF saiu da Arklok (lead time).
CREATE TABLE expedicao_nf (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nf_numero            bigint NOT NULL CHECK (nf_numero > 0),
  saida_em             timestamptz NOT NULL,
  uf                   char(2) REFERENCES uf (sigla),
  transportadora_nome  text,
  transportadora_id    smallint REFERENCES transportadora (id),
  modal                text,
  tipo                 text,
  cliente              text,
  importacao_id        uuid NOT NULL REFERENCES importacao (id),
  UNIQUE (nf_numero, saida_em)
);

-- Zendesk: tickets do relatório "Aging".
CREATE TABLE ticket_zendesk (
  id                    bigint PRIMARY KEY CHECK (id > 0),
  status                text NOT NULL,
  aba                   aba_zendesk,                      -- nulo = status fora das abas da Baixa Zendesk
  grupo                 text,
  organizacao           text,
  grupo_economico       text,
  uf                    char(2) REFERENCES uf (sigla),
  localidade            text,
  prioridade            text,
  criado_em             timestamptz,
  atualizado_em         timestamptz,
  aberto                boolean NOT NULL DEFAULT true,    -- presente na última planilha importada
  ultima_importacao_id  uuid NOT NULL REFERENCES importacao (id),
  sincronizado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_zendesk_aba_idx ON ticket_zendesk (aba) WHERE aberto;

-- Ticket ↔ NF: romaneio (planilha), planilha manual e vínculos feitos na tela.
-- Sem FK para ticket_zendesk: o romaneio cita tickets que não estão (ou ainda não estão) no relatório do Zendesk.
CREATE TABLE ticket_nf (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id      bigint NOT NULL CHECK (ticket_id > 0),
  origem         origem_vinculo_nf NOT NULL,
  romaneio       text,
  data_romaneio  date,
  nf_numero      bigint CHECK (nf_numero > 0),            -- nulo = linha do romaneio ainda sem NF
  nf_triangular  bigint CHECK (nf_triangular > 0),        -- par informado à mão; vale antes do par da Alloca07
  etapa          text,
  importacao_id  uuid REFERENCES importacao (id) ON DELETE CASCADE,
  criado_por     uuid REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CHECK (origem = 'manual_tela' OR importacao_id IS NOT NULL),
  CHECK (origem = 'romaneio' OR nf_numero IS NOT NULL)
);
CREATE INDEX ticket_nf_ticket_idx ON ticket_nf (ticket_id);
CREATE INDEX ticket_nf_nf_idx ON ticket_nf (nf_numero) WHERE nf_numero IS NOT NULL;
CREATE UNIQUE INDEX ticket_nf_uk ON ticket_nf (ticket_id, origem, coalesce(romaneio, ''), coalesce(nf_numero, 0));

-- Planilha base da tela Entregas (lista a conferir). A lista em uso é a da última importação com sucesso.
CREATE TABLE conferencia_linha (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  importacao_id  uuid NOT NULL REFERENCES importacao (id) ON DELETE CASCADE,
  ordem          int NOT NULL,
  ticket_id      bigint CHECK (ticket_id > 0),
  organizacao    text,
  tipo_nota      text,
  emissao        date,
  cidade         text,
  uf             char(2) REFERENCES uf (sigla),
  UNIQUE (importacao_id, ordem)
);

CREATE TABLE conferencia_linha_nf (
  conferencia_linha_id  bigint NOT NULL REFERENCES conferencia_linha (id) ON DELETE CASCADE,
  nf_numero             bigint NOT NULL CHECK (nf_numero > 0),
  PRIMARY KEY (conferencia_linha_id, nf_numero)
);
CREATE INDEX conferencia_linha_nf_idx ON conferencia_linha_nf (nf_numero);

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Resultados apurados (recalculados pela API a cada importação)
-- ---------------------------------------------------------------------------------------------------------------------

-- Cruzamento Alloca07 × Intelipost (antes: arklok_integrations_v3).
CREATE TABLE conciliacao_nf (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nota_fiscal_id       bigint UNIQUE REFERENCES nota_fiscal (id) ON DELETE CASCADE,
  envio_intelipost_id  bigint REFERENCES envio_intelipost (id) ON DELETE SET NULL,
  status               status_conciliacao NOT NULL,
  validacao            validacao_conciliacao,
  anomalia_datas       boolean NOT NULL DEFAULT false,    -- emissão diferente da data de integração
  apurado_em           timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'integrada' OR (validacao IS NOT NULL AND envio_intelipost_id IS NOT NULL)),
  CHECK (status = 'integrada' OR validacao IS NULL),
  CHECK ((status = 'so_intelipost') = (nota_fiscal_id IS NULL)),
  CHECK (status <> 'so_intelipost' OR envio_intelipost_id IS NOT NULL)
);
CREATE UNIQUE INDEX conciliacao_so_intelipost_uk ON conciliacao_nf (envio_intelipost_id) WHERE status = 'so_intelipost';
CREATE INDEX conciliacao_status_idx ON conciliacao_nf (status);

-- Situação consolidada de entrega e SLA por NF (antes: calculada na tela a cada render).
CREATE TABLE entrega_nf (
  nf_numero              bigint PRIMARY KEY CHECK (nf_numero > 0),
  situacao               situacao_entrega NOT NULL,
  transportadora_id      smallint REFERENCES transportadora (id),   -- inclui Frota interna e Lalamove
  evento_entrega_id      bigint REFERENCES evento_entrega (id) ON DELETE SET NULL,
  via_nf_numero          bigint,                          -- entregue pela outra NF do par remessa × triangular
  sla_status             status_sla,                      -- nulo = fora do SLA (sem planilha com previsão, retorno)
  previsao               date,
  data_entrega           date,
  atraso_dias_uteis      int,
  lead_time_dias_uteis   int,
  regiao                 regiao,
  apurado_em             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entrega_nf_sla_idx ON entrega_nf (sla_status, regiao);

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. Trabalho da equipe
-- ---------------------------------------------------------------------------------------------------------------------

-- Tratativa por NF; sobrevive a novas importações (antes: arklok_tratativas_v1).
CREATE TABLE tratativa (
  nf_numero       bigint PRIMARY KEY CHECK (nf_numero > 0),
  tratado         boolean NOT NULL DEFAULT false,
  tratado_em      timestamptz,
  tratado_por     uuid REFERENCES usuario (id) ON DELETE SET NULL,
  pdv             text,
  nota_antiga     text,
  nota_nova       text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES usuario (id) ON DELETE SET NULL,
  CHECK (tratado = (tratado_em IS NOT NULL))
);
CREATE TRIGGER tratativa_atualizado_em BEFORE UPDATE ON tratativa FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

CREATE TABLE tratativa_comentario (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nf_numero  bigint NOT NULL REFERENCES tratativa (nf_numero) ON DELETE CASCADE,
  texto      text NOT NULL CHECK (btrim(texto) <> ''),
  autor_id   uuid REFERENCES usuario (id) ON DELETE SET NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tratativa_comentario_nf_idx ON tratativa_comentario (nf_numero, criado_em);

-- Ocorrências da Torre de Controle com responsável e andamento (novo: hoje são só calculadas na tela).
CREATE TABLE ocorrencia (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo            tipo_ocorrencia NOT NULL,
  nf_numero       bigint NOT NULL CHECK (nf_numero > 0),
  prioridade      prioridade_ocorrencia NOT NULL,
  status          status_ocorrencia NOT NULL DEFAULT 'aberta',
  responsavel_id  uuid REFERENCES usuario (id) ON DELETE SET NULL,
  dias_parado     int,
  detectada_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  resolvida_em    timestamptz,
  CHECK ((status IN ('resolvida', 'descartada')) = (resolvida_em IS NOT NULL))
);
CREATE UNIQUE INDEX ocorrencia_em_aberto_uk ON ocorrencia (tipo, nf_numero) WHERE status IN ('aberta', 'em_andamento');
CREATE INDEX ocorrencia_responsavel_idx ON ocorrencia (responsavel_id) WHERE status IN ('aberta', 'em_andamento');
CREATE TRIGGER ocorrencia_atualizado_em BEFORE UPDATE ON ocorrencia FOR EACH ROW EXECUTE FUNCTION tocar_atualizado_em();

-- Resumo de cada dia (antes: store "dias" do IndexedDB arklok_banco).
CREATE TABLE fechamento_diario (
  data       date PRIMARY KEY,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  contagens  jsonb NOT NULL,                              -- registros por tabela
  entregas   jsonb NOT NULL DEFAULT '{}'                  -- notas integradas por situação de entrega
);

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. Visões
-- ---------------------------------------------------------------------------------------------------------------------

CREATE VIEW vw_ticket_zendesk AS
SELECT t.*,
       current_date - t.criado_em::date     AS idade_dias,
       current_date - t.atualizado_em::date AS dias_sem_atualizacao
  FROM ticket_zendesk t;

-- Vínculos que valem: ticket com NF manual (planilha ou tela) usa só as manuais; os demais seguem o romaneio.
CREATE VIEW vw_ticket_nf_efetivo AS
SELECT tn.*
  FROM ticket_nf tn
 WHERE tn.origem <> 'romaneio'
    OR NOT EXISTS (SELECT 1 FROM ticket_nf m WHERE m.ticket_id = tn.ticket_id AND m.origem <> 'romaneio');

-- Baixa Zendesk. Regra atual do app: ao menos uma NF entregue, nenhuma linha do romaneio sem NF
-- e nenhuma NF de Frota interna/Lalamove (essas têm baixa própria).
CREATE VIEW vw_ticket_baixa AS
SELECT t.id   AS ticket_id,
       t.aba,
       count(v.id)                                                                         AS linhas_romaneio,
       count(v.nf_numero)                                                                  AS linhas_com_nf,
       count(DISTINCT v.nf_numero)                                                         AS nfs,
       count(DISTINCT e.nf_numero) FILTER (WHERE e.situacao IN ('entregue', 'mesmo_dia'))  AS nfs_entregues,
       count(DISTINCT e.nf_numero) FILTER (WHERE tr.tipo = 'modal_proprio')                AS nfs_modal_proprio,
       (    count(DISTINCT e.nf_numero) FILTER (WHERE e.situacao IN ('entregue', 'mesmo_dia')) > 0
        AND count(v.id) = count(v.nf_numero)
        AND count(DISTINCT e.nf_numero) FILTER (WHERE tr.tipo = 'modal_proprio') = 0)      AS pronto_para_baixa
  FROM ticket_zendesk t
  LEFT JOIN vw_ticket_nf_efetivo v ON v.ticket_id = t.id
  LEFT JOIN entrega_nf e           ON e.nf_numero = v.nf_numero
  LEFT JOIN transportadora tr      ON tr.id = e.transportadora_id
 WHERE t.aberto AND t.aba IS NOT NULL
 GROUP BY t.id, t.aba;

-- Painel de SLA: % no prazo = no prazo ÷ (no prazo + com atraso + vencidas). Meta 95%.
CREATE VIEW vw_sla_regiao_transportadora AS
SELECT regiao, transportadora_id, no_prazo, atrasadas, vencidas, em_transito, devolvidas, sem_previsao,
       round(100.0 * no_prazo / nullif(no_prazo + atrasadas + vencidas, 0), 1) AS pct_no_prazo
  FROM (SELECT e.regiao,
               e.transportadora_id,
               count(*) FILTER (WHERE e.sla_status = 'no_prazo')     AS no_prazo,
               count(*) FILTER (WHERE e.sla_status = 'atrasada')     AS atrasadas,
               count(*) FILTER (WHERE e.sla_status = 'vencida')      AS vencidas,
               count(*) FILTER (WHERE e.sla_status = 'em_transito')  AS em_transito,
               count(*) FILTER (WHERE e.sla_status = 'devolvida')    AS devolvidas,
               count(*) FILTER (WHERE e.sla_status = 'sem_previsao') AS sem_previsao
          FROM entrega_nf e
         WHERE e.sla_status IS NOT NULL
         GROUP BY e.regiao, e.transportadora_id) s;

-- Banco acumulado por mês de emissão (antes: store "base" do IndexedDB, índice "mes").
CREATE VIEW vw_resumo_mensal AS
SELECT to_char(n.emissao, 'YYYY-MM')                           AS mes,
       count(*)                                                AS notas,
       count(*) FILTER (WHERE c.status = 'integrada')          AS integradas,
       count(*) FILTER (WHERE c.status = 'nao_integrada')      AS nao_integradas,
       count(e.nf_numero) FILTER (WHERE e.situacao IN ('entregue', 'mesmo_dia')) AS entregues,
       max(n.atualizado_em)                                    AS ultima_atualizacao
  FROM nota_fiscal n
  LEFT JOIN conciliacao_nf c ON c.nota_fiscal_id = n.id
  LEFT JOIN entrega_nf e     ON e.nf_numero = n.numero
 GROUP BY 1;

-- ---------------------------------------------------------------------------------------------------------------------
-- 9. Carga inicial
-- ---------------------------------------------------------------------------------------------------------------------

INSERT INTO uf (sigla, nome, regiao) VALUES
  ('SP', 'São Paulo', 'Sudeste'), ('RJ', 'Rio de Janeiro', 'Sudeste'), ('MG', 'Minas Gerais', 'Sudeste'),
  ('ES', 'Espírito Santo', 'Sudeste'),
  ('PR', 'Paraná', 'Sul'), ('SC', 'Santa Catarina', 'Sul'), ('RS', 'Rio Grande do Sul', 'Sul'),
  ('DF', 'Distrito Federal', 'Centro-Oeste'), ('GO', 'Goiás', 'Centro-Oeste'), ('MT', 'Mato Grosso', 'Centro-Oeste'),
  ('MS', 'Mato Grosso do Sul', 'Centro-Oeste'),
  ('BA', 'Bahia', 'Nordeste'), ('SE', 'Sergipe', 'Nordeste'), ('AL', 'Alagoas', 'Nordeste'),
  ('PE', 'Pernambuco', 'Nordeste'), ('PB', 'Paraíba', 'Nordeste'), ('RN', 'Rio Grande do Norte', 'Nordeste'),
  ('CE', 'Ceará', 'Nordeste'), ('PI', 'Piauí', 'Nordeste'), ('MA', 'Maranhão', 'Nordeste'),
  ('AM', 'Amazonas', 'Norte'), ('PA', 'Pará', 'Norte'), ('AP', 'Amapá', 'Norte'), ('RR', 'Roraima', 'Norte'),
  ('RO', 'Rondônia', 'Norte'), ('AC', 'Acre', 'Norte'), ('TO', 'Tocantins', 'Norte');

INSERT INTO transportadora (codigo, nome, tipo, planilha_propria) VALUES
  ('spfly',    'SPfly',         'parceira',      true),
  ('jamef',    'Jamef',         'parceira',      true),
  ('certex',   'Certex',        'parceira',      true),
  ('frota',    'Frota interna', 'modal_proprio', false),
  ('lalamove', 'Lalamove',      'modal_proprio', false);

INSERT INTO tipo_nota (nome, fora_do_cruzamento) VALUES ('REMANEJAMENTO FISCAL', true);

COMMIT;
