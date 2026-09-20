import { config } from './config'

export interface QualityIssue {
  code: 'blurry' | 'dark' | 'bright'
  /** For the small live pill. */
  short: string
  /** For the review screen. */
  message: string
}

export interface QualityReport {
  sharpness: number
  brightness: number
  issues: QualityIssue[]
  ok: boolean
}

const ISSUES = {
  blurry: {
    code: 'blurry',
    short: 'Hold steady',
    message: 'The photo looks blurry. Hold the phone steady and let it focus before you tap.',
  },
  dark: {
    code: 'dark',
    short: 'Too dark',
    message: 'The photo is too dark. Move to a brighter spot, but keep the sun behind you.',
  },
  bright: {
    code: 'bright',
    short: 'Too bright',
    message: 'The photo is washed out. Move out of direct sunlight or glare.',
  },
} as const satisfies Record<string, QualityIssue>

/**
 * Pure maths, no DOM. Takes RGBA pixels and returns brightness (mean luma) and
 * sharpness (variance of the 4-neighbour Laplacian, the standard cheap blur metric).
 */
export function analyseLuma(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  limits: { minSharpness: number; minBrightness: number; maxBrightness: number } = config.quality,
): QualityReport {
  const n = width * height
  const gray = new Float32Array(n)
  let sum = 0
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
    gray[i] = g
    sum += g
  }
  const brightness = n > 0 ? sum / n : 0

  let lapSum = 0
  let lapSq = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const lap = gray[idx - width] + gray[idx + width] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx]
      lapSum += lap
      lapSq += lap * lap
      count++
    }
  }
  const mean = count > 0 ? lapSum / count : 0
  const sharpness = count > 0 ? lapSq / count - mean * mean : 0

  const issues: QualityIssue[] = []
  if (sharpness < limits.minSharpness) issues.push(ISSUES.blurry)
  if (brightness < limits.minBrightness) issues.push(ISSUES.dark)
  else if (brightness > limits.maxBrightness) issues.push(ISSUES.bright)

  return { sharpness, brightness, issues, ok: issues.length === 0 }
}

let scratch: HTMLCanvasElement | null = null

/** Downscales a video frame / image / bitmap onto a small canvas and analyses it. */
export function analyseSource(source: CanvasImageSource, srcWidth: number, srcHeight: number): QualityReport {
  const w = Math.max(3, Math.min(config.quality.analysisWidth, srcWidth))
  const h = Math.max(3, Math.round(srcHeight * (w / srcWidth)))
  scratch ??= document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas is not available')
  ctx.drawImage(source, 0, 0, w, h)
  return analyseLuma(ctx.getImageData(0, 0, w, h).data, w, h)
}

export async function analyseBlob(blob: Blob): Promise<QualityReport> {
  const bitmap = await createImageBitmap(blob)
  try {
    return analyseSource(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}
