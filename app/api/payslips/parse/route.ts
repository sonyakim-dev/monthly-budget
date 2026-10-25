import { NextResponse, type NextRequest } from 'next/server'
import { isSignedIn } from '@/lib/auth/session'
import { extractTextItems } from '@/lib/payslip/extract'
import { parsePayslipItems, type ParseResult } from '@/lib/payslip/parse'
import { createClient } from '@/lib/supabase/server'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Reads one payslip PDF and returns its figures. The bytes live only for this request:
 * nothing about the file is written anywhere (design §0.6).
 */
export async function POST(request: NextRequest): Promise<NextResponse<ParseResult | { error: string }>> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That PDF is too large (5 MB max).' }, { status: 413 })

  let items
  try {
    items = await extractTextItems(new Uint8Array(await file.arrayBuffer()))
  } catch {
    return NextResponse.json({ ok: false, reason: 'no-text' } satisfies ParseResult)
  }
  return NextResponse.json(parsePayslipItems(items))
}
