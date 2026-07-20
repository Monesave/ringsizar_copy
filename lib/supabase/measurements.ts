import { supabase } from './client';
import type { LocalMeasurement } from '@/types/measurement';

export async function saveMeasurement(m: Omit<LocalMeasurement, 'id' | 'createdAt'>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await supabase
    .from('measurements')
    .insert({
      user_id: user.id,
      type: m.type,
      label: m.label,
      hand: m.hand ?? null,
      finger: m.finger ?? null,
      inner_diameter_mm: m.innerDiameterMm,
      inner_circumference_mm: m.innerCircumferenceMm,
      size_us: m.sizeUS,
      size_eu: m.sizeEU,
      size_uk_au_nz: m.sizeUK_AU_NZ,
      size_jp_cn: m.sizeJP_CN,
    })
    .select()
    .single();

  return { data, error };
}

export async function getMeasurements() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await supabase
    .from('measurements')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return { data, error };
}

export async function deleteMeasurement(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error('Not authenticated') };

  const { error } = await supabase
    .from('measurements')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  return { error };
}
