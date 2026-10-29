import React, { useEffect, useState } from 'react';
import { SETORES, salvarUsuario, type Usuario } from '../../services/usuario';

interface PerfilModalProps {
  usuario: Usuario | null;
  onClose: (() => void) | null;
}

export const PerfilModal: React.FC<PerfilModalProps> = ({ usuario, onClose }) => {
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [setor, setSetor] = useState(usuario?.setor ?? '');
  const primeiroAcesso = onClose === null;

  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const salvar = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nome.trim()) return;
    salvarUsuario({ nome, setor });
    onClose?.();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose ?? undefined} role="dialog" aria-modal="true" aria-labelledby="perfil-title">
      <form className="sheet-modal perfil-modal" onClick={(event) => event.stopPropagation()} onSubmit={salvar}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title" id="perfil-title">{primeiroAcesso ? 'Bem-vindo ao ArkTransp' : 'Seu perfil'}</h2>
            <p className="sheet-subtitle">
              {primeiroAcesso
                ? 'Antes de começar, diga quem você é. Fica salvo só neste computador.'
                : 'Nome e setor usados na saudação e no topo da tela.'}
            </p>
          </div>
          {onClose && (
            <button type="button" className="sheet-close-btn" onClick={onClose} aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="perfil-nome">Seu nome</label>
          <input
            id="perfil-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Maria Souza"
            autoFocus
            required
            maxLength={60}
          />
        </div>
        <div className="form-group">
          <label htmlFor="perfil-setor">Setor</label>
          <input
            id="perfil-setor"
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            placeholder="Escolha ou digite"
            list="perfil-setores"
            maxLength={60}
          />
          <datalist id="perfil-setores">
            {SETORES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="sheet-actions perfil-acoes">
          <button type="submit" className="btn btn-primary" disabled={!nome.trim()}>
            {primeiroAcesso ? 'Começar' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
};
