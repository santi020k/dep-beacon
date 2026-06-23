/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DEP_BEACON_DOCS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
