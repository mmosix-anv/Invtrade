const fs = require('fs');
const path = require('path');

// MySQL to PostgreSQL date format mapping
const formatMap = {
  '%Y-%m-%d': 'YYYY-MM-DD',
  '%Y-%m-01': 'YYYY-MM-01',
  '%Y-%m': 'YYYY-MM',
  '%Y-%u': 'IYYY-IW',
  '%Y': 'YYYY',
  '%y': 'YY',
  '%m': 'MM',
  '%d': 'DD',
  '%H': 'HH24',
  '%i': 'MI',
  '%s': 'SS',
  '%b': 'Mon',
  '%M': 'Month',
  '%u': 'IW',
};

function convertMySQLFormatToPostgres(mysqlFormat) {
  let pgFormat = mysqlFormat;
  
  // Sort by length (longest first) to avoid partial replacements
  const sortedKeys = Object.keys(formatMap).sort((a, b) => b.length - a.length);
  
  for (const mysqlPattern of sortedKeys) {
    pgFormat = pgFormat.replace(new RegExp(mysqlPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), formatMap[mysqlPattern]);
  }
  
  return pgFormat;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.js')) {
      callback(filePath);
    }
  });
}

let totalReplacements = 0;
const apiDir = path.join(__dirname, 'dist', 'src', 'api');

if (!fs.existsSync(apiDir)) {
  console.log('API directory not found:', apiDir);
  process.exit(1);
}

walkDir(apiDir, (file) => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  // Replace DATE_FORMAT with TO_CHAR
  const dateFormatRegex = /\(0,\s*sequelize_1\.fn\)\("DATE_FORMAT",\s*\(0,\s*sequelize_1\.col\)\("([^"]+)"\),\s*"([^"]+)"\)/g;
  
  content = content.replace(dateFormatRegex, (match, colName, mysqlFormat) => {
    const pgFormat = convertMySQLFormatToPostgres(mysqlFormat);
    modified = true;
    totalReplacements++;
    console.log(`  ${path.basename(file)}: DATE_FORMAT(..., "${mysqlFormat}") -> TO_CHAR(..., "${pgFormat}")`);
    return `(0, sequelize_1.fn)("TO_CHAR", (0, sequelize_1.col)("${colName}"), "${pgFormat}")`;
  });
  
  // Also handle sequelize_1.Sequelize.fn variant
  const sequelizeFnRegex = /sequelize_1\.Sequelize\.fn\("DATE_FORMAT",\s*sequelize_1\.Sequelize\.col\("([^"]+)"\),\s*([^)]+)\)/g;
  
  content = content.replace(sequelizeFnRegex, (match, colName, formatVar) => {
    modified = true;
    totalReplacements++;
    console.log(`  ${path.basename(file)}: Sequelize.fn DATE_FORMAT -> TO_CHAR`);
    return `sequelize_1.Sequelize.fn("TO_CHAR", sequelize_1.Sequelize.col("${colName}"), ${formatVar})`;
  });
  
  // Handle literal DATE_FORMAT
  const literalRegex = /\(0,\s*sequelize_1\.literal\)\("DATE_FORMAT\(([^,]+),\s*'([^']+)'\)"\)/g;
  
  content = content.replace(literalRegex, (match, colName, mysqlFormat) => {
    const pgFormat = convertMySQLFormatToPostgres(mysqlFormat);
    modified = true;
    totalReplacements++;
    console.log(`  ${path.basename(file)}: literal DATE_FORMAT(..., '${mysqlFormat}') -> TO_CHAR(..., '${pgFormat}')`);
    return `(0, sequelize_1.literal)("TO_CHAR(${colName}, '${pgFormat}')")`;
  });
  
  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
  }
});

console.log(`\n✓ Total replacements: ${totalReplacements}`);
console.log('✓ All DATE_FORMAT functions converted to TO_CHAR for PostgreSQL');
