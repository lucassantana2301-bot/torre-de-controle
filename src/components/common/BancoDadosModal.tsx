import React from 'react';
import { exportarGeral, montarTabelas, type FontesExportGeral } from '../../services/exportGeral';
import {
  acumularHoje,
  exportarBanco,
  listarDias,
  nomeMes,
  resumoMeses,
  verificarBanco,
  type DiaSalvo,
  type ProblemaBanco,
  type ResumoMes,
  type VerificacaoBanco,
} from '../../services/bancoDiario';
import { ENTREGA_SITUACOES } from '../../services/entregasImport';
import { dataBr, useDiaAtivo } from '../../services/diaAtivo';
import { useApp } from '../../context/AppContext';

interface BancoDadosModalProps {
  fontes: FontesExportGeral;
  pasta: string | null;
  onExportado: (titulo: string, mensagem: string, pasta: string | null) => void;
  onSalvo: (mensagem: string) => void;
  onErro: (mensagem: string) => void;
  onClose: () => void;
}

const temDados = (fontes: FontesExportGeral) => montarTabelas(fontes).some((t) => t.linhas.length > 0);

const DIAS_NO_RESUMO = 10;

export const BancoDadosModal: React.FC<BancoDadosModalProps> = ({ fontes, pasta, onExportado, onSalvo, onErro, onClose }) => {
  const [meses, setMeses] = React.useState<ResumoMes[]>([]);
  const [dias, setDias] = React.useState<DiaSalvo[]>([]);
  const [ocupado, setOcupado] = React.useState(false);
  const [verificacao, setVerificacao] = React.useState<VerificacaoBanco | null>(null);
  const diaAtivo = useDiaAtivo();
  const { zerarDadosDeHoje } = useApp();

  const recarregar = React.useCallback(async () => {
    const [m, d] = await Promise.all([resumoMeses().catch(() => []), listarDias().catch(() => [])]);
    setMeses(m);
    setDias(d.filter((dia) => dia.entregas).slice(-DIAS_NO_RESUMO).reverse());
  }, []);

  React.useEffect(() => {
    acumularHoje().catch(() => undefined).finally(recarregar);
  }, [fontes, recarregar]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    try {
      await acao();
    } catch (cause) {
      onErro(cause instanceof Error ? cause.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setOcupado(false);
    }
  };

  const exportarHoje = () =>
    executar(async () => {
      const { arquivo, pasta: destino } = await exportarGeral(fontes, diaAtivo?.data);
      onExportado('Dados do dia exportados', arquivo, destino);
    });

  const exportarMes = (mes: string | null) =>
    executar(async () => {
      const { arquivo, pasta: destino } = await exportarBanco(mes);
      onExportado(mes ? `Banco de ${nomeMes(mes)} exportado` : 'Banco completo exportado', arquivo, destino);
    });

  const atualizar = () =>
    executar(async () => {
      const { novos, atualizados } = await acumularHoje();
      await recarregar();
      onSalvo(novos || atualizados ? `${novos} registros novos e ${atualizados} atualizados no banco.` : 'O banco já estava em dia.');
    });

  const verificar = () =>
    executar(async () => {
      setVerificacao(await verificarBanco());
    });

  const limpar = (problemas: ProblemaBanco[]) => {
    const total = problemas.reduce((soma, p) => soma + p.quantidade, 0);
    if (!confirm(`Apagar ${total} ${total === 1 ? 'item' : 'itens'} do banco? Isso não pode ser desfeito.`)) return;
    return executar(async () => {
      for (const problema of problemas) await problema.limpar?.();
      setVerificacao(await verificarBanco());
      await recarregar();
      onSalvo(`Limpeza feita: ${total} ${total === 1 ? 'item removido' : 'itens removidos'}.`);
    });
  };

  const novaImportacao = () => {
    if (!confirm('Guardar no banco o que está carregado e limpar as planilhas para uma nova importação?')) return;
    return executar(async () => {
      await zerarDadosDeHoje();
      await recarregar();
      onSalvo('Dados guardados no banco. As planilhas foram limpas para a nova importação (as tratativas continuam).');
    });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="banco-title">
      <div className="sheet-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title" id="banco-title">Banco de dados</h2>
            <p className="sheet-subtitle">
              Cada importação é somada ao banco: uma linha por NF (ou ticket), atualizada sempre que a situação muda. O
              mês é o da emissão da nota.
              {pasta ? ` Os arquivos vão para a pasta "${pasta}".` : ''}
            </p>
          </div>
          <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="reconcile-body">
          <section className="banco-section">
            <h3 className="section-title">Banco acumulado por mês</h3>
            {meses.length === 0 ? (
              <p className="text-muted">O banco ainda está vazio. Ele é preenchido sozinho ao carregar as planilhas.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mês (emissão)</th>
                      <th className="text-right">Notas</th>
                      {ENTREGA_SITUACOES.map((s) => (
                        <th key={s.id} className="text-right">{s.label}</th>
                      ))}
                      <th>Atualizado em</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {meses.map((m) => (
                      <tr key={m.mes}>
                        <td>{nomeMes(m.mes)}</td>
                        <td className="text-right">{m.notas}</td>
                        {ENTREGA_SITUACOES.map((s) => (
                          <td key={s.id} className="text-right">{m.entregas[s.label] ?? 0}</td>
                        ))}
                        <td>{m.ultimaAtualizacao ? new Date(m.ultimaAtualizacao).toLocaleString('pt-BR') : '—'}</td>
                        <td>
                          <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => exportarMes(m.mes)}>
                            Exportar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="filter-inputs-row">
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado || meses.length === 0} onClick={() => exportarMes(null)}>
                Exportar banco completo
              </button>
              {!diaAtivo && (
                <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={atualizar}>
                  Atualizar banco agora
                </button>
              )}
            </div>
          </section>

          <section className="banco-section">
            <h3 className="section-title">Verificar banco</h3>
            <p className="text-muted">
              Procura registros inválidos, repetidos ou soltos, datas lidas errado e sobras de versões antigas.
            </p>
            {verificacao && (
              <div className="verificacao">
                <p className="verificacao-resumo">
                  {verificacao.registros.toLocaleString('pt-BR')} registros (
                  {Object.entries(verificacao.porTabela)
                    .map(([tabela, n]) => `${tabela.replace('_', ' ')}: ${n.toLocaleString('pt-BR')}`)
                    .join(' · ')}
                  ) · {verificacao.dias} dias no resumo · {verificacao.fotos} fotos de dias · navegador usando{' '}
                  {(verificacao.espacoLocalKb / 1024).toFixed(1)} MB
                </p>
                {verificacao.problemas.length === 0 ? (
                  <p className="verificacao-ok">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: '6px' }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Nenhum lixo encontrado. O banco está limpo.
                  </p>
                ) : (
                  <ul className="verificacao-lista">
                    {verificacao.problemas.map((p) => (
                      <li key={p.id} className={`verificacao-item ${p.nivel}`}>
                        <div className="verificacao-info">
                          <span className="verificacao-titulo">
                            {p.titulo} <b>({p.quantidade.toLocaleString('pt-BR')})</b>
                          </span>
                          <span className="verificacao-desc">{p.descricao}</span>
                          {p.exemplos.length > 0 && (
                            <span className="verificacao-exemplos">
                              Ex.: {p.exemplos.join(', ')}
                              {p.quantidade > p.exemplos.length ? '…' : ''}
                            </span>
                          )}
                        </div>
                        {p.limpar ? (
                          <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => limpar([p])}>
                            Limpar
                          </button>
                        ) : (
                          <span className="verificacao-tag">Só aviso</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="filter-inputs-row">
              <button type="button" className="btn btn-outline btn-sm" disabled={ocupado} onClick={verificar}>
                {verificacao ? 'Verificar de novo' : 'Verificar banco'}
              </button>
              {verificacao && verificacao.problemas.some((p) => p.limpar) && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={ocupado}
                  onClick={() => limpar(verificacao.problemas.filter((p) => p.limpar))}
                >
                  Limpar todo o lixo
                </button>
              )}
            </div>
          </section>

          <section className="banco-section">
            <h3 className="section-title">{diaAtivo ? `Dia ${dataBr(diaAtivo.data)}` : 'Dados carregados agora'}</h3>
            <p className="text-muted">Uma aba por tabela, só com o que está carregado no app neste momento.</p>
            <div className="filter-inputs-row">
              <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || !temDados(fontes)} onClick={exportarHoje}>
                {diaAtivo ? `Exportar dia ${dataBr(diaAtivo.data)}` : 'Exportar dados carregados'}
              </button>
              {!diaAtivo && (
                <button type="button" className="btn btn-outline btn-sm" disabled={ocupado || !temDados(fontes)} onClick={novaImportacao}>
                  Zerar para atualizar hoje
                </button>
              )}
            </div>
          </section>

          {dias.length > 0 && (
            <section className="banco-section">
              <h3 className="section-title">Resumo diário</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th className="text-right">Notas</th>
                      {ENTREGA_SITUACOES.map((s) => (
                        <th key={s.id} className="text-right">{s.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((dia) => (
                      <tr key={dia.data}>
                        <td>{dataBr(dia.data)}</td>
                        <td className="text-right">{dia.registros.Notas ?? 0}</td>
                        {ENTREGA_SITUACOES.map((s) => (
                          <td key={s.id} className="text-right">{dia.entregas?.[s.id] ?? 0}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
