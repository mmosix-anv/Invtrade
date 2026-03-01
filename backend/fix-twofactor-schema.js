const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTwoFactorSchema() {
  try {
    console.log('Adding recoveryCodes column to two_factor table...');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT;'
    });
    
    if (error) {
      // Try direct query instead
      console.log('RPC failed, trying direct approach...');
      const { error: directError } = await supabase
        .from('two_factor')
        .select('*')
        .limit(0);
      
      if (directError) {
        throw directError;
      }
      
      console.log('Note: Column may already exist or needs to be added via SQL editor in Supabase dashboard');
      console.log('Run this SQL in Supabase SQL Editor:');
      console.log('ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT;');
    } else {
      console.log('✓ Successfully added recoveryCodes column');
    }
    
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT;');
  }
}

fixTwoFactorSchema();
