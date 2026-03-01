# PowerShell migration script for Windows
# Migration script for converting from MySQL to Supabase PostgreSQL

$ErrorActionPreference = "Stop"

Write-Host "🚀 Bicrypto Migration to Supabase + Turborepo" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  No .env file found. Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✓ Created .env file" -ForegroundColor Green
    Write-Host "⚠️  Please update .env with your Supabase credentials before continuing" -ForegroundColor Yellow
    exit 1
}

# Check for required environment variables
$envContent = Get-Content .env -Raw
if (-not ($envContent -match "DATABASE_URL") -or -not ($envContent -match "NEXT_PUBLIC_SUPABASE_URL")) {
    Write-Host "❌ Missing required Supabase environment variables in .env" -ForegroundColor Red
    Write-Host "Please add:"
    Write-Host "  - DATABASE_URL"
    Write-Host "  - DIRECT_URL"
    Write-Host "  - NEXT_PUBLIC_SUPABASE_URL"
    Write-Host "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
    Write-Host "  - SUPABASE_SERVICE_ROLE_KEY"
    exit 1
}

Write-Host "Step 1: Installing dependencies..." -ForegroundColor Cyan
Write-Host "-----------------------------------"

# Check if pnpm is installed
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pnpm is not installed" -ForegroundColor Red
    Write-Host "Install it with: npm install -g pnpm"
    exit 1
}

# Install Turborepo
Write-Host "Installing Turborepo..."
pnpm add -D turbo

# Install Supabase client
Write-Host "Installing Supabase client..."
pnpm add @supabase/supabase-js

# Install PostgreSQL driver for backend
Write-Host "Installing PostgreSQL driver..."
Set-Location backend
pnpm add pg pg-hstore
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

Write-Host "Step 2: Backing up MySQL configuration..." -ForegroundColor Cyan
Write-Host "------------------------------------------"
if (Test-Path backend/config.js) {
    Copy-Item backend/config.js backend/config.mysql.backup.js
    Write-Host "✓ Backed up to backend/config.mysql.backup.js" -ForegroundColor Green
}
Write-Host ""

Write-Host "Step 3: Updating database configuration..." -ForegroundColor Cyan
Write-Host "-------------------------------------------"
Copy-Item backend/config.supabase.js backend/config.js -Force
Write-Host "✓ Updated backend/config.js for PostgreSQL" -ForegroundColor Green
Write-Host ""

Write-Host "Step 4: Testing database connection..." -ForegroundColor Cyan
Write-Host "---------------------------------------"

$testScript = @'
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
'@

Set-Content -Path backend/test-connection.js -Value $testScript

node backend/test-connection.js
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database connection successful" -ForegroundColor Green
    Remove-Item backend/test-connection.js
} else {
    Write-Host "❌ Database connection failed" -ForegroundColor Red
    Write-Host "Please check your DATABASE_URL in .env"
    exit 1
}
Write-Host ""

Write-Host "Step 5: Migration options..." -ForegroundColor Cyan
Write-Host "----------------------------"
Write-Host "Choose how to migrate your data:"
Write-Host "1) Export MySQL data and import manually"
Write-Host "2) Skip data migration (I'll do it manually)"
$choice = Read-Host "Enter choice [1-2]"

switch ($choice) {
    "1" {
        Write-Host "For MySQL export, please use mysqldump manually:"
        Write-Host "mysqldump -u root -p --no-create-info bicrypto > mysql_data_export.sql"
        Write-Host "Then convert to PostgreSQL format and import to Supabase"
    }
    "2" {
        Write-Host "Skipping data migration..."
    }
}
Write-Host ""

Write-Host "Step 6: Finalizing setup..." -ForegroundColor Cyan
Write-Host "---------------------------"
Set-Location ..

# Create workspace file if it doesn't exist
if (-not (Test-Path pnpm-workspace.yaml)) {
    Write-Host "Creating pnpm-workspace.yaml..."
    $workspaceContent = @"
packages:
  - 'frontend'
  - 'backend'
  - 'tools/*'
"@
    Set-Content -Path pnpm-workspace.yaml -Value $workspaceContent
    Write-Host "✓ Created pnpm-workspace.yaml" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Migration setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Review and update Sequelize models for PostgreSQL data types"
Write-Host "2. Run migrations: cd backend; npx sequelize-cli db:migrate"
Write-Host "3. Run seeders: cd backend; npx sequelize-cli db:seed:all"
Write-Host "4. Test the application: pnpm turbo dev"
Write-Host "5. Deploy to Vercel: vercel --prod"
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "  - MIGRATION_GUIDE.md - Complete migration guide"
Write-Host "  - SUPABASE_SETUP.md - Supabase configuration"
Write-Host "  - TURBOREPO_SETUP.md - Turborepo usage"
Write-Host "  - VERCEL_DEPLOYMENT.md - Deployment guide"
Write-Host ""
