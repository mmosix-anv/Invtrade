/**
 * Execute SQL schema creation script
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function runSchema() {
  console.log('🚀 Creating database schema in Supabase...\n');

  // Create PostgreSQL client
  const client = new Client({
    connectionString: process.env.DIRECT_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Connect
    console.log('1️⃣  Connecting to database...');
    await client.connect();
    console.log('   ✅ Connected!\n');

    // Read SQL file
    console.log('2️⃣  Reading schema file...');
    const sqlPath = path.join(__dirname, 'create-schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('   ✅ Schema file loaded\n');

    // Execute SQL
    console.log('3️⃣  Executing schema creation...');
    console.log('   ⏳ This may take a moment...\n');
    
    await client.query(sql);
    
    console.log('   ✅ Schema created successfully!\n');

    // Verify tables
    console.log('4️⃣  Verifying tables...');
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log(`   ✅ Found ${result.rows.length} tables:`);
    result.rows.forEach((row, index) => {
      console.log(`      ${index + 1}. ${row.table_name}`);
    });

    console.log('\n✅ Database schema creation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Run seeders: npx sequelize-cli db:seed:all');
    console.log('   2. Start application: pnpm turbo dev\n');

  } catch (error) {
    console.error('\n❌ Schema creation failed!');
    console.error('Error:', error.message);
    if (error.position) {
      console.error('Position:', error.position);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the schema creation
runSchema();
