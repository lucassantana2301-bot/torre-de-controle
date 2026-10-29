import React from 'react';
import * as XLSX from 'xlsx';
import { MultiSelectFilter } from '../components/common/MultiSelectFilter';
import { UploadCard } from '../components/common/UploadCard';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { useDiaAtivo } from '../services/diaAtivo';
import { REGIOES, SLA_STATUS, regiaoDe, slaDoEvento, type Regiao, type SlaStatus } from '../services/sla';
import { BarList } from '../components/charts/BiCharts';
import { businessToday } from '../utils/businessDay';
import { exportarBaixaMassa } from '../services/baixaMassa';
import { formatDateTimeBr } from '../services/tratativaService';
import { RESULTADOS, isResultado, useConferencia, type LinhaResultado, type Resultado } from '../hooks/useConferencia';
import {
  MODAIS_PROPRIOS,
  TRANSPORTADORAS,
  entregasStore,
  formatBrDate,
  grupoTransportadora,
  importTransportadoraFile,
  useEntregas,
  type EntregaNf,
  type EntregaNfSituacao,
  type TransportadoraId,
} from '../services/entregasImport';

const SITUACAO_NF: Record<EntregaNfSituacao, { label: string; tom: string }> = {
  entregue: { label: 'Entregue', tom: 'success' },
  mesmo_dia: { label: 'Entregue (mesmo dia)', tom: 'success' },
  devolvida: { label: 'Devolução', tom: 'danger' },
  em_transito: { label: 'Em trânsito', tom: 'warning' },
  sem_rastreio: { label: 'Não encontrada', tom: 'danger' },
};

const LIMITE_LISTA = 500;

const nomeModal = (entrega: EntregaNf) => MODAIS_PROPRIOS.find((m) => m.id === entrega.modal)?.label;

const situacaoDaNf = (entrega: EntregaNf) => {
  const modal = nomeModal(entrega);
  if (modal) return { label: `${modal} · ${SITUACAO_NF[entrega.situacao].label}`, tom: '' };
  if (entrega.situacao === 'sem_rastreio' && entrega.evento) return { label: 'Só envio cancelado', tom: 'warning' };
  return SITUACAO_NF[entrega.situacao];
};

const transportadoraDaNf = (entrega: EntregaNf) =>
  entrega.evento?.transportadora || TRANSPORTADORAS.find((t) => t.id === entrega.transportadora)?.label || nomeModal(entrega) || '—';

/** Filtro `?transportadora=` (vem do Início e da Torre de Controle). */
const FILTROS_TRANSPORTADORA = [...TRANSPORTADORAS, ...MODAIS_PROPRIOS];
const grupoDaNf = (entrega: EntregaNf) =>
  entrega.modal ?? entrega.transportadora ?? grupoTransportadora(entrega.evento?.transportadora);

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function excelSerial(value: string): number | string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, y, m, d, hh = '0', mm = '0'] = match;
  return (Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)) - EXCEL_EPOCH) / 86_400_000;
}

const numeroOuTexto = (value: string) => (/^\d{1,15}$/.test(value) ? Number(value) : value);

const slaInfo = (id: SlaStatus) => SLA_STATUS.find((s) => s.id === id)!;

const slaDaNf = (entrega: EntregaNf, hoje: string): { status: SlaStatus; atraso: number | null } =>
  entrega.evento ? slaDoEvento(entrega.evento, hoje) : { status: 'sem_previsao', atraso: null };

/** A linha vale pela NF em pior situação. */
const PIOR_SLA: Record<SlaStatus, number> = { vencida: 0, atrasada: 1, em_transito: 2, sem_previsao: 3, no_prazo: 4 };
const slaDaLinha = (linha: LinhaResultado, hoje: string): SlaStatus =>
  linha.itens.map((i) => slaDaNf(i.entrega, hoje).status).sort((a, b) => PIOR_SLA[a] - PIOR_SLA[b])[0] ?? 'sem_previsao';

/** Destino da planilha base; sem ele, o da planilha de entrega. */
function regiaoDaLinha(linha: LinhaResultado): Regiao {
  return regiaoDe(linha.uf || linha.itens.find((i) => i.entrega.evento?.uf)?.entrega.evento?.uf || '');
}

const META_SLA = 95;
const corPctSla = (valor: number | null) =>
  valor === null ? 'var(--chart-muted)' : valor >= META_SLA ? 'var(--status-success)' : valor >= 85 ? 'var(--status-warning)' : 'var(--status-danger)';

type FiltroSla = '' | 'dentro' | 'fora' | SlaStatus;

const DENTRO_DO_SLA: SlaStatus[] = ['no_prazo', 'em_transito'];
const FORA_DO_SLA: SlaStatus[] = ['atrasada', 'vencida'];

const passaFiltroSla = (status: SlaStatus, filtro: FiltroSla) =>
  !filtro ||
  (filtro === 'dentro' ? DENTRO_DO_SLA.includes(status) : filtro === 'fora' ? FORA_DO_SLA.includes(status) : status === filtro);

const textoSla = (sla: { status: SlaStatus; atraso: number | null }) =>
  sla.atraso ? `${slaInfo(sla.status).label} (+${sla.atraso} d.u.)` : slaInfo(sla.status).label;

function exportarConferencia(linhas: LinhaResultado[], filtro: string, temTipo: boolean, temEmissao: boolean, hoje: string) {
  const header = [
    'id_zendesk', 'resultado', 'nota_fiscal', 'situacao_nf', 'transportadora', 'base_saida', 'ultimo_status',
    'data_entrega', 'recebedor', temTipo ? 'tipo' : 'organizacao', ...(temEmissao ? ['data_emissao'] : []),
    'previsao_entrega', 'situacao_sla', 'atraso_dias_uteis', 'regiao', 'cidade_destino', 'uf_destino',
  ];
  const colPrevisao = temEmissao ? 11 : 10;
  const rows = linhas.flatMap((linha) =>
    linha.itens.map(({ nf, entrega }) => {
      const sla = slaDaNf(entrega, hoje);
      return [
        linha.ticket ? numeroOuTexto(linha.ticket) : '',
        RESULTADOS.find((r) => r.id === linha.resultado)!.label,
        numeroOuTexto(nf),
        situacaoDaNf(entrega).label,
        transportadoraDaNf(entrega),
        entrega.evento?.base ?? '',
        entrega.evento?.ultimoStatus ?? '',
        entrega.evento?.dataEntrega ? excelSerial(entrega.evento.dataEntrega) : '',
        entrega.evento?.recebedor ?? '',
        temTipo ? (linha.tipo ?? '') : linha.organizacao,
        ...(temEmissao ? [linha.emissao ? excelSerial(linha.emissao) : ''] : []),
        entrega.evento?.previsao ? excelSerial(entrega.evento.previsao) : '',
        slaInfo(sla.status).label,
        sla.atraso ?? '',
        regiaoDaLinha(linha),
        linha.uf ? (linha.cidade ?? '') : (entrega.evento?.cidade ?? ''),
        linha.uf || entrega.evento?.uf || '',
      ];
    }),
  );
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: 7 })];
    if (cell?.t === 'n') cell.z = Number.isInteger(row[7]) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
    for (const coluna of [...(temEmissao ? [10] : []), colPrevisao]) {
      const data = sheet[XLSX.utils.encode_cell({ r: index + 1, c: coluna })];
      if (data?.t === 'n') data.z = 'dd/mm/yyyy';
    }
  });
  sheet['!cols'] = [14, 16, 12, 24, 20, 12, 34, 17, 26, 36, ...(temEmissao ? [14] : []), 14, 22, 12, 14, 24, 8].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Entregas');
  XLSX.writeFile(workbook, `entregas_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    document.execCommand('copy');
    campo.remove();
  }
}

const MODELO_TRANSPORTADORA: Record<TransportadoraId, string> = {
  spfly: 'Relatório de entregas da SPfly (Relatorio_Entrega_….csv)',
  jamef: 'Relatório de entregas da Jamef (JCENTREGA_….xlsx)',
  certex: 'Relatório de entregas da Certex (Relatorio_Entrega_….csv)',
};

const CartaoTransportadora: React.FC<{ id: TransportadoraId; label: string }> = ({ id, label }) => {
  const planilha = useEntregas().transportadoras[id];
  const entregues = planilha ? Object.values(planilha.porNf).filter((eventos) => eventos.some((e) => e.dataEntrega)).length : 0;
  return (
    <UploadCard
      title={label}
      emptyLabel={`Arraste as planilhas da ${label} ou clique para escolher`}
      hint={`${MODELO_TRANSPORTADORA[id]}. Pode enviar vários períodos de uma vez; eles são somados.`}
      meta={
        planilha && (
          <>
            <b>{planilha.fileName}</b> · {Object.keys(planilha.porNf).length} NFs · {entregues} entregues
            {planilha.ignoradas ? ` · ${planilha.ignoradas} reversas/retornos ignorados` : ''}
            {planilha.periodo
              ? ` · ${planilha.periodoTipo === 'entrega' ? 'entregas' : 'emitidas'} de ${formatBrDate(planilha.periodo.de)} a ${formatBrDate(planilha.periodo.ate)}`
              : ''}{' '}
            · carregada em {formatDateTimeBr(planilha.importadoEm)}
          </>
        )
      }
      onFile={async (file) => entregasStore.setTransportadora(id, await importTransportadoraFile(file))}
      onAdicionar={async (file) => entregasStore.adicionarTransportadora(id, await importTransportadoraFile(file))}
      onRemove={() => entregasStore.setTransportadora(id, null)}
    />
  );
};

export const EntregasPage: React.FC = () => {
  const { addToast, refreshData, isRefreshing } = useApp();
  const { searchParams, navigate } = useRouter();
  const dia = useDiaAtivo();
  const somenteLeitura = dia !== null;
  const hoje = dia?.data ?? businessToday();
  const { transportadoras } = useEntregas();
  const { lista, linhas } = useConferencia();
  const temFonte = TRANSPORTADORAS.some(({ id }) => transportadoras[id]);

  const filtroParam = searchParams.get('resultado') || searchParams.get('situacao');
  const filtro = isResultado(filtroParam) ? filtroParam : null;
  const transportadoraFiltro = FILTROS_TRANSPORTADORA.find((t) => t.id === searchParams.get('transportadora')) ?? null;
  const filtrar = (id: typeof filtro) => {
    const destino = {
      ...(id ? { resultado: id } : {}),
      ...(transportadoraFiltro ? { transportadora: transportadoraFiltro.id } : {}),
    };
    navigate('/entregas', Object.keys(destino).length ? destino : { view: 'lista' });
  };
  const tirarTransportadora = () => navigate('/entregas', filtro ? { resultado: filtro } : { view: 'lista' });

  const qParam = searchParams.get('q');
  const [busca, setBusca] = React.useState(qParam ?? '');
  React.useEffect(() => {
    if (qParam !== null) setBusca(qParam);
  }, [qParam]);

  const [tipos, setTipos] = React.useState<string[]>([]);
  const [emissaoDe, setEmissaoDe] = React.useState('');
  const [emissaoAte, setEmissaoAte] = React.useState('');
  const [filtroSla, setFiltroSla] = React.useState<FiltroSla>('');
  const [regiao, setRegiao] = React.useState<Regiao | ''>('');
  const temRecorte = tipos.length > 0 || Boolean(emissaoDe || emissaoAte) || filtroSla !== '' || regiao !== '';
  const limparRecorte = () => {
    setTipos([]);
    setEmissaoDe('');
    setEmissaoAte('');
    setFiltroSla('');
    setRegiao('');
  };

  const opcoesTipo = React.useMemo(() => {
    const porTipo = new Map<string, number>();
    for (const linha of linhas) porTipo.set(linha.tipo ?? '', (porTipo.get(linha.tipo ?? '') ?? 0) + 1);
    return [...porTipo]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value || '(sem tipo)', count }));
  }, [linhas]);

  const opcoesMes = React.useMemo(() => {
    const porMes = new Map<string, number>();
    for (const linha of linhas) {
      if (linha.emissao) porMes.set(linha.emissao.slice(0, 7), (porMes.get(linha.emissao.slice(0, 7)) ?? 0) + 1);
    }
    return [...porMes]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, count]) => {
        const nome = new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return { mes, label: `${nome.charAt(0).toUpperCase()}${nome.slice(1)} (${count})` };
      });
  }, [linhas]);
  const limitesDoMes = (mes: string) => {
    const [ano, numero] = mes.split('-').map(Number);
    return { de: `${mes}-01`, ate: `${mes}-${String(new Date(ano, numero, 0).getDate()).padStart(2, '0')}` };
  };
  const mesSelecionado =
    opcoesMes.find(({ mes }) => {
      const { de, ate } = limitesDoMes(mes);
      return emissaoDe === de && emissaoAte === ate;
    })?.mes ?? '';
  const escolherMes = (mes: string) => {
    const { de, ate } = mes ? limitesDoMes(mes) : { de: '', ate: '' };
    setEmissaoDe(de);
    setEmissaoAte(ate);
  };

  const regiaoPorLinha = React.useMemo(() => new Map(linhas.map((linha) => [linha, regiaoDaLinha(linha)])), [linhas]);
  const slaPorLinha = React.useMemo(() => new Map(linhas.map((linha) => [linha, slaDaLinha(linha, hoje)])), [linhas, hoje]);

  const semRegiao = linhas.filter(
    (l) =>
      (!tipos.length || tipos.includes(l.tipo ?? '')) &&
      (!emissaoDe || (!!l.emissao && l.emissao >= emissaoDe)) &&
      (!emissaoAte || (!!l.emissao && l.emissao <= emissaoAte)) &&
      (!transportadoraFiltro || l.itens.some((i) => grupoDaNf(i.entrega) === transportadoraFiltro.id)),
  );
  const noRecorte = regiao ? semRegiao.filter((l) => regiaoPorLinha.get(l) === regiao) : semRegiao;
  const contagem = Object.fromEntries(RESULTADOS.map((r) => [r.id, 0])) as Record<Resultado, number>;
  for (const linha of noRecorte) contagem[linha.resultado] += 1;

  const resumoSla = (lista: LinhaResultado[]) => {
    const porStatus = Object.fromEntries(SLA_STATUS.map((s) => [s.id, 0])) as Record<SlaStatus, number>;
    for (const linha of lista) porStatus[slaPorLinha.get(linha)!] += 1;
    const avaliadas = porStatus.no_prazo + porStatus.atrasada + porStatus.vencida;
    return { porStatus, avaliadas, pct: avaliadas ? Math.round((porStatus.no_prazo / avaliadas) * 1000) / 10 : null };
  };
  const { porStatus: contagemSla, avaliadas: avaliadasSla, pct: pctSla } = resumoSla(noRecorte);
  const porRegiao = REGIOES.flatMap((r) => {
    const daRegiao = semRegiao.filter((l) => regiaoPorLinha.get(l) === r);
    return daRegiao.length ? [{ regiao: r, total: daRegiao.length, ...resumoSla(daRegiao) }] : [];
  });

  const q = busca.replace(/\D/g, '');
  const filtradas = noRecorte
    .filter((l) => !filtro || l.resultado === filtro)
    .filter((l) => passaFiltroSla(slaPorLinha.get(l)!, filtroSla))
    .filter((l) => !q || l.ticket.includes(q) || l.nfs.some((nf) => nf.includes(q)));
  const nfsFiltradas = [...new Set(filtradas.flatMap((l) => l.nfs))];
  /** Baixa Zendesk só com tickets cujo resultado na lista é entregue. */
  const ticketsParaBaixa = [
    ...new Set(filtradas.filter((l) => l.resultado === 'entregue').map((l) => l.ticket).filter(Boolean)),
  ];
  const slug = filtro ?? 'todos';
  const rotulo = lista?.temTicket ? 'tickets' : 'linhas';

  const copiarNfs = async () => {
    await copiarTexto(nfsFiltradas.join(','));
    addToast('success', 'NFs copiadas', `${nfsFiltradas.length} NFs separadas por vírgula.`);
  };

  return (
    <div className="page-entregas">
      <div className="page-header app-cabecalho">
        <div>
          <h1 className="page-title">Entregas</h1>
          <p className="page-subtitle">
            {lista
              ? `Alloca07 (${lista.fileName}) cruzada com SPfly, Jamef e Certex.`
              : 'Alloca07 × SPfly, Jamef e Certex. O que já foi entregue.'}
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-outline" onClick={refreshData} disabled={isRefreshing}>
            {isRefreshing ? 'Atualizando...' : 'Atualizar dados'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/entregas')}>
            Painel
          </button>
        </div>
      </div>

      {!somenteLeitura && (
        <section className="entregas-fontes" aria-labelledby="entregas-fontes-titulo">
          <h2 id="entregas-fontes-titulo" className="section-title">
            Planilhas de entrega
          </h2>
          <p className="text-muted">
            A data e o recebedor vêm da planilha da transportadora.
          </p>
          <div className="zendesk-slots">
            {TRANSPORTADORAS.map(({ id, label }) => (
              <CartaoTransportadora key={id} id={id} label={label} />
            ))}
          </div>
        </section>
      )}

      {!lista ? (
        <EstadoVazio
          titulo={somenteLeitura ? 'Nenhuma nota salva neste dia' : 'Envie a Alloca07 para cruzar com as transportadoras'}
          texto={
            somenteLeitura
              ? 'Neste dia a Alloca07 não tinha sido carregada.'
              : 'Cada nota emitida é conferida nas planilhas da SPfly, Jamef e Certex.'
          }
          passos={
            somenteLeitura
              ? undefined
              : [
                  <>No Início, envie a exportação da <b>Alloca07</b>.</>,
                  <>Em <b>Planilhas de entrega</b>, envie os relatórios da SPfly, Jamef e Certex.</>,
                  <>Use os cartões de resultado e os filtros para ver o que foi entregue e exportar.</>,
                ]
          }
        />
      ) : (
        <>
          {!temFonte && (
            <div className="home-alerta">
              <span>Envie a planilha de uma transportadora para saber o que foi entregue.</span>
            </div>
          )}

          <section className="home-cards" aria-label="Resultado das entregas">
            {RESULTADOS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`home-card ${r.tom === 'success' ? 'sucesso' : r.tom === 'warning' ? 'atencao' : r.tom === 'danger' ? 'perigo' : ''}`}
                onClick={() => filtrar(filtro === r.id ? null : r.id)}
                title={r.dica}
                aria-pressed={filtro === r.id}
              >
                <span className="home-card-rotulo">{r.label}</span>
                <span className="home-card-valor">{contagem[r.id].toLocaleString('pt-BR')}</span>
                <span className="home-card-sub">
                  {noRecorte.length ? Math.round((contagem[r.id] / noRecorte.length) * 100) : 0}% dos {rotulo}
                </span>
              </button>
            ))}
          </section>

          {porRegiao.length > 0 && (
            <section className="bi-card entregas-regioes">
              <header>
                <h3>% no prazo por região</h3>
                <p>
                  Verde ≥ {META_SLA}% · amarelo ≥ 85% · vermelho abaixo · clique numa região para filtrar a lista. A região vem
                  da UF de destino da planilha base (UF Destino).
                </p>
              </header>
              <BarList
                max={100}
                ativa={regiao}
                onSelecionar={(chave) => setRegiao(regiao === chave ? '' : (chave as Regiao))}
                itens={porRegiao.map((r) => ({
                  chave: r.regiao,
                  label: r.regiao,
                  valor: r.pct ?? 0,
                  texto: r.pct === null ? '—' : `${r.pct.toLocaleString('pt-BR')}%`,
                  sub: `${r.avaliadas} avaliadas`,
                  cor: corPctSla(r.pct),
                }))}
              />
            </section>
          )}

          <div className="panel-card">
            <div className="detail-tabs-bar zendesk-tabs" role="tablist" aria-label="Resultado">
              <button
                type="button"
                role="tab"
                aria-selected={filtro === null}
                className={`detail-tab-btn ${filtro === null ? 'active' : ''}`}
                onClick={() => filtrar(null)}
              >
                Todos ({noRecorte.length})
              </button>
              {RESULTADOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === r.id}
                  className={`detail-tab-btn ${r.id === 'entregue' ? 'tab-acao' : ''} ${filtro === r.id ? 'active' : ''}`}
                  onClick={() => filtrar(r.id)}
                  title={r.dica}
                >
                  {r.label} ({contagem[r.id]})
                </button>
              ))}
            </div>

            <div className="filter-inputs-row entregas-filtros">
              <div className="filter-input-group flex-1 zendesk-search">
                <label htmlFor="entregas-busca">Busca</label>
                <input
                  id="entregas-busca"
                  type="search"
                  placeholder="Ticket ou NF..."
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                />
              </div>
              {lista.temTipo && (
                <MultiSelectFilter
                  id="entregas-tipo"
                  label="Tipo"
                  allLabel="Todos os tipos"
                  options={opcoesTipo}
                  selected={tipos}
                  onChange={setTipos}
                />
              )}
              {lista.temEmissao && (
                <>
                  <div className="filter-input-group">
                    <label htmlFor="entregas-emissao-de">Emissão de</label>
                    <input
                      id="entregas-emissao-de"
                      type="date"
                      value={emissaoDe}
                      max={emissaoAte || undefined}
                      onChange={(event) => setEmissaoDe(event.target.value)}
                    />
                  </div>
                  <div className="filter-input-group">
                    <label htmlFor="entregas-emissao-ate">Emissão até</label>
                    <input
                      id="entregas-emissao-ate"
                      type="date"
                      value={emissaoAte}
                      min={emissaoDe || undefined}
                      onChange={(event) => setEmissaoAte(event.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="filter-input-group">
                <label htmlFor="entregas-regiao">Região</label>
                <select id="entregas-regiao" value={regiao} onChange={(event) => setRegiao(event.target.value as Regiao | '')}>
                  <option value="">Todas</option>
                  {porRegiao.map((r) => (
                    <option key={r.regiao} value={r.regiao}>
                      {r.regiao} ({r.total})
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-input-group">
                <label htmlFor="entregas-sla">SLA</label>
                <select id="entregas-sla" value={filtroSla} onChange={(event) => setFiltroSla(event.target.value as FiltroSla)}>
                  <option value="">Todos</option>
                  <option value="dentro">
                    Dentro do SLA ({contagemSla.no_prazo + contagemSla.em_transito})
                  </option>
                  <option value="fora">
                    Fora do SLA ({contagemSla.atrasada + contagemSla.vencida})
                  </option>
                  {SLA_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({contagemSla[s.id]})
                    </option>
                  ))}
                </select>
              </div>
              {transportadoraFiltro && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={tirarTransportadora}
                  title="Mostrar todas as transportadoras"
                >
                  Transportadora: {transportadoraFiltro.label} ×
                </button>
              )}
              {temRecorte && (
                <button type="button" className="btn btn-outline btn-sm" onClick={limparRecorte}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="zendesk-count-bar">
              <p className="text-muted zendesk-count">
                {filtradas.length} {rotulo} · {nfsFiltradas.length} NFs
                {pctSla !== null && (
                  <span title="Entregues no prazo ÷ (no prazo + com atraso + vencidas sem entrega), com os filtros de tipo e emissão">
                    {' '}
                    · <b>{pctSla.toLocaleString('pt-BR')}% dentro do SLA</b> ({avaliadasSla} avaliadas)
                  </span>
                )}
              </p>
              <div className="zendesk-actions">
                {!lista.temEmissao ? (
                  <select
                    className="select-control"
                    aria-label="Mês de emissão"
                    disabled
                    title='Para filtrar por mês, a planilha base precisa da coluna "Dt. Emissao". Se ela tem, clique em Trocar e envie de novo.'
                  >
                    <option>Mês: reenvie a planilha base</option>
                  </select>
                ) : (
                  <select
                    className="select-control"
                    aria-label="Mês de emissão"
                    title="Mostra só as NFs emitidas no mês escolhido"
                    value={mesSelecionado || (emissaoDe || emissaoAte ? 'personalizado' : '')}
                    onChange={(event) => escolherMes(event.target.value)}
                  >
                    <option value="">Todos os meses</option>
                    {!mesSelecionado && (emissaoDe || emissaoAte) && (
                      <option value="personalizado" disabled>
                        Período personalizado
                      </option>
                    )}
                    {opcoesMes.map(({ mes, label }) => (
                      <option key={mes} value={mes}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={nfsFiltradas.length === 0}
                  onClick={copiarNfs}
                  title="Copia as NFs desta lista no formato 123,456,789"
                >
                  Copiar NFs ({nfsFiltradas.length})
                </button>
                {lista.temTicket && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={ticketsParaBaixa.length === 0}
                    onClick={() => exportarBaixaMassa(ticketsParaBaixa, 'entregas_entregue')}
                    title="Só tickets com resultado Entregue. Não inclui Em trânsito, sem rastreio nem outras abas."
                  >
                    Baixa em massa ({ticketsParaBaixa.length})
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={filtradas.length === 0}
                  onClick={() => exportarConferencia(filtradas, slug, !!lista.temTipo, !!lista.temEmissao, hoje)}
                >
                  Exportar ({filtradas.length})
                </button>
              </div>
            </div>

            {filtradas.length === 0 ? (
              <p className="text-muted">Nada nesta seleção.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table zendesk-table">
                  <thead>
                    <tr>
                      {lista.temTicket && <th>Ticket</th>}
                      <th>Resultado</th>
                      <th>NF</th>
                      <th>Situação da NF</th>
                      <th>Transportadora</th>
                      <th>Base de saída</th>
                      <th>Último status</th>
                      <th>Previsão</th>
                      <th>Data entrega</th>
                      <th>SLA</th>
                      <th>Recebedor</th>
                      <th>{lista.temTipo ? 'Tipo' : 'Organização'}</th>
                      <th>Região</th>
                      {lista.temEmissao && <th>Emissão</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.slice(0, LIMITE_LISTA).map((linha, index) => {
                      const r = RESULTADOS.find((item) => item.id === linha.resultado)!;
                      const coluna = (render: (item: LinhaResultado['itens'][number]) => React.ReactNode) => (
                        <div className="zendesk-lines">
                          {linha.itens.map((item) => (
                            <span key={item.nf}>{render(item)}</span>
                          ))}
                        </div>
                      );
                      return (
                        <tr key={`${linha.ticket}-${index}`}>
                          {lista.temTicket && <td>{linha.ticket ? <code className="id-badge">#{linha.ticket}</code> : '—'}</td>}
                          <td>
                            <span className={`status-badge ${r.tom}`}>{r.label}</span>
                          </td>
                          <td>{coluna((i) => <code className="id-badge">{i.nf}</code>)}</td>
                          <td>
                            {coluna((i) => {
                              const s = situacaoDaNf(i.entrega);
                              return <span className={`status-badge ${s.tom}`}>{s.label}</span>;
                            })}
                          </td>
                          <td>{coluna((i) => transportadoraDaNf(i.entrega))}</td>
                          <td>{coluna((i) => i.entrega.evento?.base || '—')}</td>
                          <td>{coluna((i) => i.entrega.evento?.ultimoStatus || '—')}</td>
                          <td>
                            {coluna((i) => (i.entrega.evento?.previsao ? formatBrDate(i.entrega.evento.previsao) : '—'))}
                          </td>
                          <td>
                            {coluna((i) => (i.entrega.evento?.dataEntrega ? formatBrDate(i.entrega.evento.dataEntrega) : '—'))}
                          </td>
                          <td>
                            {coluna((i) => {
                              const sla = slaDaNf(i.entrega, hoje);
                              return <span className={`status-badge ${slaInfo(sla.status).tone}`}>{textoSla(sla)}</span>;
                            })}
                          </td>
                          <td>{coluna((i) => i.entrega.evento?.recebedor || '—')}</td>
                          <td className="zendesk-org">{(lista.temTipo ? linha.tipo : linha.organizacao) || '—'}</td>
                          <td>
                            {regiaoPorLinha.get(linha)}
                            {linha.uf && (
                              <span className="text-muted">
                                {' '}
                                · {[linha.cidade, linha.uf].filter(Boolean).join('/')}
                              </span>
                            )}
                          </td>
                          {lista.temEmissao && <td>{linha.emissao ? formatBrDate(linha.emissao) : '—'}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtradas.length > LIMITE_LISTA && (
              <p className="home-nota">
                Mostrando {LIMITE_LISTA} de {filtradas.length}. O Exportar leva todos.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};
