/**
 * Guarda o último resultado de `fn`: chamadas com os mesmos argumentos (por referência) reaproveitam o cálculo.
 * Vários componentes usam o mesmo cruzamento; assim ele roda uma vez só por mudança de dados.
 */
export function memoUltimo<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let ultimos: A | null = null;
  let resultado: R;
  return (...args: A) => {
    if (ultimos && ultimos.length === args.length && ultimos.every((valor, i) => valor === args[i])) return resultado;
    resultado = fn(...args);
    ultimos = args;
    return resultado;
  };
}
