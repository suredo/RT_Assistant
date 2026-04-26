import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export interface Demand {
  id?: string;
  message: string;
  summary: string;
  category: string;
  priority: string;
  status?: string;
  created_at?: string;
  resolved_at?: string;
}

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_KEY as string
);

export async function saveDemand(demand: Omit<Demand, 'id' | 'status' | 'created_at' | 'resolved_at'>): Promise<Demand> {
  const { data, error } = await supabase
    .from('demands')
    .insert(demand)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function resolveDemand(id: string): Promise<void> {
  const { error } = await supabase
    .from('demands')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function getOpenDemands({ days = 7, priority }: { days?: number; priority?: string } = {}): Promise<Demand[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('demands')
    .select('*')
    .eq('status', 'open')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString());

  if (priority) query = query.eq('priority', priority);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
