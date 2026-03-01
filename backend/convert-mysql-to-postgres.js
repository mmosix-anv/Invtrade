/**
 * MySQL to PostgreSQL Schema Converter
 * Converts the initial.sql MySQL schema to PostgreSQL compatible syntax
 */

const fs = require('fs');
const path = require('path');

function convertMySQLToPostgreSQL(mysqlSQL) {
  let sql = mysqlSQL;

  // Remove MySQL specific comments and settings
  sql = sql.replace(/\/\*!.*?\*\/;?/gs, '');
  
  // Remove MySQL specific SET commands
  sql = sql.replace(/SET @.*?;/g, '');
  
  // Convert ENGINE=InnoDB to nothing (PostgreSQL doesn't use this)
  sql = sql.replace(/ENGINE=InnoDB/gi, '');
  
  // Convert DEFAULT CHARSET and COLLATE
  sql = sql.replace(/DEFAULT CHARSET=\w+/gi, '');
  sql = sql.replace(/COLLATE=\w+/gi, '');
  sql = sql.replace(/CHARACTER SET \w+/gi, '');
  sql = sql.replace(/COLLATE \w+/gi, '');
  
  // Convert AUTO_INCREMENT to SERIAL
  sql = sql.replace(/`(\w+)` int\(11\) NOT NULL AUTO_INCREMENT/gi, '"$1" SERIAL');
  sql = sql.replace(/`(\w+)` INT NOT NULL AUTO_INCREMENT/gi, '"$1" SERIAL');
  
  // Convert TINYINT(1) to BOOLEAN
  sql = sql.replace(/`(\w+)` tinyint\(1\)/gi, '"$1" BOOLEAN');
  sql = sql.replace(/TINYINT\(1\)/gi, 'BOOLEAN');
  
  // Convert other TINYINT to SMALLINT
  sql = sql.replace(/tinyint\(\d+\)/gi, 'SMALLINT');
  sql = sql.replace(/TINYINT/gi, 'SMALLINT');
  
  // Convert INT to INTEGER
  sql = sql.replace(/`(\w+)` int\((\d+)\)/gi, '"$1" INTEGER');
  sql = sql.replace(/INT\((\d+)\)/gi, 'INTEGER');
  
  // Convert DATETIME to TIMESTAMP
  sql = sql.replace(/datetime\((\d+)\)/gi, 'TIMESTAMP($1)');
  sql = sql.replace(/datetime/gi, 'TIMESTAMP WITH TIME ZONE');
  sql = sql.replace(/DATETIME/gi, 'TIMESTAMP WITH TIME ZONE');
  
  // Convert DOUBLE to DOUBLE PRECISION
  sql = sql.replace(/`(\w+)` double/gi, '"$1" DOUBLE PRECISION');
  sql = sql.replace(/DOUBLE/gi, 'DOUBLE PRECISION');
  
  // Convert LONGTEXT to TEXT
  sql = sql.replace(/longtext/gi, 'TEXT');
  sql = sql.replace(/LONGTEXT/gi, 'TEXT');
  
  // Convert VARCHAR with CHARACTER SET to just VARCHAR
  sql = sql.replace(/varchar\((\d+)\) CHARACTER SET \w+ COLLATE \w+/gi, 'VARCHAR($1)');
  
  // Convert backticks to double quotes for identifiers
  sql = sql.replace(/`([^`]+)`/g, '"$1"');
  
  // Convert ENUM - PostgreSQL uses the same syntax but needs proper quoting
  sql = sql.replace(/enum\((.*?)\)/gi, (match, values) => {
    return `VARCHAR(50) CHECK ("$1" IN (${values}))`;
  });
  
  // Convert UNIQUE KEY to UNIQUE
  sql = sql.replace(/UNIQUE KEY "(\w+)"/gi, 'UNIQUE');
  
  // Convert KEY to INDEX (but remove inline KEY definitions)
  sql = sql.replace(/,\s*KEY "(\w+)" \((.*?)\)( USING \w+)?/gi, '');
  
  // Convert CONSTRAINT foreign keys
  sql = sql.replace(/CONSTRAINT "(\w+)" FOREIGN KEY/gi, 'CONSTRAINT "$1" FOREIGN KEY');
  
  // Convert ON DELETE/UPDATE CASCADE
  sql = sql.replace(/ON DELETE CASCADE ON UPDATE CASCADE/gi, 'ON DELETE CASCADE ON UPDATE CASCADE');
  
  // Remove CHECK (json_valid(...)) - PostgreSQL has native JSONB
  sql = sql.replace(/CHECK \(json_valid\([^)]+\)\)/gi, '');
  
  // Convert COMMENT syntax
  sql = sql.replace(/COMMENT '([^']+)'/gi, '');
  
  // Convert DEFAULT values
  sql = sql.replace(/DEFAULT ''/gi, "DEFAULT ''");
  
  // Convert BIGINT
  sql = sql.replace(/bigint\((\d+)\)/gi, 'BIGINT');
  
  // Convert DECIMAL
  sql = sql.replace(/decimal\((\d+),(\d+)\)/gi, 'DECIMAL($1,$2)');
  
  // Convert FLOAT
  sql = sql.replace(/float/gi, 'REAL');
  
  // Remove PRIMARY KEY from column definition if it's defined separately
  // This is handled case by case
  
  // Convert DROP TABLE IF EXISTS
  sql = sql.replace(/DROP TABLE IF EXISTS "(\w+)";/gi, 'DROP TABLE IF EXISTS "$1" CASCADE;');
  
  // Add IF NOT EXISTS to CREATE TABLE
  sql = sql.replace(/CREATE TABLE "(\w+)"/gi, 'CREATE TABLE IF NOT EXISTS "$1"');
  
  return sql;
}

async function main() {
  try {
    console.log('🔄 Converting MySQL schema to PostgreSQL...\n');
    
    // Read the MySQL schema
    const mysqlPath = path.join(__dirname, '..', 'initial.sql');
    const mysqlSQL = fs.readFileSync(mysqlPath, 'utf8');
    
    console.log('✅ Read MySQL schema file\n');
    
    // Convert to PostgreSQL
    let postgresSQL = convertMySQLToPostgreSQL(mysqlSQL);
    
    // Add PostgreSQL specific header
    const header = `-- PostgreSQL Schema for Supabase
-- Converted from MySQL schema
-- Generated: ${new Date().toISOString()}

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

`;
    
    postgresSQL = header + postgresSQL;
    
    // Write the PostgreSQL schema
    const postgresPath = path.join(__dirname, 'supabase-schema.sql');
    fs.writeFileSync(postgresPath, postgresSQL);
    
    console.log('✅ Converted schema to PostgreSQL\n');
    console.log(`📄 Output file: ${postgresPath}\n`);
    console.log('⚠️  Note: This is an automated conversion. You may need to:');
    console.log('   1. Review ENUM types and convert to proper PostgreSQL ENUMs or CHECK constraints');
    console.log('   2. Review and adjust indexes');
    console.log('   3. Review foreign key constraints');
    console.log('   4. Test the schema before applying to production\n');
    
  } catch (error) {
    console.error('❌ Conversion failed:', error.message);
    process.exit(1);
  }
}

main();
