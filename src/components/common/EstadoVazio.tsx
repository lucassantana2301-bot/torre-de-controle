import React from 'react';

interface Acao {
  label: string;
  onClick: () => void;
  secundaria?: boolean;
}

interface EstadoVazioProps {
  titulo: string;
  texto: React.ReactNode;
  passos?: React.ReactNode[];
  acoes?: Acao[];
  icone?: 'planilha' | 'busca';
}

const ICONES = {
  planilha: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M12 18v-6" />
      <path d="m9 15 3-3 3 3" />
    </>
  ),
  busca: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
};

export const EstadoVazio: React.FC<EstadoVazioProps> = ({ titulo, texto, passos, acoes, icone = 'planilha' }) => (
  <section className="estado-vazio">
    <span className="estado-vazio-icone" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONES[icone]}
      </svg>
    </span>
    <h2 className="estado-vazio-titulo">{titulo}</h2>
    <p className="estado-vazio-texto">{texto}</p>
    {passos && passos.length > 0 && (
      <ol className="estado-vazio-passos">
        {passos.map((passo, i) => (
          <li key={i}>
            <span className="estado-vazio-numero">{i + 1}</span>
            <span>{passo}</span>
          </li>
        ))}
      </ol>
    )}
    {acoes && acoes.length > 0 && (
      <div className="estado-vazio-acoes">
        {acoes.map((acao) => (
          <button
            key={acao.label}
            type="button"
            className={`btn ${acao.secundaria ? 'btn-outline' : 'btn-primary'}`}
            onClick={acao.onClick}
          >
            {acao.label}
          </button>
        ))}
      </div>
    )}
  </section>
);
