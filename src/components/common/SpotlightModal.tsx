import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../router/useRouter';

interface SpotlightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewIntegration: () => void;
  onOpenReconcile: () => void;
}

export const SpotlightModal: React.FC<SpotlightModalProps> = ({
  isOpen,
  onClose,
  onOpenNewIntegration,
  onOpenReconcile,
}) => {
  const { integrations, refreshData, toggleTheme, theme } = useApp();
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Lista de ações rápidas
  const quickActions = [
    {
      id: 'act-new',
      title: 'Nova Integração',
      subtitle: 'Cadastrar nova rota ou pipeline de dados',
      category: 'Ações Rápidas',
      icon: 'plus',
      action: () => {
        onClose();
        onOpenNewIntegration();
      },
    },
    {
      id: 'act-reconcile',
      title: 'Conciliar Planilhas (Alloca × Intelipost)',
      subtitle: 'Upload e cruzamento de remessas e notas fiscais',
      category: 'Ações Rápidas',
      icon: 'upload',
      action: () => {
        onClose();
        onOpenReconcile();
      },
    },
    {
      id: 'act-sync',
      title: 'Sincronizar Gateway Agora',
      subtitle: 'Recarregar dados do Protheus e Intelipost',
      category: 'Ações Rápidas',
      icon: 'refresh',
      action: () => {
        onClose();
        refreshData();
      },
    },
    {
      id: 'act-theme',
      title: theme === 'dark' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro',
      subtitle: 'Alternar tema visual Apple HIG',
      category: 'Ações Rápidas',
      icon: theme === 'dark' ? 'sun' : 'moon',
      action: () => {
        toggleTheme();
        onClose();
      },
    },
    {
      id: 'act-reports',
      title: 'Ir para Relatórios e SLAs',
      subtitle: 'Exportação analítica em CSV e JSON',
      category: 'Navegação',
      icon: 'file',
      action: () => {
        onClose();
        navigate('/reports');
      },
    },
    {
      id: 'act-settings',
      title: 'Abrir Configurações do Sistema',
      subtitle: 'Ajustar credenciais, Webhooks e categorias',
      category: 'Navegação',
      icon: 'gear',
      action: () => {
        onClose();
        navigate('/settings');
      },
    },
  ];

  // Filtra integrações por texto
  const filteredIntegrations = query.trim()
    ? integrations.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          (item.metadata?.notaFiscal && item.metadata.notaFiscal.includes(q)) ||
          (item.metadata?.nfTriangular && item.metadata.nfTriangular.includes(q)) ||
          (item.metadata?.rastreio && item.metadata.rastreio.toLowerCase().includes(q))
        );
      }).slice(0, 6)
    : [];

  const filteredActions = query.trim()
    ? quickActions.filter((a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : quickActions;

  // Itens combinados para navegação por teclado
  interface PaletteItem {
    id: string;
    type: 'action' | 'integration';
    title: string;
    subtitle: string;
    tag?: string;
    status?: string;
    onSelect: () => void;
  }

  const combinedItems: PaletteItem[] = [
    ...filteredActions.map((a) => ({
      id: a.id,
      type: 'action' as const,
      title: a.title,
      subtitle: a.subtitle,
      tag: a.category,
      onSelect: a.action,
    })),
    ...filteredIntegrations.map((item) => ({
      id: item.id,
      type: 'integration' as const,
      title: item.name,
      subtitle: `${item.category} · ${item.responsible} · NF ${item.metadata?.notaFiscal || item.id}`,
      tag: item.type,
      status: item.status,
      onSelect: () => {
        onClose();
        navigate(`/integrations/${item.id}`);
      },
    })),
  ];

  // Atalhos de teclado no Spotlight
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (combinedItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % (combinedItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (combinedItems[selectedIndex]) {
        combinedItems[selectedIndex].onSelect();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="spotlight-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Busca global Spotlight">
      <div className="spotlight-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Campo de Busca Apple HIG */}
        <div className="spotlight-search-header">
          <svg className="spotlight-search-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="spotlight-input"
            placeholder="Buscar nota, pedido, cliente, ação ou atalho..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <kbd className="spotlight-badge-esc" onClick={onClose} title="Fechar">ESC</kbd>
        </div>

        {/* Resultados em lista Apple HIG */}
        <div className="spotlight-results-scroll">
          {combinedItems.length === 0 ? (
            <div className="spotlight-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p className="empty-title">Nenhum resultado para "{query}"</p>
              <p className="empty-subtitle">Tente pesquisar pelo número da NF, transportadora ou nome do serviço.</p>
            </div>
          ) : (
            <div className="spotlight-list">
              {filteredIntegrations.length > 0 && (
                <div className="spotlight-group-label">Integrações Encontradas</div>
              )}
              {combinedItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    className={`spotlight-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => item.onSelect()}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="item-icon-box">
                      {item.type === 'action' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      )}
                    </div>
                    <div className="item-content">
                      <div className="item-title-row">
                        <span className="item-title">{item.title}</span>
                        {item.status && (
                          <span className={`status-pill small status-${item.status}`}>
                            {item.status === 'completed' && 'Integrada'}
                            {item.status === 'pending' && 'Não integrada'}
                            {item.status === 'intelipost_only' && 'Só Intelipost'}
                            {item.status === 'error' && 'Erro'}
                            {item.status === 'processing' && 'Processando'}
                          </span>
                        )}
                      </div>
                      <span className="item-subtitle">{item.subtitle}</span>
                    </div>
                    {item.tag && <span className="item-tag">{item.tag}</span>}
                    <div className="item-enter-hint">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 10 4 15 9 20" />
                        <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer do Spotlight */}
        <div className="spotlight-footer">
          <div className="footer-tips">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
            <span><kbd>↵</kbd> Selecionar</span>
            <span><kbd>ESC</kbd> Fechar</span>
          </div>
          <span className="footer-brand">Arklok · Spotlight HIG</span>
        </div>
      </div>
    </div>
  );
};
