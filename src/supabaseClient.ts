import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nswpjnyntinahskmdszw.supabase.co';
const supabaseAnonKey = 'sb_publishable_wMxk67vwRsIyYsPu97jj7Q_19Zl-mvs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);