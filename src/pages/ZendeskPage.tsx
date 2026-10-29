import React from 'react';
import * as XLSX from 'xlsx';
import { UploadCard } from '../components/common/UploadCard';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { exportarBaixaMassa } from '../services/baixaMassa';
import { useApp } from '../context/AppContext';
import { useRouter } from '../router/useRouter';
import { formatDateTimeBr } from '../services/tratativaService';
import { useDiaAtivo } from '../services/diaAtivo';
import { entregueParaBaixa, useEntregaPorTicket, type EntregaDoTicket } from '../hooks/useEntregaPorTicket';
import { VincularNfModal } from '../components/zendesk/VincularNfModal';
import {
  MODAIS_PROPRIOS,
  TRANSPORTADORAS,
  entregasStore,
  formatBrDate,
  importTransportadoraFile,
  useEntregas,
  type EntregaNf,
  type ModalProprio,
  type TransportadoraId,
} from '../services/entregasImport';
import {
  NF_SITUACOES,
  ZENDESK_ABAS,
  contarZendesk,
  formatZendeskDate,
  importNfFile,
  importNfManualFile,
  importZendeskFile,
  resumoNf,
  useZendesk,
  zendeskStore,
  type NfResumo,
  type NfSituacao,
  type ZendeskAba,
  type ZendeskTicket,
} from '../services/zendeskImport';

const MODELO_TRANSPORTADORA: Record<TransportadoraId, string> = {
  spfly: 'Relatorio_Entrega da SPfly (.xls / .csv)',
  jamef: 'JCENTREGA da Jamef (.xlsx)',
  certex: 'Relatorio_Entrega da Certex (.xls / .csv)',
};

const SITUACAO_BADGE: Record<NfSituacao, string> = { com_nf: 'success', sem_nf: 'warning', fora: 'danger' };

const SituacaoBadge: React.FC<{ resumo: NfResumo }> = ({ resumo }) => {
  const parcial = resumo.situacao === 'sem_nf' && resumo.comNf > 0;
  const label = parcial
    ? `Parcial · ${resumo.comNf} de ${resumo.registros.length}`
    : NF_SITUACOES.find((s) => s.id === resumo.situacao)!.label;
  return <span className={`status-badge ${SITUACAO_BADGE[resumo.situacao]}`}>{label}</span>;
};

interface TicketLinha {
  ticket: ZendeskTicket;
  resumo: NfResumo | null;
}

type Aba = ZendeskAba | 'entregues' | ModalProprio;

const ehAbaModal = (aba: string | null): aba is ModalProprio => MODAIS_PROPRIOS.some((m) => m.id === aba);

const nomeTransportadora = (entrega: EntregaNf) =>
  entrega.evento?.transportadora ||
  TRANSPORTADORAS.find((t) => t.id === entrega.transportadora)?.label ||
  MODAIS_PROPRIOS.find((m) => m.id === entrega.modal)?.label ||
  (entrega.situacao === 'mesmo_dia' ? 'Mesmo dia' : '—');

/** Transações da Intelipost primeiro; sem envio lá, a transportadora do cruzamento Alloca07 × Intelipost. */
const transportadoraDaNf = (nf: string, entrega: EntregaNf, transportadoras: Map<string, string>) => {
  const nome = nomeTransportadora(entrega);
  return nome !== '—' ? nome : transportadoras.get(nf) ?? '—';
};

const statusZendesk = (aba: ZendeskAba) => ZENDESK_ABAS.find((a) => a.id === aba)?.label ?? aba;

const EntreguesTable: React.FC<{
  linhas: TicketLinha[];
  entregas: Map<string, EntregaDoTicket>;
  transportadoras: Map<string, string>;
  comStatus?: boolean;
  vazio?: string;
}> = ({ linhas, entregas, transportadoras, comStatus = false, vazio = 'Nenhum ticket com NF entregue.' }) => {
  if (linhas.length === 0) {
    return <p className="text-muted">{vazio}</p>;
  }
  return (
    <div className="table-responsive">
      <table className="data-table zendesk-table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status Zendesk</th>
            <th>NF</th>
            <th>Transportadora</th>
            <th>Base de saída</th>
            {comStatus && <th>Último status</th>}
            <th>Data entrega</th>
            <th>Recebedor</th>
            <th>Organização</th>
            <th>UF</th>
            <th>Criado em</th>
            <th>Atualizado em</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ ticket }) => {
            const nfs = entregas.get(ticket.id)?.nfs ?? [];
            const coluna = (render: (item: (typeof nfs)[number]) => React.ReactNode) => (
              <div className="zendesk-lines">
                {nfs.map((item) => (
                  <span key={item.nf}>{render(item)}</span>
                ))}
              </div>
            );
            return (
              <tr key={ticket.id}>
                <td><code className="id-badge">#{ticket.id}</code></td>
                <td>{statusZendesk(ticket.aba)}</td>
                <td>{coluna((i) => i.nf)}</td>
                <td>{coluna((i) => transportadoraDaNf(i.nf, i.entrega, transportadoras))}</td>
                <td>{coluna((i) => i.entrega.evento?.base || '—')}</td>
                {comStatus && <td>{coluna((i) => i.entrega.evento?.ultimoStatus || 'Sem rastreio')}</td>}
                <td>
                  {coluna((i) =>
                    i.entrega.evento?.dataEntrega ? (
                      <>
                        {formatBrDate(i.entrega.evento.dataEntrega)}
                        {i.entrega.viaNf && <span className="text-muted"> · pela NF {i.entrega.viaNf} (triangular)</span>}
                      </>
                    ) : i.entrega.modal === 'frota' && entregueParaBaixa(i.entrega) ? (
                      <span className="text-muted">Frota interna · mesmo dia</span>
                    ) : (
                      '—'
                    ),
                  )}
                </td>
                <td>{coluna((i) => i.entrega.evento?.recebedor || '—')}</td>
                <td className="zendesk-org">{ticket.organizacao || '—'}</td>
                <td>{ticket.uf || '—'}</td>
                <td>{formatZendeskDate(ticket.criadoEm)}</td>
                <td>{formatZendeskDate(ticket.atualizadoEm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const RegistroLines: React.FC<{ resumo: NfResumo | null; render: (index: number) => React.ReactNode }> = ({
  resumo,
  render,
}) => {
  if (!resumo || resumo.registros.length === 0) return <>—</>;
  return (
    <div className="zendesk-lines">
      {resumo.registros.map((_, index) => (
        <span key={index}>{render(index)}</span>
      ))}
    </div>
  );
};

const TicketsTable: React.FC<{
  linhas: TicketLinha[];
  comNf: boolean;
  transportadoras: Map<string, string>;
  onAbrir?: (linha: TicketLinha) => void;
}> = ({ linhas, comNf, transportadoras, onAbrir }) => {
  if (linhas.length === 0) {
    return <p className="text-muted">Nenhum ticket encontrado.</p>;
  }
  return (
    <div className="table-responsive">
      <table className="data-table zendesk-table">
        <thead>
          <tr>
            <th>Ticket</th>
            {comNf && (
              <>
                <th>Situação NF</th>
                <th>NF</th>
                <th>Transportadora</th>
                <th>Romaneio</th>
                <th>Etapa atual</th>
              </>
            )}
            <th>Organização</th>
            <th>UF</th>
            <th>Localidade</th>
            <th>Grupo</th>
            <th>Prioridade</th>
            <th>Criado em</th>
            <th>Atualizado em</th>
            <th className="text-right">Idade (dias)</th>
            <th className="text-right">Sem atualização (dias)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const { ticket, resumo } = linha;
            return (
            <tr
              key={ticket.id}
              className={onAbrir ? 'clicavel' : undefined}
              onClick={onAbrir && (() => onAbrir(linha))}
              title={onAbrir ? 'Clique para vincular ou corrigir a NF deste ticket' : undefined}
            >
              <td><code className="id-badge">#{ticket.id}</code></td>
              {comNf && (
                <>
                  <td>{resumo && <SituacaoBadge resumo={resumo} />}</td>
                  <td>
                    <RegistroLines
                      resumo={resumo}
                      render={(i) => resumo!.registros[i].nf ?? <span className="text-muted">Sem nota</span>}
                    />
                  </td>
                  <td>
                    <RegistroLines
                      resumo={resumo}
                      render={(i) => {
                        const nota = resumo!.registros[i].nf;
                        return (nota && transportadoras.get(nota)) || '—';
                      }}
                    />
                  </td>
                  <td>
                    <RegistroLines
                      resumo={resumo}
                      render={(i) => {
                        const r = resumo!.registros[i];
                        return `${r.romaneio || '—'}${r.dataRomaneio ? ` · ${formatZendeskDate(r.dataRomaneio)}` : ''}`;
                      }}
                    />
                  </td>
                  <td>
                    <RegistroLines resumo={resumo} render={(i) => resumo!.registros[i].etapa || '—'} />
                  </td>
                </>
              )}
              <td className="zendesk-org">{ticket.organizacao || '—'}</td>
              <td>{ticket.uf || '—'}</td>
              <td>{ticket.localidade || '—'}</td>
              <td>{ticket.grupo || '—'}</td>
              <td>{ticket.prioridade || '—'}</td>
              <td>{formatZendeskDate(ticket.criadoEm)}</td>
              <td>{formatZendeskDate(ticket.atualizadoEm)}</td>
              <td className="text-right">{ticket.idadeDias != null ? Math.floor(ticket.idadeDias) : '—'}</td>
              <td className="text-right">
                {ticket.diasSemAtualizacao != null ? Math.floor(ticket.diasSemAtualizacao) : '—'}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const isSituacao = (value: string | null): value is NfSituacao => NF_SITUACOES.some((s) => s.id === value);

const situacaoSlug: Record<NfSituacao, string> = { com_nf: 'com_nf', sem_nf: 'sem_nf', fora: 'fora_da_planilha' };
const abaSlug: Record<Aba, string> = {
  em_rota: 'em_rota',
  aguardando_expedicao: 'aguardando_expedicao',
  entregues: 'ja_entregues',
  frota: 'frota_interna',
  lalamove: 'lalamove',
  proprio: 'o_proprio',
};

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Serial de data do Excel calculado em UTC, para não deslocar o dia pelo fuso do navegador. */
function excelSerial(value: string): number | string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return value;
  const [, y, m, d, hh = '0', mm = '0'] = match;
  return (Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)) - EXCEL_EPOCH) / 86_400_000;
}

function exportarTicketLog(linhas: TicketLinha[], transportadoras: Map<string, string>, filtro: string) {
  const header = ['id_zendesk', 'nota_fiscal', 'transportadora', 'atualizado_em', 'criado_em'];
  const rows = linhas.map(({ ticket, resumo }) => {
    const notas = [...new Set((resumo?.registros ?? []).map((r) => r.nf).filter((n): n is string => !!n))];
    const transp = [...new Set(notas.map((n) => transportadoras.get(n)).filter((t): t is string => !!t))];
    return [
      /^\d+$/.test(ticket.id) ? Number(ticket.id) : ticket.id,
      notas.join(' / '),
      transp.join(' / '),
      excelSerial(ticket.atualizadoEm),
      excelSerial(ticket.criadoEm),
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((_, index) => {
    for (const [col, format] of [[3, 'dd/mm/yyyy hh:mm'], [4, 'dd/mm/yyyy']] as const) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })];
      if (cell?.t === 'n') cell.z = format;
    }
  });
  sheet['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 17 }, { wch: 12 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tickets');
  const hoje = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `zendesk_ticket_log_${filtro}_${hoje}.xlsx`);
}

function exportarEntregues(
  linhas: TicketLinha[],
  entregas: Map<string, EntregaDoTicket>,
  transportadoras: Map<string, string>,
  filtro: string,
  prefixo: string,
) {
  const header = [
    'id_zendesk', 'status_zendesk', 'nota_fiscal', 'transportadora', 'base_saida', 'ultimo_status', 'data_entrega',
    'recebedor', 'organizacao', 'uf',
    'atualizado_em', 'criado_em',
  ];
  const rows = linhas.map(({ ticket }) => {
    const nfs = entregas.get(ticket.id)?.nfs ?? [];
    const datas = nfs.map((i) => i.entrega.evento?.dataEntrega ?? '').filter(Boolean).sort();
    return [
      /^\d+$/.test(ticket.id) ? Number(ticket.id) : ticket.id,
      statusZendesk(ticket.aba),
      nfs.map((i) => i.nf).join(' / '),
      [...new Set(nfs.map((i) => transportadoraDaNf(i.nf, i.entrega, transportadoras)))].join(' / '),
      nfs.map((i) => i.entrega.evento?.base || '—').join(' / '),
      nfs.map((i) => i.entrega.evento?.ultimoStatus || 'Sem rastreio').join(' / '),
      datas.length ? excelSerial(datas[datas.length - 1]) : '',
      [...new Set(nfs.map((i) => i.entrega.evento?.recebedor).filter(Boolean))].join(' / '),
      ticket.organizacao,
      ticket.uf,
      excelSerial(ticket.atualizadoEm),
      excelSerial(ticket.criadoEm),
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    for (const col of [6, 10, 11]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })];
      if (cell?.t === 'n') cell.z = Number.isInteger(row[col]) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
    }
  });
  sheet['!cols'] = [14, 20, 22, 18, 12, 34, 17, 26, 36, 5, 17, 12].map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tickets');
  XLSX.writeFile(workbook, `zendesk_${prefixo}_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportarTodos(
  linhas: TicketLinha[],
  entregas: Map<string, EntregaDoTicket>,
  transportadoras: Map<string, string>,
  filtro: string,
) {
  const header = [
    'id_zendesk', 'status_zendesk', 'situacao_nf', 'nota_fiscal', 'transportadora', 'base_saida', 'ultimo_status',
    'data_entrega', 'recebedor', 'organizacao', 'uf', 'atualizado_em', 'criado_em', 'idade_dias',
  ];
  const rows = linhas.map(({ ticket, resumo }) => {
    const nfs = entregas.get(ticket.id)?.nfs ?? [];
    const notas = nfs.length
      ? nfs.map((i) => i.nf)
      : [...new Set((resumo?.registros ?? []).map((r) => r.nf).filter((n): n is string => !!n))];
    const transp = nfs.length
      ? nfs.map((i) => transportadoraDaNf(i.nf, i.entrega, transportadoras)).filter((t) => t !== '—')
      : notas.map((n) => transportadoras.get(n)).filter((t): t is string => !!t);
    const datas = nfs.map((i) => i.entrega.evento?.dataEntrega ?? '').filter(Boolean).sort();
    return [
      /^\d+$/.test(ticket.id) ? Number(ticket.id) : ticket.id,
      statusZendesk(ticket.aba),
      resumo ? NF_SITUACOES.find((s) => s.id === resumo.situacao)!.label : '',
      notas.join(' / '),
      [...new Set(transp)].join(' / '),
      nfs.map((i) => i.entrega.evento?.base || '—').join(' / '),
      nfs.map((i) => i.entrega.evento?.ultimoStatus || 'Sem rastreio').join(' / '),
      datas.length ? excelSerial(datas[datas.length - 1]) : '',
      [...new Set(nfs.map((i) => i.entrega.evento?.recebedor).filter(Boolean))].join(' / '),
      ticket.organizacao,
      ticket.uf,
      excelSerial(ticket.atualizadoEm),
      excelSerial(ticket.criadoEm),
      ticket.idadeDias != null ? Math.floor(ticket.idadeDias) : '',
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  rows.forEach((row, index) => {
    for (const col of [7, 11, 12]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: index + 1, c: col })];
      if (cell?.t === 'n') cell.z = Number.isInteger(row[col]) ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm';
    }
  });
  sheet['!cols'] = [14, 22, 16, 22, 18, 12, 34, 17, 26, 36, 5, 17, 12, 10].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1' };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tickets');
  XLSX.writeFile(workbook, `zendesk_todos_${filtro}_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

export const ZendeskPage: React.FC = () => {
  const zendesk = useZendesk();
  const entregas = useEntregas();
  const somenteLeitura = useDiaAtivo() !== null;
  const { integrations, addToast } = useApp();
  const { searchParams, navigate } = useRouter();
  const abaParam = searchParams.get('aba');
  const [aba, setAba] = React.useState<Aba>(abaParam === 'entregues' || ehAbaModal(abaParam) ? abaParam : 'em_rota');
  React.useEffect(() => {
    if (abaParam === 'entregues' || ehAbaModal(abaParam) || abaParam === 'em_rota' || abaParam === 'aguardando_expedicao')
      setAba(abaParam);
    else setAba((atual) => (atual === 'entregues' || ehAbaModal(atual) ? 'em_rota' : atual));
  }, [abaParam]);
  const entregaPorTicket = useEntregaPorTicket();
  const qParam = searchParams.get('q');
  const [busca, setBusca] = React.useState(qParam ?? '');
  React.useEffect(() => {
    if (qParam !== null) setBusca(qParam);
  }, [qParam]);

  const { tickets, nf } = zendesk;
  const { transportadoras: planilhasTransp } = entregas;
  const contagem = React.useMemo(() => contarZendesk(zendesk), [zendesk]);
  const nfParam = searchParams.get('nf');
  const situacao = nf && isSituacao(nfParam) ? nfParam : null;

  const linhas = React.useMemo<TicketLinha[]>(
    () => (tickets?.tickets ?? []).map((ticket) => ({ ticket, resumo: nf ? resumoNf(nf, ticket.id) : null })),
    [tickets, nf],
  );
  const daSituacao = situacao ? linhas.filter((l) => l.resumo?.situacao === situacao) : linhas;
  const [vinculando, setVinculando] = React.useState<string | null>(null);
  const linhaVinculo = vinculando ? linhas.find((l) => l.ticket.id === vinculando) : undefined;

  const transportadoras = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of integrations) {
      const transp = item.metadata?.transportadora;
      if (!transp) continue;
      for (const nota of [item.metadata?.notaFiscal, item.metadata?.nfTriangular]) {
        if (nota && !map.has(nota)) map.set(nota, transp);
      }
    }
    for (const { nfs } of entregaPorTicket.values()) {
      for (const { nf: nota, entrega } of nfs) {
        const transp = nomeTransportadora(entrega);
        if (!map.has(nota) && transp !== '—') map.set(nota, transp);
      }
    }
    return map;
  }, [integrations, entregaPorTicket]);

  const jaEntregue = (l: TicketLinha) => entregaPorTicket.get(l.ticket.id)?.completa ?? false;
  /** Entregues (carriers, Frota ou Lalamove): saem das abas de status e ficam nas abas de baixa. */
  const todasEntregues = (l: TicketLinha) => {
    const e = entregaPorTicket.get(l.ticket.id);
    return !!e && (e.completa || (e.nfs.length > 0 && e.entregues === e.nfs.length));
  };
  const doStatus = (status: string) => (l: TicketLinha) => l.ticket.aba === status && !todasEntregues(l);
  const parcial = (l: TicketLinha) => {
    const e = entregaPorTicket.get(l.ticket.id);
    return !!e && !e.completa && e.entregues > 0;
  };

  const q = busca.trim().toLowerCase();
  const filtradas = daSituacao
    .filter(
      ({ ticket, resumo }) =>
        !q ||
        ticket.id.includes(q) ||
        ticket.organizacao.toLowerCase().includes(q) ||
        ticket.grupoEconomico.toLowerCase().includes(q) ||
        ticket.uf.toLowerCase() === q ||
        (resumo?.registros ?? []).some(
          (r) => r.nf === q || r.romaneio === q || (r.nf && transportadoras.get(r.nf)?.toLowerCase().includes(q)),
        ),
    )
    .sort((a, b) => (b.ticket.idadeDias ?? 0) - (a.ticket.idadeDias ?? 0));
  const temModal = (modal: ModalProprio) => (l: TicketLinha) => (entregaPorTicket.get(l.ticket.id)?.porModal[modal] ?? 0) > 0;
  const abaModal = ehAbaModal(aba) ? MODAIS_PROPRIOS.find((m) => m.id === aba)! : null;
  const linhasDaAba =
    aba === 'entregues'
      ? filtradas.filter(jaEntregue)
      : abaModal
        ? filtradas.filter(temModal(abaModal.id))
        : filtradas.filter(doStatus(aba));
  const entreguesForaDaAba =
    aba === 'entregues' || abaModal ? 0 : filtradas.filter((l) => l.ticket.aba === aba && todasEntregues(l)).length;
  /** Baixa em massa = tickets da aba aberta (Em rota, Já entregues, Lalamove, Frota, etc.). */
  const ticketsParaBaixa = linhasDaAba;
  const slugBaixa = `${situacao ? situacaoSlug[situacao] : 'todos'}_${abaSlug[aba]}`;
  const parciais = aba === 'entregues' ? filtradas.filter(parcial).length : 0;
  const nfsDaAba = [
    ...new Set(
      linhasDaAba.flatMap(({ ticket, resumo }) =>
        aba === 'entregues'
          ? (entregaPorTicket.get(ticket.id)?.nfs ?? []).map((i) => i.nf)
          : abaModal
            ? (entregaPorTicket.get(ticket.id)?.nfs ?? []).filter((i) => i.entrega.modal === abaModal.id).map((i) => i.nf)
            : (resumo?.registros ?? []).map((r) => r.nf),
      ),
    ),
  ].filter((n): n is string => !!n);

  const copiarNfs = async () => {
    await copiarTexto(nfsDaAba.join(','));
    addToast(
      'success',
      'NFs copiadas',
      `${nfsDaAba.length} NFs${abaModal ? ` da ${abaModal.label}` : ''} de ${linhasDaAba.length} tickets, separadas por vírgula.`,
    );
  };

  const ticketsDaAba = [...new Set(linhasDaAba.map(({ ticket }) => ticket.id))];
  const copiarTickets = async () => {
    await copiarTexto(ticketsDaAba.join(','));
    addToast('success', 'Tickets copiados', `${ticketsDaAba.length} tickets do Zendesk, separados por vírgula.`);
  };

  const nfTabs: { id: NfSituacao | null; label: string; count: number }[] = [
    { id: null, label: 'Todos', count: contagem.total },
    ...NF_SITUACOES.map((s) => ({ id: s.id, label: s.label, count: contagem.porSituacao?.[s.id] ?? 0 })),
  ];

  return (
    <div className="page-zendesk">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Operação</span>
          <h1 className="page-title">Baixa Zendesk</h1>
          <p className="page-subtitle">
            Zendesk e romaneio (tem NF?) e SPfly, Jamef e Certex (entregue pela data na planilha da transportadora).
          </p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/zendesk')}>
            Painel
          </button>
        </div>
      </div>

      {!somenteLeitura && (
      <div className="zendesk-slots zendesk-slots-6">
        <UploadCard
          title="1 · Zendesk (Aging)"
          emptyLabel="Arraste o Aging do Zendesk ou clique para escolher"
          hint="Tickets em rota / aguardando expedição (.xlsx)"
          meta={
            tickets && (
              <>
                <b>{tickets.fileName}</b> · {tickets.totalPlanilha} na planilha · {tickets.tickets.length} nos status de
                baixa · {formatDateTimeBr(tickets.importadoEm)}
              </>
            )
          }
          onFile={async (file) => zendeskStore.setTickets(await importZendeskFile(file))}
          onRemove={() => zendeskStore.setTickets(null)}
        />
        <UploadCard
          title="2 · Romaneio (Base_Dados)"
          emptyLabel="Arraste o romaneio ou clique para escolher"
          hint="Valida se o ticket tem NF · aba Base_Dados"
          meta={
            nf && (
              <>
                <b>{nf.fileName}</b> · {nf.totalLinhas} romaneios · {formatDateTimeBr(nf.importadoEm)}
                {nf.filtrado && (
                  <>
                    <br />
                    Só tickets do Zendesk atual. Se trocar o Aging, envie o romaneio de novo.
                  </>
                )}
              </>
            )
          }
          onFile={async (file) => zendeskStore.setNf(await importNfFile(file))}
          onRemove={() => zendeskStore.setNf(null)}
        />
        <UploadCard
          title="2b · NFs informadas manualmente"
          emptyLabel="Arraste a planilha com ticket e NF ou clique para escolher"
          hint="Colunas id_zendesk e NF (ou nota_fiscal); nf_triangular é opcional. Também dá para clicar no ticket da lista e vincular a NF ali. O ticket listado vale pelas NFs informadas, no lugar das do romaneio; a entrega continua conferida nas transportadoras."
          meta={
            zendesk.manual && (
              <>
                <b>{zendesk.manual.fileName}</b> · {Object.keys(zendesk.manual.porTicket).length} tickets ·{' '}
                {Object.values(zendesk.manual.porTicket).flat().length} NFs · {formatDateTimeBr(zendesk.manual.importadoEm)}
                {!nf && (
                  <>
                    <br />
                    Envie também o romaneio: as NFs manuais completam o que falta nele.
                  </>
                )}
              </>
            )
          }
          onFile={async (file) => zendeskStore.setManual(await importNfManualFile(file))}
          onAdicionar={async (file) => zendeskStore.adicionarManual(await importNfManualFile(file))}
          onRemove={() => zendeskStore.setManual(null)}
        />
        {TRANSPORTADORAS.map(({ id, label }, index) => {
          const planilha = planilhasTransp[id];
          const entregues = planilha
            ? Object.values(planilha.porNf).filter((eventos) => eventos.some((e) => e.dataEntrega)).length
            : 0;
          return (
            <UploadCard
              key={id}
              title={`${index + 3} · ${label}`}
              emptyLabel={`Arraste o Relatorio_Entrega / JCENTREGA da ${label}`}
              hint={`${MODELO_TRANSPORTADORA[id]} · confirma se está entregue (data de entrega)`}
              meta={
                planilha && (
                  <>
                    <b>{planilha.fileName}</b> · {Object.keys(planilha.porNf).length} NFs · {entregues} entregues
                    {planilha.ignoradas ? ` · ${planilha.ignoradas} ignoradas` : ''} ·{' '}
                    {formatDateTimeBr(planilha.importadoEm)}
                  </>
                )
              }
              onFile={async (file) => entregasStore.setTransportadora(id, await importTransportadoraFile(file))}
              onAdicionar={async (file) =>
                entregasStore.adicionarTransportadora(id, await importTransportadoraFile(file))
              }
              onRemove={() => entregasStore.setTransportadora(id, null)}
            />
          );
        })}
      </div>
      )}

      {!tickets && (
        <EstadoVazio
          titulo={somenteLeitura ? 'Nenhum ticket salvo neste dia' : 'Envie a planilha 1 · Zendesk (Aging)'}
          texto={
            somenteLeitura
              ? 'Neste dia a planilha de tickets não tinha sido carregada.'
              : 'Depois do Aging: romaneio (tem NF?) e SPfly, Jamef e Certex (entregue pela data de entrega).'
          }
          passos={
            somenteLeitura
              ? undefined
              : [
                  <>1 · Aging do Zendesk (tickets).</>,
                  <>2 · Romaneio Base_Dados (tem NF?).</>,
                  <>3–5 · Relatórios SPfly, Jamef e Certex (data de entrega = entregue).</>,
                  <>Aba <b>Já entregues — dar baixa</b> reúne os tickets com NF já entregue na transportadora.</>,
                ]
          }
        />
      )}

      {tickets && (
        <div className="panel-card">
          <div className="detail-tabs-bar zendesk-tabs" role="tablist" aria-label="Status do ticket">
            {ZENDESK_ABAS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={aba === item.id}
                className={`detail-tab-btn ${aba === item.id ? 'active' : ''}`}
                onClick={() => setAba(item.id)}
              >
                {item.label} ({daSituacao.filter(doStatus(item.id)).length})
              </button>
            ))}
            {nf && (
              <button
                type="button"
                role="tab"
                aria-selected={aba === 'entregues'}
                className={`detail-tab-btn tab-acao ${aba === 'entregues' ? 'active' : ''}`}
                onClick={() => setAba('entregues')}
                title="Pelo menos uma NF do ticket entregue nas planilhas SPfly/Jamef/Certex (data de entrega) ou enviada pela Frota interna (entrega no mesmo dia). Lalamove fica fora."
              >
                Já entregues — dar baixa ({daSituacao.filter(jaEntregue).length})
              </button>
            )}
            {nf &&
              MODAIS_PROPRIOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={aba === m.id}
                  className={`detail-tab-btn ${aba === m.id ? 'active' : ''}`}
                  onClick={() => setAba(m.id)}
                  title={
                    m.id === 'frota'
                      ? 'Tickets com NF da Frota interna. Contam como entregues e também estão em Já entregues — dar baixa.'
                      : m.id === 'proprio'
                        ? 'Tickets com NF que saiu como "O próprio" no romaneio (sem transportadora contratada).'
                        : `Tickets com NF da ${m.label}. Fora da baixa das transportadoras.`
                  }
                >
                  {m.label} ({daSituacao.filter(temModal(m.id)).length})
                </button>
              ))}
          </div>

          <div className="filter-inputs-row entregas-filtros">
            <div className="filter-input-group flex-1 zendesk-search">
              <label htmlFor="zendesk-busca">Busca</label>
              <input
                id="zendesk-busca"
                type="search"
                placeholder="Ticket, NF, romaneio, organização ou UF..."
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>
            {nf && (
              <div className="filter-input-group">
                <label htmlFor="zendesk-situacao-nf">Situação da NF</label>
                <select
                  id="zendesk-situacao-nf"
                  value={situacao ?? ''}
                  onChange={(event) =>
                    navigate('/zendesk', {
                      view: 'lista',
                      ...(event.target.value ? { nf: event.target.value } : {}),
                      ...(aba !== 'em_rota' ? { aba } : {}),
                    })
                  }
                >
                  {nfTabs.map((item) => (
                    <option key={item.id ?? 'todos'} value={item.id ?? ''}>
                      {item.id ? item.label : 'Todas'} ({item.count})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="zendesk-count-bar">
            <p className="text-muted zendesk-count">
              {linhasDaAba.length} tickets · ordenados do mais antigo para o mais novo
              {aba === 'entregues' && parciais > 0 && (
                <> · {parciais} com NF entregue ficaram de fora (linha do romaneio sem NF ou Lalamove)</>
              )}
              {entreguesForaDaAba > 0 && (
                <> · {entreguesForaDaAba} já entregues saíram desta aba (estão em Já entregues, Frota ou Lalamove)</>
              )}
            </p>
            <div className="zendesk-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={nfsDaAba.length === 0}
                onClick={copiarNfs}
                title="Copia as NFs dos tickets desta lista no formato 123,456,789 para colar numa busca em lote"
              >
                Copiar NFs ({nfsDaAba.length})
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={ticketsDaAba.length === 0}
                onClick={copiarTickets}
                title="Copia os números dos tickets do Zendesk desta lista no formato 123,456,789"
              >
                Copiar tickets ({ticketsDaAba.length})
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={ticketsParaBaixa.length === 0}
                onClick={() =>
                  exportarBaixaMassa(
                    ticketsParaBaixa.map(({ ticket }) => ticket.id),
                    slugBaixa,
                  )
                }
                title="Gera a planilha de baixa em massa só com os tickets desta aba"
              >
                Baixa em massa ({ticketsParaBaixa.length})
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={linhasDaAba.length === 0}
                onClick={() => {
                  const filtro = `${situacao ? situacaoSlug[situacao] : 'todos'}_${abaSlug[aba]}`;
                  if (aba === 'entregues' || abaModal)
                    exportarEntregues(
                      linhasDaAba,
                      entregaPorTicket,
                      transportadoras,
                      situacao ? situacaoSlug[situacao] : 'todos',
                      abaSlug[aba],
                    );
                  else exportarTicketLog(linhasDaAba, transportadoras, filtro);
                }}
              >
                Exportar ({linhasDaAba.length})
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={filtradas.length === 0}
                onClick={() =>
                  exportarTodos(filtradas, entregaPorTicket, transportadoras, situacao ? situacaoSlug[situacao] : 'todos')
                }
                title={`Exporta todos os tickets${situacao ? ` "${NF_SITUACOES.find((s) => s.id === situacao)!.label}"` : ''}, de Em rota e Aguardando expedição juntos`}
              >
                Exportar todos ({filtradas.length})
              </button>
            </div>
          </div>
          {aba === 'entregues' ? (
            <EntreguesTable
              linhas={linhasDaAba}
              entregas={entregaPorTicket}
              transportadoras={transportadoras}
              vazio="Nenhum ticket com NF entregue nas planilhas das transportadoras ou enviada pela Frota interna."
            />
          ) : abaModal ? (
            <EntreguesTable
              linhas={linhasDaAba}
              entregas={entregaPorTicket}
              transportadoras={transportadoras}
              comStatus
              vazio={
                abaModal.id === 'frota'
                  ? 'Nenhum ticket de Frota interna nas planilhas carregadas.'
                  : `Nenhum ticket com NF da ${abaModal.label}.`
              }
            />
          ) : (
            <TicketsTable
              linhas={linhasDaAba}
              comNf={!!nf}
              transportadoras={transportadoras}
              onAbrir={nf && !somenteLeitura ? (linha) => setVinculando(linha.ticket.id) : undefined}
            />
          )}
        </div>
      )}
      {linhaVinculo && (
        <VincularNfModal
          ticket={linhaVinculo.ticket}
          resumo={linhaVinculo.resumo}
          manual={zendesk.manual}
          entrega={entregaPorTicket.get(linhaVinculo.ticket.id)}
          onClose={() => setVinculando(null)}
        />
      )}
    </div>
  );
};
