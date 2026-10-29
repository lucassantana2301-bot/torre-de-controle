import React from 'react';
import { MenuTopo } from './MenuTopo';
import { Header } from './Header';
import { ToastContainer } from './ToastContainer';
import { ReconcileUploadModal } from '../common/ReconcileUploadModal';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../router/useRouter';
import { dataBr, definirDiaAtivo, useDiaAtivo } from '../../services/diaAtivo';
import { useUsuario } from '../../services/usuario';
import { PerfilModal } from '../common/PerfilModal';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { path } = useRouter();
  const { uploadOpen, closeUpload, hasDataset } = useApp();
  const diaAtivo = useDiaAtivo();
  const usuario = useUsuario();
  const blockedByForcedUpload = !hasDataset && path.startsWith('/entregas');

  return (
    <div className="app-shell app-shell-topo">
      <div className="app-barras">
        <MenuTopo ferramentas={<Header />} />
      </div>
      <div className="app-main-container">
        {diaAtivo && (
          <div className="dia-historico-banner" role="status">
            <span>
              Você está vendo os dados de <b>{dataBr(diaAtivo.data)}</b>. Somente leitura: para enviar planilhas ou
              alterar tratativas, volte para hoje.
            </span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => definirDiaAtivo(null)}>
              Voltar para hoje
            </button>
          </div>
        )}
        <main className="app-content-body">
          {children}
        </main>
      </div>
      <ToastContainer />
      <ReconcileUploadModal isOpen={uploadOpen && !blockedByForcedUpload} onClose={closeUpload} />
      {!usuario && <PerfilModal usuario={null} onClose={null} />}
    </div>
  );
};
