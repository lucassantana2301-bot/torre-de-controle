import React from 'react';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { useRouter } from './router/useRouter';
import { DashboardPage } from './pages/DashboardPage';
import { ReportsPage } from './pages/ReportsPage';
import { EntregasDashPage } from './pages/EntregasDashPage';
import { EntregasPage } from './pages/EntregasPage';
import { ReentregasPage } from './pages/ReentregasPage';
import { PainelPage } from './pages/PainelPage';
import { ApresentacaoPage } from './pages/ApresentacaoPage';
import { TorrePage } from './pages/TorrePage';
import { CompassePage } from './pages/CompassePage';
import { SettingsPage } from './pages/SettingsPage';
import { ehListaEntregas } from './router/secao';
import { ToastContainer } from './components/layout/ToastContainer';

const AppContent: React.FC = () => {
  const { path, searchParams } = useRouter();

  if (path.startsWith('/apresentacao')) {
    return (
      <div className="apres-standalone-container">
        <ApresentacaoPage />
        <ToastContainer />
      </div>
    );
  }

  let pageComponent: React.ReactNode = <DashboardPage />;

  if (path.startsWith('/entregas') || path.startsWith('/conferir')) {
    pageComponent =
      searchParams.get('view') === 'reentregas' ? (
        <ReentregasPage />
      ) : ehListaEntregas(searchParams) ? (
        <EntregasPage />
      ) : (
        <EntregasDashPage />
      );
  } else if (path.startsWith('/torre')) {
    pageComponent = <TorrePage />;
  } else if (path.startsWith('/painel')) {
    pageComponent = <PainelPage />;
  } else if (path.startsWith('/compasse')) {
    pageComponent = <CompassePage />;
  } else if (path.startsWith('/reports')) {
    pageComponent = <ReportsPage />;
  } else if (path.startsWith('/settings')) {
    pageComponent = <SettingsPage />;
  } else {
    pageComponent = <DashboardPage />;
  }

  return <AppLayout>{pageComponent}</AppLayout>;
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};
