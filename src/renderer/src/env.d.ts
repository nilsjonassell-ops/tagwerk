import type { TagwerkApi } from '@shared/types'

declare global {
  interface Window {
    tagwerk: TagwerkApi
  }
}

export {}
