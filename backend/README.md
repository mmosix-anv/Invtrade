# Backend

This is the backend API built with Node.js, TypeScript, and Express.

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- npm or pnpm
- PostgreSQL or MySQL database

### Installation

```bash
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

### Build

Build for production:

```bash
npm run build
```

### Start Production Server

```bash
npm start
```

Or for Render deployment:

```bash
npm run start:render
```

### Database

Run database seeders:

```bash
npm run seed
```

### Other Commands

- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run bundle` - Build and bundle for production

## Environment Variables

Copy `.env.example` to `.env` and configure the required environment variables including database connection details.

## Independent Operation

This backend can now run completely independently from the frontend. It exposes REST APIs that can be consumed by any client application.
