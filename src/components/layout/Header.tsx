import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { BancoDadosModal } from '../common/BancoDadosModal';
import { CalendarioPeriodo } from '../common/CalendarioPeriodo';
import { SeletorDia } from './SeletorDia';
import { FiltroTiposNota } from './FiltroTiposNota';
import { BuscaGlobal } from './BuscaGlobal';
import { acumularHoje } from '../../services/bancoDiario';
import { integrationService } from '../../services/integrationService';
import { dataBr, definirDiaAtivo, useDiaAtivo } from '../../services/diaAtivo';
import { useRouter } from '../../router/useRouter';
import { escolherPastaExport, nomePastaExport, suportaPasta } from '../../services/pastaExport';
import { useTratativas } from '../../services/tratativaService';
import { useZendesk } from '../../services/zendeskImport';
import { useEntregas } from '../../services/entregasImport';
import { useEntregasNotas } from '../../hooks/useEntregasNotas';
import { iniciais, useUsuario } from '../../services/usuario';
import { PerfilModal } from '../common/PerfilModal';
import { AjudaTelaModal, temAjuda } from '../common/AjudaTelaModal';

export const Header: React.FC = () => {
  const {
    theme,
    toggleTheme,
    refreshData,
    isRefreshing,
    filters,
    setFilter,
    integrations,
    addToast,
  } = useApp();
  const tratativas = useTratativas();
  const zendesk = useZendesk();
  const entregas = useEntregas();
  const cruzadas = useEntregasNotas();
  const [pastaExport, setPastaExport] = useState<string | null>(null);
  const [bancoAberto, setBancoAberto] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { navigate, path } = useRouter();
  const usuario = useUsuario();
  const diaAtivo = useDiaAtivo();

  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [menuAberto]);
  const fontes = useMemo(
    () => ({ integrations: integrationService.operacionais(), tratativas, zendesk, entregas, cruzadas }),
    [integrations, tratativas, zendesk, entregas, cruzadas],
  );

  useEffect(() => {
    nomePastaExport().then(setPastaExport);
  }, []);

  useEffect(() => {
    if (diaAtivo) return;
    const timer = window.setTimeout(() => acumularHoje().catch(() => undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [fontes, diaAtivo]);

  const handleExportado = (titulo: string, mensagem: string, pasta: string | null) => {
    if (pasta) setPastaExport(pasta);
    addToast('success', titulo, pasta ? `${mensagem} salvo na pasta "${pasta}".` : `${mensagem} baixado.`);
  };

  const handleTrocarPasta = async () => {
    const nome = await escolherPastaExport();
    if (nome) {
      setPastaExport(nome);
      addToast('info', 'Pasta definida', `Os arquivos exportados vão ser salvos em "${nome}".`);
    }
  };

  return (
    <div className="topo-ferramentas">
      <BuscaGlobal />

      <div className="header-tools">
        {diaAtivo && (
          <button
            type="button"
            className="dia-historico-pill"
            onClick={() => definirDiaAtivo(null)}
            title="Você está vendo os dados salvos de um dia antigo. Clique para voltar aos dados de hoje."
          >
            Vendo {dataBr(diaAtivo.data)} · Voltar para hoje
          </button>
        )}
        <CalendarioPeriodo
          de={filters.emissaoDe}
          ate={filters.emissaoAte}
          onChange={(de, ate) => {
            setFilter('emissaoDe', de);
            setFilter('emissaoAte', ate);
          }}
        />
        <FiltroTiposNota />

        <button
          type="button"
          className={`icon-btn ${isRefreshing ? 'spinning' : ''}`}
          onClick={refreshData}
          title="Atualizar dados: reler planilhas salvas e recalcular tudo sem precisar importar de novo"
          aria-label="Atualizar dados"
          disabled={isRefreshing}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>

        <div className="header-menu" ref={menuRef}>
          <button
            type="button"
            className={`icon-btn ${menuAberto ? 'ativo' : ''}`}
            onClick={() => setMenuAberto((v) => !v)}
            title="Mais opções"
            aria-label="Mais opções"
            aria-expanded={menuAberto}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {menuAberto && (
            <div className="header-menu-popover" role="menu">
              <button
                type="button"
                className="header-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuAberto(false);
                  refreshData();
                }}
              >
                <span>Atualizar dados e recalcular</span>
                <small>Reler planilhas salvas com as regras atualizadas</small>
              </button>
              {temAjuda(path) && (
                <button
                  type="button"
                  className="header-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuAberto(false);
                    setAjudaAberta(true);
                  }}
                >
                  <span>Como usar esta tela</span>
                  <small>Para que serve e o que cada cor significa</small>
                </button>
              )}
              <button
                type="button"
                className="header-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuAberto(false);
                  setBancoAberto(true);
                }}
              >
                <span>Banco de dados</span>
                <small>Exportar um mês, o banco completo ou o que está carregado</small>
              </button>
              <button
                type="button"
                className="header-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuAberto(false);
                  navigate('/settings', { section: 'general' });
                }}
              >
                <span>Configurações</span>
              </button>
              <div className="header-menu-bloco">
                <span className="header-menu-rotulo">Ver dados de</span>
                <SeletorDia sempre />
                <span className="header-menu-dica">Dias antigos abrem só para consulta.</span>
              </div>
              {suportaPasta() && (
                <button type="button" className="header-menu-item" role="menuitem" onClick={handleTrocarPasta}>
                  <span>Pasta dos arquivos exportados</span>
                  <small>{pastaExport ?? 'Downloads (padrão)'}</small>
                </button>
              )}
              <button type="button" className="header-menu-item" role="menuitem" onClick={toggleTheme}>
                <span>{theme === 'light' ? 'Tema escuro' : 'Tema claro'}</span>
              </button>
              <button
                type="button"
                className="header-menu-item"
                role="menuitem"
                disabled={isRefreshing}
                onClick={() => refreshData()}
              >
                <span>{isRefreshing ? 'Atualizando…' : 'Recarregar dados'}</span>
              </button>
              <button
                type="button"
                className="header-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuAberto(false);
                  navigate('/settings', { section: 'ajuda' });
                }}
              >
                <span>Como funciona</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="user-avatar"
        onClick={() => setPerfilAberto(true)}
        title={usuario ? `${usuario.nome}${usuario.setor ? ` · ${usuario.setor}` : ''}\nClique para editar seu perfil` : 'Seu perfil'}
        aria-label={usuario ? `Perfil de ${usuario.nome}` : 'Seu perfil'}
      >
        {usuario ? iniciais(usuario.nome) : '?'}
      </button>

      {perfilAberto && createPortal(<PerfilModal usuario={usuario} onClose={() => setPerfilAberto(false)} />, document.body)}
      {ajudaAberta && createPortal(<AjudaTelaModal path={path} onClose={() => setAjudaAberta(false)} />, document.body)}

      {bancoAberto &&
        createPortal(
          <BancoDadosModal
            fontes={fontes}
            pasta={pastaExport}
            onExportado={handleExportado}
            onSalvo={(mensagem) => addToast('success', 'Banco de dados', mensagem)}
            onErro={(mensagem) => addToast('error', 'Não foi possível concluir', mensagem)}
            onClose={() => setBancoAberto(false)}
          />,
          document.body,
        )}
    </div>
  );
};
