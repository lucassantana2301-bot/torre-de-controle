import React, { useState } from 'react';

const EXTENSOES = ['png', 'svg', 'webp', 'jpg'];

/**
 * Lê public/transportadoras/{id}.png (ou .svg, .webp, .jpg).
 * Logo larga (com o nome escrito) entra no lugar do nome; logo quadrada vira ícone ao lado do nome.
 * Sem arquivo, mostra só o nome.
 */
export const LogoTransportadora: React.FC<{ id: string; nome: string }> = ({ id, nome }) => {
  const [tentativa, setTentativa] = useState(0);
  const [icone, setIcone] = useState(false);

  if (tentativa >= EXTENSOES.length) {
    return <span className="logo-transportadora-nome">{nome}</span>;
  }

  return (
    <span className="logo-transportadora-marca">
      <img
        className={icone ? 'logo-transportadora-icone' : 'logo-transportadora'}
        src={`/transportadoras/${id}.${EXTENSOES[tentativa]}`}
        alt=""
        title={nome}
        onLoad={(e) => setIcone(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight < 1.6)}
        onError={() => setTentativa((t) => t + 1)}
      />
      <span className={icone ? 'logo-transportadora-nome' : 'logo-transportadora-oculto'}>{nome}</span>
    </span>
  );
};
