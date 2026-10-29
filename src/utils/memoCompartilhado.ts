/** Guarda o último resultado e o devolve a todos os componentes que pedirem com as mesmas entradas. */
export function memoCompartilhado<A extends unknown[], R>(calcular: (...args: A) => R): (...args: A) => R {
  let ultimosArgs: A | null = null;
  let ultimo: R;
  return (...args: A) => {
    const anteriores = ultimosArgs;
    if (anteriores && args.length === anteriores.length && args.every((arg, i) => arg === anteriores[i])) return ultimo;
    ultimo = calcular(...args);
    ultimosArgs = args;
    return ultimo;
  };
}
