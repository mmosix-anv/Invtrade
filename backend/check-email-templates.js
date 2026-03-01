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

async function checkEmailTemplates() {
  try {
    console.log('Checking email templates...\n');
    
    // Check if notification_template table exists
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'notification_template';
    `);
    
    if (tables.length === 0) {
      console.log('❌ notification_template table does not exist!');
      return;
    }
    
    console.log('✓ notification_template table exists\n');
    
    // Get all templates
    const [templates] = await sequelize.query(`
      SELECT 
        id,
        name,
        subject,
        email,
        sms,
        push,
        "emailBody",
        "smsBody",
        "pushBody"
      FROM notification_template
      ORDER BY name;
    `);
    
    console.log(`Found ${templates.length} templates:\n`);
    
    if (templates.length === 0) {
      console.log('❌ No templates found! You need to run seeders.');
      console.log('\nRun: cd backend && npx sequelize-cli db:seed:all');
      return;
    }
    
    // Check for EmailVerification template
    const emailVerification = templates.find(t => t.name === 'EmailVerification');
    
    if (!emailVerification) {
      console.log('❌ EmailVerification template not found!');
      console.log('\nAvailable templates:');
      templates.forEach(t => console.log(`  - ${t.name}`));
    } else {
      console.log('✓ EmailVerification template found');
      console.log(`  ID: ${emailVerification.id}`);
      console.log(`  Subject: ${emailVerification.subject}`);
      console.log(`  Email enabled: ${emailVerification.email}`);
      console.log(`  SMS enabled: ${emailVerification.sms}`);
      console.log(`  Push enabled: ${emailVerification.push}`);
      console.log(`  Has emailBody: ${!!emailVerification.emailBody}`);
      
      if (!emailVerification.email) {
        console.log('\n⚠ Email is disabled for EmailVerification template!');
        console.log('Enabling email for this template...');
        
        await sequelize.query(`
          UPDATE notification_template 
          SET email = true 
          WHERE name = 'EmailVerification';
        `);
        
        console.log('✓ Email enabled for EmailVerification template');
      }
    }
    
    // Check other important templates
    const importantTemplates = [
      'WelcomeEmail',
      'PasswordReset',
      'EmailVerification'
    ];
    
    console.log('\n\nImportant templates status:');
    console.log('='.repeat(60));
    
    for (const templateName of importantTemplates) {
      const template = templates.find(t => t.name === templateName);
      if (template) {
        console.log(`✓ ${templateName.padEnd(25)} | Email: ${template.email ? '✓' : '✗'} | SMS: ${template.sms ? '✓' : '✗'} | Push: ${template.push ? '✓' : '✗'}`);
      } else {
        console.log(`✗ ${templateName.padEnd(25)} | NOT FOUND`);
      }
    }
    
  } catch (error) {
    console.error('Error checking templates:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

checkEmailTemplates();
