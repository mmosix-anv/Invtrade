# Supabase Setup Guide

## Quick Start

### 1. Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - Project name: `bicrypto` (or your preferred name)
   - Database password: (generate a strong password)
   - Region: Choose closest to your users
4. Wait for project to be created (~2 minutes)

### 2. Get Connection Strings

1. Go to Project Settings → Database
2. Copy the following connection strings:

**Connection Pooling (Recommended for Serverless)**
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

**Direct Connection**
```
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

### 3. Get API Keys

1. Go to Project Settings → API
2. Copy:
   - Project URL: `https://[PROJECT-REF].supabase.co`
   - `anon` `public` key
   - `service_role` `secret` key

### 4. Update .env File

```env
# Supabase Database
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"

# Supabase API
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-REF].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

## Database Migration

### Option 1: Export from MySQL and Import to PostgreSQL

#### Step 1: Export MySQL Data

```bash
# Export schema only
mysqldump -u root -p --no-data bicrypto > schema.sql

# Export data only
mysqldump -u root -p --no-create-info bicrypto > data.sql

# Or export everything
mysqldump -u root -p bicrypto > full_backup.sql
```

#### Step 2: Convert MySQL to PostgreSQL

Install pgloader (recommended):

**macOS:**
```bash
brew install pgloader
```

**Ubuntu/Debian:**
```bash
apt-get install pgloader
```

**Windows:**
Use Docker:
```bash
docker run --rm -it dimitri/pgloader:latest pgloader --version
```

#### Step 3: Run Migration

Create a `migration.load` file:

```
LOAD DATABASE
     FROM mysql://root:password@localhost/bicrypto
     INTO postgresql://postgres:password@db.[PROJECT-REF].supabase.co:5432/postgres

WITH include drop, create tables, create indexes, reset sequences

SET maintenance_work_mem to '128MB',
    work_mem to '12MB',
    search_path to 'public'

CAST type datetime to timestamptz
     drop default drop not null using zero-dates-to-null,
     type date drop not null drop default using zero-dates-to-null,
     type tinyint to boolean using tinyint-to-boolean,
     type year to integer

BEFORE LOAD DO
  $$ DROP SCHEMA IF EXISTS public CASCADE; $$,
  $$ CREATE SCHEMA public; $$;
```

Run the migration:
```bash
pgloader migration.load
```

### Option 2: Manual Migration Using Sequelize

#### Step 1: Update Backend Dependencies

```bash
cd backend
pnpm remove mysql2
pnpm add pg pg-hstore
```

#### Step 2: Update Sequelize Config

Replace `config.js` with `config.supabase.js`:
```bash
mv config.js config.mysql.backup.js
mv config.supabase.js config.js
```

#### Step 3: Update Model Data Types

Common conversions needed:

```typescript
// MySQL → PostgreSQL Data Type Conversions

// TINYINT → SMALLINT or BOOLEAN
DataTypes.TINYINT → DataTypes.SMALLINT
DataTypes.TINYINT(1) → DataTypes.BOOLEAN

// DATETIME → TIMESTAMP
DataTypes.DATE → DataTypes.DATE // (same, but behavior differs)

// JSON → JSONB (recommended)
DataTypes.JSON → DataTypes.JSONB

// TEXT types (same)
DataTypes.TEXT → DataTypes.TEXT
DataTypes.STRING → DataTypes.STRING

// DECIMAL (same)
DataTypes.DECIMAL(10, 2) → DataTypes.DECIMAL(10, 2)

// ENUM (same)
DataTypes.ENUM('value1', 'value2') → DataTypes.ENUM('value1', 'value2')
```

#### Step 4: Create Migration Script

Create `backend/migrations/001-mysql-to-postgres.js`:

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add any PostgreSQL-specific schema changes here
    // Example: Convert TINYINT columns to BOOLEAN
    await queryInterface.changeColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Rollback changes if needed
  }
};
```

#### Step 5: Run Migrations

```bash
cd backend
npx sequelize-cli db:migrate --config ./config.js
```

#### Step 6: Seed Database

```bash
npx sequelize-cli db:seed:all --config ./config.js
```

## Supabase Features to Enable

### 1. Row Level Security (RLS)

Enable RLS for sensitive tables:

```sql
-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Users can view own data"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

-- Create policy for updates
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  USING (auth.uid() = id);
```

### 2. Database Functions

Create useful functions in Supabase SQL Editor:

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 3. Indexes

Add indexes for better performance:

```sql
-- Example indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

### 4. Enable Realtime (Optional)

For real-time features:

```sql
-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

## Testing the Connection

Create `backend/test-connection.js`:

```javascript
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: '../.env' });

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connection to Supabase successful!');
    
    // Test query
    const [results] = await sequelize.query('SELECT version()');
    console.log('PostgreSQL version:', results[0].version);
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
  }
}

testConnection();
```

Run test:
```bash
node backend/test-connection.js
```

## Troubleshooting

### Connection Issues

1. **SSL Certificate Error**
   - Ensure `rejectUnauthorized: false` in dialectOptions
   - Check if SSL is required in Supabase settings

2. **Connection Timeout**
   - Verify connection string is correct
   - Check if IP is whitelisted (Supabase allows all by default)
   - Increase pool timeout settings

3. **Too Many Connections**
   - Use connection pooling (port 6543)
   - Reduce pool max size
   - Enable connection pooling in Supabase settings

### Data Type Issues

1. **TINYINT Conversion**
   ```sql
   -- If boolean conversion fails, use SMALLINT
   ALTER TABLE table_name 
   ALTER COLUMN column_name TYPE SMALLINT;
   ```

2. **Date/Time Issues**
   ```sql
   -- Ensure timezone handling
   ALTER TABLE table_name 
   ALTER COLUMN created_at TYPE TIMESTAMPTZ;
   ```

### Performance Issues

1. **Add Indexes**
   ```sql
   CREATE INDEX CONCURRENTLY idx_name ON table_name(column_name);
   ```

2. **Analyze Tables**
   ```sql
   ANALYZE table_name;
   ```

3. **Enable Query Logging**
   - Go to Supabase Dashboard → Logs → Database
   - Monitor slow queries

## Next Steps

1. ✅ Set up Supabase project
2. ✅ Update environment variables
3. ✅ Migrate database schema and data
4. ✅ Test database connection
5. ✅ Update Sequelize models
6. ✅ Run migrations and seeders
7. ✅ Enable RLS and security policies
8. ✅ Add indexes for performance
9. ✅ Test application functionality
10. ✅ Deploy to Vercel

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Sequelize PostgreSQL Guide](https://sequelize.org/docs/v6/other-topics/dialect-specific-things/#postgresql)
- [pgloader Documentation](https://pgloader.readthedocs.io/)
