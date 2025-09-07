# SaaS Starter Template

A modern full-stack SaaS starter template with:

- Next.js 14 (App Router)
- TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS
- Jest & React Testing Library
- ESLint & TypeScript
- GitHub Actions CI/CD
- Vercel Deployment

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

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Check types
- `npm test` - Run tests

## Deployment

This template is configured for deployment on Vercel. The GitHub Actions workflow will automatically deploy to Vercel when pushing to main/master branch.

Required secrets for GitHub Actions:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Directory Structure

```
├── .github/          # GitHub Actions workflows
├── prisma/          # Prisma schema and migrations
├── public/          # Static assets
├── src/
│   ├── app/         # Next.js app router
│   ├── components/  # React components
│   ├── lib/         # Utility functions
│   └── types/       # TypeScript types
├── tests/           # Test files
└── ...config files
```