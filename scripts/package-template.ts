import { mkdir, stat } from 'fs/promises'
import { createWriteStream, type Stats } from 'fs'
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
  '.husky',
  'scripts',
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

async function statOrNull(resource: string): Promise<Stats | null> {
  try {
    return await stat(resource)
  } catch {
    return null
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
    const info = await statOrNull(item)
    if (!info) {
      console.warn(`[template:package] Skipping missing resource: ${item}`)
    } else if (info.isDirectory()) {
      archive.directory(item, item)
    } else {
      archive.file(item, { name: item })
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
