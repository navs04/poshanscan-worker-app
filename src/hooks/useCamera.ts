import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable'

/**
 * Wraps getUserMedia. Prefers the rear camera. Safe under React StrictMode:
 * a late-resolving stream from a cancelled start() is stopped immediately.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef(0)
  const [status, setStatus] = useState<CameraStatus>('idle')

  const stop = useCallback(() => {
    requestRef.current += 1 // invalidates any start() still awaiting the browser
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  const start = useCallback(async () => {
    stop()
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable') // no camera API, or not a secure (https) context
      return
    }
    const id = ++requestRef.current
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      if (id !== requestRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
      }
      // Continuous autofocus where the browser supports it (sharper photos of a moving child).
      try {
        await stream
          .getVideoTracks()[0]
          .applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
      } catch {
        /* not supported: ignore */
      }
      if (id === requestRef.current) setStatus('ready')
    } catch (err) {
      if (id !== requestRef.current) return
      const name = err instanceof DOMException ? err.name : ''
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
    }
  }, [stop])

  /** Grab the current video frame at full camera resolution as a JPEG. */
  const capture = useCallback(async (): Promise<Blob> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) throw new Error('The camera is not ready yet.')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read the camera frame.')
    ctx.drawImage(video, 0, 0)
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo.'))), 'image/jpeg', 0.92),
    )
  }, [])

  useEffect(() => stop, [stop]) // release the camera on unmount

  return { videoRef, status, start, stop, capture }
}
