const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Use DIRECT_URL for direct connection (not pooler)
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: false
  }
});

async function fixMissingColumns() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected successfully.');

    // Add missing columns
    const queries = [
      {
        name: 'recoveryCodes to two_factor',
        sql: 'ALTER TABLE two_factor ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT;'
      },
      {
        name: 'providerUserId to provider_user',
        sql: 'ALTER TABLE provider_user ADD COLUMN IF NOT EXISTS "providerUserId" VARCHAR(255);'
      },
      {
        name: 'path to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "path" VARCHAR(255) DEFAULT \'\';'
      },
      {
        name: 'isHome to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "isHome" BOOLEAN DEFAULT false;'
      },
      {
        name: 'isBuilderPage to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "isBuilderPage" BOOLEAN DEFAULT false;'
      },
      {
        name: 'template to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "template" VARCHAR(100);'
      },
      {
        name: 'category to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "category" VARCHAR(100);'
      },
      {
        name: 'seoTitle to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "seoTitle" VARCHAR(255);'
      },
      {
        name: 'seoDescription to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "seoDescription" TEXT;'
      },
      {
        name: 'seoKeywords to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "seoKeywords" TEXT;'
      },
      {
        name: 'ogImage to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "ogImage" TEXT;'
      },
      {
        name: 'ogTitle to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "ogTitle" VARCHAR(255);'
      },
      {
        name: 'ogDescription to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "ogDescription" TEXT;'
      },
      {
        name: 'settings to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "settings" TEXT;'
      },
      {
        name: 'customCss to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "customCss" TEXT;'
      },
      {
        name: 'customJs to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "customJs" TEXT;'
      },
      {
        name: 'lastModifiedBy to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "lastModifiedBy" VARCHAR(255);'
      },
      {
        name: 'publishedAt to page',
        sql: 'ALTER TABLE page ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP;'
      }
    ];

    for (const query of queries) {
      try {
        console.log(`\nAdding ${query.name}...`);
        await sequelize.query(query.sql);
        console.log(`✓ Successfully added ${query.name}`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate column')) {
          console.log(`  Column already exists, skipping.`);
        } else {
          console.error(`  Error: ${error.message}`);
        }
      }
    }
    
    await sequelize.close();
    console.log('\nDone! Backend should now start successfully.');
  } catch (error) {
    console.error('Error:', error.message);
    console.log('\n⚠️  Could not connect to database.');
    console.log('Please run these SQL commands manually in Supabase SQL Editor:');
    console.log('\nALTER TABLE two_factor ADD COLUMN IF NOT EXISTS "recoveryCodes" TEXT;');
    console.log('ALTER TABLE provider_user ADD COLUMN IF NOT EXISTS "providerUserId" VARCHAR(255);');
    process.exit(1);
  }
}

fixMissingColumns();
