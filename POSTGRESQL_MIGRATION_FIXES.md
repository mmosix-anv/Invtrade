# PostgreSQL Migration Fixes

This document tracks all MySQL-to-PostgreSQL compatibility fixes applied to the backend.

## Summary

Fixed multiple MySQL-specific SQL syntax issues that were causing errors after migrating to PostgreSQL/Supabase.

## Files Fixed

### 1. Chart Utilities
**File:** `backend/dist/src/utils/chart.js`
- Changed `DATE_FORMAT()` to `TO_CHAR()`
- Updated date format patterns:
  - `%Y-%m-%d %H:00:00` → `YYYY-MM-DD HH24:00:00`
  - `%Y-%m-%d 00:00:00` → `YYYY-MM-DD 00:00:00`

### 2. ICO Creator Performance
**File:** `backend/dist/src/api/(ext)/ico/creator/performance/index.get.js`
- Changed `DATE_FORMAT(icoTransaction.createdAt, '%Y-%m-%d')` to `TO_CHAR("icoTransaction"."createdAt", 'YYYY-MM-DD')`
- Changed `DATE_FORMAT(icoTransaction.createdAt, '%Y-%m-01')` to `TO_CHAR("icoTransaction"."createdAt", 'YYYY-MM-01')`
- Added proper PostgreSQL double-quote escaping for table/column names

### 3. Forex Overview
**File:** `backend/dist/src/api/(ext)/forex/overview/index.get.js`
- Changed `DATE_FORMAT()` to `TO_CHAR()`
- Updated format patterns:
  - `%d` → `DD` (day of month)
  - `%Y-%u` → `IYYY-IW` (ISO year-week)
  - `%b` → `Mon` (abbreviated month)

### 4. Admin Forex Dashboard
**File:** `backend/dist/src/api/(ext)/admin/forex/index.get.js`
- Changed `DATE_FORMAT()` to `TO_CHAR()`
- Updated format patterns:
  - `%d` → `DD` (day of month)
  - `%Y-%u` → `IYYY-IW` (ISO year-week)
  - `%b` → `Mon` (abbreviated month)

### 5. Staking Stats
**File:** `backend/dist/src/api/(ext)/staking/stats/index.get.js`
- Changed MySQL backticks to PostgreSQL double quotes:
  - `` `amount` `` → `"amount"`
  - `` `poolId` `` → `"poolId"`
  - `` `userId` `` → `"userId"`
  - `` `status` `` → `"status"`
  - `` `deletedAt` `` → `"deletedAt"`

### 6. P2P Location
**File:** `backend/dist/src/api/(ext)/p2p/location/index.get.js`
- Changed MySQL JSON functions to PostgreSQL JSON operators:
  - `JSON_UNQUOTE(JSON_EXTRACT(profile, '$.location.country'))` → `profile->>'location.country'`
  - `JSON_EXTRACT(profile, '$.location.country')` → `profile->'location'->'country'`
- Changed table name from `user` to `"user"` (quoted for PostgreSQL)

### 7. P2P Trade Timeout
**File:** `backend/dist/src/api/(ext)/p2p/utils/p2p-trade-timeout.js`
- Changed MySQL JSON functions to PostgreSQL JSON operators:
  - `` JSON_EXTRACT(`amountConfig`, '$.total') `` → `("amountConfig"->>'total')::numeric`
  - Removed MySQL backticks, added PostgreSQL double quotes
  - Changed `CAST(... AS DECIMAL(36,18))` to `::numeric` casting

### 8. P2P Landing
**File:** `backend/dist/src/api/(ext)/p2p/landing/index.get.js`
- Changed MySQL JSON function to PostgreSQL JSON operator:
  - `JSON_EXTRACT(locationSettings, '$.country')` → `"locationSettings"->>'country'`

## MySQL vs PostgreSQL Syntax Reference

### Date Formatting
| MySQL | PostgreSQL |
|-------|-----------|
| `DATE_FORMAT(col, '%Y-%m-%d')` | `TO_CHAR(col, 'YYYY-MM-DD')` |
| `DATE_FORMAT(col, '%Y-%m-%d %H:00:00')` | `TO_CHAR(col, 'YYYY-MM-DD HH24:00:00')` |
| `%d` (day) | `DD` |
| `%b` (month abbr) | `Mon` |
| `%Y-%u` (year-week) | `IYYY-IW` |

### JSON Operations
| MySQL | PostgreSQL |
|-------|-----------|
| `JSON_EXTRACT(col, '$.path')` | `col->'path'` |
| `JSON_UNQUOTE(JSON_EXTRACT(col, '$.path'))` | `col->>'path'` |
| `CAST(JSON_EXTRACT(...) AS DECIMAL)` | `(col->>'path')::numeric` |

### Identifier Quoting
| MySQL | PostgreSQL |
|-------|-----------|
| `` `column_name` `` | `"column_name"` |
| `` `table_name` `` | `"table_name"` |

## Testing Recommendations

1. Test analytics/chart data endpoints with different timeframes
2. Test ICO creator performance charts (daily and monthly)
3. Test Forex overview and admin dashboards
4. Test staking statistics
5. Test P2P location filtering and landing page
6. Test P2P offer expiration logic

## Notes

- All fixes were applied to compiled JavaScript files in `backend/dist/`
- If source TypeScript files exist, they should also be updated to prevent these issues from reappearing after recompilation
- Consider running the `backend/fix-date-format.js` script if more DATE_FORMAT instances are found
