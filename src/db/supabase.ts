import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export interface Demand {
  id?: string;
  message: string;
  summary: string;
  category: string;
  priority: string;
  status?: string;
  created_at?: string;
  resolved_at?: string;
  whatsapp_message_id?: string;
  notes?: string;
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

export type DemandUpdate = Partial<Pick<Demand, 'summary' | 'category' | 'priority' | 'status' | 'notes'>>;

export async function updateDemand(id: string, fields: DemandUpdate): Promise<void> {
  const { error } = await supabase
    .from('demands')
    .update(fields)
    .eq('id', id);
  if (error) throw error;
}

export async function resolveDemand(id: string): Promise<void> {
  const { error } = await supabase
    .from('demands')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function appendNote(id: string, existingNotes: string | undefined, formattedNote: string): Promise<void> {
  const notes = existingNotes ? `${existingNotes}\n${formattedNote}` : formattedNote;
  const { error } = await supabase
    .from('demands')
    .update({ notes })
    .eq('id', id);
  if (error) throw error;
}

export async function findDemandByMessage(message: string): Promise<Demand | null> {
  const { data, error } = await supabase
    .from('demands')
    .select('*')
    .eq('message', message)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export interface DemandFilters {
  status?: 'open' | 'resolved';  // undefined = no status filter (all statuses)
  category?: string;
  priority?: string;
  days?: number;
}

export async function getDemands({ status, category, priority, days = 7 }: DemandFilters = {}): Promise<Demand[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('demands')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString());

  if (status) query = query.eq('status', status);
  if (category) query = query.eq('category', category);
  if (priority) query = query.eq('priority', priority);

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getOpenDemands({ days = 7, priority }: { days?: number; priority?: string } = {}): Promise<Demand[]> {
  return getDemands({ status: 'open', priority, days });
}
