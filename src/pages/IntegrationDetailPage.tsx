import React, { useState, useEffect } from 'react';
import { useRouter } from '../router/useRouter';
import { useApp } from '../context/AppContext';
import { Integration, IntegrationExecution, ExecutionLog } from '../types';
import { integrationService } from '../services/integrationService';
import { formatNoteDate } from '../utils/businessDay';
import { anomaliaDescricao, isDataAnormal } from '../utils/anomalia';
import { AlertIcon } from '../components/common/AlertIcon';
import { TratativaPanel } from '../components/common/TratativaPanel';
import { useTratativas } from '../services/tratativaService';
import { emissaoDaNf, useEmissores } from '../services/emissores';

const dataHoraBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;

export const IntegrationDetailPage: React.FC = () => {
  const { params, navigate } = useRouter();
  const { reprocessIntegration, deleteIntegration } = useApp();

  const [integration, setIntegration] = useState<Integration | null>(null);
  const [executions, setExecutions] = useState<IntegrationExecution[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'tratativa' | 'executions' | 'logs' | 'audit' | 'settings'>('summary');
  const tratativas = useTratativas();
  const emissores = useEmissores();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    setIsLoading(true);
    Promise.all([
      integrationService.getById(params.id),
      integrationService.getExecutionsByIntegration(params.id),
      integrationService.getLogsByIntegration(params.id),
    ]).then(([item, execList, logList]) => {
      setIntegration(item);
      setExecutions(execList);
      setLogs(logList);
      setIsLoading(false);
    });
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="detail-loading-box">
        <span className="pulse-dot active" />
        <p>Carregando telemetria da integração...</p>
      </div>
    );
  }

  if (!integration) {
    return (
      <div className="panel-card empty-state-box">
        <h3>Integração não encontrada</h3>
        <p>O identificador {params.id} não existe no catálogo ativo.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/integrations', { view: 'lista' })}>
          Voltar para Lista
        </button>
      </div>
    );
  }

  const emissao = emissaoDaNf(emissores, integration.metadata?.notaFiscal);
  const emissaoTriangular = emissaoDaNf(emissores, integration.metadata?.nfTriangular);

  return (
    <div className="page-integration-detail">
      {/* Topo com Título, Status e Ações Primárias */}
      <div className="detail-hero-card">
        <div className="hero-meta-row">
          <div className="hero-title-group">
            <span className="category-pill">{integration.category}</span>
            <span className={`status-badge ${integration.status === 'completed' ? 'success' : integration.status === 'pending' ? 'warning' : integration.status === 'intelipost_only' ? 'info' : integration.status === 'error' ? 'danger' : 'info'}`}>
              {integration.status === 'completed' && 'Integrada'}
              {integration.status === 'pending' && 'Não integrada'}
              {integration.status === 'intelipost_only' && 'Só Intelipost'}
              {integration.status === 'error' && 'Com erro'}
              {integration.status === 'processing' && 'Processando'}
            </span>
            <code className="id-badge large">{integration.id}</code>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => reprocessIntegration(integration.id)}
            >
              Executar Novamente
            </button>
            <button
              type="button"
              className="btn btn-ghost-danger"
              onClick={() => {
                if (confirm(`Deseja excluir a integração ${integration.id}?`)) {
                  deleteIntegration(integration.id);
                  navigate('/integrations', { view: 'lista' });
                }
              }}
            >
              Excluir
            </button>
          </div>
        </div>

        <h1 className="hero-name">
          {isDataAnormal(integration) && (
            <span className="anomalia-alert" title={anomaliaDescricao(integration)}>
              <AlertIcon size={20} />
            </span>
          )}
          {integration.name}
        </h1>
        <p className="hero-desc">{integration.description}</p>
        {isDataAnormal(integration) && (
          <div className="anomalia-callout">
            <AlertIcon />
            Anormal: {anomaliaDescricao(integration)}
          </div>
        )}
      </div>

      {/* Navegação por Abas no estilo Apple HIG Segmented/Tabs */}
      <div className="detail-tabs-bar" role="tablist">
        {(['summary', 'tratativa', 'executions', 'logs', 'audit', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`detail-tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'summary' && 'Resumo Geral'}
            {tab === 'tratativa' && `Tratativa (${tratativas[integration.id]?.tratado ? 'Tratado' : 'Pendente'})`}
            {tab === 'executions' && `Execuções (${executions.length})`}
            {tab === 'logs' && `Console de Logs (${logs.length})`}
            {tab === 'audit' && 'Histórico de Auditoria'}
            {tab === 'settings' && 'Configurações'}
          </button>
        ))}
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div className="detail-tab-content">
        {activeTab === 'summary' && (
          <div className="summary-grid">
            <div className="panel-card">
              <h3 className="section-title">Dados Operacionais</h3>
              <dl className="meta-dl">
                <div>
                  <dt>Tipo de Integração</dt>
                  <dd><span className="type-tag">{integration.type}</span></dd>
                </div>
                <div>
                  <dt>Sistema de Origem</dt>
                  <dd>{integration.sourceSystem}</dd>
                </div>
                <div>
                  <dt>Sistema de Destino</dt>
                  <dd>{integration.targetSystem}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{integration.responsible}</dd>
                </div>
                <div>
                  <dt>Duração da Última Execução</dt>
                  <dd>{integration.durationMs > 0 ? `${integration.durationMs}ms` : '—'}</dd>
                </div>
                <div>
                  <dt>Data de Criação</dt>
                  <dd>{new Date(integration.createdAt).toLocaleString('pt-BR')}</dd>
                </div>
              </dl>
            </div>

            <div className="panel-card">
              <h3 className="section-title">Metadados de Transporte & NF</h3>
              {integration.metadata ? (
                <dl className="meta-dl">
                  {integration.metadata.notaFiscal && (
                    <div>
                      <dt>Nota Fiscal</dt>
                      <dd><b>{integration.metadata.notaFiscal}</b></dd>
                    </div>
                  )}
                  <div>
                    <dt>Tipo da nota</dt>
                    <dd><b>{integration.metadata.tipoNota || '—'}</b></dd>
                  </div>
                  <div>
                    <dt>UF de destino</dt>
                    <dd>
                      <b>{integration.metadata.uf || '—'}</b>
                      {integration.metadata.cidade ? ` · ${integration.metadata.cidade}` : ''}
                    </dd>
                  </div>
                  {emissores && (
                    <div>
                      <dt>Emitida por</dt>
                      <dd>
                        {emissao ? (
                          <>
                            <b>{emissao.login}</b>
                            {emissao.em ? ` · ${dataHoraBr(emissao.em)}` : ''}
                          </>
                        ) : (
                          'Não está na Extração - Romaneio carregada'
                        )}
                        {emissaoTriangular && (
                          <span className="text-muted">
                            {' '}
                            · triangular por {emissaoTriangular.login}
                            {emissaoTriangular.em ? ` em ${dataHoraBr(emissaoTriangular.em)}` : ''}
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Data de emissão (Alloca07)</dt>
                    <dd>{formatNoteDate(integration.metadata.dataEmissao)}</dd>
                  </div>
                  <div>
                    <dt>Data de integração (Intelipost)</dt>
                    <dd>{formatNoteDate(integration.metadata.dataIntegracao)}</dd>
                  </div>
                  {integration.metadata.nfTriangular && (
                    <div>
                      <dt>NF triangular</dt>
                      <dd>
                        <b>{integration.metadata.nfTriangular}</b>
                        {integration.metadata.validacao === 'triangular' ? ' · valida esta nota na Intelipost' : ''}
                      </dd>
                    </div>
                  )}
                  {integration.metadata.pedido && (
                    <div>
                      <dt>Pedido</dt>
                      <dd>{integration.metadata.pedido}</dd>
                    </div>
                  )}
                  {integration.metadata.transportadora && (
                    <div>
                      <dt>Transportadora</dt>
                      <dd>{integration.metadata.transportadora}</dd>
                    </div>
                  )}
                  {integration.metadata.clienteDestino && (
                    <div>
                      <dt>Cliente / Destinatário</dt>
                      <dd>{integration.metadata.clienteDestino}</dd>
                    </div>
                  )}
                  {integration.metadata.rastreio && (
                    <div>
                      <dt>Código de Rastreio</dt>
                      <dd><code className="id-badge">{integration.metadata.rastreio}</code></dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-muted">Nenhum metadado adicional anexado.</p>
              )}

              {integration.errorMessage && (
                <div className="error-callout-box">
                  <strong>Mensagem de Erro Registrada:</strong>
                  <p>{integration.errorMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tratativa' && (
          <div className="panel-card">
            <h3 className="section-title">Tratativa</h3>
            <TratativaPanel integrationId={integration.id} notaAtual={integration.metadata?.notaFiscal} />
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="panel-card">
            <h3 className="section-title">Histórico de Execuções</h3>
            {executions.length === 0 ? (
              <p className="text-muted">Nenhuma execução registrada nesta janela.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID da Execução</th>
                      <th>Início</th>
                      <th>Duração</th>
                      <th>Status</th>
                      <th>Disparo</th>
                      <th>Registros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((e) => (
                      <tr key={e.id}>
                        <td><code>{e.id}</code></td>
                        <td>{new Date(e.startedAt).toLocaleString('pt-BR')}</td>
                        <td>{e.durationMs}ms</td>
                        <td><span className={`status-badge ${e.status === 'completed' ? 'success' : 'danger'}`}>{e.status}</span></td>
                        <td><span className="type-tag">{e.triggeredBy}</span></td>
                        <td>{e.recordsProcessed} proc / {e.recordsFailed} falhas</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="panel-card">
            <h3 className="section-title">Console de Logs</h3>
            {logs.length === 0 ? (
              <p className="text-muted">Nenhum log encontrado para esta integração.</p>
            ) : (
              <div className="logs-terminal-view">
                {logs.map((l) => (
                  <div key={l.id} className={`log-line level-${l.level.toLowerCase()}`}>
                    <span className="log-time">{new Date(l.timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span className={`log-tag tag-${l.level.toLowerCase()}`}>[{l.level}]</span>
                    <span className="log-msg">{l.message}</span>
                    <span className="log-dur">+{l.durationMs}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="panel-card">
            <h3 className="section-title">Trilha de Auditoria</h3>
            <ul className="timeline-list">
              <li>
                <strong>Criação do Registro</strong>
                <p>Criado por {integration.responsible} em {new Date(integration.createdAt).toLocaleString('pt-BR')}.</p>
              </li>
              {integration.lastRunAt && (
                <li>
                  <strong>Última Transmissão</strong>
                  <p>Executado em {new Date(integration.lastRunAt).toLocaleString('pt-BR')} via gateway Intelipost.</p>
                </li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="panel-card">
            <h3 className="section-title">Parâmetros do Endpoint</h3>
            <dl className="meta-dl">
              <div>
                <dt>URL do Serviço</dt>
                <dd><code>{integration.endpoint || 'https://api.arklok.com.br/v1/integrations'}</code></dd>
              </div>
              <div>
                <dt>Formato de Payload</dt>
                <dd><code>application/json (UTF-8)</code></dd>
              </div>
              <div>
                <dt>Política de Retentativas</dt>
                <dd>Até 3 tentativas exponenciais com jitter (SLA Arklok)</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
};
