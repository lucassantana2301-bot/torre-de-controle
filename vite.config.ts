import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Política de segurança: o navegador só carrega e conecta no próprio app — nenhum dado sai para outro servidor. */
function politicaDeSeguranca(dev: boolean): Plugin {
  const diretivas = [
    "default-src 'self'",
    // O Vite em desenvolvimento injeta um script inline (React Refresh) e usa WebSocket para recarregar.
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    dev ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*" : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "politica-de-seguranca",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: diretivas }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), politicaDeSeguranca(command === "serve")],
  server: {
    host: "localhost",
    port: 5173,
    // No Windows, planilhas abertas no Excel ou ainda sendo copiadas travam o vigia de arquivos (EBUSY) e derrubam o servidor.
    watch: {
      ignored: ["**/.cursor/**", "**/dist/**", "**/database/**", "**/docs/**", "**/*.xlsx", "**/*.xls", "**/*.csv"],
    },
  },
  preview: {
    host: "localhost",
  },
}));
