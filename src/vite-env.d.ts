/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for the NightWise FastAPI backend, e.g. http://localhost:8000 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
