import React, { useMemo, useState } from 'react';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { useApp } from '../context/AppContext';
import { ticketsDaIntegracao, useTicketsPorNf } from '../hooks/useTicketsPorNf';
import { useRouter } from '../router/useRouter';
import { LISTA } from '../router/secao';
import {
  JANELA_RECORTE,
  inicioDaJanela,
  recorteSugerido,
  resumirConciliacao,
  type RecorteConciliacao,
} from '../services/conciliacao';
import { integrationService } from '../services/integrationService';
import { formatDateTimeBr, useTratativas } from '../services/tratativaService';
import { businessToday } from '../utils/businessDay';
import { rotuloPeriodo } from '../utils/periodo';
import { useDiaAtivo } from '../services/diaAtivo';
import {
  Barras,
  BarrasLista,
  Botao,
  Cabecalho,
  Colunas,
  Destaque,
  ListaAcoes,
  Pagina,
  Painel,
  Segmentado,
  type ItemAcao,
  type Tom,
} from '../ui/componentes';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pctTxt = (valor: number | null) =>
  valor === null ? '—' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const PESO_TOM: Record<Tom, number> = { perigo: 0, atencao: 1, sucesso: 2, '': 3 };
const IDADE_ANTIGA = new Set(['8_15', '16']);

const RECORTES: { id: RecorteConciliacao; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

export const IntegrationsDashPage: React.FC = () => {
  const { metrics, integrations, hasDataset, openUpload, filters, isLoading } = useApp();
  const { navigate } = useRouter();
  const tratativas = useTratativas();
  const ticketsPorNf = useTicketsPorNf();
  const diaAtivo = useDiaAtivo();
  const hoje = diaAtivo?.data ?? businessToday();
  const info = useMemo(() => integrationService.info(), [integrations]);
  const todasOperacionais = useMemo(() => integrationService.operacionais(), [integrations]);
  const [recorte, setRecorte] = useState<RecorteConciliacao | 'auto'>('auto');

  const recorteEfetivo = useMemo<RecorteConciliacao>(() => {
    if (recorte !== 'auto') return recorte;
    return recorteSugerido(integrations.map((i) => (i.metadata?.dataEmissao ?? '').slice(0, 10)));
  }, [integrations, recorte]);

  const resumo = useMemo(
    () =>
      resumirConciliacao(integrations, {
        recorte: recorteEfetivo,
        hoje,
        tratativas,
        ticketsPorNf,
        ticketsDe: (item) => (ticketsPorNf ? ticketsDaIntegracao(item, ticketsPorNf) : []),
        periodo: { de: filters.emissaoDe, ate: filters.emissaoAte },
        todasOperacionais,
      }),
    [integrations, recorteEfetivo, hoje, tratativas, ticketsPorNf, filters.emissaoDe, filters.emissaoAte, todasOperacionais],
  );

  const irLista = (extra?: Record<string, string>) => navigate('/integrations', extra ?? LISTA);

  const cabecalho = (
    <Cabecalho
      eyebrow="Operação / Integração"
      titulo="Integrações de NF"
      sub={
        <>
          Alloca07 × Intelipost · {rotuloPeriodo(filters.emissaoDe, filters.emissaoAte)}
          {info?.importadoEm ? ` · atualizado ${formatDateTimeBr(info.importadoEm)}` : ''}
        </>
      }
      acoes={
        <>
          <Botao onClick={() => irLista()}>Abrir lista</Botao>
          <Botao primario onClick={openUpload}>
            Enviar planilhas
          </Botao>
        </>
      }
    />
  );

  if (!hasDataset || (!metrics && !isLoading)) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          titulo="Envie a Alloca07 e a Intelipost"
          texto="O painel mostra o que chegou na Intelipost e o que ainda está só na Alloca07."
          passos={[
            <>Envie as duas planilhas do dia.</>,
            <>A taxa é integradas ÷ emitidas. “Só Intelipost” fica fora dessa conta.</>,
            <>Clique num número ou numa barra para abrir a lista já filtrada.</>,
          ]}
          acoes={[{ label: 'Enviar planilhas', onClick: openUpload }]}
        />
      </Pagina>
    );
  }

  const vs = resumo.vsAnterior;
  const antigas = resumo.idade.filter((f) => IDADE_ANTIGA.has(f.chave)).reduce((s, f) => s + f.valor, 0);

  const acoes: ItemAcao[] = [
    {
      id: 'antigas',
      rotulo: 'Não integradas há mais de 8 dias',
      valor: fmt(antigas),
      texto: 'Emitidas na Alloca07 e ainda fora da Intelipost',
      tom: 'perigo' as Tom,
      onClick: () => irLista({ status: 'pending' }),
    },
    {
      id: 'sem_tratativa',
      rotulo: 'Não integradas sem tratativa',
      valor: fmt(resumo.pendentesSemTratativa),
      texto: `de ${fmt(resumo.naoIntegradas)} não integradas`,
      tom: 'atencao' as Tom,
      onClick: () => irLista({ status: 'pending', tratativa: 'pendente' }),
    },
    ...(resumo.semTicket !== null
      ? [
          {
            id: 'sem_ticket',
            rotulo: 'Não integradas sem ticket',
            valor: fmt(resumo.semTicket),
            texto: 'Sem romaneio aberto no Zendesk',
            tom: 'atencao' as Tom,
            onClick: () => irLista({ status: 'pending', ticket: 'sem_ticket' }),
          },
        ]
      : []),
    {
      id: 'so_intelipost',
      rotulo: 'Só na Intelipost',
      valor: fmt(resumo.soIntelipost),
      texto: 'Sem par na Alloca07 · fora da taxa',
      tom: 'atencao' as Tom,
      onClick: () => irLista({ status: 'intelipost_only' }),
    },
  ]
    .filter((a) => a.valor !== '0')
    .sort((a, b) => PESO_TOM[a.tom] - PESO_TOM[b.tom]);

  const comEmissao = resumo.tendencia.filter((p) => p.chave !== 'sem_data');
  const ultima = comEmissao.at(-1)?.chave ?? '';
  const inicio = ultima ? inicioDaJanela(ultima, recorteEfetivo) : '';
  const barras = comEmissao.filter((p) => p.chave >= inicio);

  return (
    <Pagina>
      {cabecalho}

      <div className="ui-hero">
        <Destaque
          rotulo="Taxa de conciliação"
          valor={pctTxt(resumo.taxa)}
          tom={resumo.naoIntegradas ? 'atencao' : 'sucesso'}
          tag={
            resumo.naoIntegradas
              ? { texto: `${fmt(resumo.naoIntegradas)} fora da Intelipost`, tom: 'atencao' }
              : { texto: 'Tudo integrado', tom: 'sucesso' }
          }
          apoio={`${fmt(resumo.integradas)} integradas de ${fmt(resumo.emitidas)} emitidas na Alloca07`}
          partes={[
            {
              id: 'integradas',
              rotulo: 'Integradas',
              valor: resumo.integradas,
              cor: 'sucesso',
              onClick: () => irLista({ status: 'completed' }),
            },
            {
              id: 'nao_integradas',
              rotulo: 'Não integradas',
              valor: resumo.naoIntegradas,
              cor: 'atencao',
              onClick: () => irLista({ status: 'pending' }),
            },
          ]}
          rodape={
            <div className="ui-mini-numeros">
              <div>
                <b>{fmt(resumo.emitidas)}</b>
                <span>
                  emitidas
                  {vs
                    ? resumo.emitidas === vs.emitidas
                      ? ' · igual ao período anterior'
                      : ` · ${resumo.emitidas > vs.emitidas ? '+' : ''}${fmt(resumo.emitidas - vs.emitidas)} vs período anterior`
                    : ''}
                </span>
              </div>
              <div>
                <b>{fmt(resumo.triangulares)}</b>
                <span>integradas pela NF triangular</span>
              </div>
              <div>
                <b>{fmt(resumo.soIntelipost)}</b>
                <span>só na Intelipost (fora da taxa)</span>
              </div>
            </div>
          }
        />

        <ListaAcoes
          titulo="O que resolver agora"
          itens={acoes}
          vazio="Nenhuma nota pendente de integração neste período."
        />
      </div>

      <Colunas>
        <Painel
          titulo="Integração por data de emissão"
          sub={`${JANELA_RECORTE[recorteEfetivo].rotulo} com emissão · notas emitidas e % já integrada`}
          acoes={<Segmentado rotulo="Agrupar por" valor={recorteEfetivo} opcoes={RECORTES} onChange={setRecorte} />}
        >
          {barras.length === 0 ? (
            <p className="ui-vazio">Sem data de emissão nas notas deste período.</p>
          ) : (
            <Barras
              descricao={`Emitidas por ${recorteEfetivo}: ${barras
                .map((p) => `${p.label} ${fmt(p.emitidas)} (${pctTxt(p.percentual)} integrada)`)
                .join(', ')}`}
              pontos={barras.map((p) => ({ chave: p.chave, rotulo: p.label, valor: p.emitidas, percentual: p.percentual }))}
            />
          )}
        </Painel>

        <Painel titulo="Há quanto tempo estão fora" sub="Não integradas pela idade da emissão">
          {resumo.idade.length === 0 ? (
            <p className="ui-vazio">Nenhuma nota pendente de integração.</p>
          ) : (
            <BarrasLista
              itens={resumo.idade.map((f) => ({
                id: f.chave,
                rotulo: f.label,
                valor: f.valor,
                tom: IDADE_ANTIGA.has(f.chave) ? 'perigo' : f.chave === '4_7' ? 'atencao' : '',
                onClick: () => irLista({ status: 'pending' }),
              }))}
            />
          )}
        </Painel>
      </Colunas>

      {resumo.porTipoPendente.length > 0 && (
        <Painel titulo="Não integradas por tipo de nota" sub="Clique para abrir a lista já filtrada pelo tipo.">
          <BarrasLista
            itens={resumo.porTipoPendente.slice(0, 10).map((f) => ({
              id: f.chave,
              rotulo: f.label === '(sem valor)' ? 'Sem tipo' : f.label,
              valor: f.valor,
              onClick: () => irLista({ status: 'pending', tipo: f.chave === '(sem valor)' ? '__sem_tipo__' : f.chave }),
            }))}
          />
        </Painel>
      )}
    </Pagina>
  );
};
