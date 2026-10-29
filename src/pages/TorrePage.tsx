import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { RankingTransportadoras, ordenarRanking } from '../components/torre/RankingTransportadoras';
import { FontesModal } from '../components/torre/FontesModal';
import { OcorrenciasPanel } from '../components/torre/OcorrenciasPanel';
import { type LinhaMatriz } from '../components/torre/MatrizTransportadoras';
import { RemessaPainel } from '../components/torre/RemessaPainel';
import { KpiNotasModal, type LinhaKpi } from '../components/torre/KpiNotasModal';
import { integrationService } from '../services/integrationService';
import {
  MODAIS_PROPRIOS,
  TRANSPORTADORAS,
  formatBrDate,
  useEntregas,
  type EntregaNfSituacao,
  type EntregaNota,
} from '../services/entregasImport';
import { useExpedicao } from '../services/expedicaoImport';
import { useRetencaoFiscal } from '../services/retencaoFiscalImport';
import { nomeNoRomaneio, useRomaneio } from '../services/romaneioImport';
import { SLA_STATUS, resumirSla, useSla, type NotaSla } from '../services/sla';
import {
  LIMITE_CRITICO,
  META_SLA,
  TIPOS_OCORRENCIA,
  analisarRomaneio,
  montarAVencer,
  montarFontes,
  montarOcorrencias,
  situacaoFonte,
  type Ocorrencia,
  type TipoOcorrencia,
} from '../services/torre';
import { useEntregasNotas } from '../hooks/useEntregasNotas';
import { dataBr, useDiaAtivo } from '../services/diaAtivo';
import { formatDateTimeBr } from '../services/tratativaService';
import { businessToday } from '../utils/businessDay';
import { dentroDoPeriodo, isoLocal } from '../utils/periodo';

type Tom = 'sucesso' | 'atencao' | 'perigo' | '';

type KpiTorre =
  | 'emitidas'
  | 'prazo'
  | 'vencidas'
  | 'sem_rastreio'
  | 'transportadora'
  | 'retencao'
  | 'transito'
  | 'outras'
  | 'divergentes';

interface Cartao {
  id: KpiTorre;
  rotulo: string;
  valor: string;
  sub: string;
  tom: Tom;
  desativado?: boolean;
}

const SITUACAO_NF: Record<EntregaNfSituacao, { label: string; tom: LinhaKpi['tom'] }> = {
  entregue: { label: 'Entregue', tom: 'success' },
  mesmo_dia: { label: 'Entregue no mesmo dia', tom: 'success' },
  devolvida: { label: 'Devolução', tom: 'warning' },
  em_transito: { label: 'Em trânsito', tom: 'info' },
  sem_rastreio: { label: 'Sem rastreio', tom: 'danger' },
};

const TOM_SLA: Record<string, LinhaKpi['tom']> = { success: 'success', danger: 'danger', warning: 'warning', info: 'info' };
const TOM_PRIORIDADE: Record<Ocorrencia['prioridade'], LinhaKpi['tom']> = { critica: 'danger', alta: 'warning', media: 'info' };

const destinoDe = (cidade: string, uf: string, alternativa = '') =>
  cidade ? `${cidade}${uf ? `/${uf}` : ''}` : uf || alternativa || '—';

const transportadoraDaNota = (n: EntregaNota) =>
  TRANSPORTADORAS.find((t) => t.id === n.entrega.transportadora)?.label ||
  MODAIS_PROPRIOS.find((m) => m.id === n.entrega.modal)?.label ||
  n.transportadoraIntelipost ||
  '—';

const linhaDaNota = (n: EntregaNota, valor: string, situacao = SITUACAO_NF[n.entrega.situacao]): LinhaKpi => ({
  chave: n.id,
  nf: n.nf,
  transportadora: transportadoraDaNota(n),
  destino: destinoDe(n.cidade, n.uf, n.cliente),
  situacao: situacao.label,
  tom: situacao.tom,
  valor,
});

const linhaDoSla = (n: NotaSla, valor: string): LinhaKpi => {
  const s = SLA_STATUS.find((x) => x.id === n.status)!;
  return {
    chave: `${n.transportadora}-${n.nf}`,
    nf: n.nf,
    transportadora: TRANSPORTADORAS.find((t) => t.id === n.transportadora)?.label ?? n.transportadora,
    destino: destinoDe(n.cidade, n.uf, n.destinatario),
    situacao: s.label,
    tom: TOM_SLA[s.tone] ?? '',
    valor,
  };
};

const linhaDaOcorrencia = (o: Ocorrencia, valor: string): LinhaKpi => ({
  chave: o.id,
  nf: o.nf,
  transportadora: o.transportadora,
  destino: o.destino !== '—' ? o.destino : o.destinatario || '—',
  situacao: TIPOS_OCORRENCIA.find((t) => t.id === o.tipo)!.label,
  tom: TOM_PRIORIDADE[o.prioridade],
  valor,
});

const ORDEM_AVALIADA: Record<string, number> = { vencida: 0, atrasada: 1, no_prazo: 2 };
const du = (n: number | null) => (n === null ? '—' : `${n} d.u.`);

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pctDecimal = (valor: number | null) =>
  valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const tomSla = (valor: number | null): Tom => (valor === null ? '' : valor >= META_SLA ? 'sucesso' : valor >= 85 ? 'atencao' : 'perigo');

export const TorrePage: React.FC = () => {
  const { metrics, integrations, hasDataset, filters, isLoading, refreshData, isRefreshing } = useApp();
  const { navigate } = useRouter();
  const diaAtivo = useDiaAtivo();
  const somenteLeitura = diaAtivo !== null;
  const hoje = diaAtivo?.data ?? businessToday();
  const entregas = useEntregas();
  const expedicao = useExpedicao();
  const retencaoFiscal = useRetencaoFiscal();
  const romaneio = useRomaneio();
  const { notas: notasSla } = useSla();
  const todasNotas = useEntregasNotas();
  const info = useMemo(() => integrationService.info(), [integrations]);

  const [fontesAbertas, setFontesAbertas] = useState(false);
  const [tipoOcorrencia, setTipoOcorrencia] = useState<TipoOcorrencia | null>(null);
  const [remessa, setRemessa] = useState<string | null>(null);
  const [kpiAberto, setKpiAberto] = useState<KpiTorre | null>(null);

  const doPeriodo = useMemo(
    () => todasNotas.filter((n) => dentroDoPeriodo(n.emissao.slice(0, 10), filters.emissaoDe, filters.emissaoAte)),
    [todasNotas, filters.emissaoDe, filters.emissaoAte],
  );

  /** Com o cruzamento carregado, tudo segue as NFs (e triangulares) emitidas no período; sem ele, vale a planilha inteira. */
  const noPeriodo = useMemo(() => {
    if (!hasDataset) return () => true;
    const nfs = new Set(doPeriodo.flatMap((n) => [n.nf, n.nfTriangular].filter(Boolean)));
    return (nf: string) => nfs.has(nf);
  }, [hasDataset, doPeriodo]);

  const slaPeriodo = useMemo(() => notasSla.filter((n) => noPeriodo(n.nf)), [notasSla, noPeriodo]);
  const resumoSla = useMemo(() => resumirSla(slaPeriodo), [slaPeriodo]);
  const carregadas = TRANSPORTADORAS.filter(({ id }) => entregas.transportadoras[id]);

  const fontes = montarFontes({
    hasDataset,
    cruzamento: info,
    totalNotas: metrics?.total ?? null,
    entregas,
    expedicao,
    retencao: retencaoFiscal,
    romaneio,
  });
  const referencia = diaAtivo?.data ?? isoLocal(new Date());
  const situacoes = fontes.map((f) => situacaoFonte(f, referencia).tom);
  const pendentes = fontes.filter((_, i) => ['falta', 'antiga'].includes(situacoes[i]));
  const emDia = situacoes.filter((s) => s === 'ok').length;
  const tomFontes: Tom = situacoes.includes('falta') ? 'perigo' : situacoes.includes('antiga') ? 'atencao' : 'sucesso';
  const ultimaAtualizacao = fontes
    .map((f) => f.importadoEm)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  const ocorrencias = useMemo(
    () =>
      montarOcorrencias({
        slaPeriodo,
        entregas,
        integrations,
        noPeriodo,
        hoje,
        emRetencao: (nf) => Boolean(retencaoFiscal?.porNf[nf]),
        romaneio: romaneio?.porNf,
      }),
    [slaPeriodo, entregas, integrations, noPeriodo, hoje, retencaoFiscal, romaneio],
  );
  const aVencer = useMemo(() => montarAVencer(slaPeriodo, hoje), [slaPeriodo, hoje]);
  const retencaoResumo = useMemo(() => {
    const notas = Object.values(retencaoFiscal?.porNf ?? {});
    const retidas = notas.filter((n) => !n.efetivada).length;
    return { retidas, liberadas: notas.length - retidas };
  }, [retencaoFiscal]);
  const naCentral = useMemo(() => [...ocorrencias, ...aVencer], [ocorrencias, aVencer]);
  const analiseRomaneio = useMemo(
    () =>
      analisarRomaneio(romaneio, entregas, (emissao) =>
        !filters.emissaoDe && !filters.emissaoAte ? true : dentroDoPeriodo(emissao, filters.emissaoDe, filters.emissaoAte),
      ),
    [romaneio, entregas, filters.emissaoDe, filters.emissaoAte],
  );

  const funil = useMemo(() => {
    if (!hasDataset) {
      // Sem o cruzamento, a rua vem direto das planilhas das transportadoras.
      const vencidas = slaPeriodo.filter((n) => n.status === 'vencida').length;
      const emTransito = slaPeriodo.filter((n) => n.status === 'em_transito').length + vencidas;
      return { emTransito, vencidasNaRua: vencidas };
    }
    const emTransito = doPeriodo.filter((n) => n.entrega.situacao === 'em_transito');
    const vencidasNaRua = emTransito.filter((n) => {
      const previsao = n.entrega.evento?.previsao?.slice(0, 10);
      return previsao && previsao < hoje;
    }).length;
    return { emTransito: emTransito.length, vencidasNaRua };
  }, [hasDataset, doPeriodo, slaPeriodo, hoje]);

  const matriz = useMemo<LinhaMatriz[]>(() => {
    const carriers = TRANSPORTADORAS.flatMap(({ id, label }) => {
      const lista = slaPeriodo.filter((n) => n.transportadora === id);
      if (!lista.length) return [];
      const r = resumirSla(lista);
      return [
        {
          id,
          label,
          volume: r.total,
          entregues: r.porStatus.no_prazo + r.porStatus.atrasada,
          percentual: r.percentual,
          vencidas: r.porStatus.vencida,
          atrasoMedio: r.atrasoMedio,
        },
      ];
    });
    const modais = MODAIS_PROPRIOS.flatMap(({ id, label }) => {
      const lista = doPeriodo.filter((n) => n.entrega.modal === id);
      if (!lista.length) return [];
      return [
        {
          id,
          label,
          volume: lista.length,
          entregues: lista.filter((n) => n.entrega.situacao === 'entregue' || n.entrega.situacao === 'mesmo_dia').length,
          percentual: null,
          vencidas: null,
          atrasoMedio: null,
          modal: true,
        },
      ];
    });
    return [...carriers, ...modais];
  }, [slaPeriodo, doPeriodo]);

  const semNada = !hasDataset && !entregas.transacoes && carregadas.length === 0 && !expedicao;
  const cabecalho = (
    <header className="page-header torre-cabecalho app-cabecalho">
      <div>
        <h1 className="page-title">Torre de Controle</h1>
      </div>
      <div className="page-header-actions torre-cabecalho-meta">
        <dl className="torre-meta">
          <div>
            <dt>Última atualização</dt>
            <dd>{ultimaAtualizacao ? formatDateTimeBr(ultimaAtualizacao) : '—'}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="btn btn-outline btn-sm torre-fontes-btn"
          onClick={refreshData}
          disabled={isRefreshing}
          title="Reler planilhas salvas e recalcular tudo sem precisar reenviar"
        >
          <span className={`torre-fontes-ponto ${isRefreshing ? 'carregando' : 'sucesso'}`} aria-hidden="true" />
          {isRefreshing ? 'Atualizando...' : 'Atualizar dados'}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm torre-fontes-btn"
          onClick={() => setFontesAbertas(true)}
          title="Saúde das fontes: quando cada planilha foi atualizada"
        >
          <span className={`torre-fontes-ponto ${tomFontes}`} aria-hidden="true" />
          Fontes: {emDia} de {fontes.length} em dia
        </button>
      </div>
    </header>
  );

  const modais = (
    <>
      {fontesAbertas && (
        <FontesModal
          fontes={fontes}
          referencia={referencia}
          somenteLeitura={somenteLeitura}
          onEnviar={() => navigate('/dashboard')}
          onClose={() => setFontesAbertas(false)}
        />
      )}
    </>
  );

  if (semNada) {
    return (
      <div className="page-home page-torre">
        {cabecalho}
        {modais}
        <EstadoVazio
          titulo={somenteLeitura ? 'Nenhuma planilha salva neste dia' : 'Envie as planilhas do dia para montar a Torre de Controle'}
          texto={
            somenteLeitura
              ? 'Neste dia nenhuma planilha de cruzamento, transportadora ou expedição tinha sido carregada.'
              : 'A Torre junta as notas emitidas, as transportadoras e a expedição numa visão só, da emissão à entrega.'
          }
          passos={
            somenteLeitura
              ? undefined
              : [
                  <>Envie a <b>Alloca07</b> para montar a base de notas.</>,
                  <>Envie os relatórios da <b>SPfly</b>, <b>Jamef</b> e <b>Certex</b>.</>,
                  <>Opcional: o <b>Relatório de Expedição</b>, para medir a saída do CD.</>,
                ]
          }
          acoes={somenteLeitura ? undefined : [{ label: 'Ir para o Início', onClick: () => navigate('/dashboard') }]}
        />
      </div>
    );
  }

  const carregando = isLoading && hasDataset && !metrics;
  const comCruzamento = hasDataset && metrics;

  const comTransportadora = doPeriodo.filter((n) => n.entrega.situacao !== 'sem_rastreio').length;
  const gapMeta =
    resumoSla.percentual === null ? null : Math.round((resumoSla.percentual - META_SLA) * 10) / 10;

  const etapas: Cartao[] = [
    {
      id: 'transportadora',
      rotulo: 'Transportadora',
      valor: hasDataset ? fmt(comTransportadora) : '—',
      sub: carregadas.length ? 'SPfly, Jamef ou Certex' : 'Envie uma transportadora',
      tom: '',
      desativado: !hasDataset,
    },
    {
      id: 'retencao',
      rotulo: 'Retenção fiscal',
      valor: retencaoFiscal ? fmt(retencaoResumo.retidas) : '—',
      sub: retencaoFiscal
        ? `${fmt(retencaoResumo.liberadas)} ${retencaoResumo.liberadas === 1 ? 'liberada' : 'liberadas'}`
        : 'Envie a planilha de Retenção Fiscal',
      tom: !retencaoFiscal ? '' : retencaoResumo.retidas ? 'atencao' : 'sucesso',
      desativado: !retencaoFiscal || retencaoResumo.retidas === 0,
    },
    {
      id: 'transito',
      rotulo: 'Em trânsito',
      valor: fmt(funil.emTransito),
      sub: funil.vencidasNaRua ? `${fmt(funil.vencidasNaRua)} com a previsão vencida` : 'Ainda dentro da previsão',
      tom: funil.vencidasNaRua ? 'perigo' : '',
      desativado: funil.emTransito === 0,
    },
  ];

  const conta = (tipo: TipoOcorrencia, prioridades?: string[]) =>
    ocorrencias.filter((o) => o.tipo === tipo && (!prioridades || prioridades.includes(o.prioridade))).length;

  const vencidas = conta('vencida');
  const criticas = conta('vencida', ['critica']);
  const semRastreio = conta('sem_rastreio');
  const semRastreioAntigas = conta('sem_rastreio', ['alta']);

  const macro: Cartao[] = [
    {
      id: 'emitidas',
      rotulo: 'Notas emitidas',
      valor: comCruzamento ? fmt(metrics.allocaTotal) : '—',
      sub: comCruzamento ? '' : 'Envie a Alloca07',
      tom: '',
      desativado: !comCruzamento,
    },
    {
      id: 'prazo',
      rotulo: 'Entregas no prazo',
      valor: pctDecimal(resumoSla.percentual),
      sub:
        resumoSla.percentual === null
          ? 'Sem notas avaliadas'
          : `Meta ${META_SLA}%${gapMeta !== null ? `, ${gapMeta > 0 ? '+' : ''}${gapMeta.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.` : ''}`,
      tom: tomSla(resumoSla.percentual),
      desativado: resumoSla.percentual === null,
    },
    {
      id: 'vencidas',
      rotulo: 'Vencidas sem entrega',
      valor: carregadas.length ? fmt(vencidas) : '—',
      sub: carregadas.length ? `${fmt(criticas)} acima de ${LIMITE_CRITICO} d.u.` : 'Envie as transportadoras',
      tom: criticas ? 'perigo' : vencidas ? 'atencao' : carregadas.length ? 'sucesso' : '',
      desativado: !carregadas.length,
    },
    {
      id: 'sem_rastreio',
      rotulo: 'Sem rastreio',
      valor: carregadas.length && hasDataset ? fmt(semRastreio) : '—',
      sub: !hasDataset || !carregadas.length ? 'Falta Alloca07 ou transportadora' : 'Fora das planilhas',
      tom: semRastreioAntigas ? 'perigo' : semRastreio ? 'atencao' : carregadas.length && hasDataset ? 'sucesso' : '',
      desativado: !(carregadas.length && hasDataset),
    },
  ];

  const { outras, divergentes } = analiseRomaneio;
  const cartoesRomaneio: Cartao[] = [
    {
      id: 'outras',
      rotulo: 'Outras transportadoras',
      valor: fmt(outras.length),
      sub: 'Fora do sem rastreio',
      tom: '',
      desativado: outras.length === 0,
    },
    {
      id: 'divergentes',
      rotulo: 'Romaneio divergente',
      valor: fmt(divergentes.length),
      sub: divergentes.length ? 'Saiu numa, está em outra' : 'Romaneio bate com as planilhas',
      tom: divergentes.length ? 'atencao' : 'sucesso',
      desativado: divergentes.length === 0,
    },
  ];

  const listaDoKpi = (id: KpiTorre): { titulo: string; sub: string; coluna: string; linhas: LinhaKpi[] } => {
    switch (id) {
      case 'outras':
        return {
          titulo: 'Outras transportadoras',
          sub: 'Saíram no romaneio com transportadora fora da SPfly, Jamef e Certex. Não contam como sem rastreio.',
          coluna: 'Emissão',
          linhas: [...outras]
            .sort((a, b) => nomeNoRomaneio(a.nota).localeCompare(nomeNoRomaneio(b.nota)) || b.nota.emissao.localeCompare(a.nota.emissao))
            .map(({ nf, nota }) => ({
              chave: `outra-${nf}`,
              nf,
              transportadora: nomeNoRomaneio(nota),
              destino: destinoDe(nota.cidade, nota.uf, nota.cliente),
              situacao: `Romaneio ${nota.romaneio || '—'}`,
              tom: '',
              valor: nota.emissao ? formatBrDate(nota.emissao) : '—',
            })),
        };
      case 'divergentes':
        return {
          titulo: 'Romaneio divergente',
          sub: 'Saíram com uma transportadora no romaneio e aparecem na planilha de outra. Para entrega e SLA, vale a planilha.',
          coluna: 'Na planilha',
          linhas: divergentes.map((d) => ({
            chave: `div-${d.naPlanilha}-${d.nf}`,
            nf: d.nf,
            transportadora: TRANSPORTADORAS.find((t) => t.id === d.naPlanilha)?.label ?? d.naPlanilha,
            destino: destinoDe(d.nota.cidade, d.nota.uf, d.nota.cliente),
            situacao: `Romaneio diz ${nomeNoRomaneio(d.nota)}`,
            tom: 'warning',
            valor: d.dataEntrega ? `Entregue ${formatBrDate(d.dataEntrega.slice(0, 10))}` : 'Sem entrega ainda',
          })),
        };
      case 'emitidas':
        return {
          titulo: 'Notas emitidas',
          sub: 'NFs da Alloca07 emitidas no período, as mais recentes primeiro.',
          coluna: 'Emissão',
          linhas: [...doPeriodo].sort((a, b) => b.emissao.localeCompare(a.emissao)).map((n) => linhaDaNota(n, formatBrDate(n.emissao))),
        };
      case 'prazo':
        return {
          titulo: 'Entregas avaliadas no SLA',
          sub: `Vencidas e atrasadas primeiro. Meta ${META_SLA}% no prazo.`,
          coluna: 'Previsão',
          linhas: slaPeriodo
            .filter((n) => n.status in ORDEM_AVALIADA)
            .sort((a, b) => ORDEM_AVALIADA[a.status] - ORDEM_AVALIADA[b.status] || (b.atraso ?? 0) - (a.atraso ?? 0))
            .map((n) => linhaDoSla(n, `${formatBrDate(n.previsao)}${n.atraso ? `, +${n.atraso} d.u.` : ''}`)),
        };
      case 'vencidas':
        return {
          titulo: 'Vencidas sem entrega',
          sub: 'A previsão da transportadora passou e ainda não há entrega.',
          coluna: 'Atraso',
          linhas: ocorrencias.filter((o) => o.tipo === 'vencida').map((o) => linhaDaOcorrencia(o, du(o.diasParado))),
        };
      case 'sem_rastreio':
        return {
          titulo: 'Sem rastreio',
          sub: 'Estão na Alloca07 e não aparecem na SPfly, Jamef ou Certex.',
          coluna: 'Desde a emissão',
          linhas: ocorrencias.filter((o) => o.tipo === 'sem_rastreio').map((o) => linhaDaOcorrencia(o, du(o.diasParado))),
        };
      case 'transportadora':
        return {
          titulo: 'Na transportadora',
          sub: 'NFs do período que aparecem nas planilhas da SPfly, Jamef ou Certex.',
          coluna: 'Previsão',
          linhas: doPeriodo
            .filter((n) => n.entrega.situacao !== 'sem_rastreio')
            .map((n) => linhaDaNota(n, n.entrega.evento?.previsao ? formatBrDate(n.entrega.evento.previsao) : '—')),
        };
      case 'retencao':
        return {
          titulo: 'Em retenção fiscal',
          sub: `Ainda retidas. ${fmt(retencaoResumo.liberadas)} já liberadas ficam fora desta lista. Nenhuma conta no SLA da transportadora.`,
          coluna: 'Status da retenção',
          linhas: Object.entries(retencaoFiscal?.porNf ?? {})
            .filter(([, n]) => !n.efetivada)
            .map(([nf, n]) => ({
              chave: `retencao-${nf}`,
              nf,
              transportadora: TRANSPORTADORAS.find((t) => entregas.transportadoras[t.id]?.porNf[nf]?.length)?.label ?? '—',
              destino: destinoDe(n.cidade, n.uf, n.cliente),
              situacao: 'Retida',
              tom: 'warning' as const,
              valor: n.status || '—',
            })),
        };
      case 'transito':
        if (!hasDataset) {
          return {
            titulo: 'Em trânsito',
            sub: 'Sem a Alloca07, vem direto das planilhas das transportadoras.',
            coluna: 'Previsão',
            linhas: slaPeriodo
              .filter((n) => n.status === 'em_transito' || n.status === 'vencida')
              .sort((a, b) => a.previsao.localeCompare(b.previsao))
              .map((n) => linhaDoSla(n, formatBrDate(n.previsao))),
          };
        }
        return {
          titulo: 'Em trânsito',
          sub: 'Vencidas na rua primeiro, depois pela previsão mais próxima.',
          coluna: 'Previsão',
          linhas: doPeriodo
            .filter((n) => n.entrega.situacao === 'em_transito')
            .map((n) => ({ n, previsao: n.entrega.evento?.previsao?.slice(0, 10) ?? '' }))
            .sort((a, b) => (a.previsao || '9999').localeCompare(b.previsao || '9999'))
            .map(({ n, previsao }) =>
              linhaDaNota(
                n,
                previsao ? formatBrDate(previsao) : '—',
                previsao && previsao < hoje ? { label: 'Previsão vencida', tom: 'danger' } : SITUACAO_NF.em_transito,
              ),
            ),
        };
    }
  };
  const listaAberta = kpiAberto ? listaDoKpi(kpiAberto) : null;

  const ranking = ordenarRanking(matriz);

  const renderFaixa = (c: Cartao) => {
    const corpo = (
      <>
        <span className="app-faixa-rotulo">{c.rotulo}</span>
        <span className="app-faixa-valor">{carregando ? <span className="torre-skeleton" aria-label="Carregando" /> : c.valor}</span>
        {c.sub ? (
          <span className="app-faixa-sub" title={c.sub}>
            {c.sub}
          </span>
        ) : null}
      </>
    );
    const ativo = kpiAberto === c.id;
    return (
      <button
        key={c.id}
        type="button"
        className={`app-faixa ${c.tom} ${ativo ? 'ativo' : ''}`}
        onClick={() => setKpiAberto(c.id)}
        disabled={c.desativado || carregando}
        aria-haspopup="dialog"
        title={c.desativado ? undefined : `Abrir a lista: ${c.rotulo.toLowerCase()}`}
      >
        {corpo}
      </button>
    );
  };

  return (
    <div className="page-home page-torre app-cockpit">
      {cabecalho}
      {modais}
      {listaAberta && (
        <KpiNotasModal
          key={kpiAberto}
          titulo={listaAberta.titulo}
          sub={listaAberta.sub}
          coluna={listaAberta.coluna}
          linhas={listaAberta.linhas}
          onAbrirNf={(nf) => {
            setKpiAberto(null);
            setRemessa(nf);
          }}
          onClose={() => setKpiAberto(null)}
        />
      )}

      {somenteLeitura ? (
        <div className="home-alerta leitura" role="status">
          <span>Você está vendo a Torre de {dataBr(diaAtivo!.data)} (somente leitura).</span>
        </div>
      ) : (
        pendentes.length > 0 && (
          <div className="home-alerta" role="status">
            <span>
              Atualize hoje: {pendentes.map((f) => f.nome).join(', ')}. Os números abaixo dependem delas.
              {carregadas.length === 0 && ' Sem planilha de transportadora, SLA e vencidas ficam sem dados.'}
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFontesAbertas(true)}>
              Ver fontes
            </button>
          </div>
        )
      )}

      <div className={`app-cockpit-faixas ${romaneio ? 'com-romaneio' : ''}`}>
        <section className="app-cockpit-grupo app-cockpit-grupo-macro" aria-labelledby="macro-titulo">
          <div className="app-secao-topo">
            <h2 className="torre-secao-titulo" id="macro-titulo">
              Como está a operação
            </h2>
          </div>
          <div className="app-regua">{macro.map((c) => renderFaixa(c))}</div>
        </section>

        <section className="app-cockpit-grupo app-cockpit-grupo-funil" aria-labelledby="funil-titulo">
          <div className="app-secao-topo">
            <h2 className="torre-secao-titulo" id="funil-titulo">
              Funil das notas
            </h2>
          </div>
          <div className="app-funil">{etapas.map((e) => renderFaixa(e))}</div>
        </section>

        {romaneio && (
          <section className="app-cockpit-grupo app-cockpit-grupo-romaneio" aria-labelledby="romaneio-titulo">
            <div className="app-secao-topo">
              <h2 className="torre-secao-titulo" id="romaneio-titulo">
                Romaneio
              </h2>
            </div>
            <div className="app-funil app-funil-romaneio">{cartoesRomaneio.map((c) => renderFaixa(c))}</div>
          </section>
        )}
      </div>

      <div className={`app-cockpit-corpo ${remessa ? 'com-remessa' : ''}`}>
        <div className="app-cockpit-principal">
          <OcorrenciasPanel
            ocorrencias={naCentral}
            tipo={tipoOcorrencia}
            onTipo={setTipoOcorrencia}
            onAbrirRemessa={setRemessa}
            nfAtiva={remessa}
          />
        </div>

        <div className="app-cockpit-lateral">
          {remessa ? (
            <RemessaPainel
              nf={remessa}
              ocorrencias={naCentral.filter((o) => o.nf === remessa)}
              onClose={() => setRemessa(null)}
              embutido
            />
          ) : (
          <section className="app-ranking-painel" aria-labelledby="ranking-titulo">
            <div className="app-secao-topo">
              <h2 className="torre-secao-titulo" id="ranking-titulo">
                Ranking de transportadoras
              </h2>
              <span className="app-ranking-meta">Meta {META_SLA}%</span>
            </div>
            {ranking.length === 0 ? (
              <div className="home-vazio">
                <span>Envie as planilhas das transportadoras para ver o ranking.</span>
              </div>
            ) : (
              <RankingTransportadoras
                linhas={ranking}
                dica="Ver as entregas da"
                onSelecionar={(id) => navigate('/entregas', { transportadora: id })}
              />
            )}
          </section>
          )}
        </div>
      </div>
    </div>
  );
};
