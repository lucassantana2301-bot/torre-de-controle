import React from 'react';
import { entregueParaBaixa, foiEntregue, type EntregaDoTicket } from '../../hooks/useEntregaPorTicket';
import { MODAIS_PROPRIOS, TRANSPORTADORAS, formatBrDate, type EntregaNf } from '../../services/entregasImport';
import {
  ETAPA_MANUAL,
  ZENDESK_ABAS,
  formatZendeskDate,
  numeroNf,
  ticketKey,
  zendeskStore,
  type NfManual,
  type NfResumo,
  type VinculoNf,
  type ZendeskTicket,
} from '../../services/zendeskImport';
import { Botao, Modal, Tag, type Tom } from '../../ui/componentes';

interface Linha {
  nf: string;
  triangular: string;
}

const situacaoDaNf = (entrega: EntregaNf): { texto: string; tom: Tom } => {
  const quem =
    entrega.evento?.transportadora ||
    TRANSPORTADORAS.find((t) => t.id === entrega.transportadora)?.label ||
    MODAIS_PROPRIOS.find((m) => m.id === entrega.modal)?.label;
  if (foiEntregue(entrega)) {
    const data = entrega.evento?.dataEntrega ? ` em ${formatBrDate(entrega.evento.dataEntrega)}` : '';
    return { texto: `Entregue${data}${quem ? ` · ${quem}` : ''}`, tom: 'sucesso' };
  }
  if (entregueParaBaixa(entrega)) return { texto: 'Entregue · Frota interna (mesmo dia)', tom: 'sucesso' };
  if (entrega.situacao === 'devolvida') return { texto: `Devolução${quem ? ` · ${quem}` : ''}`, tom: 'perigo' };
  if (entrega.situacao === 'em_transito') {
    return { texto: [quem, entrega.evento?.ultimoStatus || 'Em trânsito'].filter(Boolean).join(' · '), tom: 'atencao' };
  }
  if (entrega.evento) return { texto: 'Envio sem entrega confirmada', tom: 'perigo' };
  return { texto: 'Não está nas planilhas das transportadoras', tom: '' };
};

export const VincularNfModal: React.FC<{
  ticket: ZendeskTicket;
  resumo: NfResumo | null;
  manual: NfManual | null | undefined;
  entrega: EntregaDoTicket | undefined;
  onClose: () => void;
}> = ({ ticket, resumo, manual, entrega, onClose }) => {
  const chave = ticketKey(ticket.id);
  const vinculado = !!manual?.porTicket[chave];
  const registros = resumo?.registros ?? [];
  const doRomaneio = registros.filter((r) => r.etapa !== ETAPA_MANUAL);

  const [linhas, setLinhas] = React.useState<Linha[]>(() => {
    const atuais = [...new Set(registros.flatMap((r) => (r.nf ? [r.nf] : [])))];
    return atuais.length
      ? atuais.map((nf) => ({ nf, triangular: manual?.triangular?.[nf] ?? '' }))
      : [{ nf: '', triangular: '' }];
  });
  const [salvo, setSalvo] = React.useState(false);

  const vinculos: VinculoNf[] = linhas
    .map((l) => ({ nf: numeroNf(l.nf), triangular: numeroNf(l.triangular) || undefined }))
    .filter((v) => v.nf.length >= 3);
  const invalida = linhas.some((l) => {
    const nf = numeroNf(l.nf);
    const triangular = numeroNf(l.triangular);
    return (nf && nf.length < 3) || (triangular && (triangular.length < 3 || !nf));
  });

  const editar = (index: number, campo: keyof Linha, valor: string) => {
    setSalvo(false);
    setLinhas((atual) => atual.map((l, i) => (i === index ? { ...l, [campo]: valor } : l)));
  };

  const salvar = (event: React.FormEvent) => {
    event.preventDefault();
    if (!vinculos.length || invalida) return;
    zendeskStore.vincularNfs(ticket.id, vinculos);
    setSalvo(true);
  };

  const remover = () => {
    zendeskStore.vincularNfs(ticket.id, []);
    onClose();
  };

  const status = ZENDESK_ABAS.find((a) => a.id === ticket.aba)?.label ?? ticket.aba;

  return (
    <Modal
      titulo={`Ticket #${ticket.id}`}
      sub={[ticket.organizacao, ticket.uf, status, `aberto em ${formatZendeskDate(ticket.criadoEm)}`].filter(Boolean).join(' · ')}
      onClose={onClose}
      estreito
      rodape={
        <>
          {vinculado && (
            <Botao className="ui-vinculo-remover" onClick={remover}>
              Remover vínculo
            </Botao>
          )}
          <Botao onClick={onClose}>{salvo ? 'Fechar' : 'Cancelar'}</Botao>
          <Botao primario type="submit" form="vincular-nf" disabled={!vinculos.length || invalida}>
            {vinculado ? 'Salvar e cruzar de novo' : 'Vincular e cruzar'}
          </Botao>
        </>
      }
    >
      <p className="ui-vinculo-origem">
        {doRomaneio.length === 0
          ? 'Este ticket não está no romaneio.'
          : `No romaneio: ${doRomaneio.map((r) => r.nf ?? 'linha sem NF').join(', ')}${vinculado ? ' (substituído pelo vínculo manual)' : ''}.`}{' '}
        A NF vinculada aqui vale no lugar das do romaneio e é conferida nas planilhas da SPfly, Jamef e Certex.
      </p>

      <form id="vincular-nf" className="ui-vinculo-form" onSubmit={salvar}>
        <div className="ui-vinculo-cabecalho">
          <span>Nota fiscal</span>
          <span>NF triangular (opcional)</span>
        </div>
        {linhas.map((linha, index) => (
          <div key={index} className="ui-vinculo-linha">
            <input
              className="ui-campo"
              inputMode="numeric"
              placeholder="Ex.: 237768"
              aria-label={`Nota fiscal ${index + 1}`}
              value={linha.nf}
              autoFocus={index === 0}
              onChange={(e) => editar(index, 'nf', e.target.value)}
            />
            <input
              className="ui-campo"
              inputMode="numeric"
              placeholder="Se houver"
              aria-label={`NF triangular ${index + 1}`}
              value={linha.triangular}
              onChange={(e) => editar(index, 'triangular', e.target.value)}
            />
            <button
              type="button"
              className="ui-modal-fechar"
              aria-label="Remover esta NF"
              disabled={linhas.length === 1}
              onClick={() => {
                setSalvo(false);
                setLinhas((atual) => atual.filter((_, i) => i !== index));
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
        <div>
          <Botao pequeno onClick={() => setLinhas((atual) => [...atual, { nf: '', triangular: '' }])}>
            + Outra NF
          </Botao>
        </div>
        {invalida && <p className="ui-vinculo-erro">Confira os números: a NF tem que ter pelo menos 3 dígitos, e a triangular precisa da NF ao lado.</p>}
      </form>

      {vinculado && entrega && (
        <div className="ui-modal-resumo">
          <b>{salvo ? 'Cruzamento feito agora' : 'Cruzamento atual'}</b>
          <ul className="ui-vinculo-resultado">
            {entrega.nfs.map(({ nf, entrega: e }) => {
              const s = situacaoDaNf(e);
              const par = manual?.triangular?.[nf];
              return (
                <li key={nf}>
                  <span>
                    NF <b>{nf}</b>
                    {par && <span className="text-muted"> · triangular {par}</span>}
                  </span>
                  <Tag tom={s.tom}>{s.texto}</Tag>
                  {e.viaNf && <span className="text-muted">pela NF {e.viaNf} (triangular)</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-muted">
            {entrega.completa
              ? 'Pronto para baixa: o ticket agora é "Com NF" e está na aba "Já entregues — dar baixa" (com a Situação da NF em Todas ou Com NF).'
              : entrega.entregues > 0
                ? 'Tem NF entregue, mas ainda não entra na baixa (Lalamove ou linha do romaneio sem NF).'
                : 'Nenhuma NF entregue ainda; o ticket segue na aba do status dele, agora como "Com NF".'}
          </p>
        </div>
      )}
    </Modal>
  );
};
