/*
  把 nemu 命令行拷到 src-tauri/bin/，好让它跟着安装包一起装上。
  安装包里的二进制必须是打包时就躺在 src-tauri 下的文件，所以这一步要在 tauri build 之前跑。
*/
import { copyFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const name = isWindows ? 'nemu.exe' : 'nemu'
const built = join(root, 'src-tauri', 'target', 'release', name)

if (!existsSync(built)) {
  console.error(`找不到 ${built}，先跑 npm run cli:build`)
  process.exit(1)
}

const outDir = join(root, 'src-tauri', 'bin')
mkdirSync(outDir, { recursive: true })
const target = join(outDir, name)
copyFileSync(built, target)
if (!isWindows) chmodSync(target, 0o755)
console.log(`已放入安装包资源：src-tauri/bin/${name}`)
