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
  logging: console.log,
});

async function fixNotificationColumns() {
  try {
    console.log('Checking notification table for missing columns...');
    
    // Check if relatedId column exists
    const [relatedIdResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'relatedId';
    `);
    
    if (relatedIdResults.length === 0) {
      console.log('Adding relatedId column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "relatedId" UUID NULL;
      `);
      console.log('✓ relatedId column added successfully');
    } else {
      console.log('✓ relatedId column already exists');
    }
    
    // Check if details column exists
    const [detailsResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'details';
    `);
    
    if (detailsResults.length === 0) {
      console.log('Adding details column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "details" TEXT NULL;
      `);
      console.log('✓ details column added successfully');
    } else {
      console.log('✓ details column already exists');
    }
    
    // Check if actions column exists
    const [actionsResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'actions';
    `);
    
    if (actionsResults.length === 0) {
      console.log('Adding actions column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "actions" JSONB NULL;
      `);
      console.log('✓ actions column added successfully');
    } else {
      console.log('✓ actions column already exists');
    }
    
    // Check if channels column exists
    const [channelsResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'channels';
    `);
    
    if (channelsResults.length === 0) {
      console.log('Adding channels column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "channels" JSONB NULL;
      `);
      console.log('✓ channels column added successfully');
    } else {
      console.log('✓ channels column already exists');
    }
    
    // Check if priority column exists
    const [priorityResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'priority';
    `);
    
    if (priorityResults.length === 0) {
      console.log('Adding priority column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "priority" VARCHAR(10) DEFAULT 'NORMAL';
      `);
      console.log('✓ priority column added successfully');
    } else {
      console.log('✓ priority column already exists');
    }
    
    // Check if read column exists
    const [readResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'read';
    `);
    
    if (readResults.length === 0) {
      console.log('Adding read column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "read" BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log('✓ read column added successfully');
    } else {
      console.log('✓ read column already exists');
    }
    
    // Check if link column exists
    const [linkResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification' 
      AND column_name = 'link';
    `);
    
    if (linkResults.length === 0) {
      console.log('Adding link column to notification table...');
      await sequelize.query(`
        ALTER TABLE notification 
        ADD COLUMN "link" VARCHAR(255) NULL;
      `);
      console.log('✓ link column added successfully');
    } else {
      console.log('✓ link column already exists');
    }
    
    console.log('\nAll notification columns fixed successfully!');
  } catch (error) {
    console.error('Error fixing notification table:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

fixNotificationColumns();
