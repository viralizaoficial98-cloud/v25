/// <reference types="vite/client" />

// Apenas variáveis públicas. Credenciais (MySQL, SMTP) ficam no .env privado da API PHP.
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_MEDIA_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
