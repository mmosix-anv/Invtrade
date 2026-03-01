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

async function checkKycServices() {
  try {
    console.log('Checking KYC verification services...\n');
    
    // Check if table exists
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'kyc_verification_service';
    `);
    
    if (tables.length === 0) {
      console.log('❌ kyc_verification_service table does not exist!');
      return;
    }
    
    // Get all services
    const [services] = await sequelize.query(`
      SELECT * FROM kyc_verification_service;
    `);
    
    console.log(`Found ${services.length} KYC verification services:\n`);
    
    if (services.length === 0) {
      console.log('❌ No KYC verification services found!');
      console.log('\nThe KYC page needs at least one verification service.');
      console.log('Creating a default "Manual" verification service...\n');
      
      await sequelize.query(`
        INSERT INTO kyc_verification_service (
          id, 
          name, 
          description,
          type,
          "integrationDetails",
          "createdAt",
          "updatedAt"
        ) VALUES (
          'manual',
          'Manual Verification',
          'Manual document verification by admin',
          'manual',
          '{}',
          NOW(),
          NOW()
        );
      `);
      
      console.log('✓ Default manual verification service created');
      
      // Get the created service
      const [newServices] = await sequelize.query(`
        SELECT * FROM kyc_verification_service;
      `);
      
      console.log('\nCreated service:');
      newServices.forEach(service => {
        console.log(`  ID: ${service.id}`);
        console.log(`  Name: ${service.name}`);
        console.log(`  Title: ${service.title}`);
        console.log(`  Status: ${service.status}`);
      });
    } else {
      services.forEach(service => {
        console.log(`ID: ${service.id}`);
        console.log(`Name: ${service.name}`);
        console.log(`Title: ${service.title}`);
        console.log(`Status: ${service.status}`);
        console.log(`Description: ${service.description || 'N/A'}`);
        console.log('-'.repeat(60));
      });
      
      const activeServices = services.filter(s => s.status === 'ACTIVE' || s.status === true);
      console.log(`\n✓ Active services: ${activeServices.length}`);
    }
    
  } catch (error) {
    console.error('Error checking KYC services:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

checkKycServices();
