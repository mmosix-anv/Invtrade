const { Sequelize } = require('sequelize');
require('dotenv').config();

// Database configuration
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    },
    logging: false,
  }
);

async function seedInvestmentPlans() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established');

    // Import and run the seeder
    const seeder = require('./seeders/20240403000507-investment-plans.js');
    
    console.log('🔄 Seeding investment plans and durations...');
    await seeder.up(sequelize.getQueryInterface(), Sequelize);
    
    console.log('✓ Investment plans seeded successfully!');
    
    // Verify the data
    const [plans] = await sequelize.query('SELECT COUNT(*) as count FROM investment_plan');
    const [durations] = await sequelize.query('SELECT COUNT(*) as count FROM investment_duration');
    const [planDurations] = await sequelize.query('SELECT COUNT(*) as count FROM investment_plan_duration');
    
    console.log(`\n📊 Summary:`);
    console.log(`   - Investment Plans: ${plans[0].count}`);
    console.log(`   - Investment Durations: ${durations[0].count}`);
    console.log(`   - Plan-Duration Links: ${planDurations[0].count}`);
    
  } catch (error) {
    console.error('✗ Error seeding investment plans:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('\n✓ Database connection closed');
  }
}

// Run the seeder
seedInvestmentPlans();
