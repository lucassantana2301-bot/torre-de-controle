import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../router/useRouter';
import { integrationService } from '../../services/integrationService';
import { ticketKey } from '../../services/zendeskImport';
interface Resultado {
  chave: string;
  grupo: string;
  titulo: string;
  detalhe: string;
  ir: () => void;
}

/** Busca por NF ou cliente. */
export const BuscaGlobal: React.FC = () => {
  const { integrations } = useApp();
  const { navigate } = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);

  const todasNotas = useMemo(() => integrationService.operacionais(), [integrations]);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setAberta(true);
      }
    };
    const fora = (e: MouseEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberta(false);
    };
    window.addEventListener('keydown', atalho);
    document.addEventListener('mousedown', fora);
    return () => {
      window.removeEventListener('keydown', atalho);
      document.removeEventListener('mousedown', fora);
    };
  }, []);

  const termo = busca.trim();

  const resultados = useMemo<Resultado[]>(() => {
    if (termo.length < 2) return [];
    const q = termo.toLowerCase();
    const numero = ticketKey(termo);
    const soDigitos = /^\d+$/.test(termo);
    const lista: Resultado[] = [];

    const notas = todasNotas
      .filter((item) => {
        const meta = item.metadata ?? {};
        if (soDigitos) {
          return [meta.notaFiscal, meta.nfTriangular, meta.pedido, meta.romaneio, meta.rastreio].some(
            (valor) => valor && ticketKey(valor).includes(numero),
          );
        }
        return [meta.clienteDestino, meta.pedido, meta.rastreio, meta.romaneio, meta.transportadora, item.name].some((valor) =>
          (valor ?? '').toLowerCase().includes(q),
        );
      })
      .sort((a, b) => Number(ticketKey(b.metadata?.notaFiscal) === numero) - Number(ticketKey(a.metadata?.notaFiscal) === numero))
      .slice(0, 5);
    for (const item of notas) {
      const meta = item.metadata ?? {};
      const nf = meta.notaFiscal ?? item.id.replace(/^NF-/, '');
      lista.push({
        chave: `nota-${item.id}`,
        grupo: 'Notas',
        titulo: `NF ${nf}${meta.nfTriangular ? ` · triangular ${meta.nfTriangular}` : ''}`,
        detalhe: [meta.clienteDestino, meta.pedido && `pedido ${meta.pedido}`, meta.rastreio && `rastreio ${meta.rastreio}`, meta.tipoNota]
          .filter(Boolean)
          .join(' · '),
        ir: () => navigate('/entregas', { q: nf }),
      });
    }

    lista.push({
      chave: 'em-entregas',
      grupo: 'Buscar em',
      titulo: `Entregas: "${termo}"`,
      detalhe: 'Alloca07 cruzada com as transportadoras',
      ir: () => navigate('/entregas', { q: termo }),
    });
    return lista;
  }, [termo, todasNotas, navigate]);

  useEffect(() => setIndice(0), [termo]);

  const escolher = (resultado: Resultado | undefined) => {
    if (!resultado) return;
    resultado.ir();
    setAberta(false);
    setBusca('');
    inputRef.current?.blur();
  };

  const teclas = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberta(true);
      setIndice((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      escolher(resultados[indice]);
    } else if (e.key === 'Escape') {
      setAberta(false);
      inputRef.current?.blur();
    }
  };

  const mostrar = aberta && termo.length >= 2;

  return (
    <div className="global-search-wrap" ref={caixaRef}>
      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        placeholder="Buscar NF, pedido, rastreio ou cliente"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberta(true);
        }}
        onFocus={() => setAberta(true)}
        onKeyDown={teclas}
        aria-label="Buscar NF, pedido, rastreio ou cliente"
        aria-expanded={mostrar}
        role="combobox"
        aria-controls="busca-global-resultados"
      />
      <kbd className="search-shortcut" title="Pressione Ctrl+K para buscar">Ctrl K</kbd>

      {mostrar && (
        <div className="busca-resultados" id="busca-global-resultados" role="listbox">
          {resultados.length === 1 && <div className="busca-vazia">Nenhuma nota com "{termo}".</div>}
          {resultados.map((r, i) => (
            <React.Fragment key={r.chave}>
              {(i === 0 || resultados[i - 1].grupo !== r.grupo) && <div className="busca-grupo">{r.grupo}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === indice}
                className={`busca-item ${i === indice ? 'ativo' : ''}`}
                onMouseEnter={() => setIndice(i)}
                onClick={() => escolher(r)}
              >
                <span className="busca-item-titulo">{r.titulo}</span>
                {r.detalhe && <span className="busca-item-detalhe">{r.detalhe}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
