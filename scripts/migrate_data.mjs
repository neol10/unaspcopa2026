import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmxssuotlacqadbbfhou.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // The NEW anon key or service key! Wait, anon key can't bypass RLS!
// WAIT! Anon key cannot insert into tables due to RLS `to authenticated using(is_admin())`
