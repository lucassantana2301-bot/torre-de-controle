import React, { useMemo, useState } from 'react';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { RESULTADOS, useConferencia } from '../hooks/useConferencia';
import { useEntregasNotas } from '../hooks/useEntregasNotas';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { LISTA } from '../router/secao';
import {
  FiltroSlaDash,
  SEM_TIPO,
  filtroDeTipo,
  linhasCarrierDash,
  passaSlaDash,
  tendenciaEntregas,
  tipoPorNf,
  type LinhaCarrierDash,
} from '../services/entregasDash';
import { integrationService } from '../services/integrationService';
import { chaveTipo, useTiposOcultos } from '../services/tiposOcultos';
import { TRANSPORTADORAS, useEntregas, type TransportadoraId } from '../services/entregasImport';
import { META_SLA } from '../services/torre';
import { TransportadoraModal } from '../components/entregas/TransportadoraModal';
import { JANELA_RECORTE, inicioDaJanela, type RecorteConciliacao } from '../services/conciliacao';
import { resumirSla, useSla, type SlaStatus } from '../services/sla';
import { useReentregas } from '../services/reentregas';
import { useDiaAtivo } from '../services/diaAtivo';
import { businessToday } from '../utils/businessDay';
import { dentroDoPeriodo, rotuloPeriodo } from '../utils/periodo';
import {
  Barras,
  BarrasMeta,
  Botao,
  Cabecalho,
  Colunas,
  Destaque,
  Filtro,
  Filtros,
  Kpi,
  Kpis,
  ListaAcoes,
  Pagina,
  Painel,
  Secao,
  Segmentado,
  Tag,
  type ItemAcao,
  type ParteComposicao,
  type Tom,
} from '../ui/componentes';

type Coluna = 'label' | 'volume' | 'entregues' | 'percentual' | 'vencidas' | 'atencao';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pctTxt = (valor: number | null) =>
  valor === null ? '—' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const tomSla = (valor: number | null): Tom =>
  valor === null ? '' : valor >= META_SLA ? 'sucesso' : valor >= 85 ? 'atencao' : 'perigo';
const PESO_TOM: Record<Tom, number> = { perigo: 0, atencao: 1, sucesso: 2, '': 3 };

const situacaoCarrier = (l: LinhaCarrierDash): { texto: string; tom: Tom } =>
  l.percentual === null
    ? { texto: 'Sem SLA', tom: '' }
    : l.percentual >= META_SLA
      ? { texto: 'Na meta', tom: 'sucesso' }
      : l.percentual >= 85
        ? { texto: 'Atenção', tom: 'atencao' }
        : { texto: 'Abaixo da meta', tom: 'perigo' };

const COLUNAS: { id: Coluna; label: string; numerica: boolean }[] = [
  { id: 'label', label: 'Transportadora', numerica: false },
  { id: 'volume', label: 'Volume', numerica: true },
  { id: 'entregues', label: 'Entregues', numerica: true },
  { id: 'percentual', label: '% no prazo', numerica: true },
  { id: 'vencidas', label: 'Vencidas', numerica: true },
];

const CARRIERS: { id: TransportadoraId | ''; label: string }[] = [{ id: '', label: 'Todas' }, ...TRANSPORTADORAS];

const SLA_FILTROS: { id: FiltroSlaDash; label: string }[] = [
  { id: '', label: 'Todas' },
  { id: 'no_prazo', label: 'No prazo' },
  { id: 'atrasada', label: 'Com atraso' },
  { id: 'vencida', label: 'Vencida' },
  { id: 'em_transito', label: 'Em trânsito' },
  { id: 'fora', label: 'Fora do SLA' },
];

const RECORTES: { id: RecorteConciliacao; label: string }[] = [
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

const TOM_RESULTADO: Record<string, Tom> = { success: 'sucesso', warning: 'atencao', danger: 'perigo' };

export const EntregasDashPage: React.FC = () => {
  const { navigate } = useRouter();
  const { filters, hasDataset, integrations } = useApp();
  const ocultos = useTiposOcultos();
  const [tipoNota, setTipoNota] = useState('');
  const entregas = useEntregas();
  const conferencia = useConferencia();
  const notasIntegradas = useEntregasNotas();
  const { notas: notasSla } = useSla();
  const reentregas = useReentregas();
  const diaAtivo = useDiaAtivo();
  const [carrier, setCarrier] = useState<TransportadoraId | ''>('');
  const [slaFiltro, setSlaFiltro] = useState<FiltroSlaDash>('');
  const [recorte, setRecorte] = useState<RecorteConciliacao>('semana');
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({ coluna: 'atencao', desc: true });
  const [modal, setModal] = useState<TransportadoraId | null>(null);

  const temFonte = TRANSPORTADORAS.some(({ id }) => entregas.transportadoras[id]);
  const nfsDoPeriodo = useMemo(() => {
    if (!hasDataset) return null;
    return new Set(
      notasIntegradas
        .filter((n) => dentroDoPeriodo(n.emissao.slice(0, 10), filters.emissaoDe, filters.emissaoAte))
        .flatMap((n) => [n.nf, n.nfTriangular].filter(Boolean)),
    );
  }, [hasDataset, notasIntegradas, filters]);

  const tipos = useMemo(() => tipoPorNf(integrationService.todasDoDia()), [integrations, ocultos]);
  const passaSemTipo = useMemo(() => filtroDeTipo(tipos, ocultos, ''), [tipos, ocultos]);
  const passa = useMemo(() => filtroDeTipo(tipos, ocultos, tipoNota), [tipos, ocultos, tipoNota]);

  const slaDoPeriodo = useMemo(
    () => (nfsDoPeriodo ? notasSla.filter((n) => nfsDoPeriodo.has(n.nf)) : notasSla).filter((n) => passaSemTipo(n.nf)),
    [notasSla, nfsDoPeriodo, passaSemTipo],
  );

  const opcoesTipo = useMemo(() => {
    const porTipo = new Map<string, { label: string; notas: number }>();
    for (const n of slaDoPeriodo) {
      const rotulo = tipos.get(n.nf);
      const chave = rotulo ? chaveTipo(rotulo) : SEM_TIPO;
      const atual = porTipo.get(chave) ?? { label: rotulo ?? 'Sem tipo (fora da Alloca07)', notas: 0 };
      atual.notas += 1;
      porTipo.set(chave, atual);
    }
    return [
      { id: '', label: 'Todos' },
      ...[...porTipo]
        .sort(([a, x], [b, y]) => (a === SEM_TIPO ? 1 : b === SEM_TIPO ? -1 : y.notas - x.notas))
        .map(([id, v]) => ({ id, label: `${v.label} (${fmt(v.notas)})` })),
    ];
  }, [slaDoPeriodo, tipos]);

  const slaPeriodo = useMemo(() => (tipoNota ? slaDoPeriodo.filter((n) => passa(n.nf)) : slaDoPeriodo), [slaDoPeriodo, passa, tipoNota]);

  const slaFiltrado = useMemo(
    () => slaPeriodo.filter((n) => (!carrier || n.transportadora === carrier) && passaSlaDash(n.status, slaFiltro)),
    [slaPeriodo, carrier, slaFiltro],
  );

  const sla = useMemo(() => resumirSla(slaFiltrado), [slaFiltrado]);
  const tendencia = useMemo(() => tendenciaEntregas(slaFiltrado, recorte), [slaFiltrado, recorte]);

  const todasLinhas = useMemo(
    () => linhasCarrierDash(slaPeriodo.filter((n) => passaSlaDash(n.status, slaFiltro)), carrier),
    [slaPeriodo, slaFiltro, carrier],
  );

  const linhas = useMemo(() => {
    return [...todasLinhas].sort((a, b) => {
      const va = a[ordem.coluna];
      const vb = b[ordem.coluna];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * (ordem.desc ? -1 : 1);
      }
      if (va === null) return 1;
      if (vb === null) return -1;
      return (Number(va) - Number(vb)) * (ordem.desc ? -1 : 1);
    });
  }, [todasLinhas, ordem]);

  const irLista = (extra?: Record<string, string>) => {
    const base = extra ?? LISTA;
    navigate('/entregas', carrier ? { ...base, transportadora: carrier } : base);
  };
  const irPainel = (situacao?: SlaStatus) =>
    navigate('/painel', {
      ...(situacao ? { situacao } : {}),
      ...(carrier ? { transportadora: carrier } : {}),
    });

  const cabecalho = (
    <Cabecalho
      titulo="Entregas"
      sub={
        <>
          {rotuloPeriodo(filters.emissaoDe, filters.emissaoAte)}
          {conferencia.lista ? `, lista “${conferencia.lista.fileName}”` : ''}
        </>
      }
      acoes={
        <Botao primario onClick={() => irLista()}>
          Abrir conferência
        </Botao>
      }
    />
  );

  if (!temFonte && !conferencia.lista) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          titulo="Envie as planilhas de entrega"
          texto="O painel acompanha o que já foi entregue e o SLA das transportadoras."
          passos={[
            <>Envie a <b>Alloca07</b> no Início.</>,
            <>Envie os relatórios da SPfly, Jamef e Certex.</>,
            <>O período do calendário vale para as notas emitidas.</>,
          ]}
          acoes={[{ label: 'Abrir conferência', onClick: () => irLista() }]}
        />
      </Pagina>
    );
  }

  const entregues = sla.porStatus.no_prazo + sla.porStatus.atrasada;
  const avaliadas = sla.porStatus.no_prazo + sla.porStatus.atrasada + sla.porStatus.vencida;
  const tom = tomSla(sla.percentual);

  const partes: ParteComposicao[] = [
    { id: 'no_prazo', rotulo: 'No prazo', valor: sla.porStatus.no_prazo, cor: 'sucesso', onClick: () => irPainel('no_prazo') },
    { id: 'atrasada', rotulo: 'Com atraso', valor: sla.porStatus.atrasada, cor: 'atencao', onClick: () => irPainel('atrasada') },
    { id: 'vencida', rotulo: 'Vencidas', valor: sla.porStatus.vencida, cor: 'perigo', onClick: () => irPainel('vencida') },
    { id: 'em_transito', rotulo: 'Em trânsito', valor: sla.porStatus.em_transito, cor: 'neutro', onClick: () => irPainel('em_transito') },
  ];

  const acoes = ([
    {
      id: 'vencidas',
      rotulo: 'Vencidas sem entrega',
      valor: fmt(sla.porStatus.vencida),
      texto: 'Previsão da transportadora já passou',
      tom: sla.porStatus.vencida ? 'perigo' : '',
      onClick: () => irPainel('vencida'),
    },
    {
      id: 'reentregas',
      rotulo: 'Reentregas',
      valor: fmt(reentregas.lista.filter((r) => (!carrier || r.transportadora === carrier) && passa(r.nf)).length),
      texto: 'Mesma NF com mais de um CT-e para o mesmo destinatário',
      tom: 'atencao',
      onClick: () => navigate('/entregas', { view: 'reentregas' }),
    },
  ] satisfies ItemAcao[] as ItemAcao[])
    .filter((a) => a.valor !== '0')
    .sort((a, b) => PESO_TOM[a.tom] - PESO_TOM[b.tom]);

  const carriersPorSla = [...todasLinhas].sort((a, b) => (a.percentual ?? 101) - (b.percentual ?? 101));
  const comEntrega = tendencia.filter((p) => p.entregues > 0);
  const ultima = comEntrega.at(-1)?.chave ?? '';
  const inicioJanela = ultima ? inicioDaJanela(ultima, recorte) : '';
  const barras = comEntrega.filter((p) => p.chave >= inicioJanela);

  const ordenar = (coluna: Coluna) =>
    setOrdem((atual) => (atual.coluna === coluna ? { coluna, desc: !atual.desc } : { coluna, desc: coluna !== 'label' }));

  return (
    <Pagina>
      {cabecalho}

      <Filtros compactos>
        <Filtro rotulo="Transportadora" valor={carrier} opcoes={CARRIERS} onChange={setCarrier} />
        <Filtro rotulo="SLA" valor={slaFiltro} opcoes={SLA_FILTROS} onChange={setSlaFiltro} />
        {tipos.size > 0 && <Filtro rotulo="Tipo de nota" valor={tipoNota} opcoes={opcoesTipo} onChange={setTipoNota} />}
      </Filtros>

      <div className="ui-hero">
        <Destaque
          rotulo="Entregas no prazo"
          valor={pctTxt(sla.percentual)}
          tom={tom}
          tag={
            sla.percentual === null
              ? undefined
              : sla.percentual >= META_SLA
                ? { texto: 'Na meta', tom: 'sucesso' }
                : {
                    texto: `${(META_SLA - sla.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. abaixo da meta`,
                    tom,
                  }
          }
          meta={sla.percentual === null ? undefined : { valor: sla.percentual, alvo: META_SLA, texto: `meta ${META_SLA}% · ${fmt(avaliadas)} avaliadas` }}
          partes={partes}
          rodape={
            sla.total ? (
              <div className="ui-mini-numeros">
                <div>
                  <b>{fmt(entregues)}</b>
                  <span>entregues de {fmt(sla.total)} notas</span>
                </div>
                <div>
                  <b>
                    {sla.atrasoMedio === null
                      ? '—'
                      : `${sla.atrasoMedio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d.u.`}
                  </b>
                  <span>atraso médio das entregues com atraso</span>
                </div>
              </div>
            ) : (
              'Envie a planilha de uma transportadora para medir o SLA.'
            )
          }
        />

        <ListaAcoes
          titulo="O que resolver agora"
          itens={acoes}
          vazio="Nenhuma pendência neste recorte."
          rodape={
            !conferencia.lista && (
              <>
                <span>Envie a Alloca07 para cruzar cada nota com as transportadoras.</span>
                <Botao pequeno onClick={() => irLista()}>
                  Abrir cruzamento
                </Botao>
              </>
            )
          }
        />
      </div>

      {conferencia.lista && (
        <Secao titulo="Cruzamento Alloca07 × transportadoras">
          <Kpis>
            {RESULTADOS.map((r) => (
              <Kpi
                key={r.id}
                rotulo={r.label}
                valor={fmt(conferencia.contagem[r.id])}
                sub={r.dica}
                tom={TOM_RESULTADO[r.tom] === 'perigo' && conferencia.contagem[r.id] ? 'perigo' : ''}
                onClick={() => irLista({ resultado: r.id })}
              />
            ))}
          </Kpis>
        </Secao>
      )}

      <Colunas>
        <Painel
          titulo="Evolução das entregas"
          sub={`${JANELA_RECORTE[recorte].rotulo} com entrega · pela data de entrega · % no prazo em cima`}
          acoes={<Segmentado rotulo="Agrupar por" valor={recorte} opcoes={RECORTES} onChange={setRecorte} />}
        >
          {barras.length === 0 ? (
            <p className="ui-vazio">Sem data de entrega neste recorte.</p>
          ) : (
            <Barras
              meta={META_SLA}
              descricao={`Entregues por ${recorte}: ${barras
                .map((p) => `${p.label} ${fmt(p.entregues)} (${pctTxt(p.percentual)})`)
                .join(', ')}`}
              pontos={barras.map((p) => ({ chave: p.chave, rotulo: p.label, valor: p.entregues, percentual: p.percentual }))}
            />
          )}
        </Painel>

        <Painel titulo="SLA por transportadora" sub={`Pior primeiro · a marca é a meta de ${META_SLA}%`}>
          {carriersPorSla.length === 0 ? (
            <p className="ui-vazio">Nenhuma transportadora neste filtro.</p>
          ) : (
            <BarrasMeta
              meta={META_SLA}
              linhas={carriersPorSla.map((l) => ({
                id: l.id,
                rotulo: l.label,
                percentual: l.percentual,
                detalhe: [
                  `${fmt(l.volume)} notas`,
                  `${fmt(l.vencidas)} vencidas`,
                ]
                  .filter(Boolean)
                  .join(' · '),
                onClick: () => setModal(l.id),
              }))}
            />
          )}
        </Painel>
      </Colunas>

      <Painel
        titulo="Detalhe por transportadora"
        sub="Clique no cabeçalho para ordenar e na transportadora para ver as notas dela."
      >
        {linhas.length === 0 ? (
          <p className="ui-vazio">Nenhuma transportadora neste filtro.</p>
        ) : (
          <div className="ui-tabela-caixa">
            <table className="ui-tabela">
              <thead>
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.id}
                      className={c.numerica ? 'num' : ''}
                      aria-sort={ordem.coluna === c.id ? (ordem.desc ? 'descending' : 'ascending') : 'none'}
                    >
                      <button type="button" className="ui-ordenar" onClick={() => ordenar(c.id)}>
                        {c.label}
                        <span aria-hidden="true">{ordem.coluna === c.id ? (ordem.desc ? '↓' : '↑') : ''}</span>
                      </button>
                    </th>
                  ))}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const s = situacaoCarrier(l);
                  return (
                    <tr key={l.id} className="clicavel" onClick={() => setModal(l.id)}>
                      <td>
                        <button
                          type="button"
                          className="ui-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModal(l.id);
                          }}
                        >
                          {l.label}
                        </button>
                      </td>
                      <td className="num">{fmt(l.volume)}</td>
                      <td className="num">
                        {fmt(l.entregues)}
                        {l.volume ? <small>{Math.round((l.entregues / l.volume) * 100)}%</small> : null}
                      </td>
                      <td className={`num ${l.percentual !== null && l.percentual < META_SLA ? 'ruim' : ''}`}>
                        {pctTxt(l.percentual)}
                      </td>
                      <td className={`num ${l.vencidas ? 'ruim' : ''}`}>{fmt(l.vencidas)}</td>
                      <td>
                        <Tag tom={s.tom}>{s.texto}</Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      {modal && (
        <TransportadoraModal
          label={TRANSPORTADORAS.find((t) => t.id === modal)!.label}
          notas={slaPeriodo.filter((n) => n.transportadora === modal)}
          comparacao={null}
          hoje={diaAtivo?.data ?? businessToday()}
          onAbrirConferencia={() => navigate('/entregas', { transportadora: modal })}
          onClose={() => setModal(null)}
        />
      )}
    </Pagina>
  );
};
