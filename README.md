# SaaS Starter Template

A modern full-stack SaaS starter template with:

- Next.js 14 (App Router)
- TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS
- Jest & React Testing Library
- ESLint & Prettier
- GitHub Actions CI/CD
- Vercel Deployment
- Error tracking with Sentry
- State management with Zustand

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/yourusername/saas-starter-template.git
cd saas-starter-template
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your values
```

4. Set up the database:

```bash
npx prisma db push
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check types
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Project Structure

```
├── .github/          # GitHub Actions workflows
├── prisma/          # Prisma schema and migrations
├── public/          # Static assets
├── src/
│   ├── app/         # Next.js app router pages
│   ├── components/  # React components
│   │   └── ui/     # Reusable UI components
│   ├── lib/        # Utility functions
│   └── types/      # TypeScript types
├── tests/          # Test files
└── ...config files
```

## Testing

We use Jest and React Testing Library for testing. Run tests with:

```bash
npm test
```

Coverage requirements:

- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

## Deployment

This template is configured for deployment on Vercel. The GitHub Actions workflow will automatically deploy to Vercel when pushing to main/master branch.

Required secrets for GitHub Actions:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on contributing to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
