import type { ImgHTMLAttributes } from 'react'
import type { MediaVariant } from './media.schemas'

export function mediaUrl(captureId: string, variant: MediaVariant) {
  return `/api/media/${encodeURIComponent(captureId)}/${variant}`
}

/**
 * A deliberately non-networking fallback: uncaptured media never causes the
 * viewer's browser to contact a source CDN.
 */
export function CachedListingImage({
  captureId,
  variant = 'thumbnail',
  alt,
  className,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { captureId?: string | null; variant?: MediaVariant }) {
  if (!captureId) return <span aria-label={alt || 'No captured image'} className={className}>No image</span>
  return <img src={mediaUrl(captureId, variant)} alt={alt} className={className} loading="lazy" decoding="async" {...props} />
}
