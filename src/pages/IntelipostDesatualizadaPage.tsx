import React, { useMemo, useState } from 'react';
import { EstadoVazio } from '../components/common/EstadoVazio';
import { useRouter } from '../router/useRouter';
import { LISTA } from '../router/secao';
import { TRANSPORTADORAS, formatBrDate, type TransportadoraId } from '../services/entregasImport';
import { exportarGap, useGapIntelipost } from '../services/gapIntelipost';
import { useDiaAtivo } from '../services/diaAtivo';
import { businessToday } from '../utils/businessDay';
import {
  BarrasLista,
  Botao,
  Cabecalho,
  Destaque,
  Filtro,
  Filtros,
  Pagina,
  Painel,
  Tag,
  type Tom,
} from '../ui/componentes';

type Faixa = '' | 'ate2' | '3a7' | 'mais7';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const LIMITE = 300;
const CARRIERS: { id: TransportadoraId | ''; label: string }[] = [{ id: '', label: 'Todas' }, ...TRANSPORTADORAS];
const FAIXAS: { id: Faixa; label: string }[] = [
  { id: '', label: 'Todas' },
  { id: 'ate2', label: 'Até 2 dias' },
  { id: '3a7', label: '3 a 7 dias' },
  { id: 'mais7', label: 'Mais de 7 dias' },
];

const diasEntre = (de: string, ate: string) =>
  de ? Math.max(0, Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86_400_000)) : null;
const faixaDe = (dias: number | null): Exclude<Faixa, ''> | null =>
  dias === null ? null : dias <= 2 ? 'ate2' : dias <= 7 ? '3a7' : 'mais7';
const tomDe = (dias: number | null): Tom => (dias === null ? '' : dias > 7 ? 'perigo' : dias > 2 ? 'atencao' : '');

export const IntelipostDesatualizadaPage: React.FC = () => {
  const { navigate } = useRouter();
  const dia = useDiaAtivo();
  const hoje = dia?.data ?? businessToday();
  const { lista, comparadas, comparadasPor, temTransacoes } = useGapIntelipost();
  const [carrier, setCarrier] = useState<TransportadoraId | ''>('');
  const [faixa, setFaixa] = useState<Faixa>('');
  const [busca, setBusca] = useState('');

  const comDias = useMemo(() => lista.map((n) => ({ ...n, dias: diasEntre(n.entregueEm, hoje) })), [lista, hoje]);
  const doRecorte = useMemo(() => comDias.filter((n) => !carrier || n.transportadora === carrier), [comDias, carrier]);
  const q = busca.replace(/\D/g, '');
  const filtradas = useMemo(
    () => doRecorte.filter((n) => (!faixa || faixaDe(n.dias) === faixa) && (!q || n.nf.includes(q))),
    [doRecorte, faixa, q],
  );

  const cabecalho = (
    <Cabecalho
      eyebrow="Operação / Logística"
      titulo="Intelipost desatualizada"
      sub="NF entregue na planilha da transportadora e ainda pendente nas Transações da Intelipost"
      acoes={
        <>
          <Botao onClick={() => navigate('/entregas')}>Painel de Entregas</Botao>
          <Botao primario disabled={filtradas.length === 0} onClick={() => exportarGap(filtradas, hoje)}>
            Exportar ({fmt(filtradas.length)})
          </Botao>
        </>
      }
    />
  );

  if (!temTransacoes || comparadasPor.length === 0) {
    return (
      <Pagina>
        {cabecalho}
        <EstadoVazio
          titulo="Envie as Transações e a planilha de uma transportadora"
          texto="A conferência compara a data de entrega da SPfly, Jamef ou Certex com o status da mesma NF nas Transações da Intelipost."
          passos={[
            <>Na conferência de Entregas, envie as <b>Transações Intelipost</b>.</>,
            <>Envie também o relatório de entregas de pelo menos uma transportadora.</>,
          ]}
          acoes={[{ label: 'Abrir conferência', onClick: () => navigate('/entregas', LISTA) }]}
        />
      </Pagina>
    );
  }

  const porFaixa = { ate2: 0, '3a7': 0, mais7: 0 };
  for (const n of doRecorte) {
    const f = faixaDe(n.dias);
    if (f) porFaixa[f] += 1;
  }
  const maisAntiga = doRecorte.reduce<number>((m, n) => Math.max(m, n.dias ?? 0), 0);
  const pct = comparadas ? Math.round((doRecorte.length / comparadas) * 1000) / 10 : null;

  const porCarrier = TRANSPORTADORAS.map(({ id, label }) => ({ id, rotulo: label, valor: comDias.filter((n) => n.transportadora === id).length })).filter(
    (c) => c.valor > 0,
  );
  const porStatus = new Map<string, number>();
  for (const n of doRecorte) porStatus.set(n.statusIntelipost || 'Sem status', (porStatus.get(n.statusIntelipost || 'Sem status') ?? 0) + 1);

  return (
    <Pagina>
      {cabecalho}

      <div className="ui-hero">
        <Destaque
          rotulo="Entregues sem baixa na Intelipost"
          valor={fmt(doRecorte.length)}
          tom={porFaixa.mais7 ? 'perigo' : doRecorte.length ? 'atencao' : 'sucesso'}
          tag={
            doRecorte.length === 0
              ? { texto: 'Intelipost em dia', tom: 'sucesso' }
              : porFaixa.mais7
                ? { texto: `${fmt(porFaixa.mais7)} há mais de 7 dias`, tom: 'perigo' }
                : undefined
          }
          apoio={pct === null ? 'NFs comparadas' : `${pct.toLocaleString('pt-BR')}% das ${fmt(comparadas)} NFs que estão nas duas fontes`}
          partes={[
            { id: 'ate2', rotulo: 'Até 2 dias', valor: porFaixa.ate2, cor: 'neutro', onClick: () => setFaixa('ate2') },
            { id: '3a7', rotulo: '3 a 7 dias', valor: porFaixa['3a7'], cor: 'atencao', onClick: () => setFaixa('3a7') },
            { id: 'mais7', rotulo: 'Mais de 7 dias', valor: porFaixa.mais7, cor: 'perigo', onClick: () => setFaixa('mais7') },
          ]}
          rodape={
            <div className="ui-mini-numeros">
              {porCarrier.map((c) => (
                <div key={c.id}>
                  <b>{fmt(c.valor)}</b>
                  <span>{c.rotulo}</span>
                </div>
              ))}
              <div>
                <b>{maisAntiga ? `${fmt(maisAntiga)} dias` : '—'}</b>
                <span>a mais antiga sem atualizar</span>
              </div>
            </div>
          }
        />

        <Painel titulo="Status que a Intelipost ainda mostra" sub="O que precisa ser corrigido para Entregue">
          {porStatus.size === 0 ? (
            <p className="ui-vazio">Nenhuma NF pendente de atualização.</p>
          ) : (
            <BarrasLista
              itens={[...porStatus]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([status, valor]) => ({ id: status, rotulo: status, valor, tom: 'atencao' as Tom }))}
            />
          )}
        </Painel>
      </div>

      <Painel
        titulo="Por transportadora"
        sub={`Clique para filtrar a lista · comparadas: ${comparadasPor.map((id) => TRANSPORTADORAS.find((t) => t.id === id)!.label).join(', ')}`}
      >
        <BarrasLista
          itens={porCarrier.map((c) => ({ ...c, tom: carrier === c.id ? ('perigo' as Tom) : undefined, onClick: () => setCarrier(carrier === c.id ? '' : c.id) }))}
        />
      </Painel>

      <Painel
        titulo="NFs para atualizar na Intelipost"
        sub={`${fmt(filtradas.length)} NFs · as entregues há mais tempo primeiro`}
        acoes={
          <Filtros compactos>
            <Filtro rotulo="Transportadora" valor={carrier} opcoes={CARRIERS} onChange={setCarrier} />
            <Filtro rotulo="Sem atualizar há" valor={faixa} opcoes={FAIXAS} onChange={setFaixa} />
            <label className="ui-filtro">
              Busca
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="NF" />
            </label>
          </Filtros>
        }
      >
        {filtradas.length === 0 ? (
          <p className="ui-vazio">Nenhuma NF neste filtro.</p>
        ) : (
          <div className="ui-tabela-caixa">
            <table className="ui-tabela">
              <thead>
                <tr>
                  <th>NF</th>
                  <th>Transportadora</th>
                  <th>Entregue em</th>
                  <th className="num">Dias sem atualizar</th>
                  <th>Status na Intelipost</th>
                  <th>Destinatário</th>
                  <th>Destino</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, LIMITE).map((n) => (
                  <tr key={`${n.transportadora}-${n.nf}`}>
                    <td>
                      <b>{n.nf}</b>
                    </td>
                    <td>{n.transportadoraLabel}</td>
                    <td>{n.entregueEm ? formatBrDate(n.entregueEm) : '—'}</td>
                    <td className="num">
                      {n.dias === null ? '—' : <Tag tom={tomDe(n.dias)}>{fmt(n.dias)}</Tag>}
                    </td>
                    <td className="ui-celula-longa">{n.statusIntelipost || '—'}</td>
                    <td className="ui-celula-longa">{n.destinatario || '—'}</td>
                    <td>{[n.cidade, n.uf].filter(Boolean).join(' / ') || '—'}</td>
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
