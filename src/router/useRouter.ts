import { useState, useEffect, useCallback, useMemo } from 'react';

export interface RouteState {
  path: string;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  fullPath: string;
}

function getHashRoute(): string {
  if (window.location.hash) return window.location.hash;
  const p = window.location.pathname;
  if (p && p !== '/' && p !== '/index.html') {
    return `#${p}${window.location.search}`;
  }
  return '#/dashboard';
}

export function useRouter() {
  const [currentHash, setCurrentHash] = useState(getHashRoute);

  useEffect(() => {
    // Se abriu via pathname direto (ex: /apresentacao), normaliza para o hash
    if (!window.location.hash && window.location.pathname && window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
      window.history.replaceState(null, '', `/#${window.location.pathname}${window.location.search}`);
    }

    const handleHashChange = () => {
      setCurrentHash(getHashRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  const routeState = useMemo<RouteState>(() => {
    const raw = currentHash.replace(/^#/, '') || '/dashboard';
    const [pathPart, queryPart] = raw.split('?');
    const searchParams = new URLSearchParams(queryPart || '');

    const params: Record<string, string> = {};

    return {
      path: pathPart,
      params,
      searchParams,
      fullPath: currentHash,
    };
  }, [currentHash]);

  const navigate = useCallback((path: string, search?: Record<string, string>) => {
    let target = path.startsWith('#') ? path : `#${path}`;
    if (search && Object.keys(search).length > 0) {
      const sp = new URLSearchParams();
      Object.entries(search).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') sp.set(k, v);
      });
      const q = sp.toString();
      if (q) target += `?${q}`;
    }
    window.location.hash = target;
  }, []);

  // Geração semântica de Breadcrumbs no estilo Apple HIG
  const breadcrumbs = useMemo(() => {
    const items = [{ label: 'Início', path: '#/dashboard' }];
    const { path, searchParams } = routeState;
    if (path === '/dashboard' || path === '/') return [{ label: 'Início', path: '#/dashboard' }];

    if (path.startsWith('/entregas') || path.startsWith('/conferir')) {
      items.push({ label: 'Entregas', path: '#/entregas' });
      const resultado = searchParams.get('resultado') || searchParams.get('situacao');
      const rotulos: Record<string, string> = {
        entregue: 'Todas entregues',
        parcial: 'Parte entregue',
        nao_entregue: 'Não entregues',
        modal: 'Frota / Lalamove',
        nao_encontrada: 'Não encontradas',
      };
      if (searchParams.get('view') === 'reentregas') items.push({ label: 'Reentregas', path: '#/entregas?view=reentregas' });
      else if (resultado && rotulos[resultado]) items.push({ label: rotulos[resultado], path: `#/entregas?resultado=${resultado}` });
      else if (searchParams.get('transportadora'))
        items.push({ label: 'Por transportadora', path: `#/entregas?transportadora=${searchParams.get('transportadora')}` });
      else if (searchParams.get('view') === 'lista' || searchParams.get('q'))
        items.push({ label: 'Cruzamento', path: '#/entregas?view=lista' });
    } else if (path.startsWith('/torre')) {
      items.push({ label: 'Torre de Controle', path: '#/torre' });
    } else if (path.startsWith('/painel')) {
      items.push({ label: 'Painel de SLA', path: '#/painel' });
    } else if (path.startsWith('/compasse')) {
      items.push({ label: 'Compasse', path: '#/compasse' });
    } else if (path.startsWith('/reports')) {
      items.push({ label: 'Relatórios', path: '#/reports' });
    } else if (path.startsWith('/settings')) {
      items.push({ label: 'Configurações', path: '#/settings' });
    }

    return items;
  }, [routeState]);

  return {
    ...routeState,
    navigate,
    breadcrumbs,
  };
}
