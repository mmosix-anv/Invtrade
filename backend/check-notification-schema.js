const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Disable SSL certificate validation for Supabase
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
});

async function checkNotificationSchema() {
  try {
    console.log('Checking notification table schema...\n');
    
    const [columns] = await sequelize.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'notification'
      ORDER BY ordinal_position;
    `);
    
    console.log('Current notification table columns:');
    console.log('=====================================');
    columns.forEach(col => {
      console.log(`${col.column_name.padEnd(20)} | ${col.data_type.padEnd(25)} | Nullable: ${col.is_nullable} | Default: ${col.column_default || 'none'}`);
    });
    
    console.log('\n\nExpected columns from model:');
    console.log('=====================================');
    const expectedColumns = [
      'id',
      'userId',
      'relatedId',
      'title',
      'type',
      'message',
      'details',
      'link',
      'actions',
      'read',
      'idempotency_key',
      'channels',
      'priority',
      'createdAt',
      'updatedAt',
      'deletedAt'
    ];
    
    expectedColumns.forEach(col => {
      const exists = columns.find(c => c.column_name === col);
      console.log(`${col.padEnd(20)} | ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
    });
    
  } catch (error) {
    console.error('Error checking schema:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

checkNotificationSchema();
