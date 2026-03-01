#!/bin/bash

# Migration script for converting from MySQL to Supabase PostgreSQL
# This script helps automate the migration process

set -e

echo "🚀 Bicrypto Migration to Supabase + Turborepo"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
    echo -e "${YELLOW}⚠️  Please update .env with your Supabase credentials before continuing${NC}"
    exit 1
fi

# Check for required environment variables
if ! grep -q "DATABASE_URL" .env || ! grep -q "NEXT_PUBLIC_SUPABASE_URL" .env; then
    echo -e "${RED}❌ Missing required Supabase environment variables in .env${NC}"
    echo "Please add:"
    echo "  - DATABASE_URL"
    echo "  - DIRECT_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_URL"
    echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

echo "Step 1: Installing dependencies..."
echo "-----------------------------------"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ pnpm is not installed${NC}"
    echo "Install it with: npm install -g pnpm"
    exit 1
fi

# Install Turborepo
echo "Installing Turborepo..."
pnpm add -D turbo

# Install Supabase client
echo "Installing Supabase client..."
pnpm add @supabase/supabase-js

# Install PostgreSQL driver for backend
echo "Installing PostgreSQL driver..."
cd backend
pnpm add pg pg-hstore
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo "Step 2: Backing up MySQL configuration..."
echo "------------------------------------------"
if [ -f backend/config.js ]; then
    cp backend/config.js backend/config.mysql.backup.js
    echo -e "${GREEN}✓ Backed up to backend/config.mysql.backup.js${NC}"
fi
echo ""

echo "Step 3: Updating database configuration..."
echo "-------------------------------------------"
cp backend/config.supabase.js backend/config.js
echo -e "${GREEN}✓ Updated backend/config.js for PostgreSQL${NC}"
echo ""

echo "Step 4: Testing database connection..."
echo "---------------------------------------"
cat > backend/test-connection.js << 'EOF'
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: '../.env' });

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connection to Supabase successful!');
    const [results] = await sequelize.query('SELECT version()');
    console.log('PostgreSQL version:', results[0].version);
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Unable to connect to database:', error.message);
    process.exit(1);
  }
}

testConnection();
EOF

node backend/test-connection.js
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
    rm backend/test-connection.js
else
    echo -e "${RED}❌ Database connection failed${NC}"
    echo "Please check your DATABASE_URL in .env"
    exit 1
fi
echo ""

echo "Step 5: Migration options..."
echo "----------------------------"
echo "Choose how to migrate your data:"
echo "1) Export MySQL data and import manually"
echo "2) Use pgloader (recommended if installed)"
echo "3) Skip data migration (I'll do it manually)"
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo "Exporting MySQL data..."
        if command -v mysqldump &> /dev/null; then
            read -p "MySQL username: " mysql_user
            read -p "MySQL database name: " mysql_db
            mysqldump -u $mysql_user -p --no-create-info $mysql_db > mysql_data_export.sql
            echo -e "${GREEN}✓ Data exported to mysql_data_export.sql${NC}"
            echo "You'll need to convert this to PostgreSQL format and import manually"
        else
            echo -e "${RED}❌ mysqldump not found${NC}"
        fi
        ;;
    2)
        if command -v pgloader &> /dev/null; then
            echo "Creating pgloader configuration..."
            read -p "MySQL connection string (mysql://user:pass@host/db): " mysql_conn
            cat > migration.load << EOF
LOAD DATABASE
     FROM $mysql_conn
     INTO \${DATABASE_URL}

WITH include drop, create tables, create indexes, reset sequences

SET maintenance_work_mem to '128MB',
    work_mem to '12MB'

CAST type datetime to timestamptz
     drop default drop not null using zero-dates-to-null,
     type date drop not null drop default using zero-dates-to-null,
     type tinyint to boolean using tinyint-to-boolean,
     type year to integer;
EOF
            echo -e "${GREEN}✓ Created migration.load${NC}"
            echo "Run: pgloader migration.load"
        else
            echo -e "${RED}❌ pgloader not found${NC}"
            echo "Install it with: brew install pgloader (macOS) or apt-get install pgloader (Linux)"
        fi
        ;;
    3)
        echo "Skipping data migration..."
        ;;
esac
echo ""

echo "Step 6: Finalizing setup..."
echo "---------------------------"
cd ..

# Create workspace file if it doesn't exist
if [ ! -f pnpm-workspace.yaml ]; then
    echo "Creating pnpm-workspace.yaml..."
    cat > pnpm-workspace.yaml << EOF
packages:
  - 'frontend'
  - 'backend'
  - 'tools/*'
EOF
    echo -e "${GREEN}✓ Created pnpm-workspace.yaml${NC}"
fi

echo ""
echo -e "${GREEN}✅ Migration setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review and update Sequelize models for PostgreSQL data types"
echo "2. Run migrations: cd backend && npx sequelize-cli db:migrate"
echo "3. Run seeders: cd backend && npx sequelize-cli db:seed:all"
echo "4. Test the application: pnpm turbo dev"
echo "5. Deploy to Vercel: vercel --prod"
echo ""
echo "📚 Documentation:"
echo "  - MIGRATION_GUIDE.md - Complete migration guide"
echo "  - SUPABASE_SETUP.md - Supabase configuration"
echo "  - TURBOREPO_SETUP.md - Turborepo usage"
echo "  - VERCEL_DEPLOYMENT.md - Deployment guide"
echo ""
