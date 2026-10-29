import React from 'react';
import { deIso, isoLocal, rotuloPeriodo } from '../../utils/periodo';

interface CalendarioPeriodoProps {
  de: string | null;
  ate: string | null;
  onChange: (de: string | null, ate: string | null) => void;
  titulo?: string;
  alinhar?: 'esquerda' | 'direita';
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const somarDias = (data: Date, dias: number) => new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
const somarMeses = (data: Date, meses: number) => new Date(data.getFullYear(), data.getMonth() + meses, 1);

function atalhos(): { label: string; de: string | null; ate: string | null }[] {
  const hoje = new Date();
  const iso = isoLocal(hoje);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesPassado = somarMeses(inicioMes, -1);
  return [
    { label: 'Todas as datas', de: null, ate: null },
    { label: 'Hoje', de: iso, ate: iso },
    { label: 'Ontem', de: isoLocal(somarDias(hoje, -1)), ate: isoLocal(somarDias(hoje, -1)) },
    { label: 'Últimos 7 dias', de: isoLocal(somarDias(hoje, -6)), ate: iso },
    { label: 'Últimos 30 dias', de: isoLocal(somarDias(hoje, -29)), ate: iso },
    { label: 'Este mês', de: isoLocal(inicioMes), ate: iso },
    { label: 'Mês passado', de: isoLocal(inicioMesPassado), ate: isoLocal(somarDias(inicioMes, -1)) },
  ];
}

function diasDoMes(mes: Date): (string | null)[] {
  const vazios = new Date(mes.getFullYear(), mes.getMonth(), 1).getDay();
  const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: vazios }, () => null),
    ...Array.from({ length: total }, (_, i) => isoLocal(new Date(mes.getFullYear(), mes.getMonth(), i + 1))),
  ];
}

export const CalendarioPeriodo: React.FC<CalendarioPeriodoProps> = ({
  de,
  ate,
  onChange,
  titulo = 'Emissão',
  alinhar = 'direita',
}) => {
  const [aberto, setAberto] = React.useState(false);
  const [mesVisivel, setMesVisivel] = React.useState(() => somarMeses(de ? deIso(de) : new Date(), de ? 0 : -1));
  const [inicio, setInicio] = React.useState<string | null>(null);
  const [sobre, setSobre] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const hoje = isoLocal(new Date());

  const fechar = React.useCallback(() => {
    setAberto(false);
    setInicio(null);
    setSobre(null);
  }, []);

  React.useEffect(() => {
    if (!aberto) return;
    const clicouFora = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) fechar();
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fechar();
    };
    document.addEventListener('mousedown', clicouFora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', clicouFora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto, fechar]);

  const abrir = () => {
    if (aberto) {
      fechar();
      return;
    }
    setMesVisivel(somarMeses(de ? deIso(de) : new Date(), de ? 0 : -1));
    setAberto(true);
  };

  const aplicar = (novoDe: string | null, novoAte: string | null) => {
    onChange(novoDe, novoAte);
    fechar();
  };

  const clicarDia = (dia: string) => {
    if (!inicio) {
      setInicio(dia);
      return;
    }
    aplicar(dia < inicio ? dia : inicio, dia < inicio ? inicio : dia);
  };

  const [faixaDe, faixaAte] = inicio
    ? [inicio, sobre ?? inicio].sort()
    : [de, ate];

  const ativo = Boolean(de || ate);

  return (
    <div className="calendario-periodo" ref={ref}>
      <button
        type="button"
        className={`calendario-gatilho ${ativo ? 'ativo' : ''}`}
        onClick={abrir}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title={`Filtrar pela data de emissão da NF: ${rotuloPeriodo(de, ate)}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="calendario-gatilho-titulo">{titulo}:</span>
        <span>{rotuloPeriodo(de, ate)}</span>
      </button>

      {aberto && (
        <div className={`calendario-popover ${alinhar}`} role="dialog" aria-label={`Período de ${titulo.toLowerCase()}`}>
          <div className="calendario-atalhos">
            {atalhos().map((a) => (
              <button
                key={a.label}
                type="button"
                className={`calendario-atalho ${a.de === de && a.ate === ate ? 'ativo' : ''}`}
                onClick={() => aplicar(a.de, a.ate)}
              >
                {a.label}
              </button>
            ))}
          </div>

          <div className="calendario-corpo">
            <div className="calendario-meses">
              {[mesVisivel, somarMeses(mesVisivel, 1)].map((mes, indice) => (
                <div key={mes.toISOString()} className="calendario-mes">
                  <div className="calendario-mes-topo">
                    {indice === 0 ? (
                      <button type="button" className="calendario-nav" onClick={() => setMesVisivel(somarMeses(mesVisivel, -1))} aria-label="Mês anterior">
                        ‹
                      </button>
                    ) : (
                      <span className="calendario-nav-vazio" />
                    )}
                    <strong>
                      {MESES[mes.getMonth()]} {mes.getFullYear()}
                    </strong>
                    {indice === 1 ? (
                      <button type="button" className="calendario-nav" onClick={() => setMesVisivel(somarMeses(mesVisivel, 1))} aria-label="Próximo mês">
                        ›
                      </button>
                    ) : (
                      <span className="calendario-nav-vazio" />
                    )}
                  </div>
                  <div className="calendario-grade">
                    {SEMANA.map((d, i) => (
                      <span key={i} className="calendario-semana">
                        {d}
                      </span>
                    ))}
                    {diasDoMes(mes).map((dia, i) => {
                      if (!dia) return <span key={`v${i}`} />;
                      const naFaixa = Boolean(faixaDe && faixaAte && dia >= faixaDe && dia <= faixaAte);
                      const ponta = dia === faixaDe || dia === faixaAte;
                      return (
                        <button
                          key={dia}
                          type="button"
                          className={`calendario-dia ${naFaixa ? 'na-faixa' : ''} ${ponta ? 'ponta' : ''} ${dia === hoje ? 'hoje' : ''}`}
                          onClick={() => clicarDia(dia)}
                          onMouseEnter={() => inicio && setSobre(dia)}
                        >
                          {Number(dia.slice(8))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="calendario-rodape">
              <span className="text-muted">
                {inicio ? 'Agora clique no dia final' : `Selecionado: ${rotuloPeriodo(de, ate)}`}
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => aplicar(null, null)} disabled={!ativo && !inicio}>
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
