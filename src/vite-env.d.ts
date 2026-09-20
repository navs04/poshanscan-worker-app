/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_REFERENCE_TYPE?: string
  readonly VITE_REFERENCE_SIZE_MM?: string
  readonly VITE_MIN_SHARPNESS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
