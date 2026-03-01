const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Configure SSL properly for Supabase
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false  // Required for Supabase
    }
  },
  logging: false
});

async function testConnection() {
  try {
    console.log('Testing connection to Supabase PostgreSQL...');
    console.log('Database URL configured:', process.env.DATABASE_URL ? 'Yes' : 'No');
    
    await sequelize.authenticate();
    console.log('✅ Connection to Supabase successful!');
    
    const [results] = await sequelize.query('SELECT version()');
    console.log('\nPostgreSQL version:', results[0].version);
    
    // Test listing tables
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log(`\nFound ${tables.length} table(s) in database`);
    if (tables.length > 0) {
      console.log('Tables:', tables.map(t => t.table_name).join(', '));
    } else {
      console.log('No tables found - database is empty (ready for migration)');
    }
    
    await sequelize.close();
    console.log('\n✅ Connection test completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Run migrations: npx sequelize-cli db:migrate');
    console.log('2. Run seeders: npx sequelize-cli db:seed:all');
    console.log('3. Start development: pnpm turbo dev');
    process.exit(0);
  } catch (error) {
    console.error('❌ Unable to connect to database');
    console.error('Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify DATABASE_URL in .env file');
    console.error('2. Check Supabase project is active');
    console.error('3. Verify network connection');
    process.exit(1);
  }
}

testConnection();
