const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
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

// Load all models
const modelsPath = path.join(__dirname, 'dist', 'models');

function loadModels(dir, models = {}) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      loadModels(filePath, models);
    } else if (file.endsWith('.js') && file !== 'init.js') {
      try {
        const model = require(filePath);
        if (model.default && typeof model.default.initModel === 'function') {
          const initializedModel = model.default.initModel(sequelize);
          models[initializedModel.tableName] = initializedModel;
        }
      } catch (err) {
        // Skip files that can't be loaded
      }
    }
  });
  
  return models;
}

async function verifyAllSchemas() {
  try {
    console.log('Loading all models...\n');
    const models = loadModels(modelsPath);
    
    console.log(`Found ${Object.keys(models).length} models\n`);
    console.log('='.repeat(80));
    
    // Get all tables from database
    const [tables] = await sequelize.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    const dbTables = tables.map(t => t.table_name);
    
    let totalIssues = 0;
    const issuesByTable = {};
    
    for (const [tableName, model] of Object.entries(models)) {
      const issues = [];
      
      // Check if table exists
      if (!dbTables.includes(tableName)) {
        issues.push(`✗ TABLE MISSING: ${tableName}`);
        totalIssues++;
        continue;
      }
      
      // Get columns from database
      const [dbColumns] = await sequelize.query(`
        SELECT 
          column_name, 
          data_type, 
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position;
      `);
      
      const dbColumnNames = dbColumns.map(c => c.column_name);
      
      // Get columns from model
      const modelAttributes = model.rawAttributes;
      const modelColumnNames = Object.keys(modelAttributes);
      
      // Check for missing columns
      for (const colName of modelColumnNames) {
        const attr = modelAttributes[colName];
        const fieldName = attr.field || colName;
        
        if (!dbColumnNames.includes(fieldName)) {
          issues.push(`  ✗ Missing column: ${fieldName} (${colName})`);
          totalIssues++;
        }
      }
      
      // Check for extra columns in database
      const expectedFields = modelColumnNames.map(col => {
        const attr = modelAttributes[col];
        return attr.field || col;
      });
      
      for (const dbCol of dbColumnNames) {
        if (!expectedFields.includes(dbCol)) {
          issues.push(`  ⚠ Extra column in DB: ${dbCol} (not in model)`);
        }
      }
      
      if (issues.length > 0) {
        issuesByTable[tableName] = issues;
        console.log(`\n❌ ${tableName}`);
        issues.forEach(issue => console.log(issue));
      } else {
        console.log(`✓ ${tableName} (${modelColumnNames.length} columns)`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\nSUMMARY:');
    console.log(`Total tables checked: ${Object.keys(models).length}`);
    console.log(`Tables with issues: ${Object.keys(issuesByTable).length}`);
    console.log(`Total issues found: ${totalIssues}`);
    
    if (totalIssues > 0) {
      console.log('\n⚠ ISSUES FOUND - Review the output above');
      
      // Generate fix suggestions
      console.log('\n' + '='.repeat(80));
      console.log('FIX SUGGESTIONS:');
      console.log('='.repeat(80));
      
      for (const [tableName, issues] of Object.entries(issuesByTable)) {
        const missingCols = issues.filter(i => i.includes('Missing column'));
        if (missingCols.length > 0) {
          console.log(`\n-- Fix ${tableName}:`);
          missingCols.forEach(issue => {
            const match = issue.match(/Missing column: (\w+)/);
            if (match) {
              const colName = match[1];
              const model = models[tableName];
              const attr = model.rawAttributes[colName] || 
                           Object.values(model.rawAttributes).find(a => a.field === colName);
              
              if (attr) {
                let sqlType = 'TEXT';
                if (attr.type instanceof DataTypes.UUID) sqlType = 'UUID';
                else if (attr.type instanceof DataTypes.STRING) sqlType = `VARCHAR(${attr.type._length || 255})`;
                else if (attr.type instanceof DataTypes.TEXT) sqlType = 'TEXT';
                else if (attr.type instanceof DataTypes.INTEGER) sqlType = 'INTEGER';
                else if (attr.type instanceof DataTypes.BOOLEAN) sqlType = 'BOOLEAN';
                else if (attr.type instanceof DataTypes.DATE) sqlType = 'TIMESTAMP WITH TIME ZONE';
                else if (attr.type instanceof DataTypes.DOUBLE) sqlType = 'DOUBLE PRECISION';
                else if (attr.type instanceof DataTypes.DECIMAL) sqlType = 'DECIMAL';
                else if (attr.type instanceof DataTypes.JSON || attr.type instanceof DataTypes.JSONB) sqlType = 'JSONB';
                else if (attr.type instanceof DataTypes.ENUM) sqlType = `VARCHAR(50)`;
                
                const nullable = attr.allowNull !== false ? 'NULL' : 'NOT NULL';
                const defaultVal = attr.defaultValue ? ` DEFAULT ${attr.defaultValue}` : '';
                
                console.log(`ALTER TABLE ${tableName} ADD COLUMN "${colName}" ${sqlType} ${nullable}${defaultVal};`);
              }
            }
          });
        }
      }
    } else {
      console.log('\n✓ All models match database schema perfectly!');
    }
    
  } catch (error) {
    console.error('Error verifying schemas:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

verifyAllSchemas();
