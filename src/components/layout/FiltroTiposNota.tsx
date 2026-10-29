import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { integrationService } from '../../services/integrationService';
import { definirTiposOcultos, useTiposOcultos } from '../../services/tiposOcultos';

/** Esconde tipos de nota (Tp. Previsão da Alloca07) em todas as telas; a escolha fica salva no navegador. */
export const FiltroTiposNota: React.FC = () => {
  const { integrations } = useApp();
  const ocultos = useTiposOcultos();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tipos = useMemo(() => integrationService.tiposDeNota(), [integrations, ocultos]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (tipos.length === 0) return null;

  const ocultas = tipos.filter((t) => ocultos.includes(t.chave));
  const notasOcultas = ocultas.reduce((s, t) => s + t.notas, 0);
  const alternar = (chave: string) =>
    definirTiposOcultos(ocultos.includes(chave) ? ocultos.filter((c) => c !== chave) : [...ocultos, chave]);

  return (
    <div className="ui-filtro-tipos" ref={ref}>
      <button
        type="button"
        className={`btn btn-outline btn-sm ${ocultas.length ? 'ui-filtro-tipos-ativo' : ''}`}
        aria-haspopup="true"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        title="Tipos de nota da Alloca07 (Tp. Previsão) que aparecem nas telas"
      >
        Tipos de nota
        {ocultas.length > 0 && <span className="ui-filtro-tipos-badge">{notasOcultas.toLocaleString('pt-BR')} ocultas</span>}
      </button>
      {aberto && (
        <div className="ui-filtro-tipos-popover" role="dialog" aria-label="Tipos de nota">
          <p className="ui-filtro-tipos-titulo">Mostrar nas telas</p>
          <p className="ui-filtro-tipos-dica">Tp. Previsão da Alloca07. Desmarque o que não quer ver.</p>
          <ul>
            {tipos.map((t) => (
              <li key={t.chave}>
                <label>
                  <input type="checkbox" checked={!ocultos.includes(t.chave)} onChange={() => alternar(t.chave)} />
                  <span>{t.tipo}</span>
                  <b>{t.notas.toLocaleString('pt-BR')}</b>
                </label>
              </li>
            ))}
          </ul>
          {ocultos.length > 0 && (
            <button type="button" className="ui-filtro-tipos-limpar" onClick={() => definirTiposOcultos([])}>
              Mostrar todos
            </button>
          )}
        </div>
      )}
    </div>
  );
};
