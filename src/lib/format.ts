export function formatRelative(timestamp: number, now: number): string {
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚更新'
  if (minutes < 60) return `${minutes} 分钟前更新`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前更新`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前更新`
  return `${new Date(timestamp).toLocaleDateString('zh-CN')} 更新`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
