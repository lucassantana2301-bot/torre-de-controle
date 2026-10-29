import React from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { Integration, IntegrationStatus } from '../types';
import { MultiSelectFilter, type MultiSelectOption } from '../components/common/MultiSelectFilter';
import { TratativaModal } from '../components/common/TratativaModal';
import { formatNoteDate } from '../utils/businessDay';
import { anomaliaDescricao, isDataAnormal } from '../utils/anomalia';
import { AlertIcon } from '../components/common/AlertIcon';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { csvCell } from '../utils/csv';
import { useTratativas, type Tratativa } from '../services/tratativaService';
import {
  OPCOES_FILTRO_TICKET,
  passaFiltroTicket,
  ticketsDaIntegracao,
  useTicketsPorNf,
  type FiltroTicket,
} from '../hooks/useTicketsPorNf';
import { emissaoDaNf, emissoresStore, importEmissoresFile, useEmissores } from '../services/emissores';

const SEM_TIPO = '__sem_tipo__';
const SEM_EMISSOR = '__sem_emissor__';

const IconeBuscaVazio: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconeCheckTratado: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: '4px' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function buildEmissorOptions(chaves: string[], countKeys: string[], selected: string[]): MultiSelectOption[] {
  const counts = new Map<string, number>();
  for (const key of countKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...new Set([...chaves, ...selected])]
    .sort((a, b) => (a === SEM_EMISSOR ? 1 : b === SEM_EMISSOR ? -1 : a.localeCompare(b, 'pt-BR')))
    .map((key) => ({ value: key, label: key === SEM_EMISSOR ? 'Sem emissor' : key, count: counts.get(key) ?? 0 }));
}

const dataHoraBr = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}` : '');

const tipoKey = (item: Integration): string => item.metadata?.tipoNota || SEM_TIPO;

function buildTipoOptions(allItems: Integration[], countItems: Integration[], selected: string[]): MultiSelectOption[] {
  const counts = new Map<string, number>();
  for (const item of countItems) {
    const key = tipoKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...new Set([...allItems.map(tipoKey), ...selected])]
    .sort((a, b) => (a === SEM_TIPO ? 1 : b === SEM_TIPO ? -1 : a.localeCompare(b, 'pt-BR')))
    .map((key) => ({
      value: key,
      label: key === SEM_TIPO ? 'Sem tipo' : key,
      count: counts.get(key) ?? 0,
    }));
}

/** Emissão da nota; as que só existem na Intelipost não têm emissão e usam a data de integração. */
const dataDaNota = (item: Integration): string => (item.metadata?.dataEmissao ?? item.metadata?.dataIntegracao ?? '').slice(0, 10);

const limitesDoMes = (mes: string) => {
  const [ano, numero] = mes.split('-').map(Number);
  return { de: `${mes}-01`, ate: `${mes}-${String(new Date(ano, numero, 0).getDate()).padStart(2, '0')}` };
};

const nomeDoMes = (mes: string) => {
  const nome = new Date(`${mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
};

const nomeSemNota = (item: Integration): string =>
  item.metadata?.clienteDestino || item.name.replace(/^NF\s+\S+\s*(·\s*)?/, '');

const ultimoComentarioCsv = (tratativa: Tratativa | undefined): string =>
  (tratativa?.comentarios.at(-1)?.texto ?? '').replace(/\s*\r?\n\s*/g, ' ');

const PASSO_LISTA = 200;

const STATUS_ABAS: { id: IntegrationStatus | 'all'; label: string; dica: string }[] = [
  { id: 'all', label: 'Todas', dica: 'Todas as notas do cruzamento' },
  { id: 'completed', label: 'Integradas', dica: 'A nota existe na Alloca07 e na Intelipost' },
  { id: 'pending', label: 'Não integradas', dica: 'A nota está só na Alloca07' },
  { id: 'intelipost_only', label: 'Só Intelipost', dica: 'A nota está só na Intelipost' },
];

export const IntegrationsListPage: React.FC = () => {
  const { integrations, filters, setFilter, resetFilters, reprocessIntegration, deleteIntegration, openUpload, hasDataset, addToast } = useApp();
  const { searchParams, navigate } = useRouter();

  // Permite sincronizar filtro pelo query param da rota (ex: #/integrations?status=error)
  const queryStatus = searchParams.get('status') as IntegrationStatus | null;
  const currentStatusFilter = queryStatus || (searchParams.get('view') === 'lista' ? 'all' : filters.status);
  const tipoParam = searchParams.get('tipo');
  const tratativaParam = searchParams.get('tratativa');
  const ticketParam = searchParams.get('ticket');
  const validacaoParam = searchParams.get('validacao');
  const [tiposSelecionados, setTiposSelecionados] = React.useState<string[]>(tipoParam ? [tipoParam] : []);
  const [diaDe, setDiaDe] = React.useState('');
  const [diaAte, setDiaAte] = React.useState('');
  const [tratativaFilter, setTratativaFilter] = React.useState<'all' | 'tratado' | 'pendente'>(
    tratativaParam === 'pendente' || tratativaParam === 'tratado' ? tratativaParam : 'all',
  );
  const [somenteAnormais, setSomenteAnormais] = React.useState(false);
  const [tratando, setTratando] = React.useState<Integration | null>(null);
  const tratativas = useTratativas();
  const isTratado = (item: Integration) => tratativas[item.id]?.tratado ?? false;
  const ticketsPorNf = useTicketsPorNf();
  const [filtroTicket, setFiltroTicket] = React.useState<FiltroTicket>(
    ticketParam === 'com_ticket' || ticketParam === 'sem_ticket' ? ticketParam : 'todos',
  );
  const ticketsDe = (item: Integration) => (ticketsPorNf ? ticketsDaIntegracao(item, ticketsPorNf) : []);
  const emissores = useEmissores();
  const emissaoDe = (item: Integration) => emissaoDaNf(emissores, item.metadata?.notaFiscal);
  const emissorKey = (item: Integration) => emissaoDe(item)?.login ?? SEM_EMISSOR;
  const [emissoresSelecionados, setEmissoresSelecionados] = React.useState<string[]>([]);
  const [lendoEmissores, setLendoEmissores] = React.useState(false);
  const carregarEmissores = async (file: File | undefined) => {
    if (!file) return;
    setLendoEmissores(true);
    try {
      const lido = await importEmissoresFile(file);
      await emissoresStore.set(lido);
      addToast('success', 'Emissores carregados', `${lido.total.toLocaleString('pt-BR')} NFs de ${lido.logins.length} logins.`);
    } catch (cause) {
      addToast('error', 'Não foi possível ler a extração', cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLendoEmissores(false);
    }
  };

  const busca = React.useDeferredValue(filters.search);
  const [limite, setLimite] = React.useState(PASSO_LISTA);
  React.useEffect(() => {
    if (tipoParam) setTiposSelecionados([tipoParam]);
  }, [tipoParam]);
  React.useEffect(() => {
    if (tratativaParam === 'pendente' || tratativaParam === 'tratado') setTratativaFilter(tratativaParam);
  }, [tratativaParam]);
  React.useEffect(() => {
    if (ticketParam === 'com_ticket' || ticketParam === 'sem_ticket' || ticketParam === 'todos') setFiltroTicket(ticketParam);
  }, [ticketParam]);
  React.useEffect(() => {
    setLimite(PASSO_LISTA);
  }, [currentStatusFilter, busca, tiposSelecionados, emissoresSelecionados, tratativaFilter, somenteAnormais, filtroTicket, diaDe, diaAte, validacaoParam]);

  const opcoesMes = React.useMemo(() => {
    const porMes = new Map<string, number>();
    for (const item of integrations) {
      const mes = dataDaNota(item).slice(0, 7);
      if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
    }
    return [...porMes].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, count]) => ({ mes, label: `${nomeDoMes(mes)} (${count})` }));
  }, [integrations]);
  const mesSelecionado =
    opcoesMes.find(({ mes }) => {
      const { de, ate } = limitesDoMes(mes);
      return diaDe === de && diaAte === ate;
    })?.mes ?? '';
  const escolherMes = (mes: string) => {
    const { de, ate } = mes ? limitesDoMes(mes) : { de: '', ate: '' };
    setDiaDe(de);
    setDiaAte(ate);
  };

  const contagemStatus = React.useMemo(() => {
    const contagem: Record<string, number> = { all: integrations.length };
    for (const item of integrations) contagem[item.status] = (contagem[item.status] ?? 0) + 1;
    return contagem;
  }, [integrations]);

  const contagemTicket = React.useMemo(() => {
    const contagem: Record<FiltroTicket, number> = { todos: integrations.length, com_ticket: 0, sem_ticket: 0 };
    if (!ticketsPorNf) return contagem;
    for (const item of integrations) contagem[ticketsDaIntegracao(item, ticketsPorNf).length ? 'com_ticket' : 'sem_ticket'] += 1;
    return contagem;
  }, [integrations, ticketsPorNf]);

  const clearAllFilters = () => {
    resetFilters();
    setTiposSelecionados([]);
    setEmissoresSelecionados([]);
    setDiaDe('');
    setDiaAte('');
    setTratativaFilter('all');
    setSomenteAnormais(false);
    setFiltroTicket('todos');
  };

  const totalAnormais = integrations.filter(isDataAnormal).length;

  const matchesOtherFilters = integrations.filter((item) => {
    if (somenteAnormais && !isDataAnormal(item)) {
      return false;
    }
    if (diaDe || diaAte) {
      const data = dataDaNota(item);
      if (!data || (diaDe && data < diaDe) || (diaAte && data > diaAte)) return false;
    }
    if (validacaoParam === 'triangular' && item.metadata?.validacao !== 'triangular') {
      return false;
    }
    if (tratativaFilter !== 'all' && isTratado(item) !== (tratativaFilter === 'tratado')) {
      return false;
    }
    if (ticketsPorNf && !passaFiltroTicket(ticketsDe(item), filtroTicket)) {
      return false;
    }
    if (currentStatusFilter && currentStatusFilter !== 'all' && item.status !== currentStatusFilter) {
      return false;
    }
    if (filters.category && filters.category !== 'all' && item.category !== filters.category) {
      return false;
    }
    if (busca) {
      const q = busca.toLowerCase();
      const match =
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.responsible.toLowerCase().includes(q) ||
        (item.metadata?.notaFiscal && item.metadata.notaFiscal.includes(q)) ||
        (item.metadata?.nfTriangular && item.metadata.nfTriangular.includes(q)) ||
        (item.metadata?.tipoNota && item.metadata.tipoNota.toLowerCase().includes(q)) ||
        (emissaoDe(item)?.login.includes(q) ?? false) ||
        (item.metadata?.clienteDestino && item.metadata.clienteDestino.toLowerCase().includes(q)) ||
        (tratativas[item.id]?.comentarios.some((c) => c.texto.toLowerCase().includes(q)) ?? false) ||
        [tratativas[item.id]?.pdv, tratativas[item.id]?.notaAntiga, tratativas[item.id]?.notaNova].some(
          (valor) => valor?.toLowerCase().includes(q),
        );
      if (!match) return false;
    }
    return true;
  });

  const doTipo = (lista: Integration[]) =>
    tiposSelecionados.length === 0 ? lista : lista.filter((item) => tiposSelecionados.includes(tipoKey(item)));
  const doEmissor = (lista: Integration[]) =>
    emissoresSelecionados.length === 0 || !emissores
      ? lista
      : lista.filter((item) => emissoresSelecionados.includes(emissorKey(item)));

  const tipoOptions = buildTipoOptions(integrations, doEmissor(matchesOtherFilters), tiposSelecionados);
  const emissorOptions = emissores
    ? buildEmissorOptions(integrations.map(emissorKey), doTipo(matchesOtherFilters).map(emissorKey), emissoresSelecionados)
    : [];

  const filtered = doEmissor(doTipo(matchesOtherFilters));

  /** Nota não integrada ainda não tem data de integração: a coluna mostra quem emitiu. */
  const abaNaoIntegradas = currentStatusFilter === 'pending';
  const exportarNaoIntegradas = () => {
    const numero = (valor: string) => (/^\d{1,15}$/.test(valor) ? Number(valor) : valor);
    const linhas = filtered.map((item) => [
      numero(item.metadata?.notaFiscal ?? item.id.replace(/^NF-/, '')),
      ticketsDe(item).map((t) => `#${t}`).join(' / '),
      emissaoDe(item)?.login ?? '',
      'Não integrada',
    ]);
    const planilha = XLSX.utils.aoa_to_sheet([['nota_fiscal', 'ticket_zendesk', 'emitido_por', 'status'], ...linhas]);
    planilha['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 16 }];
    planilha['!autofilter'] = { ref: planilha['!ref'] ?? 'A1' };
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Não integradas');
    XLSX.writeFile(livro, `nao_integradas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const celulaEmissor = (item: Integration) => {
    const emissao = emissaoDe(item);
    return (
      <td
        className="nowrap"
        title={
          emissao?.em
            ? `Emitida em ${dataHoraBr(emissao.em)}`
            : emissores
              ? undefined
              : 'Clique em "Carregar emissores" e envie a Extração - Romaneio'
        }
      >
        {emissao?.login ?? '—'}
      </td>
    );
  };

  const getStatusBadge = (status: IntegrationStatus) => {
    switch (status) {
      case 'completed':
        return <span className="status-badge success">Integrada</span>;
      case 'pending':
        return <span className="status-badge warning">Não integrada</span>;
      case 'intelipost_only':
        return <span className="status-badge info">Só Intelipost</span>;
      case 'error':
        return <span className="status-badge danger">Com Erro</span>;
      case 'processing':
        return <span className="status-badge info">Processando</span>;
    }
  };

  return (
    <div className="page-integrations-list">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Operação</span>
          <h1 className="page-title">
            {queryStatus === 'completed' && 'Notas integradas'}
            {queryStatus === 'pending' && 'Notas não integradas'}
            {queryStatus === 'intelipost_only' && 'Notas só na Intelipost'}
            {queryStatus === 'error' && 'Integrações com Erro'}
            {queryStatus === 'processing' && 'Integrações em Processamento'}
            {!queryStatus && 'Todas as integrações de NF'}
          </h1>
          <p className="page-subtitle">
            Cruzamento pela nota fiscal. Integrada quando o número ou a NF triangular existe na Intelipost.
          </p>
        </div>

        <div className="page-header-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/integrations')}>
            Painel
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const header = [
                'NF',
                'Nome da empresa',
                'Tipo da nota',
                'UF',
                'Emitido por',
                'Emitida em',
                'Número do PDV',
                'Nota antiga',
                'Nota nova',
                'Comentário de tratativa',
              ];
              const csv = [
                header.map((c) => csvCell(c)).join(';'),
                ...filtered.map((i) =>
                  [
                    i.metadata?.notaFiscal ?? i.id.replace(/^NF-/, ''),
                    nomeSemNota(i),
                    i.metadata?.tipoNota,
                    i.metadata?.uf,
                    emissaoDe(i)?.login,
                    dataHoraBr(emissaoDe(i)?.em ?? ''),
                    tratativas[i.id]?.pdv,
                    tratativas[i.id]?.notaAntiga,
                    tratativas[i.id]?.notaNova,
                    ultimoComentarioCsv(tratativas[i.id]),
                  ]
                    .map((c) => csvCell(c))
                    .join(';'),
                ),
              ].join('\r\n');
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `arklok-integracoes-${Date.now()}.csv`;
              a.click();
            }}
          >
            Exportar CSV
          </button>

          {abaNaoIntegradas && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={filtered.length === 0}
              onClick={exportarNaoIntegradas}
              title="Excel com NF, ticket do Zendesk, quem emitiu e o status, seguindo os filtros aplicados"
            >
              Exportar não integradas ({filtered.length.toLocaleString('pt-BR')})
            </button>
          )}

          <label
            className="btn btn-outline"
            title={
              emissores
                ? `${emissores.fileName} · ${emissores.total.toLocaleString('pt-BR')} NFs · ${emissores.logins.length} logins. Clique para trocar.`
                : 'Envie a "Extração - Romaneio" (coluna USR_EMISSAO) para ver quem emitiu cada nota'
            }
          >
            <input
              className="dropzone-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                carregarEmissores(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            {lendoEmissores ? 'Lendo extração...' : emissores ? 'Trocar emissores' : 'Carregar emissores'}
          </label>

          <button type="button" className="btn btn-primary" onClick={openUpload}>
            Enviar Alloca07 e Intelipost
          </button>
        </div>
      </div>

      {/* Barra de Filtros HIG */}
      <div className="filter-toolbar-card">
        <div className="detail-tabs-bar zendesk-tabs" role="tablist" aria-label="Status da nota">
          {STATUS_ABAS.map((aba) => {
            const ativa = (currentStatusFilter || 'all') === aba.id;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                className={`detail-tab-btn ${ativa ? 'active' : ''}`}
                onClick={() => navigate('/integrations', aba.id === 'all' ? { view: 'lista' } : { status: aba.id })}
                title={aba.dica}
              >
                {aba.label} ({contagemStatus[aba.id] ?? 0})
              </button>
            );
          })}
        </div>

        <div className="filter-inputs-row">
          <div className="filter-input-group flex-1">
            <label htmlFor="filter-search">Busca</label>
            <input
              id="filter-search"
              type="search"
              placeholder="Nota, cliente, pedido ou comentário"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>

          <MultiSelectFilter
            id="filter-tipo"
            label="Tipo da nota"
            allLabel="Todos os Tipos"
            options={tipoOptions}
            selected={tiposSelecionados}
            onChange={setTiposSelecionados}
          />

          {emissores && (
            <MultiSelectFilter
              id="filter-emissor"
              label="Emitido por"
              allLabel="Todos os logins"
              options={emissorOptions}
              selected={emissoresSelecionados}
              onChange={setEmissoresSelecionados}
            />
          )}

          <div className="filter-input-group">
            <label htmlFor="filter-mes">Mês</label>
            <select
              id="filter-mes"
              value={mesSelecionado || (diaDe || diaAte ? 'personalizado' : '')}
              onChange={(e) => escolherMes(e.target.value)}
              title="Mês de emissão da nota"
            >
              <option value="">Todos os meses</option>
              {!mesSelecionado && (diaDe || diaAte) && (
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
          </div>

          <div className="filter-input-group">
            <label htmlFor="filter-dia-de">Emissão de</label>
            <input
              id="filter-dia-de"
              type="date"
              value={diaDe}
              max={diaAte || undefined}
              onChange={(e) => setDiaDe(e.target.value)}
            />
          </div>

          <div className="filter-input-group">
            <label htmlFor="filter-dia-ate">Emissão até</label>
            <input
              id="filter-dia-ate"
              type="date"
              value={diaAte}
              min={diaDe || undefined}
              onChange={(e) => setDiaAte(e.target.value)}
            />
          </div>

          <div className="filter-input-group">
            <label htmlFor="filter-tratativa">Tratativa</label>
            <select
              id="filter-tratativa"
              value={tratativaFilter}
              onChange={(e) => setTratativaFilter(e.target.value as typeof tratativaFilter)}
            >
              <option value="all">Todas</option>
              <option value="pendente">Pendentes de tratativa</option>
              <option value="tratado">Tratadas</option>
            </select>
          </div>

          {ticketsPorNf && (
            <div className="filter-input-group">
              <label htmlFor="filter-ticket">Ticket Zendesk</label>
              <select
                id="filter-ticket"
                value={filtroTicket}
                onChange={(e) => setFiltroTicket(e.target.value as FiltroTicket)}
              >
                {OPCOES_FILTRO_TICKET.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.label} ({contagemTicket[opcao.id]})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-input-group">
            <span className="filter-label">Anormal</span>
            <button
              type="button"
              className={`anomalia-filter-btn${somenteAnormais ? ' active' : ''}`}
              aria-pressed={somenteAnormais}
              onClick={() => setSomenteAnormais((v) => !v)}
              title="Notas com data de emissão diferente da data de integração"
            >
              <AlertIcon />
              Só anormais ({totalAnormais})
            </button>
          </div>

          <div className="filter-actions-col">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={clearAllFilters}
              title="Limpar todos os filtros aplicados"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        <div className="filter-meta-bar">
          <span className="results-counter">
            Mostrando <b>{filtered.length}</b> de <b>{integrations.length}</b> registros
          </span>
        </div>
      </div>

      {/* Tabela Responsiva */}
      <div className="panel-card">
        {!hasDataset ? (
          <EstadoVazio
            titulo="Nenhuma planilha carregada ainda"
            texto="Esta tela confere se cada nota emitida na Alloca07 chegou na Intelipost. Para começar, envie as duas planilhas do dia."
            passos={[
              <>Exporte a <b>Alloca07</b> no Protheus (notas emitidas).</>,
              <>Exporte o <b>relatório de envios</b> no portal da Intelipost.</>,
              <>Clique no botão abaixo e envie as duas juntas.</>,
            ]}
            acoes={[{ label: 'Enviar Alloca07 e Intelipost', onClick: openUpload }]}
          />
        ) : filtered.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-icon"><IconeBuscaVazio /></div>
            <h3>Nenhuma integração encontrada</h3>
            <p>Tente ajustar os termos de busca ou redefinir os filtros aplicados.</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={clearAllFilters}>
              Redefinir Filtros
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nota fiscal</th>
                  <th>Status</th>
                  <th>Tratativa</th>
                  <th>Tipo da nota</th>
                  <th>UF</th>
                  {emissores && !abaNaoIntegradas && <th>Emitido por</th>}
                  <th>Emissão</th>
                  <th>{abaNaoIntegradas ? 'Emitido por' : 'Integração'}</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limite).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="integration-name-cell">
                        <a href={`#/integrations/${item.id}`} className="integration-primary-name">
                          {isDataAnormal(item) && (
                            <span className="anomalia-alert" title={anomaliaDescricao(item)} aria-label={anomaliaDescricao(item)}>
                              <AlertIcon />
                            </span>
                          )}
                          {item.name}
                        </a>
                        <span className="integration-desc-preview">{item.description}</span>
                        {item.metadata?.notaFiscal && (
                          <span className="nf-tag">
                            NF: {item.metadata.notaFiscal}
                            {item.metadata.nfTriangular ? ` · Triangular: ${item.metadata.nfTriangular}` : ''}
                            {item.metadata.clienteDestino ? ` · ${item.metadata.clienteDestino}` : ''}
                          </span>
                        )}
                        {ticketsDe(item).length > 0 && (
                          <a
                            className="nf-tag"
                            href={`#/zendesk?q=${encodeURIComponent(ticketsDe(item)[0])}`}
                            title="Abrir na Baixa Zendesk"
                          >
                            Zendesk: {ticketsDe(item).map((t) => `#${t}`).join(' ')}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      <div className="tratativa-cell">
                        <button
                          type="button"
                          className={`status-badge tratativa-btn ${isTratado(item) ? 'success' : 'warning'}`}
                          onClick={() => setTratando(item)}
                          title={isTratado(item) ? 'Ver ou adicionar comentários' : 'Adicionar comentário e marcar como tratado'}
                        >
                          {isTratado(item) ? (
                            <>
                              <IconeCheckTratado />
                              Tratado
                            </>
                          ) : (
                            'Pendente'
                          )}
                        </button>
                        {tratativas[item.id]?.comentarios.length ? (
                          <span className="tratativa-last" title={tratativas[item.id].comentarios.at(-1)?.texto}>
                            {tratativas[item.id].comentarios.at(-1)?.texto}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="type-tag">{item.metadata?.tipoNota || '—'}</span>
                    </td>
                    <td className="nowrap" title={item.metadata?.cidade || undefined}>
                      {item.metadata?.uf || '—'}
                    </td>
                    {emissores && !abaNaoIntegradas && celulaEmissor(item)}
                    <td className="nowrap">{formatNoteDate(item.metadata?.dataEmissao)}</td>
                    {abaNaoIntegradas ? (
                      celulaEmissor(item)
                    ) : (
                      <td className={`nowrap${isDataAnormal(item) ? ' anomalia-date' : ''}`}>
                        {formatNoteDate(item.metadata?.dataIntegracao)}
                      </td>
                    )}
                    <td className="text-right">
                      <div className="action-buttons-group">
                        {item.status === 'error' && (
                          <button
                            type="button"
                            className="btn btn-danger-soft btn-xs"
                            onClick={() => reprocessIntegration(item.id)}
                            title="Reprocessar agora"
                          >
                            Reprocessar
                          </button>
                        )}
                        <a href={`#/integrations/${item.id}`} className="btn btn-outline btn-xs">
                          Detalhes
                        </a>
                        <button
                          type="button"
                          className="btn btn-ghost-danger btn-xs"
                          onClick={() => {
                            if (confirm(`Deseja realmente excluir a integração ${item.id}?`)) {
                              deleteIntegration(item.id);
                            }
                          }}
                          title="Excluir integração"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > limite && (
              <div className="mostrar-mais">
                <span>
                  Mostrando {limite.toLocaleString('pt-BR')} de {filtered.length.toLocaleString('pt-BR')}
                </span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setLimite((n) => n + PASSO_LISTA)}>
                  Mostrar mais {Math.min(PASSO_LISTA, filtered.length - limite).toLocaleString('pt-BR')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {tratando && <TratativaModal integration={tratando} onClose={() => setTratando(null)} />}
    </div>
  );
};
