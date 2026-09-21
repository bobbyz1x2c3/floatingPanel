import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PreviewWindow } from './components/PreviewWindow'
import { previewIdFromSearch } from './lib/preview'

const container = document.getElementById('root')

if (!container) {
  throw new Error('找不到 #root 挂载节点')
}

// 同一个页面入口承担两种窗口：带 ?preview=<id> 就是独立的图片预览窗。
const previewId = previewIdFromSearch(window.location.search)

createRoot(container).render(
  <StrictMode>{previewId ? <PreviewWindow payloadId={previewId} /> : <App />}</StrictMode>,
)
