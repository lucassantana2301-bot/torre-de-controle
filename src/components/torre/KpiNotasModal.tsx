import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../../context/AppContext';
import { Modal } from '../../ui/componentes';
import { copiarTexto, semTab } from '../../utils/copiar';

export interface LinhaKpi {
  chave: string;
  nf: string;
  transportadora: string;
  destino: string;
  situacao: string;
  tom: 'success' | 'warning' | 'danger' | 'info' | '';
  valor: string;
}

const LIMITE = 300;
const fmt = (n: number) => n.toLocaleString('pt-BR');

const nomeArquivo = (titulo: string) =>
  `${titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

export const KpiNotasModal: React.FC<{
  titulo: string;
  sub: string;
  coluna: string;
  linhas: LinhaKpi[];
  onAbrirNf: (nf: string) => void;
  onClose: () => void;
}> = ({ titulo, sub, coluna, linhas, onAbrirNf, onClose }) => {
  const { addToast } = useApp();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? linhas.filter(
        (l) =>
          l.nf.includes(termo) ||
          l.transportadora.toLowerCase().includes(termo) ||
          l.destino.toLowerCase().includes(termo) ||
          l.situacao.toLowerCase().includes(termo),
      )
    : linhas;

  const avisar = (ok: boolean, tituloAviso: string, mensagem: string) =>
    ok ? addToast('success', tituloAviso, mensagem) : addToast('error', 'Não foi possível copiar', 'Use o Baixar Excel.');

  const copiarNfs = async () =>
    avisar(await copiarTexto(filtradas.map((l) => l.nf).join(',')), 'NFs copiadas', `${fmt(filtradas.length)} notas, separadas por vírgula.`);

  const copiarParaExcel = async () => {
    const linhasTexto = [
      ['NF', 'Transportadora', 'Destino', 'Situação', coluna].join('\t'),
      ...filtradas.map((l) => [l.nf, l.transportadora, l.destino, l.situacao, l.valor].map(semTab).join('\t')),
    ];
    avisar(
      await copiarTexto(linhasTexto.join('\r\n')),
      'Tabela copiada',
      `${fmt(filtradas.length)} notas. Cole no Excel: cada coluna vai para uma coluna.`,
    );
  };

  const baixarExcel = () => {
    const planilha = XLSX.utils.aoa_to_sheet([
      ['NF', 'Transportadora', 'Destino', 'Situação', coluna],
      ...filtradas.map((l) => [Number(l.nf) || l.nf, l.transportadora, l.destino, l.situacao, l.valor]),
    ]);
    planilha['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 26 }, { wch: 16 }];
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Notas');
    XLSX.writeFile(livro, nomeArquivo(titulo));
    addToast('success', 'Excel baixado', `${fmt(filtradas.length)} notas de ${titulo.toLowerCase()}.`);
  };

  return (
    <Modal
      titulo={titulo}
      sub={`${fmt(filtradas.length)} ${filtradas.length === 1 ? 'nota' : 'notas'}. ${sub}`}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn btn-outline btn-sm" disabled={filtradas.length === 0} onClick={copiarNfs} title="Números separados por vírgula">
            Copiar NFs ({fmt(filtradas.length)})
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={filtradas.length === 0}
            onClick={copiarParaExcel}
            title="Tabela com cabeçalho, pronta para colar no Excel"
          >
            Copiar para Excel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={filtradas.length === 0} onClick={baixarExcel}>
            Baixar Excel ({fmt(filtradas.length)})
          </button>
        </>
      }
    >
      <input
        type="search"
        className="ui-campo bi-modal-busca"
        placeholder="NF, transportadora, destino ou situação"
        aria-label="Buscar nesta lista"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {filtradas.length > LIMITE && (
        <p className="text-muted">Mostrando as {fmt(LIMITE)} primeiras. Copiar e Baixar Excel levam todas as {fmt(filtradas.length)}.</p>
      )}
      {filtradas.length === 0 ? (
        <p className="bi-vazio">Nenhuma nota nesta lista.</p>
      ) : (
        <div className="table-responsive bi-modal-tabela">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">NF</th>
                <th scope="col">Transportadora</th>
                <th scope="col">Destino</th>
                <th scope="col">Situação</th>
                <th scope="col">{coluna}</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, LIMITE).map((l) => (
                <tr key={l.chave} className="torre-linha" onClick={() => onAbrirNf(l.nf)}>
                  <td>
                    <button
                      type="button"
                      className="torre-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrirNf(l.nf);
                      }}
                      aria-label={`Abrir a NF ${l.nf}`}
                    >
                      {l.nf}
                    </button>
                  </td>
                  <td>{l.transportadora}</td>
                  <td>{l.destino}</td>
                  <td>
                    <span className={`status-badge ${l.tom}`}>{l.situacao}</span>
                  </td>
                  <td>{l.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
