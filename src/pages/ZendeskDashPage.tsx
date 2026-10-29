import React, { useMemo } from 'react';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { useEntregaPorTicket } from '../hooks/useEntregaPorTicket';
import { useRouter } from '../router/useRouter';
import { LISTA } from '../router/secao';
import { formatDateTimeBr } from '../services/tratativaService';
import { ZENDESK_ABAS, contarZendesk, useZendesk } from '../services/zendeskImport';
import {
  BarrasLista,
  Botao,
  Cabecalho,
  Colunas,
  Destaque,
  ListaAcoes,
  Pagina,
  Painel,
  type ItemAcao,
  type ParteComposicao,
} from '../ui/componentes';

const fmt = (n: number) => n.toLocaleString('pt-BR');

type Etapa = 'prontos' | 'parcial' | 'modal' | 'pendente' | 'sem_nf';

const IDADES: { id: string; rotulo: string; ate: number }[] = [
  { id: '0_2', rotulo: 'Até 2 dias', ate: 2 },
  { id: '3_5', rotulo: '3 a 5 dias', ate: 5 },
  { id: '6_10', rotulo: '6 a 10 dias', ate: 10 },
  { id: '11_20', rotulo: '11 a 20 dias', ate: 20 },
  { id: '21', rotulo: '21 dias ou mais', ate: Infinity },
];

export const ZendeskDashPage: React.FC = () => {
  const { navigate } = useRouter();
  const zendesk = useZendesk();
  const entregaPorTicket = useEntregaPorTicket();
  const contagem = useMemo(() => contarZendesk(zendesk), [zendesk]);
  const tickets = useMemo(() => zendesk.tickets?.tickets ?? [], [zendesk.tickets]);

  const resumo = useMemo(() => {
    const etapas: Record<Etapa, number> = { prontos: 0, parcial: 0, modal: 0, pendente: 0, sem_nf: 0 };
    let frota = 0;
    let lalamove = 0;
    for (const ticket of tickets) {
      const e = entregaPorTicket.get(ticket.id);
      if (e?.porModal.frota) frota += 1;
      if (e?.porModal.lalamove) lalamove += 1;
      if (!e || e.nfs.length === 0) etapas.sem_nf += 1;
      else if (e.completa) etapas.prontos += 1;
      else if (e.porModal.frota || e.porModal.lalamove) etapas.modal += 1;
      else if (e.entregues > 0) etapas.parcial += 1;
      else etapas.pendente += 1;
    }
    const porAba = Object.fromEntries(ZENDESK_ABAS.map((a) => [a.id, tickets.filter((t) => t.aba === a.id).length]));
    const porIdade = IDADES.map((faixa, i) => ({
      ...faixa,
      valor: tickets.filter((t) => t.idadeDias !== null && t.idadeDias > (IDADES[i - 1]?.ate ?? -1) && t.idadeDias <= faixa.ate).length,
    }));
    const semIdade = tickets.filter((t) => t.idadeDias === null).length;
    const porOrg = new Map<string, number>();
    for (const t of tickets) if (t.organizacao) porOrg.set(t.organizacao, (porOrg.get(t.organizacao) ?? 0) + 1);
    const organizacoes = [...porOrg].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 10);
    return { etapas, frota, lalamove, porAba, porIdade, semIdade, organizacoes };
  }, [tickets, entregaPorTicket]);

  const cabecalho = (
    <Cabecalho
      eyebrow="Operação / Atendimento"
      titulo="Baixa Zendesk"
      sub={
        zendesk.tickets
          ? `Tickets do Aging · ${zendesk.tickets.fileName} · atualizado ${formatDateTimeBr(zendesk.tickets.importadoEm)}`
          : 'Tickets abertos, romaneio com NF e o que já pode ser fechado.'
      }
      acoes={
        <Botao primario onClick={() => navigate('/zendesk', LISTA)}>
          Abrir tickets
        </Botao>
      }
    />
  );

  if (!zendesk.tickets) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          titulo="Envie o Aging do Zendesk"
          texto="O painel mostra o que dá para baixar. As planilhas ficam na lista desta seção."
          passos={[
            <>Aging do Zendesk (tickets em rota / aguardando).</>,
            <>Romaneio Base_Dados (tem NF?).</>,
            <>SPfly, Jamef e Certex (data de entrega = entregue).</>,
            <>A baixa usa a data de entrega da SPfly, Jamef e Certex.</>,
          ]}
          acoes={[{ label: 'Abrir lista', onClick: () => navigate('/zendesk', LISTA) }]}
        />
      </Pagina>
    );
  }

  const situacao = contagem.porSituacao;
  const { etapas } = resumo;

  const partes: ParteComposicao[] = [
    { id: 'prontos', rotulo: 'Prontos para baixa', valor: etapas.prontos, cor: 'sucesso', onClick: () => navigate('/zendesk', { aba: 'entregues' }) },
    { id: 'parcial', rotulo: 'Entregue, romaneio com linha sem NF', valor: etapas.parcial, cor: 'atencao', onClick: () => navigate('/zendesk', { nf: 'sem_nf' }) },
    { id: 'modal', rotulo: 'Frota / Lalamove', valor: etapas.modal, cor: 'neutro', onClick: () => navigate('/zendesk', { aba: 'frota' }) },
    { id: 'pendente', rotulo: 'Nenhuma NF entregue', valor: etapas.pendente, cor: 'neutro', onClick: () => navigate('/zendesk', LISTA) },
    {
      id: 'sem_nf',
      rotulo: situacao ? 'Sem NF no romaneio' : 'Sem romaneio carregado',
      valor: etapas.sem_nf,
      cor: situacao ? 'perigo' : 'neutro',
      onClick: () => navigate('/zendesk', situacao ? { nf: 'sem_nf' } : LISTA),
    },
  ];

  const acoes: ItemAcao[] = [
    {
      id: 'prontos',
      rotulo: 'Prontos para dar baixa',
      valor: fmt(etapas.prontos),
      texto: 'NF entregue nas transportadoras',
      tom: 'sucesso' as const,
      onClick: () => navigate('/zendesk', { aba: 'entregues' }),
    },
    ...(situacao
      ? [
          {
            id: 'fora',
            rotulo: 'Fora da planilha de romaneio',
            valor: fmt(situacao.fora),
            texto: 'Ticket não aparece no chamado2 · confira se está atualizado',
            tom: 'perigo' as const,
            onClick: () => navigate('/zendesk', { nf: 'fora' }),
          },
          {
            id: 'sem_nf',
            rotulo: 'Romaneio sem NF',
            valor: fmt(situacao.sem_nf),
            texto: 'Falta a nota fiscal em alguma linha',
            tom: 'atencao' as const,
            onClick: () => navigate('/zendesk', { nf: 'sem_nf' }),
          },
        ]
      : []),
    {
      id: 'frota',
      rotulo: 'Frota interna',
      valor: fmt(resumo.frota),
      texto: 'Baixa própria, fora das transportadoras',
      tom: '' as const,
      onClick: () => navigate('/zendesk', { aba: 'frota' }),
    },
    {
      id: 'lalamove',
      rotulo: 'Lalamove',
      valor: fmt(resumo.lalamove),
      texto: 'Baixa própria, fora das transportadoras',
      tom: '' as const,
      onClick: () => navigate('/zendesk', { aba: 'lalamove' }),
    },
  ].filter((a) => a.valor !== '0');

  const idades = resumo.porIdade.filter((f) => f.valor > 0);

  return (
    <Pagina>
      {cabecalho}

      <div className="ui-hero">
        <Destaque
          rotulo="Prontos para baixa"
          valor={fmt(etapas.prontos)}
          tom={etapas.prontos ? 'sucesso' : ''}
          tag={etapas.prontos ? { texto: 'Dar baixa', tom: 'sucesso' } : undefined}
          apoio={`de ${fmt(contagem.total)} tickets abertos`}
          partes={partes}
          rodape={
            <div className="ui-mini-numeros">
              <div>
                <b>{fmt(resumo.porAba.em_rota ?? 0)}</b>
                <span>em rota de entrega</span>
              </div>
              <div>
                <b>{fmt(resumo.porAba.aguardando_expedicao ?? 0)}</b>
                <span>aguardando expedição</span>
              </div>
              <div>
                <b>{situacao ? fmt(situacao.com_nf) : '—'}</b>
                <span>{situacao ? 'com NF no romaneio' : 'envie o romaneio'}</span>
              </div>
            </div>
          }
        />

        <ListaAcoes
          titulo="O que resolver agora"
          itens={acoes}
          vazio="Nenhum ticket pronto nem pendência de NF neste Aging."
          rodape={
            !zendesk.nf && (
              <>
                <span>Falta o romaneio: sem ele não dá para saber se o ticket tem NF.</span>
                <Botao pequeno onClick={() => navigate('/zendesk', LISTA)}>
                  Enviar romaneio
                </Botao>
              </>
            )
          }
        />
      </div>

      <Colunas>
        <Painel titulo="Idade dos tickets" sub="Dias desde a abertura no Zendesk">
          {idades.length === 0 ? (
            <p className="ui-vazio">O Aging não traz a data de abertura dos tickets.</p>
          ) : (
            <BarrasLista
              itens={[
                ...idades.map((f) => ({
                  id: f.id,
                  rotulo: f.rotulo,
                  valor: f.valor,
                  tom: f.ate === Infinity ? ('perigo' as const) : f.ate === 20 ? ('atencao' as const) : undefined,
                  onClick: () => navigate('/zendesk', LISTA),
                })),
                ...(resumo.semIdade ? [{ id: 'sem', rotulo: 'Sem data', valor: resumo.semIdade }] : []),
              ]}
            />
          )}
        </Painel>

        <Painel titulo="Organizações com mais tickets" sub="Clique para abrir a lista já buscando pela organização">
          {resumo.organizacoes.length === 0 ? (
            <p className="ui-vazio">O Aging não traz a organização dos tickets.</p>
          ) : (
            <BarrasLista
              itens={resumo.organizacoes.map(([org, valor]) => ({
                id: org,
                rotulo: org,
                valor,
                onClick: () => navigate('/zendesk', { q: org }),
              }))}
            />
          )}
        </Painel>
      </Colunas>
    </Pagina>
  );
};
