import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../router/useRouter';
import { RESULTADOS, useConferencia, type Resultado } from '../../hooks/useConferencia';
import { TRANSPORTADORAS, useEntregas } from '../../services/entregasImport';
import { useReentregas } from '../../services/reentregas';

type Tom = 'total' | 'success' | 'warning' | 'danger';

interface SubItem {
  label: string;
  search?: Record<string, string>;
  ativo: boolean;
  contador?: { valor: number | null; tom: Tom };
  dica?: string;
  desativado?: boolean;
}

interface ItemMenu {
  path: string;
  label: string;
  dica: string;
  filhos?: SubItem[];
  novaAba?: boolean;
}

const RESULTADO_TOM: Record<Resultado, Tom> = {
  entregue: 'success',
  parcial: 'total',
  nao_entregue: 'warning',
  modal: 'total',
  nao_encontrada: 'danger',
};

export const MenuTopo: React.FC<{ ferramentas?: React.ReactNode }> = ({ ferramentas }) => {
  const { mobileMenuOpen, setMobileMenuOpen } = useApp();
  const { path, searchParams, navigate } = useRouter();
  const [aberto, setAberto] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const conferencia = useConferencia();
  const entregasState = useEntregas();
  const reentregas = useReentregas();
  const reentregasLidas = TRANSPORTADORAS.some(
    ({ id }) => entregasState.transportadoras[id] && !reentregas.semCte.includes(id),
  );

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setAberto(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(null);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const ir = (targetPath: string, search?: Record<string, string>) => {
    navigate(targetPath, search);
    setAberto(null);
    setMobileMenuOpen(false);
  };

  const resultadoParam = searchParams.get('resultado');
  const secao = searchParams.get('section') === 'ajuda' ? 'ajuda' : 'general';

  const itens: ItemMenu[] = [
    { path: '/dashboard', label: 'Início', dica: 'Vencidas, atrasos e planilhas do dia' },
    { path: '/torre', label: 'Torre de Controle', dica: 'Funil, ocorrências e transportadoras' },
    {
      path: '/entregas',
      label: 'Entregas',
      dica: 'Cruza as notas da Alloca07 com as planilhas das transportadoras',
      filhos: [
        {
          label: 'Painel',
          ativo:
            path === '/entregas' &&
            !resultadoParam &&
            !searchParams.get('transportadora') &&
            !searchParams.get('view') &&
            !searchParams.get('q'),
          dica: 'Resumo da conferência e do SLA das transportadoras',
        },
        {
          label: 'Reentregas',
          search: { view: 'reentregas' },
          ativo: path === '/entregas' && searchParams.get('view') === 'reentregas',
          contador: { valor: reentregasLidas ? reentregas.lista.length : null, tom: 'warning' },
          dica: 'Mesma NF com mais de um CT-e para o mesmo destinatário',
        },
        {
          label: 'Todos',
          search: { view: 'lista' },
          ativo:
            path === '/entregas' &&
            !resultadoParam &&
            !searchParams.get('transportadora') &&
            (searchParams.get('view') === 'lista' || Boolean(searchParams.get('q'))),
          contador: { valor: conferencia.lista ? conferencia.linhas.length : null, tom: 'total' },
        },
        ...RESULTADOS.map(
          (item): SubItem => ({
            label: item.label,
            search: { resultado: item.id },
            ativo: path === '/entregas' && resultadoParam === item.id,
            contador: { valor: conferencia.lista ? conferencia.contagem[item.id] : null, tom: RESULTADO_TOM[item.id] },
            desativado: !conferencia.lista,
            dica: conferencia.lista ? item.dica : 'Envie a planilha base em Entregas',
          }),
        ),
      ],
    },
    { path: '/painel', label: 'Painel de SLA', dica: 'Entregas no prazo por transportadora, região e semana' },
    {
      path: '/apresentacao',
      label: 'Apresentação',
      dica: 'Abrir visão executiva de SLA em uma nova aba para reuniões',
      novaAba: true,
    },
    { path: '/reports', label: 'Relatórios', dica: 'Baixar listas em CSV' },
  ];

  const configuracoes: ItemMenu = {
    path: '/settings',
    label: 'Configurações',
    dica: 'Preferências e como o sistema funciona',
    filhos: [
      { label: 'Geral', search: { section: 'general' }, ativo: path === '/settings' && secao === 'general' },
      { label: 'Como funciona', search: { section: 'ajuda' }, ativo: path === '/settings' && secao === 'ajuda' },
    ],
  };

  const ativo = (item: ItemMenu) =>
    item.path === '/dashboard' ? path === '/dashboard' || path === '/' : path.startsWith(item.path);

  const renderItem = (item: ItemMenu) => {
    if (!item.filhos?.length) {
      if (item.novaAba) {
        return (
          <a
            key={item.path}
            href={`/#${item.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="topo-link"
            title={item.dica}
            onClick={() => {
              setAberto(null);
              setMobileMenuOpen(false);
            }}
          >
            {item.label}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginLeft: '5px', opacity: 0.8 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        );
      }
      return (
        <button
          key={item.path}
          type="button"
          className={`topo-link ${ativo(item) ? 'ativo' : ''}`}
          onClick={() => ir(item.path)}
          title={item.dica}
          aria-current={ativo(item) ? 'page' : undefined}
        >
          {item.label}
        </button>
      );
    }
    const expandido = aberto === item.path;
    return (
      <div key={item.path} className="topo-grupo">
        <button
          type="button"
          className={`topo-link ${ativo(item) ? 'ativo' : ''}`}
          onClick={() => setAberto(expandido ? null : item.path)}
          title={item.dica}
          aria-expanded={expandido}
          aria-haspopup="menu"
        >
          {item.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {expandido && (
          <div className="topo-submenu" role="menu" aria-label={item.label}>
            {item.filhos.map((filho) => (
              <button
                key={filho.label}
                type="button"
                role="menuitem"
                className={`topo-subitem ${filho.ativo ? 'ativo' : ''}`}
                onClick={() => ir(item.path, filho.search)}
                disabled={filho.desativado}
                title={filho.dica}
                aria-current={filho.ativo ? 'page' : undefined}
              >
                <span>{filho.label}</span>
                {filho.contador && (
                  <span className={`topo-contador ${filho.contador.tom}`}>
                    {filho.contador.valor === null ? '—' : filho.contador.valor.toLocaleString('pt-BR')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-topo">
      <button type="button" className="topo-marca" onClick={() => ir('/dashboard')} title="Ir para o Início">
        <img src="/arklok-logo.png" alt="Arklok" className="topo-logo" />
        <span className="topo-nome">Torre</span>
      </button>

      <button
        type="button"
        className="topo-hamburguer"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-expanded={mobileMenuOpen}
        aria-controls="menu-principal"
        aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {mobileMenuOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <nav
        id="menu-principal"
        ref={navRef}
        className={`topo-nav ${mobileMenuOpen ? 'aberto' : ''}`}
        aria-label="Menu principal"
      >
        <div className="topo-nav-itens">{itens.map(renderItem)}</div>
        <div className="topo-nav-fim">{renderItem(configuracoes)}</div>
      </nav>

      {ferramentas}
    </div>
  );
};
