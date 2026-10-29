import React from 'react';
import { useTeclaEsc } from '../hooks/useTeclaEsc';

export type Tom = 'sucesso' | 'atencao' | 'perigo' | '';

export const Modal: React.FC<{
  titulo: string;
  sub?: React.ReactNode;
  onClose: () => void;
  rodape?: React.ReactNode;
  estreito?: boolean;
  children: React.ReactNode;
}> = ({ titulo, sub, onClose, rodape, estreito, children }) => {
  const id = React.useId();
  useTeclaEsc(onClose);
  React.useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);
  return (
    <div className="ui-modal-fundo" onClick={onClose}>
      <div className={`ui-modal ${estreito ? 'estreito' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}>
        <header className="ui-modal-topo">
          <div>
            <h2 className="ui-modal-titulo" id={id}>
              {titulo}
            </h2>
            {sub && <p className="ui-painel-sub">{sub}</p>}
          </div>
          <button type="button" className="ui-modal-fechar" onClick={onClose} aria-label="Fechar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="ui-modal-corpo">{children}</div>
        {rodape && <footer className="ui-modal-rodape">{rodape}</footer>}
      </div>
    </div>
  );
};

export function Chips<T extends string>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: { id: T; label: string; contagem?: number; tom?: Tom }[];
  onChange: (valor: T) => void;
}) {
  return (
    <div className="ui-chips" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" className={`ui-chip ${o.tom ?? ''}`} aria-pressed={valor === o.id} onClick={() => onChange(o.id)}>
          {o.label}
          {o.contagem !== undefined && <span>{o.contagem.toLocaleString('pt-BR')}</span>}
        </button>
      ))}
    </div>
  );
}

export const Pagina: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-pagina">{children}</div>
);

export const Cabecalho: React.FC<{
  eyebrow?: string;
  titulo: string;
  sub?: React.ReactNode;
  acoes?: React.ReactNode;
}> = ({ titulo, sub, acoes }) => (
  <header className="ui-cabecalho">
    <div>
      <h1 className="ui-cabecalho-titulo">{titulo}</h1>
      {sub && <p className="ui-cabecalho-sub">{sub}</p>}
    </div>
    {acoes && <div className="ui-cabecalho-acoes">{acoes}</div>}
  </header>
);

export const Botao: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { primario?: boolean; pequeno?: boolean }
> = ({ primario, pequeno, className = '', type = 'button', ...props }) => (
  <button
    type={type}
    className={`ui-btn ${primario ? 'ui-btn-primario' : ''} ${pequeno ? 'ui-btn-sm' : ''} ${className}`}
    {...props}
  />
);

export const Aviso: React.FC<{ children: React.ReactNode; acao?: React.ReactNode }> = ({ children, acao }) => (
  <div className="ui-aviso" role="status">
    <span>{children}</span>
    {acao}
  </div>
);

export const Filtros: React.FC<{ children: React.ReactNode; compactos?: boolean }> = ({ children, compactos }) => (
  <div className={`ui-filtros ${compactos ? 'compactos' : ''}`}>{children}</div>
);

export function Filtro<T extends string>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: { id: T; label: string }[];
  onChange: (valor: T) => void;
}) {
  return (
    <label className="ui-filtro">
      {rotulo}
      <select value={valor} onChange={(e) => onChange(e.target.value as T)}>
        {opcoes.map((o) => (
          <option key={o.id || 'todas'} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => {
  const id = React.useId();
  return (
    <section className="ui-secao" aria-labelledby={id}>
      <h2 className="ui-secao-titulo" id={id}>
        {titulo}
      </h2>
      {children}
    </section>
  );
};

export const Kpis: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-kpis">{children}</div>
);

export interface KpiProps {
  rotulo: string;
  valor: string;
  sub: string;
  tom?: Tom;
  /** Etiqueta do que fazer com o número (ex.: "Agir hoje"). */
  tag?: { texto: string; tom: Tom };
  /** Barra de progresso contra uma meta, ambos em %. */
  meta?: { valor: number; alvo: number };
  onClick?: () => void;
}

export const Kpi: React.FC<KpiProps> = ({ rotulo, valor, sub, tom = '', tag, meta, onClick }) => {
  const conteudo = (
    <>
      <span className="ui-kpi-topo">
        {rotulo}
        {tag && <Tag tom={tag.tom}>{tag.texto}</Tag>}
      </span>
      <span className="ui-kpi-valor">{valor}</span>
      {meta && (
        <span className="ui-meta" role="img" aria-label={`${meta.valor}% de ${meta.alvo}%`}>
          <span className={`ui-meta-valor ${tom}`} style={{ width: `${Math.min(Math.max(meta.valor, 0), 100)}%` }} />
          <span className="ui-meta-alvo" style={{ left: `${meta.alvo}%` }} />
        </span>
      )}
      <span className="ui-kpi-sub">{sub}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={`ui-kpi ${tom}`} onClick={onClick}>
      {conteudo}
    </button>
  ) : (
    <div className={`ui-kpi ${tom}`}>{conteudo}</div>
  );
};

export const Tag: React.FC<{ tom?: Tom; children: React.ReactNode }> = ({ tom = '', children }) => (
  <span className={`ui-tag ${tom}`}>{children}</span>
);

export const Colunas: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ui-colunas">{children}</div>
);

export const Painel: React.FC<{
  titulo: string;
  sub?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, sub, acoes, children }) => {
  const id = React.useId();
  return (
    <section className="ui-painel" aria-labelledby={id}>
      <div className="ui-painel-topo">
        <div>
          <h2 className="ui-painel-titulo" id={id}>
            {titulo}
          </h2>
          {sub && <p className="ui-painel-sub">{sub}</p>}
        </div>
        {acoes}
      </div>
      {children}
    </section>
  );
};

export function Segmentado<T extends string>({
  rotulo,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  valor: T;
  opcoes: { id: T; label: string }[];
  onChange: (valor: T) => void;
}) {
  return (
    <div className="ui-segmentado" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" aria-pressed={valor === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ParteComposicao {
  id: string;
  rotulo: string;
  valor: number;
  cor: 'sucesso' | 'atencao' | 'perigo' | 'neutro';
  onClick?: () => void;
}

/** Número principal da tela, com meta e a composição em barra empilhada. */
export const Destaque: React.FC<{
  rotulo: string;
  valor: string;
  tom?: Tom;
  tag?: { texto: string; tom: Tom };
  meta?: { valor: number; alvo: number; texto: string };
  /** Texto ao lado do número quando não há meta. */
  apoio?: string;
  partes: ParteComposicao[];
  rodape?: React.ReactNode;
}> = ({ rotulo, valor, tom = '', tag, meta, apoio, partes, rodape }) => {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <section className="ui-destaque" aria-label={rotulo}>
      <div className="ui-destaque-topo">
        <span className="ui-destaque-rotulo">{rotulo}</span>
        {tag && <Tag tom={tag.tom}>{tag.texto}</Tag>}
      </div>
      <div className="ui-destaque-linha">
        <span className={`ui-destaque-valor ${tom}`}>{valor}</span>
        {(meta || apoio) && <span className="ui-destaque-meta-texto">{meta?.texto ?? apoio}</span>}
      </div>
      {meta && (
        <span className="ui-meta ui-meta-grande" role="img" aria-label={`${meta.valor}% de ${meta.alvo}%`}>
          <span className={`ui-meta-valor ${tom}`} style={{ width: `${Math.min(Math.max(meta.valor, 0), 100)}%` }} />
          <span className="ui-meta-alvo" style={{ left: `${meta.alvo}%` }} />
        </span>
      )}
      {total > 0 && (
        <>
          <div className="ui-empilhada" role="img" aria-label={partes.map((p) => `${p.rotulo} ${fmt(p.valor)}`).join(', ')}>
            {partes.map((p) =>
              p.valor ? (
                <span key={p.id} className={`ui-empilhada-parte ${p.cor}`} style={{ flexGrow: p.valor }} />
              ) : null,
            )}
          </div>
          <ul className="ui-legenda">
            {partes.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={p.onClick} disabled={!p.onClick}>
                  <span className={`ui-legenda-cor ${p.cor}`} aria-hidden="true" />
                  <span className="ui-legenda-rotulo">{p.rotulo}</span>
                  <b>{fmt(p.valor)}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {rodape && <div className="ui-destaque-rodape">{rodape}</div>}
    </section>
  );
};

export interface ItemAcao {
  id: string;
  rotulo: string;
  valor: string;
  texto: string;
  tom: Tom;
  onClick: () => void;
}

/** Lista curta do que fazer, da mais urgente para a menos urgente. */
export const ListaAcoes: React.FC<{ titulo: string; itens: ItemAcao[]; vazio: string; rodape?: React.ReactNode }> = ({
  titulo,
  itens,
  vazio,
  rodape,
}) => {
  const id = React.useId();
  return (
    <section className="ui-acoes" aria-labelledby={id}>
      <h2 className="ui-painel-titulo" id={id}>
        {titulo}
      </h2>
      {itens.length === 0 ? (
        <p className="ui-vazio">{vazio}</p>
      ) : (
        <ul>
          {itens.map((a) => (
            <li key={a.id}>
              <button type="button" className={`ui-acao ${a.tom}`} onClick={a.onClick}>
                <span className={`ui-acao-marca ${a.tom}`} aria-hidden="true" />
                <span className="ui-acao-info">
                  <span className="ui-acao-rotulo">{a.rotulo}</span>
                  <span className="ui-acao-texto">{a.texto}</span>
                </span>
                <span className="ui-acao-valor">{a.valor}</span>
                <svg className="ui-acao-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rodape && <div className="ui-acoes-rodape">{rodape}</div>}
    </section>
  );
};

export interface LinhaMeta {
  id: string;
  rotulo: string;
  percentual: number | null;
  detalhe: string;
  onClick?: () => void;
}

/** Uma barra por item, de 0 a 100%, com a marca da meta. */
export const BarrasMeta: React.FC<{ linhas: LinhaMeta[]; meta: number }> = ({ linhas, meta }) => (
  <ul className="ui-barras-meta">
    {linhas.map((l) => {
      const tom: Tom = l.percentual === null ? '' : l.percentual >= meta ? 'sucesso' : l.percentual >= 85 ? 'atencao' : 'perigo';
      return (
        <li key={l.id}>
          <button type="button" onClick={l.onClick} disabled={!l.onClick}>
            <span className="ui-barras-meta-topo">
              <span className="ui-barras-meta-rotulo">{l.rotulo}</span>
              <span className={`ui-barras-meta-valor ${tom}`}>{l.percentual === null ? '—' : fmtPct(l.percentual)}</span>
            </span>
            <span className="ui-meta">
              <span className={`ui-meta-valor ${tom}`} style={{ width: `${l.percentual ?? 0}%` }} />
              <span className="ui-meta-alvo" style={{ left: `${meta}%` }} />
            </span>
            <span className="ui-barras-meta-detalhe">{l.detalhe}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

export interface ItemBarraLista {
  id: string;
  rotulo: string;
  valor: number;
  tom?: Tom;
  onClick?: () => void;
}

/** Barras horizontais proporcionais ao maior valor da lista. */
export const BarrasLista: React.FC<{ itens: ItemBarraLista[] }> = ({ itens }) => {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <ul className="ui-barras-lista">
      {itens.map((i) => (
        <li key={i.id}>
          <button type="button" onClick={i.onClick} disabled={!i.onClick}>
            <span className="ui-barras-lista-rotulo">{i.rotulo}</span>
            <span className="ui-barras-lista-trilho">
              <span className={`ui-barras-lista-valor ${i.tom ?? ''}`} style={{ width: `${(i.valor / max) * 100}%` }} />
            </span>
            <b>{fmt(i.valor)}</b>
          </button>
        </li>
      ))}
    </ul>
  );
};

export interface PontoBarra {
  chave: string;
  rotulo: string;
  valor: number;
  percentual: number | null;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/** Barras de volume com o % de cada barra em cima; o % fica vermelho abaixo da meta, quando há meta. */
export const Barras: React.FC<{ pontos: PontoBarra[]; meta?: number; descricao: string }> = ({ pontos, meta, descricao }) => {
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  return (
    <div className="ui-barras" role="img" aria-label={descricao}>
      {pontos.map((p) => {
        const abaixo = meta !== undefined && p.percentual !== null && p.percentual < meta;
        const neutro = meta === undefined;
        return (
          <div key={p.chave} className="ui-barra">
            <div className="ui-barra-trilho">
              <span className="ui-barra-valor">{fmt(p.valor)}</span>
              {p.percentual !== null && (
                <span className={`ui-barra-pct ${abaixo ? 'perigo' : neutro ? 'neutro' : ''}`}>{fmtPct(p.percentual)}</span>
              )}
              <span className="ui-barra-coluna" style={{ height: `${(p.valor / max) * 78}%` }} />
            </div>
            <span className="ui-barra-rotulo">{p.rotulo}</span>
          </div>
        );
      })}
    </div>
  );
};
