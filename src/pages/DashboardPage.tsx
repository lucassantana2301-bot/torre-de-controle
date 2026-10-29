import React, { useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { integrationService } from '../services/integrationService';
import {
  TRANSPORTADORAS,
  entregasStore,
  formatBrDate,
  importTransportadoraFile,
  useEntregas,
} from '../services/entregasImport';
import { expedicaoStore, importExpedicaoFile, useExpedicao } from '../services/expedicaoImport';
import { importRetencaoFile, retencaoStore, useRetencaoFiscal, type RetencaoImport } from '../services/retencaoFiscalImport';
import { importRomaneioFile, romaneioStore, useRomaneio } from '../services/romaneioImport';
import { useEntregasNotas } from '../hooks/useEntregasNotas';
import { dataBr, useDiaAtivo } from '../services/diaAtivo';
import { DIAS_A_VENCER, SLA_STATUS, diasAtePrevisao, resumirSla, useSla, type NotaSla, type SlaStatus } from '../services/sla';
import { useTratativas } from '../services/tratativaService';
import type { Integration } from '../types';
import { TratativaPanel } from '../components/common/TratativaPanel';
import { acaoOcorrencia, impactoOcorrencia, montarOcorrencias, problemaOcorrencia, PRIORIDADES, type Ocorrencia } from '../services/torre';
import { businessToday } from '../utils/businessDay';
import { dentroDoPeriodo, isoLocal } from '../utils/periodo';
import { primeiroNome, useUsuario } from '../services/usuario';

interface Planilha {
  id: string;
  nome: string;
  detalhe: string;
  saude: string;
  importadoEm: string | null;
  arquivo: string | null;
  carregada: boolean;
  opcional?: boolean;
  enviar: ((file: File) => Promise<void>) | null;
}

type SituacaoPlanilha = 'ok' | 'carregada' | 'antiga' | 'falta' | 'opcional';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const qtd = (n: number, um: string, varios: string) => `${fmt(n)} ${n === 1 ? um : varios}`;

const LIMITE_FILA = 6;
const LIMITE_MODAL = 200;

type PainelKpi = 'transito' | 'entregues' | 'atrasadas' | 'ocorrencias' | 'prazo' | 'venceHoje';

interface ItemFila {
  chave: string;
  nf: string | null;
  titulo: string;
  problema: string;
  impacto: string;
  acao: string;
  prioridade: 'critica' | 'alta' | 'media';
  grupo: 'criticos' | 'urgentes' | 'evitar';
  botao: string;
}

interface LinhaModal {
  chave: string;
  nf: string;
  transportadora: string;
  destino: string;
  quando: string;
  situacao: string;
  tom: string;
}

interface AcaoPasso {
  rotulo: string;
  onClick: () => void;
  desativado?: boolean;
  ativo?: boolean;
}

interface Passo {
  id: string;
  titulo: string;
  valor: string;
  sub: string;
  estado: 'feito' | 'pendente' | 'info' | 'bloqueado' | 'espera';
  tom: 'sucesso' | 'atencao' | 'perigo' | '';
  acoes: AcaoPasso[];
}

interface Tratando {
  id: string;
  nf: string;
  nome: string;
}

function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

function situacaoPlanilha(p: Planilha): { tom: SituacaoPlanilha; texto: string } {
  if (!p.carregada) return p.opcional ? { tom: 'opcional', texto: 'Opcional' } : { tom: 'falta', texto: 'Falta enviar' };
  if (!p.importadoEm) return { tom: 'carregada', texto: 'Carregada' };
  const quando = new Date(p.importadoEm);
  if (isoLocal(quando) === isoLocal(new Date())) {
    return { tom: 'ok', texto: `Hoje ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` };
  }
  return { tom: p.opcional ? 'carregada' : 'antiga', texto: `De ${dataBr(isoLocal(quando)).slice(0, 5)}` };
}

const nomeTransportadora = (id: string) => TRANSPORTADORAS.find((t) => t.id === id)?.label ?? id;

const idTratativa = (nf: string, integrations: Integration[]) =>
  integrations.find((item) => item.metadata?.notaFiscal === nf || item.id === `NF-${nf}`)?.id ?? `NF-${nf}`;

const destinoNota = (cidade: string, uf: string, destinatario = '') =>
  cidade ? `${cidade}${uf ? ` / ${uf}` : ''}` : uf || destinatario || '—';

const rotuloStatus = (status: SlaStatus) => SLA_STATUS.find((item) => item.id === status)?.label ?? status;
const tomStatus = (status: SlaStatus) => SLA_STATUS.find((item) => item.id === status)?.tone ?? '';

const linhaDaNota = (nota: NotaSla, quando: string): LinhaModal => ({
  chave: `${nota.transportadora}-${nota.nf}`,
  nf: nota.nf,
  transportadora: nomeTransportadora(nota.transportadora),
  destino: destinoNota(nota.cidade, nota.uf, nota.destinatario),
  quando,
  situacao: rotuloStatus(nota.status),
  tom: tomStatus(nota.status),
});

const resumoOcorrencia = (o: Ocorrencia) => {
  const partes = [`NF ${o.nf}`];
  if (o.transportadora !== '—') partes.push(o.transportadora);
  if (o.tipo === 'sem_rastreio') partes.push('fora da transportadora');
  if (o.diasParado !== null) partes.push(`${o.diasParado} d.u.`);
  return partes.join(' · ');
};

const grupoDaPrioridade = (prioridade: Ocorrencia['prioridade']): ItemFila['grupo'] =>
  prioridade === 'critica' ? 'criticos' : prioridade === 'alta' ? 'urgentes' : 'evitar';

const itemDaOcorrencia = (o: Ocorrencia): ItemFila => ({
  chave: o.id,
  nf: o.nf,
  titulo: resumoOcorrencia(o),
  problema: problemaOcorrencia(o),
  impacto: impactoOcorrencia(o),
  acao: acaoOcorrencia(o),
  prioridade: o.prioridade,
  grupo: grupoDaPrioridade(o.prioridade),
  botao: 'Tratar',
});

const retencaoTexto = (retencao: RetencaoImport) => {
  const notas = Object.values(retencao.porNf);
  const retidas = notas.filter((n) => !n.efetivada).length;
  const liberadas = notas.length - retidas;
  return `${qtd(retidas, 'retida', 'retidas')}, ${qtd(liberadas, 'liberada', 'liberadas')}`;
};

const saudePlanilha = (registros: number | null, erros = 0) => {
  if (registros === null) return '';
  const base = qtd(registros, 'NF', 'NFs');
  return erros > 0 ? `${base} · ${fmt(erros)} sem NF` : base;
};

const BlocoPlanilha: React.FC<{ planilha: Planilha; somenteLeitura: boolean; onAbrirCruzamento: () => void }> = ({
  planilha,
  somenteLeitura,
  onAbrirCruzamento,
}) => {
  const { addToast } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = React.useState(false);
  const situacao = situacaoPlanilha(planilha);

  const receber = async (file: File | undefined) => {
    if (!file || !planilha.enviar) return;
    setLendo(true);
    try {
      await planilha.enviar(file);
      addToast('success', planilha.nome, `${file.name} carregada.`);
    } catch (erro) {
      addToast('error', `Não foi possível ler ${planilha.nome}`, erro instanceof Error ? erro.message : String(erro));
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <button
      type="button"
      className={`home-bloco ${situacao.tom}`}
      disabled={somenteLeitura || lendo}
      onClick={() => (planilha.enviar ? inputRef.current?.click() : onAbrirCruzamento())}
      onDragOver={(e) => {
        if (planilha.enviar && !somenteLeitura) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!planilha.enviar || somenteLeitura) return;
        e.preventDefault();
        receber(e.dataTransfer.files[0]);
      }}
      title={[planilha.arquivo, planilha.detalhe, planilha.saude, somenteLeitura ? '' : 'Clique ou arraste o arquivo para enviar']
        .filter(Boolean)
        .join('\n')}
    >
      <span className={`home-bloco-ponto ${situacao.tom}`} aria-hidden="true" />
      <span className="home-bloco-nome">{planilha.nome}</span>
      <span className={`home-bloco-quando ${situacao.tom}`}>{lendo ? 'Lendo…' : situacao.texto}</span>
      {planilha.saude && <span className="home-bloco-saude">{planilha.saude}</span>}
      {planilha.enviar && (
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => receber(e.target.files?.[0])}
        />
      )}
    </button>
  );
};

export const DashboardPage: React.FC = () => {
  const { metrics, integrations, hasDataset, openUpload, filters, zerarDadosDeHoje, addToast } = useApp();
  const { navigate } = useRouter();
  const usuario = useUsuario();
  const diaAtivo = useDiaAtivo();
  const somenteLeitura = diaAtivo !== null;
  const [zerando, setZerando] = React.useState(false);
  const [kpiAberto, setKpiAberto] = React.useState<PainelKpi | null>(null);
  const [tratando, setTratando] = React.useState<Tratando | null>(null);
  const tratativas = useTratativas();

  const zerarParaHoje = async () => {
    if (
      !window.confirm(
        'Guardar no Banco de dados o que está carregado e limpar as planilhas para enviar as de hoje?\n\nAs tratativas e o histórico continuam.',
      )
    )
      return;
    setZerando(true);
    try {
      await zerarDadosDeHoje();
      addToast('success', 'Pronto para hoje', 'Os dados foram guardados no banco. Envie as planilhas de hoje.');
    } catch (erro) {
      addToast('error', 'Não foi possível zerar', erro instanceof Error ? erro.message : String(erro));
    } finally {
      setZerando(false);
    }
  };
  const hoje = diaAtivo?.data ?? businessToday();
  const entregas = useEntregas();
  const expedicao = useExpedicao();
  const retencao = useRetencaoFiscal();
  const romaneio = useRomaneio();
  const todasEntregas = useEntregasNotas();

  const { notas: notasSla } = useSla();
  const temTransportadora = TRANSPORTADORAS.some(({ id }) => entregas.transportadoras[id]);

  const doPeriodo = useMemo(
    () => todasEntregas.filter((n) => dentroDoPeriodo(n.emissao.slice(0, 10), filters.emissaoDe, filters.emissaoAte)),
    [todasEntregas, filters.emissaoDe, filters.emissaoAte],
  );

  const noPeriodo = useMemo(() => {
    if (!hasDataset) return () => true;
    const nfs = new Set(doPeriodo.flatMap((n) => [n.nf, n.nfTriangular].filter(Boolean)));
    return (nf: string) => nfs.has(nf);
  }, [hasDataset, doPeriodo]);

  const slaPeriodo = useMemo(() => notasSla.filter((n) => noPeriodo(n.nf)), [notasSla, noPeriodo]);
  const resumo = useMemo(() => resumirSla(slaPeriodo), [slaPeriodo]);
  const aVencer = useMemo(
    () =>
      slaPeriodo
        .flatMap((nota) => {
          const falta = diasAtePrevisao(nota, hoje);
          return falta === null ? [] : [{ nota, falta }];
        })
        .sort(
          (a, b) =>
            a.falta - b.falta || a.nota.previsao.localeCompare(b.nota.previsao) || a.nota.nf.localeCompare(b.nota.nf, undefined, { numeric: true }),
        ),
    [slaPeriodo, hoje],
  );

  const ocorrencias = useMemo(
    () =>
      montarOcorrencias({
        slaPeriodo,
        entregas,
        integrations,
        noPeriodo,
        hoje,
        emRetencao: (nf) => Boolean(retencao?.porNf[nf]),
        romaneio: romaneio?.porNf,
      }),
    [slaPeriodo, entregas, integrations, noPeriodo, hoje, retencao, romaneio],
  );
  const abertas = ocorrencias.filter((o) => !tratativas[idTratativa(o.nf, integrations)]?.tratado);
  const criticas = abertas.filter((o) => o.prioridade === 'critica').length;
  const vencemHoje = useMemo(
    () => slaPeriodo.filter((nota) => nota.status === 'em_transito' && nota.previsao.slice(0, 10) === hoje),
    [slaPeriodo, hoje],
  );
  const entreguesHoje = slaPeriodo.filter((n) => n.dataEntrega.slice(0, 10) === hoje).length;

  const info = useMemo(() => integrationService.info(), [integrations]);

  const planilhas = useMemo<Planilha[]>(
    () => [
      {
        id: 'cruzamento',
        nome: 'Alloca07',
        detalhe: hasDataset && metrics ? `${qtd(metrics.total, 'nota', 'notas')} no período` : 'Notas emitidas',
        saude: hasDataset && metrics ? qtd(metrics.total, 'nota', 'notas') : 'Falta para montar a base',
        importadoEm: hasDataset ? info?.importadoEm ?? null : null,
        arquivo: info?.arquivos.join(' + ') ?? null,
        carregada: hasDataset,
        enviar: null,
      },
      ...TRANSPORTADORAS.map(({ id, label }): Planilha => {
        const planilha = entregas.transportadoras[id];
        return {
          id,
          nome: label,
          detalhe: planilha ? qtd(Object.keys(planilha.porNf).length, 'NF', 'NFs') : 'Relatório de entregas da transportadora',
          saude: planilha ? saudePlanilha(Object.keys(planilha.porNf).length, planilha.semNf ?? 0) : 'Aguardando envio',
          importadoEm: planilha?.importadoEm ?? null,
          arquivo: planilha?.fileName ?? null,
          carregada: Boolean(planilha),
          opcional: true,
          enviar: async (file) => entregasStore.setTransportadora(id, await importTransportadoraFile(file)),
        };
      }),
      {
        id: 'expedicao',
        nome: 'Expedição',
        detalhe: expedicao ? qtd(expedicao.total, 'nota expedida', 'notas expedidas') : 'Usada só no Painel de SLA',
        saude: expedicao ? qtd(expedicao.total, 'nota', 'notas') : 'Opcional no SLA',
        importadoEm: expedicao?.importadoEm ?? null,
        arquivo: expedicao?.fileName ?? null,
        carregada: Boolean(expedicao),
        opcional: true,
        enviar: async (file) => expedicaoStore.set(await importExpedicaoFile(file)),
      },
      {
        id: 'retencao',
        nome: 'Retenção fiscal',
        detalhe: retencao ? retencaoTexto(retencao) : 'Tira essas notas da conta do SLA',
        saude: retencao ? retencaoTexto(retencao) : 'Tira do SLA',
        importadoEm: retencao?.importadoEm ?? null,
        arquivo: retencao?.fileName ?? null,
        carregada: Boolean(retencao),
        opcional: true,
        enviar: async (file) => retencaoStore.set(await importRetencaoFile(file)),
      },
      {
        id: 'romaneio',
        nome: 'Romaneio',
        detalhe: romaneio ? qtd(romaneio.total, 'NF com transportadora', 'NFs com transportadora') : 'Com qual transportadora cada NF saiu',
        saude: romaneio ? qtd(romaneio.total, 'NF', 'NFs') : 'Valida a transportadora',
        importadoEm: romaneio?.importadoEm ?? null,
        arquivo: romaneio?.fileName ?? null,
        carregada: Boolean(romaneio),
        opcional: true,
        enviar: async (file) => romaneioStore.set(await importRomaneioFile(file)),
      },
    ],
    [hasDataset, metrics, info, entregas, expedicao, retencao, romaneio],
  );

  const prazo =
    resumo.percentual === null ? '—' : `${resumo.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const tomPrazo =
    resumo.percentual === null ? '' : resumo.percentual >= 95 ? 'sucesso' : resumo.percentual >= 85 ? 'atencao' : 'perigo';

  const tratarNf = (nf: string, nome: string) => setTratando({ id: idTratativa(nf, integrations), nf, nome });
  const abrirKpi = (id: PainelKpi) => {
    setTratando(null);
    setKpiAberto((atual) => (atual === id ? null : id));
  };

  const linhasKpi = useMemo(() => {
    const porData = (campo: 'previsao' | 'dataEntrega') => (a: NotaSla, b: NotaSla) => b[campo].localeCompare(a[campo]);
    if (kpiAberto === 'transito') {
      return slaPeriodo
        .filter((nota) => nota.status === 'em_transito')
        .sort((a, b) => a.previsao.localeCompare(b.previsao))
        .map((nota) => linhaDaNota(nota, nota.previsao ? formatBrDate(nota.previsao) : '—'));
    }
    if (kpiAberto === 'entregues') {
      return slaPeriodo
        .filter((nota) => nota.dataEntrega.slice(0, 10) === hoje)
        .sort(porData('dataEntrega'))
        .map((nota) => linhaDaNota(nota, nota.dataEntrega ? formatBrDate(nota.dataEntrega) : '—'));
    }
    if (kpiAberto === 'venceHoje') {
      return vencemHoje
        .sort((a, b) => a.previsao.localeCompare(b.previsao) || a.nf.localeCompare(b.nf, undefined, { numeric: true }))
        .map((nota) => linhaDaNota(nota, formatBrDate(nota.previsao)));
    }
    if (kpiAberto === 'atrasadas') {
      return slaPeriodo
        .filter((nota) => nota.status === 'vencida')
        .sort((a, b) => (b.atraso ?? 0) - (a.atraso ?? 0))
        .map((nota) => linhaDaNota(nota, nota.atraso ? `${nota.atraso} d.u.` : '—'));
    }
    if (kpiAberto === 'prazo') {
      return slaPeriodo
        .filter((nota) => nota.status === 'no_prazo')
        .sort(porData('dataEntrega'))
        .map((nota) => linhaDaNota(nota, nota.dataEntrega ? formatBrDate(nota.dataEntrega) : '—'));
    }
    if (kpiAberto === 'ocorrencias') {
      return abertas.map((o) => ({
        chave: o.id,
        nf: o.nf,
        transportadora: o.transportadora,
        destino: o.destino !== '—' ? o.destino : o.destinatario || '—',
        quando: o.diasParado === null ? '—' : `${o.diasParado} d.u.`,
        situacao: o.tipo === 'vencida' ? 'Vencida sem entrega' : 'Fora da transportadora',
        tom: o.prioridade === 'critica' ? 'danger' : o.prioridade === 'alta' ? 'warning' : 'info',
      }));
    }
    return [];
  }, [kpiAberto, slaPeriodo, abertas, vencemHoje, hoje]);

  const indicadores: {
    id: string;
    rotulo: string;
    valor: string;
    extra?: string;
    tom: string;
    liberado: boolean;
    ir: () => void;
  }[] = [
    {
      id: 'atrasadas',
      rotulo: 'Entregas atrasadas',
      valor: temTransportadora ? fmt(resumo.porStatus.vencida) : '—',
      extra: criticas ? `${fmt(criticas)} críticas` : 'previsão passou, sem entrega',
      tom: !temTransportadora ? '' : criticas || resumo.porStatus.vencida ? 'perigo' : 'sucesso',
      liberado: temTransportadora,
      ir: () => abrirKpi('atrasadas'),
    },
    {
      id: 'ocorrencias',
      rotulo: 'Ocorrências abertas',
      valor: temTransportadora || hasDataset ? fmt(abertas.length) : '—',
      extra: 'ainda sem tratativa',
      tom: !(temTransportadora || hasDataset) ? '' : abertas.length ? 'perigo' : 'sucesso',
      liberado: temTransportadora || hasDataset,
      ir: () => abrirKpi('ocorrencias'),
    },
    {
      id: 'venceHoje',
      rotulo: 'Vencem hoje',
      valor: temTransportadora ? fmt(vencemHoje.length) : '—',
      extra: aVencer.length > vencemHoje.length ? `${fmt(aVencer.length)} em até ${DIAS_A_VENCER} d.u.` : 'evitar novo atraso',
      tom: !temTransportadora ? '' : vencemHoje.length ? 'atencao' : 'sucesso',
      liberado: temTransportadora,
      ir: () => abrirKpi('venceHoje'),
    },
    {
      id: 'transito',
      rotulo: 'Entregas em trânsito',
      valor: temTransportadora ? fmt(resumo.porStatus.em_transito) : '—',
      extra: 'ainda dentro da previsão',
      tom: temTransportadora ? 'info' : '',
      liberado: temTransportadora,
      ir: () => abrirKpi('transito'),
    },
    {
      id: 'prazo',
      rotulo: 'Entregas no prazo',
      valor: prazo,
      extra: temTransportadora && entreguesHoje ? `${fmt(entreguesHoje)} concluídas hoje` : 'desempenho do período',
      tom: temTransportadora ? tomPrazo : '',
      liberado: temTransportadora,
      ir: () => abrirKpi('prazo'),
    },
  ];

  const indicador = (id: PainelKpi) => indicadores.find((c) => c.id === id)!;
  const acaoKpi = (id: PainelKpi, rotulo: string): AcaoPasso => {
    const c = indicador(id);
    return { rotulo: `${rotulo} ${c.valor}`, onClick: c.ir, desativado: !c.liberado, ativo: kpiAberto === id };
  };

  const idsDaRotina = new Set<string>(['cruzamento', ...TRANSPORTADORAS.map(({ id }) => id)]);
  const essenciais = planilhas.filter((p) => idsDaRotina.has(p.id));
  const faltamFontes = essenciais.filter((p) => situacaoPlanilha(p).tom !== 'ok').map((p) => p.nome);
  const vencemHojeAbertas = vencemHoje.filter((n) => !tratativas[idTratativa(n.nf, integrations)]?.tratado).length;
  const comDados = temTransportadora || hasDataset;

  const passoFontes: Passo = {
    id: 'fontes',
    titulo: 'Atualizar as planilhas',
    valor: `${essenciais.length - faltamFontes.length} de ${essenciais.length}`,
    sub: faltamFontes.length ? `Falta: ${faltamFontes.join(', ')}` : 'Todas de hoje',
    estado: faltamFontes.length ? 'pendente' : 'feito',
    tom: faltamFontes.length ? 'atencao' : 'sucesso',
    acoes: [
      ...(!hasDataset && !somenteLeitura ? [{ rotulo: 'Enviar Alloca07', onClick: openUpload }] : []),
      {
        rotulo: 'Ver fontes',
        onClick: () =>
          document
            .querySelector<HTMLButtonElement>('#planilhas .home-bloco.falta, #planilhas .home-bloco.antiga, #planilhas .home-bloco')
            ?.focus(),
      },
    ],
  };
  const passoConferir: Passo = {
    id: 'conferir',
    titulo: 'Conferir a operação',
    valor: temTransportadora ? prazo : '—',
    sub: temTransportadora ? 'no prazo, meta 95%' : 'Depende das planilhas das transportadoras',
    estado: temTransportadora ? 'info' : 'bloqueado',
    tom: temTransportadora ? (tomPrazo as Passo['tom']) : '',
    acoes: [acaoKpi('transito', 'Em trânsito'), acaoKpi('prazo', 'No prazo'), { rotulo: 'Abrir a Torre', onClick: () => navigate('/torre') }],
  };
  const passoResolver: Passo = {
    id: 'resolver',
    titulo: 'Resolver as críticas',
    valor: comDados ? fmt(criticas) : '—',
    sub: comDados ? `${qtd(abertas.length, 'ocorrência', 'ocorrências')} sem tratativa` : 'Depende das planilhas',
    estado: !comDados ? 'bloqueado' : criticas ? 'pendente' : 'feito',
    tom: !comDados ? '' : criticas ? 'perigo' : 'sucesso',
    acoes: [acaoKpi('atrasadas', 'Atrasadas'), acaoKpi('ocorrencias', 'Ocorrências')],
  };
  const passoPrevenir: Passo = {
    id: 'prevenir',
    titulo: 'Prevenir atrasos',
    valor: temTransportadora ? fmt(vencemHojeAbertas) : '—',
    sub: !temTransportadora
      ? 'Depende das planilhas das transportadoras'
      : aVencer.length > vencemHoje.length
        ? `vencem hoje sem tratativa, ${fmt(aVencer.length)} em até ${DIAS_A_VENCER} d.u.`
        : 'vencem hoje sem tratativa',
    estado: !temTransportadora ? 'bloqueado' : vencemHojeAbertas ? 'pendente' : 'feito',
    tom: !temTransportadora ? '' : vencemHojeAbertas ? 'atencao' : 'sucesso',
    acoes: [acaoKpi('venceHoje', 'Vencem hoje')],
  };
  const fechaveis = [passoFontes, passoResolver, passoPrevenir];
  const feitosParaFechar = fechaveis.filter((p) => p.estado === 'feito').length;
  const passoFechar: Passo = {
    id: 'fechar',
    titulo: 'Fechar o dia',
    valor: feitosParaFechar === fechaveis.length ? 'Pronto' : `${feitosParaFechar} de ${fechaveis.length}`,
    sub:
      feitosParaFechar === fechaveis.length
        ? 'Tudo em dia. O banco de dados já guardou.'
        : 'Conclua os passos 1, 3 e 4. O banco guarda o dia sozinho.',
    estado: feitosParaFechar === fechaveis.length ? 'feito' : 'espera',
    tom: feitosParaFechar === fechaveis.length ? 'sucesso' : '',
    acoes: [],
  };
  const passos = [passoFontes, passoConferir, passoResolver, passoPrevenir, passoFechar];
  const passoAgora = passos.find((p) => p.estado === 'pendente')?.id ?? null;
  const ROTULO_ESTADO: Record<Passo['estado'], string> = {
    feito: 'Feito',
    pendente: 'Pendente',
    info: 'Para conferir',
    bloqueado: 'Aguardando planilhas',
    espera: 'Aguardando os outros passos',
  };

  const titulosKpi: Record<PainelKpi, { titulo: string; sub: string; coluna: string }> = {
    transito: { titulo: 'Entregas em trânsito', sub: 'Ainda dentro da previsão da transportadora.', coluna: 'Previsão' },
    entregues: { titulo: 'Entregas concluídas hoje', sub: 'Notas com data de entrega neste dia.', coluna: 'Entrega' },
    atrasadas: { titulo: 'Entregas atrasadas', sub: 'A previsão passou e ainda não há entrega.', coluna: 'Atraso' },
    ocorrencias: { titulo: 'Ocorrências abertas', sub: 'Vencidas e notas emitidas que não aparecem na transportadora, ainda sem tratativa.', coluna: 'Parado' },
    prazo: { titulo: 'Entregues no prazo', sub: 'Chegaram até a data prevista pela transportadora.', coluna: 'Entrega' },
    venceHoje: { titulo: 'Vencem hoje', sub: 'Em trânsito com previsão para hoje.', coluna: 'Previsão' },
  };

  const fila = useMemo<ItemFila[]>(() => {
    const itens: ItemFila[] = abertas.map(itemDaOcorrencia);
    const usadas = new Set(itens.map((item) => item.nf).filter(Boolean));
    for (const nota of vencemHoje) {
      if (usadas.has(nota.nf)) continue;
      itens.push({
        chave: `vence-${nota.transportadora}-${nota.nf}`,
        nf: nota.nf,
        titulo: `NF ${nota.nf} · ${nomeTransportadora(nota.transportadora)}`,
        problema: `A previsão da ${nomeTransportadora(nota.transportadora)} é hoje.`,
        impacto: 'Prioridade média · evitar um novo atraso',
        acao: `Confirmar se a entrega sai hoje e, se não sair, cobrar posição da ${nomeTransportadora(nota.transportadora)}.`,
        prioridade: 'media',
        grupo: 'evitar',
        botao: 'Tratar',
      });
    }
    if (!hasDataset) {
      itens.push({
        chave: 'planilha-alloca',
        nf: null,
        titulo: 'Alloca07',
        problema: 'A base de notas emitidas ainda não foi enviada.',
        impacto: 'Sem a Alloca07 não dá para cruzar o que ficou fora da transportadora.',
        acao: 'Enviar a exportação da Alloca07 do período.',
        prioridade: 'alta',
        grupo: 'urgentes',
        botao: 'Enviar',
      });
    }
    for (const { id, label } of TRANSPORTADORAS) {
      const planilha = entregas.transportadoras[id];
      if (!planilha?.importadoEm) continue;
      if (isoLocal(new Date(planilha.importadoEm)) === isoLocal(new Date())) continue;
      itens.push({
        chave: `planilha-${id}`,
        nf: null,
        titulo: label,
        problema: `O relatório é de ${dataBr(isoLocal(new Date(planilha.importadoEm))).slice(0, 5)}.`,
        impacto: 'As atrasadas podem estar defasadas.',
        acao: `Enviar o relatório de entregas de hoje da ${label}.`,
        prioridade: 'alta',
        grupo: 'urgentes',
        botao: 'Atualizar',
      });
    }
    const ordem: Record<ItemFila['grupo'], number> = { criticos: 0, urgentes: 1, evitar: 2 };
    return itens.sort((a, b) => ordem[a.grupo] - ordem[b.grupo]).slice(0, LIMITE_FILA);
  }, [abertas, vencemHoje, hasDataset, entregas]);

  const gruposFila = [
    { id: 'criticos' as const, rotulo: 'Críticos' },
    { id: 'urgentes' as const, rotulo: 'Urgentes' },
    { id: 'evitar' as const, rotulo: 'Evitar' },
  ].map((grupo) => ({ ...grupo, itens: fila.filter((item) => item.grupo === grupo.id) }));

  const filaResolver = (
    <section className="home-painel app-resolver" aria-label="Resolver agora">
      <div className="home-resolver">
        <div>
          <h2>Resolver agora</h2>
          <p className="home-resolver-sub">
            {fila.length === 0
              ? 'Nada pendente com as planilhas carregadas.'
              : `${qtd(fila.length, 'pendência', 'pendências')}, críticas primeiro.`}
          </p>
        </div>
        {fila.length > 0 && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setKpiAberto('ocorrencias')}>
            Ver todas
          </button>
        )}
      </div>
      <div className="app-painel-corpo">
        {gruposFila.map((grupo) =>
          grupo.itens.length === 0 ? null : (
            <div key={grupo.id} className="home-fila-grupo">
              <h3>{grupo.rotulo}</h3>
              <ul className="home-fila">
                {grupo.itens.map((item) => {
                  const prioridade = PRIORIDADES.find((p) => p.id === item.prioridade)!;
                  return (
                    <li key={item.chave}>
                      <article className="home-fila-card">
                        <span className={`home-ponto ${prioridade.tom}`} aria-hidden="true" />
                        <div className="home-fila-corpo">
                          <div className="home-fila-topo">
                            <strong>{item.titulo}</strong>
                            <span className={`status-badge ${prioridade.tom}`}>{prioridade.label}</span>
                          </div>
                          <p>{item.problema}</p>
                          <p className="home-fila-impacto">{item.impacto}</p>
                          <p className="home-fila-acao">{item.acao}</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            if (item.nf) tratarNf(item.nf, item.titulo);
                            else if (item.chave === 'planilha-alloca') openUpload();
                            else {
                              const id = item.chave.replace('planilha-', '');
                              const alvo = planilhas.find((p) => p.id === id);
                              if (alvo) addToast('info', alvo.nome, 'Envie o relatório de hoje neste bloco, à esquerda.');
                            }
                          }}
                        >
                          {item.botao}
                        </button>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </div>
          ),
        )}
      </div>
    </section>
  );

  return (
    <div className="page-home page-inicio app-cockpit">
      <header className="home-boas-vindas">
        <div className="home-boas-vindas-texto">
          <p className="home-boas-vindas-saudacao">
            {saudacao()}
            {usuario ? `, ${primeiroNome(usuario.nome)}` : ''}. Hoje é{' '}
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.
          </p>
          <h1>Bem-vindo ao ArkTransp</h1>
          <p className="home-boas-vindas-sub">Seu sistema de informações centralizado</p>
        </div>
        <img className="home-boas-vindas-marca" src="/inicio/arklok-simbolo.png" alt="" aria-hidden="true" />
      </header>

      {diaAtivo && (
        <div className="home-alerta leitura">
          <span>Dia {dataBr(diaAtivo.data)}, somente leitura.</span>
        </div>
      )}

      <section className="home-rotina" aria-labelledby="rotina-titulo">
        <div className="app-secao-topo">
          <h2 className="torre-secao-titulo" id="rotina-titulo">
            Rotina do dia
          </h2>
          <span className="home-rotina-status">
            {passoAgora ? `Agora: ${passos.find((p) => p.id === passoAgora)!.titulo.toLowerCase()}` : 'Nada pendente na rotina'}
          </span>
        </div>
        <ol className="home-rotina-passos">
          {passos.map((p, i) => (
            <li
              key={p.id}
              className={`home-passo ${p.estado} ${p.tom} ${passoAgora === p.id ? 'agora' : ''}`}
              aria-current={passoAgora === p.id ? 'step' : undefined}
            >
              <div className="home-passo-topo">
                <span className="home-passo-marca" aria-hidden="true">
                  {p.estado === 'feito' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="5 12.5 10 17.5 19 7.5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="home-passo-titulo">{p.titulo}</span>
                <span className="app-oculto">{passoAgora === p.id ? `${ROTULO_ESTADO[p.estado]}, é o passo de agora` : ROTULO_ESTADO[p.estado]}</span>
                <span className="home-passo-valor">{p.valor}</span>
              </div>
              <span className="home-passo-sub" title={p.sub}>
                {p.sub}
              </span>
              {p.acoes.length > 0 && (
                <div className="home-passo-acoes">
                  {p.acoes.map((a) => (
                    <button
                      key={a.rotulo}
                      type="button"
                      className={`home-passo-acao ${a.ativo ? 'ativo' : ''}`}
                      onClick={a.onClick}
                      disabled={a.desativado}
                      aria-pressed={a.ativo}
                    >
                      {a.rotulo}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="app-cockpit-corpo">
        <div className="app-cockpit-principal">
          {kpiAberto ? (
            <PainelLista
              key={kpiAberto}
              titulo={titulosKpi[kpiAberto].titulo}
              sub={titulosKpi[kpiAberto].sub}
              coluna={titulosKpi[kpiAberto].coluna}
              linhas={linhasKpi}
              integrations={integrations}
              tratando={tratando}
              onTratar={tratarNf}
              onVoltar={() => setTratando(null)}
              onClose={() => {
                setTratando(null);
                setKpiAberto(null);
              }}
            />
          ) : tratando ? (
            <section className="home-painel app-tratativa" aria-labelledby="tratativa-titulo">
              <div className="home-painel-topo home-painel-topo-linha">
                <div>
                  <h2 id="tratativa-titulo">Tratativa · NF {tratando.nf}</h2>
                  <p>{tratando.nome}</p>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setTratando(null)}>
                  Voltar à fila
                </button>
              </div>
              <div className="app-painel-corpo">
                <TratativaPanel integrationId={tratando.id} notaAtual={tratando.nf} autoFocus onSaved={() => setTratando(null)} />
              </div>
            </section>
          ) : (
            filaResolver
          )}
        </div>

        <div className="app-cockpit-lateral">
          <section className="home-painel home-planilhas" id="planilhas">
            <div className="home-painel-topo home-painel-topo-linha">
              <h2>Fontes do dia</h2>
              {!somenteLeitura && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm home-zerar"
                  disabled={zerando || !planilhas.some((p) => p.carregada)}
                  onClick={zerarParaHoje}
                  title="Guarda no Banco de dados o que está carregado e limpa as planilhas para a importação de hoje"
                >
                  {zerando ? 'Guardando…' : 'Zerar para atualizar hoje'}
                </button>
              )}
            </div>
            <div className="home-blocos">
              {planilhas.map((p) => (
                <BlocoPlanilha key={p.id} planilha={p} somenteLeitura={somenteLeitura} onAbrirCruzamento={openUpload} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const PainelTratativa: React.FC<{ tratando: Tratando; onVoltar: () => void }> = ({ tratando, onVoltar }) => (
  <div className="home-tratativa">
    <button type="button" className="btn btn-outline btn-sm" onClick={onVoltar}>
      Voltar à lista
    </button>
    <TratativaPanel integrationId={tratando.id} notaAtual={tratando.nf} autoFocus onSaved={onVoltar} />
  </div>
);

const PainelLista: React.FC<{
  titulo: string;
  sub: string;
  coluna: string;
  linhas: LinhaModal[];
  integrations: Integration[];
  tratando: Tratando | null;
  onTratar: (nf: string, nome: string) => void;
  onVoltar: () => void;
  onClose: () => void;
}> = ({ titulo, sub, coluna, linhas, integrations, tratando, onTratar, onVoltar, onClose }) => {
  const tratativas = useTratativas();
  const [busca, setBusca] = React.useState('');
  const termo = busca.trim().toLowerCase();
  const filtradas = linhas.filter(
    (linha) =>
      !termo ||
      linha.nf.includes(termo) ||
      linha.transportadora.toLowerCase().includes(termo) ||
      linha.destino.toLowerCase().includes(termo) ||
      linha.situacao.toLowerCase().includes(termo),
  );
  const visiveis = filtradas.slice(0, LIMITE_MODAL);

  return (
    <section className="home-painel app-lista-kpi" aria-labelledby="lista-kpi-titulo">
      <div className="home-painel-topo home-painel-topo-linha">
        <div>
          <h2 id="lista-kpi-titulo">{titulo}</h2>
          <p>
            {sub} {qtd(linhas.length, 'nota', 'notas')}.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
          Voltar à fila
        </button>
      </div>
      <div className="app-painel-corpo">
      {tratando ? (
        <PainelTratativa tratando={tratando} onVoltar={onVoltar} />
      ) : (
        <>
          <input
            type="search"
            className="ui-campo home-modal-busca"
            placeholder="NF, transportadora, destino ou situação"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
          {filtradas.length === 0 ? (
            <p className="bi-vazio">Nenhuma nota nesta lista.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Transportadora</th>
                    <th>Destino</th>
                    <th>{coluna}</th>
                    <th>Situação</th>
                    <th>Tratativa</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((linha) => {
                    const tratado = Boolean(tratativas[idTratativa(linha.nf, integrations)]?.tratado);
                    return (
                      <tr key={linha.chave}>
                        <td>
                          <code className="id-badge">{linha.nf}</code>
                        </td>
                        <td>{linha.transportadora}</td>
                        <td>{linha.destino}</td>
                        <td>{linha.quando}</td>
                        <td>
                          <span className={`status-badge ${linha.tom === 'neutral' ? '' : linha.tom}`}>{linha.situacao}</span>
                        </td>
                        <td>
                          <span className={`status-badge ${tratado ? 'success' : 'warning'}`}>{tratado ? 'Tratado' : 'Pendente'}</span>
                        </td>
                        <td>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => onTratar(linha.nf, `${linha.transportadora} · ${linha.destino}`)}>
                            Tratar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {filtradas.length > LIMITE_MODAL && (
            <p className="home-nota">
              Mostrando {LIMITE_MODAL} de {fmt(filtradas.length)}. Use a busca para achar a NF.
            </p>
          )}
        </>
      )}
      </div>
    </section>
  );
};
