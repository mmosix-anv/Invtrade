# Turborepo Setup Guide

## What is Turborepo?

Turborepo is a high-performance build system for JavaScript and TypeScript monorepos. It provides:
- Fast, incremental builds
- Smart caching
- Parallel task execution
- Remote caching (optional)

## Installation

### 1. Install Turborepo

```bash
pnpm add -D turbo
```

### 2. Verify Installation

```bash
npx turbo --version
```

## Configuration

The `turbo.json` file has been created with optimized settings for your project:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

## Workspace Structure

Your monorepo structure:

```
bicrypto/
├── frontend/          # Next.js application
├── backend/           # Node.js API
├── tools/             # Shared tools
├── turbo.json         # Turborepo configuration
├── pnpm-workspace.yaml # PNPM workspace configuration
└── package.json       # Root package.json
```

## Available Commands

### Development

```bash
# Run all packages in dev mode
pnpm turbo dev

# Run specific package
pnpm turbo dev --filter=frontend
pnpm turbo dev --filter=backend

# Or use the shortcuts
pnpm dev:frontend
pnpm dev:backend
```

### Building

```bash
# Build all packages
pnpm turbo build

# Build specific package
pnpm turbo build --filter=frontend
pnpm turbo build --filter=backend

# Build with dependencies
pnpm turbo build --filter=frontend...
```

### Testing

```bash
# Run all tests
pnpm turbo test

# Run tests for specific package
pnpm turbo test --filter=backend

# Run tests with coverage
pnpm turbo test:coverage
```

### Linting

```bash
# Lint all packages
pnpm turbo lint

# Lint specific package
pnpm turbo lint --filter=frontend
```

## Turborepo Features

### 1. Caching

Turborepo caches task outputs to speed up subsequent runs:

```bash
# First run (no cache)
pnpm turbo build
# ✓ Built in 45s

# Second run (with cache)
pnpm turbo build
# ✓ Built in 0.2s (cached)
```

Clear cache:
```bash
pnpm turbo build --force
```

### 2. Parallel Execution

Turborepo runs tasks in parallel when possible:

```bash
# Runs frontend and backend builds in parallel
pnpm turbo build
```

### 3. Dependency Graph

View your task dependency graph:

```bash
npx turbo run build --graph
```

This generates a visual graph showing task dependencies.

### 4. Filtering

Run tasks for specific packages:

```bash
# Run only for frontend
pnpm turbo build --filter=frontend

# Run for frontend and its dependencies
pnpm turbo build --filter=frontend...

# Run for packages that depend on backend
pnpm turbo build --filter=...backend
```

### 5. Watch Mode

Run tasks in watch mode:

```bash
pnpm turbo dev --filter=frontend --watch
```

## Remote Caching (Optional)

Enable remote caching to share cache across team members:

### 1. Sign up for Vercel

```bash
npx turbo login
```

### 2. Link Repository

```bash
npx turbo link
```

### 3. Enable Remote Caching

Update `turbo.json`:

```json
{
  "remoteCache": {
    "enabled": true
  }
}
```

Now your team shares build cache!

## Environment Variables

Turborepo automatically handles environment variables:

### Global Variables

Add to `turbo.json`:

```json
{
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL"
  ]
}
```

### Task-Specific Variables

```json
{
  "tasks": {
    "build": {
      "env": [
        "NEXT_PUBLIC_API_URL",
        "SUPABASE_URL"
      ]
    }
  }
}
```

## Performance Tips

### 1. Optimize Task Dependencies

Only depend on what you need:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"]  // Only wait for dependencies
    }
  }
}
```

### 2. Use Outputs Correctly

Specify exact output directories:

```json
{
  "tasks": {
    "build": {
      "outputs": [
        ".next/**",
        "!.next/cache/**",  // Exclude cache
        "dist/**"
      ]
    }
  }
}
```

### 3. Disable Cache for Dev

Development tasks shouldn't be cached:

```json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### 4. Parallel Execution

Increase parallel tasks:

```bash
pnpm turbo build --concurrency=10
```

## CI/CD Integration

### GitHub Actions

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm turbo build
      
      - name: Test
        run: pnpm turbo test
      
      - name: Lint
        run: pnpm turbo lint
```

### Vercel

Vercel automatically detects Turborepo:

1. Connect your repository
2. Vercel will use `turbo.json` configuration
3. Set environment variables in Vercel dashboard
4. Deploy!

## Troubleshooting

### Cache Issues

Clear Turborepo cache:
```bash
rm -rf .turbo
pnpm turbo build --force
```

### Dependency Issues

Rebuild dependency graph:
```bash
pnpm install
pnpm turbo build --force
```

### Performance Issues

Profile your build:
```bash
pnpm turbo build --profile=profile.json
```

View profile:
```bash
npx turbo-profile profile.json
```

## Migration from Existing Setup

Your project has been migrated from:

### Before (Concurrently)
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter frontend dev\" \"pnpm --filter backend dev\""
  }
}
```

### After (Turborepo)
```json
{
  "scripts": {
    "dev": "turbo dev"
  }
}
```

Benefits:
- ✅ Faster builds with caching
- ✅ Better dependency management
- ✅ Parallel execution
- ✅ Remote caching support
- ✅ Better CI/CD integration

## Advanced Configuration

### Custom Task Pipelines

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build", "codegen"],
      "outputs": [".next/**", "dist/**"]
    },
    "codegen": {
      "outputs": ["generated/**"]
    },
    "deploy": {
      "dependsOn": ["build", "test"],
      "cache": false
    }
  }
}
```

### Environment-Specific Configs

Create `turbo.production.json`:

```json
{
  "extends": ["//turbo.json"],
  "tasks": {
    "build": {
      "env": ["NODE_ENV=production"]
    }
  }
}
```

Use it:
```bash
pnpm turbo build --config=turbo.production.json
```

## Best Practices

1. **Keep tasks granular**: Break large tasks into smaller ones
2. **Use caching wisely**: Cache build outputs, not dev tasks
3. **Specify outputs**: Always define what files are generated
4. **Minimize dependencies**: Only depend on what you need
5. **Use filters**: Run only what changed
6. **Enable remote cache**: Share cache with team
7. **Monitor performance**: Use profiling to optimize

## Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Turborepo Examples](https://github.com/vercel/turbo/tree/main/examples)
- [Turborepo Discord](https://turbo.build/discord)
- [Vercel Turborepo Guide](https://vercel.com/docs/monorepos/turborepo)

## Next Steps

1. ✅ Install Turborepo
2. ✅ Configure turbo.json
3. ✅ Update package.json scripts
4. ✅ Test local development
5. ✅ Set up remote caching (optional)
6. ✅ Configure CI/CD
7. ✅ Deploy to Vercel
