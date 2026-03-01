require('dotenv').config({ path: '../.env' });
require('./dist/module-alias-setup');
const { models } = require('./dist/src/db');

console.log('Available models:', Object.keys(models));
console.log('Settings model:', models.settings ? 'EXISTS' : 'UNDEFINED');

if (models.settings) {
  console.log('Settings model name:', models.settings.name);
  console.log('Settings table name:', models.settings.tableName);
}

process.exit(0);
