/**
 * URL de una foto del volumen `media` vista desde el panel: pasa por el proxy
 * `/api` con la sesión (F6·3). El sitio sirve las mismas fotos por su cuenta.
 */
export function mediaUrl(path: string): string {
  return `/api/web-catalog/media/${path.split('/').map(encodeURIComponent).join('/')}`;
}
