import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  Integration,
  DashboardMetrics,
  GlobalFilterState,
  ToastMessage,
  ToastType,
} from '../types';
import { integrationService } from '../services/integrationService';
import { importWorkbookFiles, type ImportSummary } from '../services/workbookImport';
import { subscribeDiaAtivo, useDiaAtivo } from '../services/diaAtivo';
import { zerarHoje } from '../services/bancoDiario';
import { useTiposOcultos } from '../services/tiposOcultos';
import { recarregarEntregas } from '../services/entregasImport';

interface AppContextValue {
  integrations: Integration[];
  metrics: DashboardMetrics | null;
  filters: GlobalFilterState;
  setFilter: <K extends keyof GlobalFilterState>(key: K, value: GlobalFilterState[K]) => void;
  resetFilters: () => void;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  toasts: ToastMessage[];
  addToast: (type: ToastType, title: string, message?: string) => void;
  removeToast: (id: string) => void;
  reprocessIntegration: (id: string) => Promise<void>;
  deleteIntegration: (id: string) => Promise<void>;
  createIntegration: (payload: Parameters<typeof integrationService.create>[0]) => Promise<Integration>;
  updateIntegration: (id: string, updates: Partial<Integration>) => Promise<Integration>;
  autoRefreshInterval: number; // segundos, 0 = desligado
  setAutoRefreshInterval: (seconds: number) => void;
  hasDataset: boolean;
  uploadOpen: boolean;
  openUpload: () => void;
  closeUpload: () => void;
  importSpreadsheets: (files: File[]) => Promise<ImportSummary>;
  zerarDadosDeHoje: () => Promise<void>;
}

const DEFAULT_FILTERS: GlobalFilterState = {
  search: '',
  status: 'all',
  category: 'all',
  type: 'all',
  responsible: 'all',
  startDate: null,
  endDate: null,
  datePreset: 'all',
  emissaoDe: null,
  emissaoAte: null,
};

const PERIODO_KEY = 'arklok_periodo_emissao';

function periodoSalvo(): Pick<GlobalFilterState, 'emissaoDe' | 'emissaoAte'> {
  try {
    const salvo = JSON.parse(sessionStorage.getItem(PERIODO_KEY) ?? 'null');
    return { emissaoDe: salvo?.de ?? null, emissaoAte: salvo?.ate ?? null };
  } catch {
    return { emissaoDe: null, emissaoAte: null };
  }
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [filters, setFilters] = useState<GlobalFilterState>(() => {
    // Sincroniza estado inicial com a URL se presente
    const params = new URLSearchParams(window.location.search);
    return {
      search: params.get('q') || '',
      status: (params.get('status') as GlobalFilterState['status']) || 'all',
      category: (params.get('category') as GlobalFilterState['category']) || 'all',
      type: (params.get('type') as GlobalFilterState['type']) || 'all',
      responsible: params.get('responsible') || 'all',
      startDate: params.get('startDate') || null,
      endDate: params.get('endDate') || null,
      datePreset: (params.get('preset') as GlobalFilterState['datePreset']) || 'all',
      ...periodoSalvo(),
    };
  });

  useEffect(() => {
    if (filters.emissaoDe || filters.emissaoAte) {
      sessionStorage.setItem(PERIODO_KEY, JSON.stringify({ de: filters.emissaoDe, ate: filters.emissaoAte }));
    } else {
      sessionStorage.removeItem(PERIODO_KEY);
    }
  }, [filters.emissaoDe, filters.emissaoAte]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('arklok_sidebar_collapsed') === 'true';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('arklok_theme') as 'light' | 'dark') || 'light';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30);
  const [hasDataset, setHasDataset] = useState(() => integrationService.hasUserDataset());
  const [uploadOpen, setUploadOpen] = useState(false);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((curr) => [...curr, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((curr) => curr.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const { emissaoDe, emissaoAte } = filters;
  const ocultos = useTiposOcultos();
  const ultimaCarga = useRef<{ base: Integration[]; de: string | null; ate: string | null } | null>(null);

  const loadData = useCallback(async (silent = false) => {
    await integrationService.pronto();
    const base = integrationService.operacionais();
    const anterior = ultimaCarga.current;
    if (anterior && anterior.base === base && anterior.de === emissaoDe && anterior.ate === emissaoAte) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const periodo = { emissaoDe, emissaoAte };
      const [list, calculatedMetrics] = await Promise.all([
        integrationService.list(periodo),
        integrationService.getMetrics(periodo),
      ]);
      ultimaCarga.current = { base, de: emissaoDe, ate: emissaoAte };
      setIntegrations(list);
      setMetrics(calculatedMetrics);
    } catch {
      addToast('error', 'Erro ao carregar dados', 'Não foi possível sincronizar com o serviço.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [emissaoDe, emissaoAte, ocultos, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const diaAtivo = useDiaAtivo();
  useEffect(() => subscribeDiaAtivo(() => loadData(true)), [loadData]);

  // Temporizador de atualização automática
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      loadData(true);
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, loadData]);

  // Aplica classe no body para dark mode
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('arklok_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      localStorage.setItem('arklok_sidebar_collapsed', String(next));
      return next;
    });
  }, []);

  const setFilter = useCallback(<K extends keyof GlobalFilterState>(key: K, value: GlobalFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    addToast('info', 'Filtros redefinidos', 'Exibindo todas as integrações sem restrições.');
  }, [addToast]);

  const reprocessIntegration = useCallback(async (id: string) => {
    try {
      addToast('info', 'Reprocessamento iniciado', `A integração ${id} foi enviada para a fila.`);
      await integrationService.reprocess(id);
      await loadData(true);
      addToast('success', 'Reprocessada com sucesso', `A integração ${id} foi concluída.`);
    } catch {
      addToast('error', 'Falha no reprocessamento', `Erro ao executar novamente ${id}.`);
    }
  }, [addToast, loadData]);

  const deleteIntegration = useCallback(async (id: string) => {
    try {
      await integrationService.delete(id);
      await loadData(true);
      addToast('success', 'Integração removida', `O registro ${id} foi excluído.`);
    } catch {
      addToast('error', 'Erro ao excluir', `Não foi possível remover a integração.`);
    }
  }, [addToast, loadData]);

  const createIntegration = useCallback(async (payload: Parameters<typeof integrationService.create>[0]) => {
    const created = await integrationService.create(payload);
    await loadData(true);
    addToast('success', 'Integração criada', `${created.name} foi adicionada ao catálogo.`);
    return created;
  }, [addToast, loadData]);

  const importSpreadsheets = useCallback(async (files: File[]) => {
    const result = await importWorkbookFiles(files);
    await integrationService.replaceAll(result.integrations);
    integrationService.salvarInfo(files.map((file) => file.name));
    setHasDataset(true);
    setUploadOpen(false);
    await loadData(true);
    addToast(
      'success',
      'Planilhas lidas',
      `${result.summary.notas.toLocaleString('pt-BR')} notas emitidas carregadas.`,
    );
    return result.summary;
  }, [addToast, loadData]);

  const zerarDadosDeHoje = useCallback(async () => {
    await zerarHoje();
    setHasDataset(false);
    await loadData(true);
  }, [loadData]);

  const updateIntegration = useCallback(async (id: string, updates: Partial<Integration>) => {
    const updated = await integrationService.update(id, updates);
    await loadData(true);
    addToast('success', 'Integração atualizada', `${updated.name} foi salva com sucesso.`);
    return updated;
  }, [addToast, loadData]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      ultimaCarga.current = null;
      recarregarEntregas();
      await loadData(true);
      addToast(
        'success',
        'Dados atualizados',
        'As planilhas salvas foram relidas e todos os cálculos recalculados com sucesso.',
      );
    } catch {
      addToast('error', 'Erro ao atualizar', 'Não foi possível reler os dados.');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadData, addToast]);

  return (
    <AppContext.Provider
      value={{
        integrations,
        metrics,
        filters,
        setFilter,
        resetFilters,
        isLoading,
        isRefreshing,
        refreshData,
        theme,
        toggleTheme,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileMenuOpen,
        setMobileMenuOpen,
        toasts,
        addToast,
        removeToast,
        reprocessIntegration,
        deleteIntegration,
        createIntegration,
        updateIntegration,
        autoRefreshInterval,
        setAutoRefreshInterval,
        hasDataset: hasDataset || diaAtivo !== null,
        uploadOpen: uploadOpen && diaAtivo === null,
        openUpload: () => {
          if (diaAtivo) {
            addToast('info', 'Somente leitura', 'Volte para "Hoje" para enviar planilhas.');
            return;
          }
          setUploadOpen(true);
        },
        closeUpload: () => setUploadOpen(false),
        importSpreadsheets,
        zerarDadosDeHoje,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider');
  return context;
};
