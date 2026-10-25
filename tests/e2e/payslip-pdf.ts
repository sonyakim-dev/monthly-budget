// Test-only: renders the made-up Workday fixture into a real PDF, so the upload flow is exercised end to end.
// Text is placed at the fixture's positions, which is what the parser reads back. Spaces inside an item are
// written as non-breaking spaces so the PDF text extractor keeps each item whole, as real payslip PDFs do.
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildWorkdayItems, type WorkdaySpec } from '../../lib/payslip/fixtures/workday'

export async function payslipPdf(spec: WorkdaySpec): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = 6
  for (const item of buildWorkdayItems(spec)) {
    const text = item.str.replaceAll(' ', '\u00A0')
    // The parser assigns a number to its column by its right edge, matched against the column header's right edge,
    // so numbers and column headers keep the fixture's right edge; everything else keeps its left edge
    // (the real font is narrower than the fixture assumed).
    const width = font.widthOfTextAtSize(text, size)
    const rightAligned = /^-?[\d,]*\.?\d+$/.test(item.str) || ['Hours', 'Rate', 'Amount', 'YTD'].includes(item.str)
    const x = rightAligned ? item.x + item.width - width : item.x
    page.drawText(text, { x, y: item.y, size, font })
  }
  return Buffer.from(await doc.save())
}

/** A PDF with no text at all, like a scan. */
export async function blankPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage([612, 792])
  return Buffer.from(await doc.save())
}
