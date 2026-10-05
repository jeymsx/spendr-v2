/**
 * The desktop's one container: a white panel with a hairline edge.
 *
 * A title row when it has a title (14px, with its meta and actions at the
 * right), then its body - padded unless `flush`, for a table or a list that
 * runs edge to edge - and an optional footer row.
 *
 * @param {{title?: import('react').ReactNode, meta?: import('react').ReactNode,
 *          actions?: import('react').ReactNode, footer?: import('react').ReactNode,
 *          flush?: boolean, bare?: boolean, className?: string, bodyClassName?: string,
 *          children?: import('react').ReactNode, as?: any} & Record<string, any>} props
 */
export default function Panel({
  title, meta, actions, footer, flush = false, bare = false,
  className = '', bodyClassName = '', children, as: Tag = 'section', ...rest
}) {
  return (
    <Tag className={`d-panel ${className}`} {...rest}>
      {(title || actions) && (
        <div className={`d-panel-head${bare ? ' is-bare' : ''}`}>
          <div className="flex items-baseline gap-2 min-w-0">
            {title && <h2 className="d-panel-title truncate">{title}</h2>}
            {meta && <span className="d-panel-meta truncate">{meta}</span>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </div>
      )}
      {children != null && <div className={`${flush ? '' : 'd-panel-body'} ${bodyClassName}`}>{children}</div>}
      {footer && <div className="d-panel-foot">{footer}</div>}
    </Tag>
  )
}
