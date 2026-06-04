const fs = require('fs')
const path = require('path')

const REPOSITORY_ROOT = path.resolve(__dirname, '../../../Cerberus-App-Store')
const APPS_ROOT = path.join(REPOSITORY_ROOT, 'apps')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath))
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${content.trimEnd()}\n`)
  }
}

function scaffoldRepository() {
  ensureDir(REPOSITORY_ROOT)
  ensureDir(APPS_ROOT)

  writeFile(
    path.join(REPOSITORY_ROOT, 'README.md'),
    `# Cerberus App Store Repository

This repository is the official Cerberus app store.

## Layout
- \`apps/\` contains one folder per app
- each app folder can include \`data.yml\`, \`README.md\`, and version folders`,
  )

  writeFile(path.join(APPS_ROOT, '.gitkeep'), '')
}

scaffoldRepository()
console.log(`App store repository scaffolded at ${REPOSITORY_ROOT}`)
