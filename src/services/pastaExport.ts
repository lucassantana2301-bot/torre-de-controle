/**
 * Grava exportações numa pasta escolhida pelo usuário (File System Access API, Chrome/Edge).
 * O navegador não aceita caminho fixo: a pasta é escolhida uma vez e o acesso fica salvo no IndexedDB.
 */

type Permissao = 'granted' | 'denied' | 'prompt';

interface PastaHandle {
  readonly name: string;
  queryPermission(options: { mode: 'readwrite' }): Promise<Permissao>;
  requestPermission(options: { mode: 'readwrite' }): Promise<Permissao>;
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
  }>;
}

type JanelaComPicker = Window & {
  showDirectoryPicker?: (options: { id?: string; mode: 'readwrite'; startIn?: string }) => Promise<PastaHandle>;
};

const DB_NAME = 'arklok_pastas';
const STORE = 'handles';
const CHAVE = 'exportGeral';

export const suportaPasta = () => typeof (window as JanelaComPicker).showDirectoryPicker === 'function';

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function lerHandle(): Promise<PastaHandle | null> {
  const db = await abrirDb();
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get(CHAVE);
    request.onsuccess = () => resolve((request.result as PastaHandle | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

async function salvarHandle(handle: PastaHandle): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, CHAVE);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function nomePastaExport(): Promise<string | null> {
  if (!suportaPasta()) return null;
  return (await lerHandle().catch(() => null))?.name ?? null;
}

export async function escolherPastaExport(): Promise<string | null> {
  const picker = (window as JanelaComPicker).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ id: 'arkhub-export', mode: 'readwrite', startIn: 'desktop' });
    await salvarHandle(handle);
    return handle.name;
  } catch {
    return null;
  }
}

/** Retorna o nome da pasta onde gravou, ou null quando o usuário cancelou / navegador não suporta. */
export async function gravarNaPasta(nomeArquivo: string, dados: BlobPart): Promise<string | null> {
  if (!suportaPasta()) return null;
  let handle = await lerHandle().catch(() => null);
  if (!handle) {
    if (!(await escolherPastaExport())) return null;
    handle = await lerHandle();
    if (!handle) return null;
  }
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
  }
  const arquivo = await handle.getFileHandle(nomeArquivo, { create: true });
  const writable = await arquivo.createWritable();
  await writable.write(dados);
  await writable.close();
  return handle.name;
}
