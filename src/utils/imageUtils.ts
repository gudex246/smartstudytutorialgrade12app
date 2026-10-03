/**
 * Utility for handling and optimizing payment receipt screenshots
 * Resizes images client-side to ensure smooth performance, fast rendering,
 * and safe storage inside browser storage without exceeding quotas.
 */

export interface ProcessedImage {
  dataUrl: string;
  fileName: string;
  fileSizeFormatted: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Converts a base64 dataUrl into a native File object for mobile Web Share API or uploads
 */
export function dataUrlToFile(dataUrl: string, fileName = 'Payment_Receipt.jpg'): File {
  try {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1] || '');
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], fileName, { type: mime });
  } catch (err) {
    console.warn('Could not parse dataUrl to File, returning dummy File', err);
    return new File([''], fileName, { type: 'image/jpeg' });
  }
}

/**
 * Triggers a native download of the screenshot dataUrl on mobile and desktop
 */
export function downloadDataUrl(dataUrl: string, fileName = 'Payment_Receipt.jpg'): void {
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.warn('Failed to trigger download:', err);
  }
}

export async function processPaymentScreenshot(
  file: File,
  maxWidth = 750,
  maxHeight = 750,
  quality = 0.60
): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected. Please choose a receipt screenshot.'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read image file from your device.'));
    };

    reader.onload = (e) => {
      const resultDataUrl = e.target?.result as string;
      if (!resultDataUrl) {
        reject(new Error('Empty image data returned from device.'));
        return;
      }

      const img = new Image();
      img.onerror = () => {
        // If canvas image load fails (e.g. unknown format or iOS HEIC fallback), accept dataUrl
        if (resultDataUrl.startsWith('data:image/') || (file.type && file.type.startsWith('image/')) || file.size > 0) {
          resolve({
            dataUrl: resultDataUrl,
            fileName: file.name || 'Payment_Receipt.jpg',
            fileSizeFormatted: formatFileSize(file.size)
          });
        } else {
          reject(new Error('Could not render image. Please upload a PNG, JPG, or JPEG screenshot.'));
        }
      };

      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale down if larger than max dimensions to ensure quick upload (<60KB) & clear receipt rendering
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({
              dataUrl: resultDataUrl,
              fileName: file.name || 'Payment_Receipt.jpg',
              fileSizeFormatted: formatFileSize(file.size)
            });
            return;
          }

          // Fill white background in case of transparent PNG
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          ctx.drawImage(img, 0, 0, width, height);

          // Export as optimized JPEG for instant transmission
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

          // Calculate approximate byte size of the base64 string
          const approxBytes = Math.round((compressedDataUrl.length * 3) / 4);

          resolve({
            dataUrl: compressedDataUrl,
            fileName: (file.name || 'Payment_Receipt').replace(/\.[^/.]+$/, '') + '.jpg',
            fileSizeFormatted: formatFileSize(approxBytes)
          });
        } catch (canvasErr) {
          console.warn('Canvas optimization fallback to original dataUrl:', canvasErr);
          resolve({
            dataUrl: resultDataUrl,
            fileName: file.name || 'Payment_Receipt.jpg',
            fileSizeFormatted: formatFileSize(file.size)
          });
        }
      };

      img.src = resultDataUrl;
    };

    reader.readAsDataURL(file);
  });
}


