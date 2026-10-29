import React, { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../router/useRouter';
import { useTeclaEsc } from '../../hooks/useTeclaEsc';
import { useEntregasNotas } from '../../hooks/useEntregasNotas';
import { integrationService } from '../../services/integrationService';
import { useExpedicao } from '../../services/expedicaoImport';
import {
  MODAIS_PROPRIOS,
  TRANSPORTADORAS,
  entregaDeNfAvulsa,
  formatBrDate,
  useEntregas,
  type EntregaNfSituacao,
} from '../../services/entregasImport';
import { TIPOS_OCORRENCIA, dataHoraBr, linhaDoTempo, type Ocorrencia } from '../../services/torre';
import { nomeNoRomaneio, useRomaneio } from '../../services/romaneioImport';
import { BadgePrioridade } from './OcorrenciasPanel';
import { TratativaPanel } from '../common/TratativaPanel';
import type { Integration } from '../../types';

const SITUACAO: Record<EntregaNfSituacao, { label: string; tom: string }> = {
  entregue: { label: 'Entregue', tom: 'success' },
  mesmo_dia: { label: 'Entregue (mesmo dia)', tom: 'success' },
  devolvida: { label: 'Devolução', tom: 'danger' },
  em_transito: { label: 'Em trânsito', tom: 'warning' },
  sem_rastreio: { label: 'Sem rastreio', tom: 'danger' },
};

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export const RemessaPainel: React.FC<{
  nf: string;
  ocorrencias: Ocorrencia[];
  onClose: () => void;
  embutido?: boolean;
}> = ({ nf, ocorrencias, onClose, embutido = false }) => {
  const { addToast } = useApp();
  const { navigate } = useRouter();
  const entregas = useEntregas();
  const expedicao = useExpedicao();
  const romaneio = useRomaneio();
  const notas = useEntregasNotas();
  const fecharRef = useRef<HTMLButtonElement>(null);
  useTeclaEsc(onClose);
  useEffect(() => fecharRef.current?.focus(), []);

  const integracao = useMemo(
    () =>
      integrationService
        .operacionais()
        .find((i) => i.metadata?.notaFiscal === nf || i.metadata?.nfTriangular === nf || i.id === `NF-${nf}`) ?? null,
    [nf],
  );
  const entrega = useMemo(
    () => notas.find((n) => n.nf === nf || n.nfTriangular === nf)?.entrega ?? entregaDeNfAvulsa(nf, entregas),
    [notas, nf, entregas],
  );
  const { eventos, semRegistro } = useMemo(
    () => linhaDoTempo({ nf, integracao, entregas, expedicao }),
    [nf, integracao, entregas, expedicao],
  );

  const meta: NonNullable<Integration['metadata']> = integracao?.metadata ?? {};
  const evento = entrega.evento;
  const transportadora =
    evento?.transportadora ||
    TRANSPORTADORAS.find((t) => t.id === entrega.transportadora)?.label ||
    MODAIS_PROPRIOS.find((m) => m.id === entrega.modal)?.label ||
    meta.transportadora ||
    '—';
  const situacao = SITUACAO[entrega.situacao];
  const campos: [string, string][] = [
    ['Cliente / destinatário', meta.clienteDestino || evento?.destinatario || '—'],
    ['Destino', [meta.cidade || evento?.cidade, meta.uf || evento?.uf].filter(Boolean).join('/') || '—'],
    ['Transportadora', transportadora],
    ...(romaneio
      ? ([
          [
            'Saiu no romaneio com',
            romaneio.porNf[nf] ? `${nomeNoRomaneio(romaneio.porNf[nf])} (romaneio ${romaneio.porNf[nf].romaneio || '—'})` : 'Não está no romaneio',
          ],
        ] as [string, string][])
      : []),
    ['Base', integracao ? 'Na Alloca07' : 'Fora da Alloca07 carregada'],
    ['Emissão', meta.dataEmissao ? formatBrDate(meta.dataEmissao) : '—'],
    ['Previsão de entrega', evento?.previsao ? formatBrDate(evento.previsao) : '—'],
    ['Entrega', evento?.dataEntrega ? dataHoraBr(evento.dataEntrega) : '—'],
    ['Recebedor', evento?.recebedor || '—'],
    ['Pedido', meta.pedido || '—'],
    ['Romaneio', meta.romaneio || '—'],
    ['Rastreio', meta.rastreio || '—'],
    ['Último status', evento?.ultimoStatus || '—'],
  ];

  const copiar = async () => {
    const ok = await copiarTexto(nf);
    addToast(ok ? 'success' : 'error', ok ? 'NF copiada' : 'Não foi possível copiar', ok ? nf : 'Copie o número manualmente.');
  };

  const corpo = (
    <>
      <header className="torre-drawer-topo">
        <div>
          <span className="torre-drawer-rotulo">Remessa</span>
          <h2 id="remessa-titulo">NF {nf}</h2>
          <span className={`status-badge ${situacao.tom}`}>{situacao.label}</span>
        </div>
        <button ref={fecharRef} type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="torre-drawer-corpo">
        {ocorrencias.length > 0 && (
          <section>
            <h3>Ocorrências</h3>
            <ul className="torre-drawer-ocorrencias">
              {ocorrencias.map((o) => {
                const t = TIPOS_OCORRENCIA.find((x) => x.id === o.tipo)!;
                return (
                  <li key={o.id}>
                    <BadgePrioridade prioridade={o.prioridade} />
                    <div>
                      <b>{t.label}</b>
                      {o.diasParado !== null && <span> · {o.diasParado} d.u.</span>}
                      <p>{t.acao}.</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h3>Dados da remessa</h3>
          <dl className="torre-drawer-dados">
            {campos.map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt>{rotulo}</dt>
                <dd>{valor}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3>Linha do tempo</h3>
          {eventos.length === 0 ? (
            <p className="torre-celula-sub">Nenhum evento com data nas planilhas carregadas.</p>
          ) : (
            <ol className="torre-timeline">
              {eventos.map((e, i) => (
                <li key={i} className={e.tom}>
                  <span className="torre-timeline-data">{dataHoraBr(e.data)}</span>
                  <span className="torre-timeline-titulo">{e.titulo}</span>
                  <span className="torre-celula-sub">{[e.detalhe, e.fonte].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ol>
          )}
          {semRegistro.length > 0 && (
            <p className="torre-celula-sub torre-drawer-nota">Sem registro desta NF em: {semRegistro.join(', ')}.</p>
          )}
        </section>

        <section>
          <h3>Tratativa</h3>
          <TratativaPanel integrationId={integracao?.id ?? `NF-${nf}`} notaAtual={nf} />
        </section>
      </div>

      <footer className="sheet-actions torre-drawer-acoes">
        <button type="button" className="btn btn-outline" onClick={copiar}>
          Copiar NF
        </button>
        <button type="button" className="btn btn-outline" onClick={() => navigate('/entregas', { q: nf })}>
          Abrir em Entregas
        </button>
      </footer>
    </>
  );

  if (embutido) {
    return (
      <aside className="app-remessa" aria-labelledby="remessa-titulo">
        {corpo}
      </aside>
    );
  }

  return (
    <div className="torre-drawer-fundo" onClick={onClose}>
      <aside
        className="torre-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remessa-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        {corpo}
      </aside>
    </div>
  );
};
