import { mkdir, stat } from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'
import archiver from 'archiver'

interface TierConfig {
  name: string
  extras: string[]
}

const BASE_FILES = [
  'src',
  'public',
  'package.json',
  'package-lock.json',
  'README.md',
  'docs',
  '.env.example',
  'prisma',
  'next.config.js',
  'tsconfig.json',
]

const TIERS: Record<string, TierConfig> = {
  basic: {
    name: 'basic',
    extras: [],
  },
  pro: {
    name: 'pro',
    extras: ['scripts/deploy', 'docs/video-tutorials'],
  },
  enterprise: {
    name: 'enterprise',
    extras: [
      'scripts/deploy',
      'docs/video-tutorials',
      'scripts/enterprise-setup',
      'docs/custom-integrations',
    ],
  },
}

async function ensureExists(resource: string) {
  try {
    await stat(resource)
    return true
  } catch {
    return false
  }
}

async function createArchive(tier: TierConfig, format: 'zip' | 'tar') {
  const templateRoot =
    process.env.TEMPLATE_FILES_PATH || path.resolve(process.cwd(), 'template-files')
  const version = process.env.TEMPLATE_VERSION || '1.0.0'
  const outputDir = path.join(templateRoot, tier.name)
  await mkdir(outputDir, { recursive: true })

  const fileName = `saas-starter-${tier.name}-v${version}.${format}`
  const outputPath = path.join(outputDir, fileName)
  const output = createWriteStream(outputPath)
  const archive = archiver(format, format === 'tar' ? { gzip: true } : undefined)

  archive.pipe(output)

  const filesToInclude = new Set([...BASE_FILES, ...tier.extras])

  for (const item of filesToInclude) {
    if (await ensureExists(item)) {
      archive.directory(item, item)
    } else {
      console.warn(`[template:package] Skipping missing resource: ${item}`)
    }
  }

  await archive.finalize()
  console.log(`[template:package] Wrote ${outputPath}`)
}

async function run() {
  for (const tier of Object.values(TIERS)) {
    await createArchive(tier, 'zip')
    await createArchive(tier, 'tar')
  }
}

run().catch((error) => {
  console.error('[template:package] Failed to package template assets', error)
  process.exitCode = 1
})
