const { Sequelize } = require('sequelize');
require('dotenv').config();

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

async function verifyInvestmentPlans() {
  try {
    await sequelize.authenticate();
    
    console.log('📋 Investment Plans:\n');
    const [plans] = await sequelize.query(`
      SELECT 
        name, 
        title, 
        currency, 
        "minAmount", 
        "maxAmount", 
        "profitPercentage",
        trending,
        status
      FROM investment_plan 
      ORDER BY "minAmount"
    `);
    
    plans.forEach(plan => {
      console.log(`  ${plan.trending ? '⭐' : '  '} ${plan.title}`);
      console.log(`     Name: ${plan.name}`);
      console.log(`     Amount: ${plan.minAmount} - ${plan.maxAmount} ${plan.currency}`);
      console.log(`     Profit: ${plan.profitPercentage}%`);
      console.log(`     Status: ${plan.status ? '✓ Active' : '✗ Inactive'}`);
      console.log('');
    });
    
    console.log('\n⏱️  Investment Durations:\n');
    const [durations] = await sequelize.query(`
      SELECT duration, timeframe
      FROM investment_duration 
      ORDER BY 
        CASE timeframe 
          WHEN 'DAY' THEN 1 
          WHEN 'WEEK' THEN 2 
          WHEN 'MONTH' THEN 3 
        END,
        duration
    `);
    
    durations.forEach(d => {
      console.log(`  • ${d.duration} ${d.timeframe}${d.duration > 1 ? 'S' : ''}`);
    });
    
    console.log('\n🔗 Plan-Duration Relationships:\n');
    const [relationships] = await sequelize.query(`
      SELECT 
        p.name as plan_name,
        p.title as plan_title,
        d.duration,
        d.timeframe
      FROM investment_plan_duration pd
      JOIN investment_plan p ON pd."planId" = p.id
      JOIN investment_duration d ON pd."durationId" = d.id
      ORDER BY p."minAmount", 
        CASE d.timeframe 
          WHEN 'DAY' THEN 1 
          WHEN 'WEEK' THEN 2 
          WHEN 'MONTH' THEN 3 
        END,
        d.duration
    `);
    
    let currentPlan = '';
    relationships.forEach(rel => {
      if (rel.plan_name !== currentPlan) {
        currentPlan = rel.plan_name;
        console.log(`  ${rel.plan_title}:`);
      }
      console.log(`    - ${rel.duration} ${rel.timeframe}${rel.duration > 1 ? 'S' : ''}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

verifyInvestmentPlans();
