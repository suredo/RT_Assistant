import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_KEY as string
);

export async function getLastActive(): Promise<Date> {
  const { data, error } = await supabase
    .from('bot_state')
    .select('value')
    .eq('key', 'last_active_at')
    .single();

  if (error || !data) return new Date(0); // epoch fallback = first run
  return new Date(data.value);
}

export async function setLastActive(date: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from('bot_state')
    .upsert({ key: 'last_active_at', value: date.toISOString(), updated_at: new Date().toISOString() });
  if (error) throw error;
}
