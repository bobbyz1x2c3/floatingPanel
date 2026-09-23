/**
 * 把各平台的更新产物汇总成 Tauri updater 用的 latest.json。
 *
 * 背景：`tauri build` 只会给每个安装包写一份 `<安装包>.sig`，不会生成清单；
 * 而自动更新要求「一个 URL 上有一份包含所有平台的清单」。所以发版流程的最后一步是
 * 把 Release 上的产物下载下来、交给这个脚本汇总，再传回 Release。
 *
 * 用法：
 *   node scripts/make-updater-manifest.mjs --dir <产物目录> --repo <owner/name> --tag <vX.Y.Z> \
 *        [--notes <markdown 文件>] [--out latest.json]
 *
 * 平台键要和 tauri-plugin-updater 的查表顺序对上（先 `{os}-{arch}-{installer}`，再 `{os}-{arch}`）：
 *   windows-x86_64-nsis / windows-x86_64   -> *-setup.exe    （NSIS 安装包本身就是更新包）
 *   windows-x86_64-msi                     -> *.msi          （用 MSI 装的人走这条）
 *   darwin-aarch64 / darwin-x86_64         -> *.app.tar.gz   （两个架构靠文件名区分）
 *   linux-x86_64-appimage / linux-x86_64   -> *.AppImage
 *   linux-x86_64-deb                       -> *.deb
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'

const RULES = [
  { keys: ['windows-x86_64-nsis', 'windows-x86_64'], match: /-setup\.exe$/i },
  // 除 MSI 外，每个矩阵平台都是更新清单的必需项；缺产物或签名不能静默跳过。
  // MSI 只是给人手动下载的备选，它有没有签名不该挡住整份清单。
  { keys: ['windows-x86_64-msi'], match: /\.msi$/i, optional: true },
  { keys: ['darwin-aarch64'], match: /\.app\.tar\.gz$/i, include: /aarch64/i },
  { keys: ['darwin-x86_64'], match: /\.app\.tar\.gz$/i, exclude: /aarch64/i },
  { keys: ['linux-x86_64-appimage', 'linux-x86_64'], match: /\.appimage$/i },
  { keys: ['linux-x86_64-deb'], match: /\.deb$/i },
]

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      args[token.slice(2)] = true
    } else {
      args[token.slice(2)] = next
      index += 1
    }
  }
  return args
}

function fail(message) {
  console.error(`[manifest] ${message}`)
  process.exit(1)
}

/** `.sig` 本体是 base64，解开后能看到受签名保护的 `version:0.3.0` 注释。 */
function signedVersion(signatureBase64) {
  try {
    const text = Buffer.from(signatureBase64.trim(), 'base64').toString('utf8')
    return text.match(/version:([^\s]+)/)?.[1] ?? null
  } catch {
    return null
  }
}

function configVersion() {
  try {
    const config = JSON.parse(readFileSync(resolve('src-tauri/tauri.conf.json'), 'utf8'))
    return String(config.version ?? '')
  } catch {
    return ''
  }
}

const args = parseArgs(process.argv.slice(2))
const dir = args.dir ? resolve(args.dir) : null
const repo = typeof args.repo === 'string' ? args.repo : ''
const tag = typeof args.tag === 'string' ? args.tag : ''
if (!dir || !repo || !tag) fail('缺少参数：--dir / --repo / --tag')

const out = typeof args.out === 'string' ? resolve(args.out) : resolve('latest.json')
const tagVersion = tag.replace(/^v/, '')
const local = configVersion()
if (local && local !== tagVersion) {
  fail(`tauri.conf.json 里是 ${local}，tag 是 ${tag}，两边版本号得一致`)
}
const version = local || tagVersion

const files = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile())
const sigFor = (name) => {
  const sigName = `${name}.sig`
  return files.includes(sigName) ? readFileSync(join(dir, sigName), 'utf8').trim() : null
}

const platforms = {}
let missing = 0

for (const rule of RULES) {
  const candidates = files
    .filter((name) => !name.endsWith('.sig') && rule.match.test(name))
    .filter((name) => !rule.include || rule.include.test(name))
    .filter((name) => !rule.exclude || !rule.exclude.test(name))
    .sort()
  if (candidates.length === 0) {
    if (!rule.optional) {
      console.error(`[manifest] ${rule.keys.join(' / ')} 没有匹配到更新产物`)
      missing += 1
    }
    continue
  }
  if (candidates.length > 1) {
    console.warn(`[manifest] ${rule.keys[0]} 匹配到多个产物，取第一个：${candidates.join('、')}`)
  }
  const name = candidates[0]
  const signature = sigFor(name)
  if (!signature) {
    const hint = '确认 createUpdaterArtifacts 打开、签名密钥配了'
    if (rule.optional) {
      console.warn(`[manifest] ${name} 旁边没有 .sig，跳过这一条（${hint}）`)
      continue
    }
    console.error(`[manifest] ${name} 旁边没有 .sig，跳过（${hint}）`)
    missing += 1
    continue
  }
  const signed = signedVersion(signature)
  if (signed && signed !== version) {
    fail(`${name} 是给 ${signed} 签的名，但这一版是 ${version}`)
  }
  const entry = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`,
  }
  for (const key of rule.keys) platforms[key] = entry
  console.log(`[manifest] ${rule.keys.join(' / ')} <- ${name}${signed ? `（签名版本 ${signed}）` : ''}`)
}

if (Object.keys(platforms).length === 0) fail('一个平台的更新产物都没匹配到')
if (missing > 0) fail(`${missing} 个必需平台缺更新产物或签名，不写清单了`)

const notes = typeof args.notes === 'string' ? readFileSync(resolve(args.notes), 'utf8') : ''
writeFileSync(
  out,
  `${JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2)}\n`,
  'utf8',
)
console.log(`[manifest] 写出 ${basename(out)}：${version}，${Object.keys(platforms).join('、')}`)
