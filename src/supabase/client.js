import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://draofilyocdmazjfoblc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyYW9maWx5b2NkbWF6amZvYmxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxODk0NjgsImV4cCI6MjA4OTc2NTQ2OH0.EHM0O7Ef7nw_ckpr-y_KuxVzkZN76zTk25CqDjXKN9M'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
