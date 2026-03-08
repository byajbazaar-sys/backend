import PDFDocument from 'pdfkit';
import { IPdfColumnConfig } from './interfaces';

/**
 * Gets a nested property value by path (e.g. 'customer.firstName')
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part) => {
    if (acc != null && typeof acc === 'object' && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

/** PDF layout constants - landscape for more column space */
const MARGIN = 30;
const TABLE_TOP = 60;
const ROW_HEIGHT = 22;
const CELL_PADDING = 6;
const FONT_SIZE_HEADER = 9;
const FONT_SIZE_DATA = 8;

/** Truncate string to maxLen with ellipsis */
function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 3)) + '...';
}

/**
 * Converts an array of objects to PDF Buffer with a table.
 * Uses landscape orientation for better column spacing.
 */
export async function toPDF<T extends Record<string, unknown>>(
  items: T[],
  columns: IPdfColumnConfig[],
  title: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: MARGIN, size: 'A4', layout: 'landscape' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const pageWidth = 842;
  const pageHeight = 595;
  const contentWidth = pageWidth - 2 * MARGIN;

  const colWidths = columns.map((col) => col.width ?? contentWidth / columns.length);
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const scale = totalWidth > contentWidth ? contentWidth / totalWidth : 1;
  const scaledWidths = colWidths.map((w) => w * scale);

  doc.fontSize(14).font('Helvetica-Bold').text(title, MARGIN, 35, {
    align: 'center',
    width: contentWidth,
  });

  if (items.length === 0) {
    doc.fontSize(10).font('Helvetica').text('No data to display.', MARGIN, TABLE_TOP);
  } else {
    let y = TABLE_TOP;

    const drawHeaderRow = () => {
      doc.fontSize(FONT_SIZE_HEADER).font('Helvetica-Bold');
      let x = MARGIN;
      columns.forEach((col, i) => {
        const w = scaledWidths[i] - CELL_PADDING;
        const headerText = truncate(col.header, 20);
        doc.text(headerText, x + CELL_PADDING / 2, y, { width: w, height: ROW_HEIGHT - 4, ellipsis: true });
        x += scaledWidths[i];
      });
      doc.moveTo(MARGIN, y + ROW_HEIGHT - 4).lineTo(MARGIN + contentWidth, y + ROW_HEIGHT - 4).stroke();
      y += ROW_HEIGHT;
    };

    drawHeaderRow();
    doc.font('Helvetica').fontSize(FONT_SIZE_DATA);

    for (const item of items) {
      if (y > pageHeight - MARGIN - ROW_HEIGHT) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
        y = MARGIN;
        drawHeaderRow();
        doc.font('Helvetica').fontSize(FONT_SIZE_DATA);
      }

      const row = item as Record<string, unknown>;
      let x = MARGIN;
      columns.forEach((col, i) => {
        let val = getByPath(row, col.key);
        if (col.formatter) val = col.formatter(val);
        else if (val instanceof Date) val = (val as Date).toISOString();
        else val = String(val ?? '');
        const cellText = String(val);
        const w = scaledWidths[i] - CELL_PADDING;
        doc.text(cellText, x + CELL_PADDING / 2, y, {
          width: w,
          height: ROW_HEIGHT - 4,
          ellipsis: true,
        });
        x += scaledWidths[i];
      });
      y += ROW_HEIGHT;
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
