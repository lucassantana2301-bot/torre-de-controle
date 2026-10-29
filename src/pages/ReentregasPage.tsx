import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { useRouter } from '../router/useRouter';
import { useApp } from '../context/AppContext';
import { LISTA } from '../router/secao';
import { TRANSPORTADORAS, formatBrDate, useEntregas, type TransportadoraId } from '../services/entregasImport';
import { useReentregas, type Reentrega } from '../services/reentregas';
import {
  Aviso,
  Barras,
  BarrasLista,
  Botao,
  Cabecalho,
  Colunas,
  Destaque,
  Filtro,
  Filtros,
  ListaAcoes,
  Pagina,
  Painel,
  Tag,
  type ItemAcao,
} from '../ui/componentes';

type Situacao = '' | 'entregue' | 'pendente' | 'tres';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (iso: string) => (iso ? formatBrDate(iso) : '—');
const LIMITE = 300;
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const CARRIERS: { id: TransportadoraId | ''; label: string }[] = [{ id: '', label: 'Todas' }, ...TRANSPORTADORAS];
const SITUACOES: { id: Situacao; label: string }[] = [
  { id: '', label: 'Todas' },
  { id: 'entregue', label: 'Entregue' },
  { id: 'pendente', label: 'Sem entrega' },
  { id: 'tres', label: '3 ou mais CT-e' },
];

const passa = (r: Reentrega, carrier: TransportadoraId | '', situacao: Situacao, busca: string) =>
  (!carrier || r.transportadora === carrier) &&
  (situacao === '' ||
    (situacao === 'entregue' && r.entregue) ||
    (situacao === 'pendente' && !r.entregue) ||
    (situacao === 'tres' && r.tentativas.length >= 3)) &&
  (!busca || r.nf.includes(busca) || r.tentativas.some((t) => t.cte.includes(busca)));

function exportar(lista: Reentrega[]) {
  const linhas = lista.flatMap((r) =>
    r.tentativas.map((t, i) => ({
      'Nota fiscal': r.nf,
      Transportadora: r.transportadoraLabel,
      Destinatário: r.destinatario,
      Cidade: r.cidade,
      UF: r.uf,
      Tentativa: i + 1,
      'CT-e': t.cte,
      'Emissão CT-e': t.dataCte ? formatBrDate(t.dataCte) : '',
      Status: t.status,
      Previsão: t.previsao ? formatBrDate(t.previsao) : '',
      'Data entrega': t.dataEntrega ? formatBrDate(t.dataEntrega) : '',
      Recebedor: t.recebedor,
      'Valor reentrega': t.valorReentrega || '',
    })),
  );
  const planilha = XLSX.utils.json_to_sheet(linhas);
  planilha['!autofilter'] = { ref: planilha['!ref'] ?? 'A1' };
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Reentregas');
  XLSX.writeFile(livro, `reentregas_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const ReentregasPage: React.FC = () => {
  const { navigate } = useRouter();
  const { refreshData, isRefreshing } = useApp();
  const entregas = useEntregas();
  const reentregas = useReentregas();
  const { lista, semCte, destinatarioDiferente } = reentregas;
  const devolucoesDesconsideradas =
    (reentregas as { devolucoesDesconsideradas?: number }).devolucoesDesconsideradas ?? 0;
  const [carrier, setCarrier] = useState<TransportadoraId | ''>('');
  const [situacao, setSituacao] = useState<Situacao>('');
  const [busca, setBusca] = useState('');

  const q = busca.replace(/\D/g, '').replace(/^0+/, '');
  const filtradas = useMemo(() => lista.filter((r) => passa(r, carrier, situacao, q)), [lista, carrier, situacao, q]);
  const doRecorte = useMemo(() => lista.filter((r) => passa(r, carrier, '', '')), [lista, carrier]);

  const nfsNasPlanilhas = useMemo(
    () =>
      TRANSPORTADORAS.filter(({ id }) => (!carrier || carrier === id) && !semCte.includes(id)).reduce(
        (s, { id }) => s + Object.keys(entregas.transportadoras[id]?.porNf ?? {}).length,
        0,
      ),
    [entregas, carrier, semCte],
  );

  const temPlanilha = TRANSPORTADORAS.some(({ id }) => entregas.transportadoras[id]);
  const lidas = TRANSPORTADORAS.some(({ id }) => entregas.transportadoras[id] && !semCte.includes(id));
  const nomes = semCte.map((id) => TRANSPORTADORAS.find((t) => t.id === id)!.label);
  const listaNomes = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0];

  const cabecalho = (
    <Cabecalho
      titulo="Reentregas"
      sub="Mesma NF com mais de um CT-e para o cliente (sem devolução / retorno à Arklok)"
      acoes={
        <>
          <Botao onClick={refreshData} disabled={isRefreshing}>
            {isRefreshing ? 'Atualizando...' : 'Atualizar dados'}
          </Botao>
          <Botao onClick={() => navigate('/entregas')}>Painel de Entregas</Botao>
          <Botao primario disabled={filtradas.length === 0} onClick={() => exportar(filtradas)}>
            Exportar ({fmt(filtradas.length)})
          </Botao>
        </>
      }
    />
  );

  if (!temPlanilha) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          titulo="Envie as planilhas das transportadoras"
          texto="A reentrega aparece quando a mesma NF tem dois ou mais CT-e para o cliente (sem devolução ou retorno à Arklok)."
          passos={[
            <>Na conferência de Entregas, envie os relatórios da SPfly, Jamef e Certex.</>,
            <>A conta usa o CT-e dessas planilhas.</>,
          ]}
          acoes={[{ label: 'Abrir conferência', onClick: () => navigate('/entregas', LISTA) }]}
        />
      </Pagina>
    );
  }

  const entregues = doRecorte.filter((r) => r.entregue).length;
  const pendentes = doRecorte.length - entregues;
  const tresOuMais = doRecorte.filter((r) => r.tentativas.length >= 3).length;
  const ctesExtras = doRecorte.reduce((s, r) => s + r.tentativas.length - 1, 0);
  const valor = doRecorte.reduce((s, r) => s + r.valorReentrega, 0);
  const pct = nfsNasPlanilhas ? Math.round((doRecorte.length / nfsNasPlanilhas) * 1000) / 10 : null;

  const acoes: ItemAcao[] = [
    {
      id: 'pendente',
      rotulo: 'Reentregas ainda sem entrega',
      valor: fmt(pendentes),
      texto: 'Nenhum dos CT-e tem data de entrega',
      tom: 'perigo' as const,
      onClick: () => setSituacao('pendente'),
    },
    {
      id: 'tres',
      rotulo: '3 ou mais CT-e',
      valor: fmt(tresOuMais),
      texto: 'Mais de uma reentrega na mesma NF',
      tom: 'atencao' as const,
      onClick: () => setSituacao('tres'),
    },
  ].filter((a) => a.valor !== '0');

  const porCarrier = TRANSPORTADORAS.map(({ id, label }) => ({
    id,
    rotulo: label,
    valor: lista.filter((r) => r.transportadora === id).length,
  })).filter((c) => c.valor > 0);

  const porMes = new Map<string, number>();
  for (const r of doRecorte) {
    const mes = r.tentativas.at(-1)?.dataCte.slice(0, 7);
    if (mes) porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
  }
  const meses = [...porMes].sort(([a], [b]) => a.localeCompare(b)).slice(-12);

  return (
    <Pagina>
      {cabecalho}

      {semCte.length > 0 && (
        <Aviso
          acao={
            <Botao pequeno onClick={() => navigate('/entregas', LISTA)}>
              Reenviar planilhas
            </Botao>
          }
        >
          {nomes.length > 1
            ? `As planilhas da ${listaNomes} foram carregadas antes de o sistema ler o CT-e. Envie de novo para ver as reentregas delas.`
            : `A planilha da ${listaNomes} foi carregada antes de o sistema ler o CT-e. Envie de novo para ver as reentregas dela.`}
        </Aviso>
      )}

      <div className="ui-hero">
        <Destaque
          rotulo="NFs reentregues"
          valor={lidas ? fmt(doRecorte.length) : '—'}
          tom={pendentes ? 'perigo' : ''}
          tag={pendentes ? { texto: `${fmt(pendentes)} sem entrega`, tom: 'perigo' } : undefined}
          apoio={
            !lidas
              ? 'envie de novo as planilhas das transportadoras para ler o CT-e'
              : pct === null
                ? 'nas planilhas das transportadoras'
                : `${pct.toLocaleString('pt-BR')}% das ${fmt(nfsNasPlanilhas)} NFs nas planilhas das transportadoras`
          }
          partes={[
            { id: 'entregue', rotulo: 'Entregues na última tentativa', valor: entregues, cor: 'sucesso', onClick: () => setSituacao('entregue') },
            { id: 'pendente', rotulo: 'Ainda sem entrega', valor: pendentes, cor: 'perigo', onClick: () => setSituacao('pendente') },
          ]}
          rodape={
            <div className="ui-mini-numeros">
              <div>
                <b>{fmt(ctesExtras)}</b>
                <span>CT-e além do primeiro</span>
              </div>
              <div>
                <b>{fmt(tresOuMais)}</b>
                <span>NFs com 3 ou mais CT-e</span>
              </div>
              <div>
                <b>{valor ? brl(valor) : '—'}</b>
                <span>cobrado de reentrega (coluna da Jamef)</span>
              </div>
            </div>
          }
        />

        <ListaAcoes
          titulo="O que resolver agora"
          itens={acoes}
          vazio="Todas as reentregas já têm data de entrega."
          rodape={
            (destinatarioDiferente > 0 || devolucoesDesconsideradas > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {devolucoesDesconsideradas > 0 && (
                  <span>
                    <b>{fmt(devolucoesDesconsideradas)}</b> {devolucoesDesconsideradas === 1 ? 'NF' : 'NFs'} com status de devolução ou retorno à Arklok {devolucoesDesconsideradas === 1 ? 'foi desconsiderada' : 'foram desconsideradas'}.
                  </span>
                )}
                {destinatarioDiferente > 0 && (
                  <span>
                    {fmt(destinatarioDiferente)} NFs com CT-e diferente para outro destinatário ficaram de fora (em geral é o
                    mesmo número de NF de outro emitente).
                  </span>
                )}
              </div>
            )
          }
        />
      </div>

      <Colunas>
        <Painel titulo="Por transportadora" sub="Clique para filtrar a lista">
          {porCarrier.length === 0 ? (
            <p className="ui-vazio">Nenhuma reentrega nas planilhas carregadas.</p>
          ) : (
            <BarrasLista
              itens={porCarrier.map((c) => ({
                ...c,
                onClick: () => setCarrier(carrier === c.id ? '' : c.id),
              }))}
            />
          )}
        </Painel>

        <Painel titulo="Por mês da última CT-e" sub="Quando a reentrega mais recente foi emitida">
          {meses.length === 0 ? (
            <p className="ui-vazio">As planilhas não trazem a data do CT-e.</p>
          ) : (
            <Barras
              descricao={`Reentregas por mês: ${meses.map(([m, n]) => `${m} ${n}`).join(', ')}`}
              pontos={meses.map(([mes, n]) => {
                const [ano, m] = mes.split('-');
                return { chave: mes, rotulo: `${MES_CURTO[Number(m) - 1]}/${ano.slice(2)}`, valor: n, percentual: null };
              })}
            />
          )}
        </Painel>
      </Colunas>

      <Painel
        titulo="NFs reentregues"
        sub={`${fmt(filtradas.length)} NFs · sem entrega primeiro, depois as com mais CT-e`}
        acoes={
          <Filtros compactos>
            <Filtro rotulo="Transportadora" valor={carrier} opcoes={CARRIERS} onChange={setCarrier} />
            <Filtro rotulo="Situação" valor={situacao} opcoes={SITUACOES} onChange={setSituacao} />
            <label className="ui-filtro">
              Busca
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="NF ou CT-e" />
            </label>
          </Filtros>
        }
      >
        {filtradas.length === 0 ? (
          <p className="ui-vazio">Nenhuma reentrega neste filtro.</p>
        ) : (
          <div className="ui-tabela-caixa">
            <table className="ui-tabela">
              <thead>
                <tr>
                  <th>NF</th>
                  <th>Transportadora</th>
                  <th>Destinatário</th>
                  <th>Destino</th>
                  <th>CT-e (tentativas)</th>
                  <th className="num">Tentativas</th>
                  <th>Situação</th>
                  <th className="num">Reentrega</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, LIMITE).map((r) => (
                  <tr key={`${r.transportadora}-${r.nf}`}>
                    <td>
                      <b>{r.nf}</b>
                    </td>
                    <td>{r.transportadoraLabel}</td>
                    <td className="ui-celula-longa">{r.destinatario || '—'}</td>
                    <td>{[r.cidade, r.uf].filter(Boolean).join(' / ') || '—'}</td>
                    <td>
                      <ol className="ui-tentativas">
                        {r.tentativas.map((t) => (
                          <li key={t.cte}>
                            <span>CT-e {t.cte}</span>
                            <small>
                              {data(t.dataCte)}
                              {t.dataEntrega ? ` · entregue ${data(t.dataEntrega)}` : t.status ? ` · ${t.status}` : ''}
                            </small>
                          </li>
                        ))}
                      </ol>
                    </td>
                    <td className="num">{r.tentativas.length}</td>
                    <td>
                      {r.entregue ? <Tag tom="sucesso">Entregue {data(r.dataEntrega)}</Tag> : <Tag tom="perigo">Sem entrega</Tag>}
                    </td>
                    <td className="num">{r.valorReentrega ? brl(r.valorReentrega) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtradas.length > LIMITE && (
          <p className="ui-painel-sub">
            Mostrando {LIMITE} de {fmt(filtradas.length)}. O Exportar leva todas.
          </p>
        )}
      </Painel>
    </Pagina>
  );
};
