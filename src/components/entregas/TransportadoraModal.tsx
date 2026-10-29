import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  TIPOS_COMPARACAO,
  type ComparacaoFontes,
  type LinhaComparacao,
  type TipoComparacao,
} from '../../services/compararFontes';
import { formatBrDate } from '../../services/entregasImport';
import { META_SLA } from '../../services/torre';
import { diasUteis, resumirSla, type NotaSla, type SlaStatus } from '../../services/sla';
import { Botao, Chips, Modal, Tag, type Tom } from '../../ui/componentes';

type Aba = 'pendentes' | SlaStatus | TipoComparacao;

const ABAS_SLA: { id: SlaStatus; label: string; tom?: Tom }[] = [
  { id: 'vencida', label: 'Vencidas', tom: 'perigo' },
  { id: 'em_transito', label: 'Em trânsito no prazo' },
  { id: 'atrasada', label: 'Entregues com atraso', tom: 'atencao' },
  { id: 'no_prazo', label: 'Entregues no prazo' },
  { id: 'sem_previsao', label: 'Sem previsão' },
];

const ABAS_COMPARACAO: { id: TipoComparacao; label: string; tom?: Tom }[] = [
  { id: 'entregue_planilha_pendente_intelipost', label: 'Gap Intelipost', tom: 'perigo' },
  { id: 'entregue_intelipost_pendente_planilha', label: 'Entregue só na Intelipost', tom: 'atencao' },
  { id: 'so_intelipost', label: 'Só na Intelipost', tom: 'atencao' },
  { id: 'so_planilha', label: 'Só na planilha' },
];

/** Como a NF aparece nas duas fontes: Transações Intelipost × planilha da transportadora. */
const CONFERE: Record<TipoComparacao, { texto: string; tom: Tom }> = {
  ambos_entregues: { texto: 'Bate', tom: 'sucesso' },
  ambos_pendentes: { texto: 'Bate', tom: 'sucesso' },
  entregue_planilha_pendente_intelipost: { texto: 'Intelipost sem baixa', tom: 'perigo' },
  entregue_intelipost_pendente_planilha: { texto: 'Carrier sem entrega', tom: 'atencao' },
  so_intelipost: { texto: 'Só na Intelipost', tom: 'atencao' },
  so_planilha: { texto: 'Fora das Transações', tom: '' },
};

const LIMITE = 300;
const fmt = (n: number) => n.toLocaleString('pt-BR');
const data = (iso: string) => (iso ? formatBrDate(iso) : '—');
const ehComparacao = (aba: Aba): aba is TipoComparacao => ABAS_COMPARACAO.some((a) => a.id === aba);
const naoEntregue = (n: NotaSla) => !n.dataEntrega;
const du = (n: number) => `${n} d.u.`;

/** Prazo da NF contra a previsão da transportadora, em dias úteis. */
function prazo(n: NotaSla, hoje: string): { texto: string; tom: Tom; ordem: number } {
  if (!n.previsao) return { texto: 'Sem previsão', tom: '', ordem: 2 };
  if (n.dataEntrega) {
    return n.status === 'atrasada'
      ? { texto: `Entregue ${du(n.atraso ?? 0)} depois`, tom: 'atencao', ordem: 4 }
      : { texto: 'Entregue no prazo', tom: 'sucesso', ordem: 5 };
  }
  if (n.status === 'vencida') return { texto: `Vencida há ${du(n.atraso ?? 0)}`, tom: 'perigo', ordem: 0 };
  const faltam = diasUteis(hoje, n.previsao);
  return { texto: faltam <= 0 ? 'No prazo · vence hoje' : `No prazo · faltam ${du(faltam)}`, tom: faltam <= 1 ? 'atencao' : 'sucesso', ordem: 1 };
}

export const TransportadoraModal: React.FC<{
  label: string;
  notas: NotaSla[];
  comparacao: ComparacaoFontes | null;
  hoje: string;
  onAbrirConferencia: () => void;
  onClose: () => void;
}> = ({ label, notas, comparacao, hoje, onAbrirConferencia, onClose }) => {
  const resumo = useMemo(() => resumirSla(notas), [notas]);
  const pendentes = useMemo(() => notas.filter(naoEntregue), [notas]);
  const porNf = useMemo(() => new Map((comparacao?.linhas ?? []).map((l) => [l.nf, l])), [comparacao]);

  const contagem = (aba: Aba) =>
    aba === 'pendentes' ? pendentes.length : ehComparacao(aba) ? comparacao?.contagem[aba] ?? 0 : resumo.porStatus[aba];

  const opcoes = [
    { id: 'pendentes' as Aba, label: 'Não entregues', tom: 'perigo' as Tom, contagem: pendentes.length },
    ...ABAS_SLA.map((a) => ({ ...a, contagem: resumo.porStatus[a.id] })),
    ...(comparacao ? ABAS_COMPARACAO.map((a) => ({ ...a, contagem: comparacao.contagem[a.id] })) : []),
  ].filter((o) => o.contagem > 0);

  const [aba, setAba] = useState<Aba>(() => opcoes[0]?.id ?? 'pendentes');
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const casa = (nf: string, destinatario: string, cidade: string) =>
    !termo || nf.includes(termo) || destinatario.toLowerCase().includes(termo) || cidade.toLowerCase().includes(termo);

  const linhasNotas = useMemo(() => {
    if (ehComparacao(aba)) return [];
    const base = aba === 'pendentes' ? pendentes : notas.filter((n) => n.status === aba);
    return base
      .filter((n) => casa(n.nf, n.destinatario, n.cidade))
      .map((n) => ({ nota: n, prazo: prazo(n, hoje), intelipost: porNf.get(n.nf) ?? null }))
      .sort(
        (a, b) =>
          a.prazo.ordem - b.prazo.ordem ||
          (b.nota.atraso ?? 0) - (a.nota.atraso ?? 0) ||
          a.nota.previsao.localeCompare(b.nota.previsao),
      );
  }, [aba, pendentes, notas, termo, hoje, porNf]);

  const linhasComparacao = useMemo(
    () => (ehComparacao(aba) && comparacao ? comparacao.linhas.filter((l) => l.tipo === aba && casa(l.nf, l.destinatario, l.cidade)) : []),
    [comparacao, aba, termo],
  );

  const total = ehComparacao(aba) ? linhasComparacao.length : linhasNotas.length;
  const temStatus = linhasNotas.some((l) => l.nota.ultimoStatus);
  const rotuloAba = opcoes.find((o) => o.id === aba)?.label ?? '';

  const conferencia = comparacao && {
    batem: comparacao.contagem.ambos_entregues + comparacao.contagem.ambos_pendentes,
    divergem: comparacao.contagem.entregue_planilha_pendente_intelipost + comparacao.contagem.entregue_intelipost_pendente_planilha,
    soUma: comparacao.contagem.so_intelipost + comparacao.contagem.so_planilha,
  };
  const pendentesNoPrazo = pendentes.filter((n) => n.status === 'em_transito').length;
  const pendentesVencidas = pendentes.filter((n) => n.status === 'vencida').length;

  const textoIntelipost = (l: LinhaComparacao | null) =>
    !l || l.situacaoIntelipost === 'ausente'
      ? '—'
      : l.dataEntregaIntelipost
        ? `${l.statusIntelipost} · ${l.dataEntregaIntelipost}`
        : l.statusIntelipost;

  const exportar = () => {
    const linhas = ehComparacao(aba)
      ? linhasComparacao.map((l) => ({
          NF: l.nf,
          Comparação: TIPOS_COMPARACAO.find((t) => t.id === l.tipo)?.label ?? '',
          'Status Intelipost': l.statusIntelipost,
          'Entrega Intelipost': l.dataEntregaIntelipost,
          [`Status ${label}`]: l.statusPlanilha,
          [`Entrega ${label}`]: l.dataEntregaPlanilha,
          Destinatário: l.destinatario,
          Cidade: l.cidade,
          UF: l.uf,
        }))
      : linhasNotas.map(({ nota: n, prazo: p, intelipost: i }) => ({
          NF: n.nf,
          Prazo: p.texto,
          Previsão: n.previsao ? formatBrDate(n.previsao) : '',
          [`Entrega ${label}`]: n.dataEntrega ? formatBrDate(n.dataEntrega) : '',
          [`Status ${label}`]: n.ultimoStatus,
          Intelipost: textoIntelipost(i),
          'Intelipost × carrier': i ? CONFERE[i.tipo].texto : '',
          Destinatário: n.destinatario,
          Cidade: n.cidade,
          UF: n.uf,
        }));
    const planilha = XLSX.utils.json_to_sheet(linhas);
    planilha['!autofilter'] = { ref: planilha['!ref'] ?? 'A1' };
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, label.slice(0, 31));
    XLSX.writeFile(livro, `${label.toLowerCase()}_${aba}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Modal
      titulo={label}
      sub={
        <>
          {fmt(resumo.total)} notas na planilha ·{' '}
          <b>{resumo.percentual === null ? '—' : `${resumo.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</b> no prazo
          (meta {META_SLA}%)
          {resumo.atrasoMedio !== null && ` · atraso médio ${resumo.atrasoMedio.toLocaleString('pt-BR')} d.u.`}
        </>
      }
      onClose={onClose}
      rodape={
        <>
          <Botao onClick={onAbrirConferencia}>Abrir conferência da {label}</Botao>
          <Botao primario disabled={total === 0} onClick={exportar}>
            Exportar {rotuloAba.toLowerCase()} ({fmt(total)})
          </Botao>
        </>
      }
    >
      <div className="ui-mini-numeros ui-modal-resumo">
        <div>
          <b className={pendentesVencidas ? 'ruim' : ''}>{fmt(pendentes.length)}</b>
          <span>
            não entregues · {fmt(pendentesVencidas)} vencidas, {fmt(pendentesNoPrazo)} no prazo
          </span>
        </div>
        {conferencia && (
          <>
            <div>
              <b>{fmt(conferencia.batem)}</b>
              <span>batem nas duas fontes e na {label}</span>
            </div>
            <div>
              <b className={conferencia.divergem ? 'ruim' : ''}>{fmt(conferencia.divergem)}</b>
              <span>
                divergem · {fmt(conferencia.soUma)} estão só numa das duas
              </span>
            </div>
          </>
        )}
      </div>

      <Chips rotulo="Situação" valor={aba} opcoes={opcoes} onChange={setAba} />

      <input
        type="search"
        className="ui-busca"
        placeholder="NF, destinatário ou cidade"
        aria-label="Buscar nas notas"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {total === 0 ? (
        <p className="ui-vazio">{contagem(aba) ? 'Nenhuma nota com essa busca.' : 'Nenhuma nota nesta situação.'}</p>
      ) : (
        <div className="ui-tabela-caixa">
          <table className="ui-tabela">
            {ehComparacao(aba) ? (
              <>
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Intelipost</th>
                    <th>Entrega Intelipost</th>
                    <th>{label}</th>
                    <th>Entrega {label}</th>
                    <th>Destinatário</th>
                    <th>UF</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasComparacao.slice(0, LIMITE).map((l) => (
                    <tr key={l.nf}>
                      <td>
                        <b>{l.nf}</b>
                      </td>
                      <td className="ui-celula-longa">{l.statusIntelipost}</td>
                      <td>{l.dataEntregaIntelipost || '—'}</td>
                      <td className="ui-celula-longa">{l.statusPlanilha}</td>
                      <td>{l.dataEntregaPlanilha || '—'}</td>
                      <td className="ui-celula-longa">{l.destinatario || '—'}</td>
                      <td>{l.uf || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead>
                  <tr>
                    <th>NF</th>
                    <th>Prazo</th>
                    <th>Previsão</th>
                    <th>Entrega {label}</th>
                    {temStatus && <th>Status {label}</th>}
                    {comparacao && <th>Intelipost</th>}
                    {comparacao && <th>Intelipost × {label}</th>}
                    <th>Destinatário</th>
                    <th>Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasNotas.slice(0, LIMITE).map(({ nota: n, prazo: p, intelipost: i }) => (
                    <tr key={n.nf}>
                      <td>
                        <b>{n.nf}</b>
                      </td>
                      <td>
                        <Tag tom={p.tom}>{p.texto}</Tag>
                      </td>
                      <td>{data(n.previsao)}</td>
                      <td>{data(n.dataEntrega)}</td>
                      {temStatus && <td className="ui-celula-longa">{n.ultimoStatus || '—'}</td>}
                      {comparacao && <td className="ui-celula-longa">{textoIntelipost(i)}</td>}
                      {comparacao && (
                        <td>{i ? <Tag tom={CONFERE[i.tipo].tom}>{CONFERE[i.tipo].texto}</Tag> : '—'}</td>
                      )}
                      <td className="ui-celula-longa">{n.destinatario || '—'}</td>
                      <td>{[n.cidade, n.uf].filter(Boolean).join(' / ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}
      {total > LIMITE && (
        <p className="ui-painel-sub">
          Mostrando {LIMITE} de {fmt(total)}. O Exportar leva todas.
        </p>
      )}
    </Modal>
  );
};
