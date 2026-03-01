'use strict';

const { v4: uuidv4 } = require('uuid');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // First, create investment durations
      const durations = [
        {
          id: uuidv4(),
          duration: 1,
          timeframe: 'DAY',
        },
        {
          id: uuidv4(),
          duration: 7,
          timeframe: 'DAY',
        },
        {
          id: uuidv4(),
          duration: 14,
          timeframe: 'DAY',
        },
        {
          id: uuidv4(),
          duration: 1,
          timeframe: 'MONTH',
        },
        {
          id: uuidv4(),
          duration: 3,
          timeframe: 'MONTH',
        },
        {
          id: uuidv4(),
          duration: 6,
          timeframe: 'MONTH',
        },
        {
          id: uuidv4(),
          duration: 12,
          timeframe: 'MONTH',
        },
      ];

      await queryInterface.bulkInsert('investment_duration', durations, { transaction });

      // Create investment plans
      const plans = [
        {
          id: uuidv4(),
          name: 'starter',
          title: 'Starter Plan',
          image: '/img/investment/starter.png',
          description: 'Perfect for beginners looking to start their investment journey with minimal risk.',
          currency: 'USDT',
          walletType: 'SPOT',
          minAmount: 100,
          maxAmount: 1000,
          profitPercentage: 5,
          invested: 0,
          minProfit: 5,
          maxProfit: 50,
          defaultProfit: 25,
          defaultResult: 'WIN',
          trending: false,
          status: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          name: 'basic',
          title: 'Basic Plan',
          image: '/img/investment/basic.png',
          description: 'A balanced plan offering steady returns with moderate risk for growing investors.',
          currency: 'USDT',
          walletType: 'SPOT',
          minAmount: 1000,
          maxAmount: 5000,
          profitPercentage: 8,
          invested: 0,
          minProfit: 80,
          maxProfit: 400,
          defaultProfit: 200,
          defaultResult: 'WIN',
          trending: true,
          status: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          name: 'premium',
          title: 'Premium Plan',
          image: '/img/investment/premium.png',
          description: 'Enhanced returns for experienced investors seeking higher profit potential.',
          currency: 'USDT',
          walletType: 'SPOT',
          minAmount: 5000,
          maxAmount: 25000,
          profitPercentage: 12,
          invested: 0,
          minProfit: 600,
          maxProfit: 3000,
          defaultProfit: 1500,
          defaultResult: 'WIN',
          trending: true,
          status: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          name: 'professional',
          title: 'Professional Plan',
          image: '/img/investment/professional.png',
          description: 'Advanced investment strategy designed for serious investors with substantial capital.',
          currency: 'USDT',
          walletType: 'SPOT',
          minAmount: 25000,
          maxAmount: 100000,
          profitPercentage: 15,
          invested: 0,
          minProfit: 3750,
          maxProfit: 15000,
          defaultProfit: 7500,
          defaultResult: 'WIN',
          trending: false,
          status: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv4(),
          name: 'vip',
          title: 'VIP Plan',
          image: '/img/investment/vip.png',
          description: 'Exclusive plan with premium benefits and maximum returns for elite investors.',
          currency: 'USDT',
          walletType: 'SPOT',
          minAmount: 100000,
          maxAmount: 1000000,
          profitPercentage: 20,
          invested: 0,
          minProfit: 20000,
          maxProfit: 200000,
          defaultProfit: 100000,
          defaultResult: 'WIN',
          trending: true,
          status: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await queryInterface.bulkInsert('investment_plan', plans, { transaction });

      // Create plan-duration relationships
      const planDurations = [];
      
      // Starter plan: 1 day, 7 days, 14 days
      planDurations.push(
        { id: uuidv4(), planId: plans[0].id, durationId: durations[0].id },
        { id: uuidv4(), planId: plans[0].id, durationId: durations[1].id },
        { id: uuidv4(), planId: plans[0].id, durationId: durations[2].id }
      );

      // Basic plan: 7 days, 14 days, 1 month
      planDurations.push(
        { id: uuidv4(), planId: plans[1].id, durationId: durations[1].id },
        { id: uuidv4(), planId: plans[1].id, durationId: durations[2].id },
        { id: uuidv4(), planId: plans[1].id, durationId: durations[3].id }
      );

      // Premium plan: 14 days, 1 month, 3 months
      planDurations.push(
        { id: uuidv4(), planId: plans[2].id, durationId: durations[2].id },
        { id: uuidv4(), planId: plans[2].id, durationId: durations[3].id },
        { id: uuidv4(), planId: plans[2].id, durationId: durations[4].id }
      );

      // Professional plan: 1 month, 3 months, 6 months
      planDurations.push(
        { id: uuidv4(), planId: plans[3].id, durationId: durations[3].id },
        { id: uuidv4(), planId: plans[3].id, durationId: durations[4].id },
        { id: uuidv4(), planId: plans[3].id, durationId: durations[5].id }
      );

      // VIP plan: 3 months, 6 months, 12 months
      planDurations.push(
        { id: uuidv4(), planId: plans[4].id, durationId: durations[4].id },
        { id: uuidv4(), planId: plans[4].id, durationId: durations[5].id },
        { id: uuidv4(), planId: plans[4].id, durationId: durations[6].id }
      );

      await queryInterface.bulkInsert('investment_plan_duration', planDurations, { transaction });

      await transaction.commit();
      console.log('✓ Investment plans and durations seeded successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('✗ Error seeding investment plans:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.bulkDelete('investment_plan_duration', null, { transaction });
      await queryInterface.bulkDelete('investment_plan', null, { transaction });
      await queryInterface.bulkDelete('investment_duration', null, { transaction });
      
      await transaction.commit();
      console.log('✓ Investment plans and durations removed successfully');
    } catch (error) {
      await transaction.rollback();
      console.error('✗ Error removing investment plans:', error);
      throw error;
    }
  }
};
