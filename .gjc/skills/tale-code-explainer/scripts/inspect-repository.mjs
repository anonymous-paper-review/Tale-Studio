import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const relevantDependencies = [
  'next',
  'react',
  'react-dom',
  'typescript',
  'zustand',
  '@tanstack/react-query',
  '@supabase/ssr',
  '@supabase/supabase-js',
  'zod',
]
const standardPaths = [
  'src/app',
  'src/app/api',
  'src/components',
  'src/lib',
  'src/stores',
  'src/types',
  'supabase/migrations',
  'tests',
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function gitRoot(repositoryPath) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', '--show-toplevel'])
    return stdout.trim()
  } catch {
    throw new Error(`usable Git repository가 아니다: ${repositoryPath}`)
  }
}

async function shortCommit(repositoryPath) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', '--short', 'HEAD'])
    return stdout.trim()
  } catch {
    throw new Error(`Git 커밋을 읽을 수 없다: ${repositoryPath}`)
  }
}

export async function inspectRepository(repositoryPath = process.cwd()) {
  const requestedPath = resolve(repositoryPath)
  const root = await gitRoot(requestedPath)
  const packagePath = resolve(root, 'package.json')

  if (!(await exists(packagePath))) {
    throw new Error(`package.json이 없다: ${root}`)
  }

  let packageJson
  try {
    packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  } catch (error) {
    throw new Error(`package.json을 읽을 수 없다: ${error.message}`)
  }

  if (typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
    throw new Error(`package.json에 유효한 name이 없다: ${packagePath}`)
  }

  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }
  const versions = {}
  for (const name of relevantDependencies) {
    if (typeof dependencies[name] === 'string') versions[name] = dependencies[name]
  }

  const paths = {}
  for (const path of standardPaths) paths[path] = await exists(resolve(root, path))

  return {
    commit: await shortCommit(root),
    package: { name: packageJson.name, versions },
    paths,
  }
}

async function main() {
  try {
    const report = await inspectRepository(process.argv[2] ?? process.cwd())
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`inspect-repository: ${error.message}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
