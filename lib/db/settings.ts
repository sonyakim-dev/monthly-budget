import { DEFAULT_TIME_ZONE } from '@/lib/domain/dates'
import type { Db } from '@/lib/supabase/types'

export async function getTimeZone(supabase: Db): Promise<string> {
  const { data, error } = await supabase.from('settings').select('timezone').maybeSingle()
  if (error) throw error
  return data?.timezone ?? DEFAULT_TIME_ZONE
}
