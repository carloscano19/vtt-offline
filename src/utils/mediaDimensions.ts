/**
 * Helper para obtener dimensiones naturales (ancho y alto) de archivos multimedia
 * soportando imágenes (PNG, JPG, WebP), GIFs animados y vídeos (MP4, WebM).
 */
export async function getMediaDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  const mime = blob.type.toLowerCase();
  const isVideo = mime.startsWith('video/');

  if (isVideo) {
    return new Promise<{ width: number; height: number } | null>((resolve) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = url;

      let settled = false;
      const cleanup = () => {
        if (!settled) {
          settled = true;
          URL.revokeObjectURL(url);
          video.removeAttribute('src');
          video.load();
        }
      };

      video.onloadedmetadata = () => {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        cleanup();
        if (width > 0 && height > 0) {
          resolve({ width, height });
        } else {
          resolve(null);
        }
      };

      video.onerror = () => {
        cleanup();
        resolve(null);
      };

      // Timeout defensivo
      setTimeout(() => {
        cleanup();
        resolve(null);
      }, 3000);
    });
  }

  // Imagen estática o GIF
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;

    let settled = false;
    const cleanup = () => {
      if (!settled) {
        settled = true;
        URL.revokeObjectURL(url);
      }
    };

    const handleLoaded = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      cleanup();
      if (width > 0 && height > 0) {
        resolve({ width, height });
      } else {
        resolve(null);
      }
    };

    if (typeof img.decode === 'function') {
      img.decode()
        .then(handleLoaded)
        .catch(() => {
          img.onload = handleLoaded;
          img.onerror = () => {
            cleanup();
            resolve(null);
          };
        });
    } else {
      img.onload = handleLoaded;
      img.onerror = () => {
        cleanup();
        resolve(null);
      };
    }

    setTimeout(() => {
      cleanup();
      resolve(null);
    }, 3000);
  });
}
