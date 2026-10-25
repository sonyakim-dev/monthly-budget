import { getDocumentProxy } from 'unpdf'
import type { TextItem } from './types'

/** Text items of the first page, with positions. The PDF bytes are only read, never stored. */
export async function extractTextItems(data: Uint8Array): Promise<TextItem[]> {
  const pdf = await getDocumentProxy(data)
  const page = await pdf.getPage(1)
  const content = await page.getTextContent()
  return content.items.flatMap((item) =>
    'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }] : [],
  )
}
