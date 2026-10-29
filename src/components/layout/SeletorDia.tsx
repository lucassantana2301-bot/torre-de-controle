import React from 'react';
import { useApp } from '../../context/AppContext';
import { lerEstadoDoDia, listarDias, onBancoAlterado, type DiaSalvo } from '../../services/bancoDiario';
import { hojeLocal } from '../../services/exportGeral';
import { dataBr, definirDiaAtivo, useDiaAtivo } from '../../services/diaAtivo';

/** Troca o app inteiro entre os dados de hoje (ao vivo) e a foto de um dia salvo. */
export const SeletorDia: React.FC<{ sempre?: boolean }> = ({ sempre = false }) => {
  const { addToast } = useApp();
  const diaAtivo = useDiaAtivo();
  const [dias, setDias] = React.useState<DiaSalvo[]>([]);

  const recarregar = React.useCallback(() => {
    listarDias()
      .then((lista) => setDias(lista.filter((d) => d.temEstado && d.data !== hojeLocal()).reverse()))
      .catch(() => setDias([]));
  }, []);

  React.useEffect(recarregar, [recarregar]);
  React.useEffect(() => onBancoAlterado(recarregar), [recarregar]);

  const trocar = async (data: string) => {
    if (!data) {
      definirDiaAtivo(null);
      return;
    }
    const estado = await lerEstadoDoDia(data).catch(() => null);
    if (!estado) {
      addToast('error', 'Dia indisponível', `Não encontrei os dados salvos de ${dataBr(data)}.`);
      return;
    }
    definirDiaAtivo({ data, estado });
  };

  if (dias.length === 0 && !diaAtivo && !sempre) return null;

  return (
    <select
      className={`dia-select ${diaAtivo ? 'historico' : ''}`}
      value={diaAtivo?.data ?? ''}
      onFocus={recarregar}
      onChange={(event) => trocar(event.target.value)}
      title="Ver os dados como estavam num dia antigo (somente leitura). Os dias novos ficam no Banco de dados."
      aria-label="Ver dados de um dia antigo"
    >
      <option value="">Dados de hoje</option>
      {dias.map((dia) => (
        <option key={dia.data} value={dia.data}>
          Ver dia {dataBr(dia.data)}
        </option>
      ))}
      {diaAtivo && !dias.some((d) => d.data === diaAtivo.data) && (
        <option value={diaAtivo.data}>Ver dia {dataBr(diaAtivo.data)}</option>
      )}
    </select>
  );
};
