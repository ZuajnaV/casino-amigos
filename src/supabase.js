import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://aocmrlfbpuwwcucenbvb.supabase.co"
const SUPABASE_KEY = "sb_publishable_bvgoxOVwMc9Phaop-3UcQA_bJFVD69n"

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)