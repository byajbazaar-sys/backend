/** React Native / some clients send PDFs as octet-stream; accept when the filename is clearly a PDF. */
export function isUploadedPdfFile(file?: Express.Multer.File): boolean {
  if (!file?.buffer?.length) return false;
  const mime = (file.mimetype ?? '').toLowerCase();
  if (mime === 'application/pdf') return true;
  if (mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    return (file.originalname ?? '').toLowerCase().endsWith('.pdf');
  }
  return false;
}

/** Meta media upload requires a PDF MIME type even when the client reported octet-stream. */
export function resolveUploadedPdfMimeType(mimeType: string, filename: string): string {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'application/pdf';
  if ((filename ?? '').toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return mimeType;
}
