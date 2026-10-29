import React from 'react';
import { useRouter } from '../router/useRouter';
import { useApp } from '../context/AppContext';
import { integrationService } from '../services/integrationService';
import { useUsuario } from '../services/usuario';
import { PerfilModal } from '../components/common/PerfilModal';

export const SettingsPage: React.FC = () => {
  const { searchParams, navigate } = useRouter();
  const { theme, toggleTheme, autoRefreshInterval, setAutoRefreshInterval, addToast, refreshData } = useApp();

  const currentSection = searchParams.get('section') === 'ajuda' ? 'ajuda' : 'general';
  const usuario = useUsuario();
  const [perfilAberto, setPerfilAberto] = React.useState(false);

  const handleResetDatabase = async () => {
    if (confirm('Deseja apagar a base da Alloca07 carregada? Você precisará enviar a planilha de novo.')) {
      await integrationService.resetToDefault();
      await refreshData();
      addToast('info', 'Base limpa', 'Envie as planilhas no Início para carregar uma nova base.');
    }
  };

  return (
    <div className="page-settings">
      <div className="page-header app-cabecalho">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Preferências e situações usadas nas telas.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav-panel">
          <button
            type="button"
            className={`settings-nav-btn ${currentSection === 'general' ? 'active' : ''}`}
            onClick={() => navigate('/settings', { section: 'general' })}
          >
            Geral
          </button>
          <button
            type="button"
            className={`settings-nav-btn ${currentSection === 'ajuda' ? 'active' : ''}`}
            onClick={() => navigate('/settings', { section: 'ajuda' })}
          >
            Como funciona
          </button>
        </nav>

        <div className="settings-content-panel">
          {currentSection === 'general' && (
            <div className="panel-card">
              <h3 className="section-title">Preferências</h3>
              <div className="preference-row">
                <div>
                  <strong>Seu perfil</strong>
                  <p className="text-muted">
                    {usuario ? `${usuario.nome}${usuario.setor ? ` · ${usuario.setor}` : ''}` : 'Nome e setor não informados.'}
                  </p>
                </div>
                <button type="button" className="btn btn-outline" onClick={() => setPerfilAberto(true)}>
                  Editar
                </button>
              </div>

              <div className="preference-row">
                <div>
                  <strong>Tema</strong>
                  <p className="text-muted">Claro ou escuro.</p>
                </div>
                <button type="button" className="btn btn-outline" onClick={toggleTheme}>
                  {theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
                </button>
              </div>

              <div className="preference-row">
                <div>
                  <strong>Atualização automática</strong>
                  <p className="text-muted">De quanto em quanto tempo as telas recalculam os números.</p>
                </div>
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                  className="select-control"
                >
                  <option value={0}>Desligado</option>
                  <option value={15}>15 segundos</option>
                  <option value={30}>30 segundos (recomendado)</option>
                  <option value={60}>60 segundos</option>
                </select>
              </div>

              <div className="preference-row">
                <div>
                  <strong>Base da Alloca07</strong>
                  <p className="text-muted">
                    Apaga só as notas emitidas carregadas. O banco acumulado e as planilhas das transportadoras continuam.
                  </p>
                </div>
                <button type="button" className="btn btn-outline-danger" onClick={handleResetDatabase}>
                  Limpar base
                </button>
              </div>
            </div>
          )}

          {currentSection === 'ajuda' && (
            <>
              <div className="panel-card">
                <h3 className="section-title">Notas emitidas</h3>
                <p className="text-muted">
                  A base vem só da Alloca07. Remanejamento fiscal e as notas do dia útil corrente ficam de fora. A NF
                  triangular continua valendo como a mesma carga quando a principal não aparece na transportadora. As
                  notas da planilha de Retenção Fiscal também ficam fora do SLA: o atraso delas não é da transportadora.
                </p>
              </div>

              <div className="panel-card">
                <h3 className="section-title">Entregas</h3>
                <dl className="meta-dl">
                  <div>
                    <dt><span className="status-badge success">Entregue</span></dt>
                    <dd>A NF (ou a triangular) tem data de entrega na planilha da SPfly, Jamef ou Certex.</dd>
                  </div>
                  <div>
                    <dt><span className="status-badge warning">Não entregue</span></dt>
                    <dd>A NF está na planilha da transportadora, mas ainda sem data de entrega.</dd>
                  </div>
                  <div>
                    <dt><span className="status-badge info">Sem rastreio</span></dt>
                    <dd>A NF não aparece em nenhuma planilha de transportadora. Normalmente é nota emitida fora do período da planilha exportada.</dd>
                  </div>
                </dl>
                <p className="text-muted">Só entregas entram. Reversas, devoluções e retornos ao CD de Itapevi ficam de fora.</p>
              </div>

              <div className="panel-card">
                <h3 className="section-title">Banco de dados</h3>
                <p className="text-muted">
                  Tudo o que é carregado é somado ao banco acumulado: uma linha por NF, atualizada quando a
                  situação muda. O mês de cada nota é o da emissão. No botão Banco de dados você exporta um mês, o
                  banco completo ou só o que está carregado agora.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
      {perfilAberto && <PerfilModal usuario={usuario} onClose={() => setPerfilAberto(false)} />}
    </div>
  );
};
