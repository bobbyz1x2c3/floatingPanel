import { formatDateTime, formatRelativeShort } from '../lib/format'
import { QUADRANT_META } from '../lib/types'
import type { ArchivedCard } from '../lib/types'
import { NeuButton } from './controls'
import { IconArchive, IconClose, IconEraser, IconRestore, IconTrash } from './icons'

export interface ArchiveDrawerProps {
  archived: ArchivedCard[]
  now: number
  onRestore: (id: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  onClose: () => void
}

export function ArchiveDrawer({
  archived,
  now,
  onRestore,
  onDelete,
  onClear,
  onClose,
}: ArchiveDrawerProps) {
  return (
    <aside className="drawer drawer--archive nm-scroll" aria-label="归档卡片">
      <div className="drawer__head">
        <h2 className="drawer__title">
          归档
          <span className="drawer__count">{archived.length}</span>
        </h2>
        <NeuButton iconOnly size="sm" aria-label="关闭归档" title="关闭归档" onClick={onClose}>
          <IconClose size={15} />
        </NeuButton>
      </div>

      {archived.length === 0 ? (
        <div className="archive-empty">
          <span className="archive-empty__badge">
            <IconArchive size={26} />
          </span>
          <p className="archive-empty__title">还没有归档的卡片</p>
          <p className="archive-empty__hint">
            点卡片下方的「完成」，它就会带着归档时间出现在这里。
          </p>
        </div>
      ) : (
        <>
          <ul className="archive-list">
            {archived.map((card) => {
              const meta = QUADRANT_META[card.quadrant]
              return (
                <li key={card.id} className="archive-item" data-tone={card.tone}>
                  <div className="archive-item__head">
                    <span className="archive-item__dot" aria-hidden="true" />
                    <span className="archive-item__title">{card.title || '未命名卡片'}</span>
                  </div>

                  {card.body ? <p className="archive-item__body">{card.body}</p> : null}

                  <div className="archive-item__meta">
                    <span className="archive-item__tag">{meta.title}</span>
                    {card.attachments.length > 0 ? (
                      <span className="archive-item__tag">{card.attachments.length} 个附件</span>
                    ) : null}
                  </div>

                  <div className="archive-item__meta">
                    <span className="archive-item__time" title={`归档时间 ${formatDateTime(card.archivedAt)}`}>
                      归档于 {formatDateTime(card.archivedAt)}
                    </span>
                    <span className="archive-item__ago">{formatRelativeShort(card.archivedAt, now)}</span>
                  </div>

                  <div className="archive-item__actions">
                    <NeuButton size="sm" onClick={() => onRestore(card.id)}>
                      <IconRestore size={14} />
                      恢复
                    </NeuButton>
                    <NeuButton size="sm" variant="danger" onClick={() => onDelete(card.id)}>
                      <IconTrash size={14} />
                      删除
                    </NeuButton>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="drawer__actions">
            <NeuButton size="sm" variant="danger" onClick={onClear}>
              <IconEraser size={15} />
              清空归档
            </NeuButton>
          </div>
        </>
      )}
    </aside>
  )
}
