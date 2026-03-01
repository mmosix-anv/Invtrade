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

async function fixMissingColumns() {
  try {
    console.log('Fixing missing columns...\n');
    
    // 1. Fix api_key.ipRestriction
    const [ipRestrictionResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'api_key' 
      AND column_name = 'ipRestriction';
    `);
    
    if (ipRestrictionResults.length === 0) {
      console.log('Adding ipRestriction column to api_key...');
      await sequelize.query(`
        ALTER TABLE api_key 
        ADD COLUMN "ipRestriction" TEXT NULL;
      `);
      console.log('✓ ipRestriction column added');
    } else {
      console.log('✓ ipRestriction already exists');
    }
    
    // 2. Fix notification_template.email
    const [emailResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification_template' 
      AND column_name = 'email';
    `);
    
    if (emailResults.length === 0) {
      console.log('Adding email column to notification_template...');
      await sequelize.query(`
        ALTER TABLE notification_template 
        ADD COLUMN "email" BOOLEAN DEFAULT true;
      `);
      console.log('✓ email column added');
    } else {
      console.log('✓ email already exists');
    }
    
    // 3. Fix notification_template.sms
    const [smsResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification_template' 
      AND column_name = 'sms';
    `);
    
    if (smsResults.length === 0) {
      console.log('Adding sms column to notification_template...');
      await sequelize.query(`
        ALTER TABLE notification_template 
        ADD COLUMN "sms" BOOLEAN DEFAULT false;
      `);
      console.log('✓ sms column added');
    } else {
      console.log('✓ sms already exists');
    }
    
    // 4. Fix notification_template.push
    const [pushResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notification_template' 
      AND column_name = 'push';
    `);
    
    if (pushResults.length === 0) {
      console.log('Adding push column to notification_template...');
      await sequelize.query(`
        ALTER TABLE notification_template 
        ADD COLUMN "push" BOOLEAN DEFAULT false;
      `);
      console.log('✓ push column added');
    } else {
      console.log('✓ push already exists');
    }
    
    console.log('\n✓ All missing columns fixed!');
  } catch (error) {
    console.error('Error fixing columns:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

fixMissingColumns();
