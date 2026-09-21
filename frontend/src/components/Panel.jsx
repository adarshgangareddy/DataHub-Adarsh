/** A labelled instrument panel: the basic container used across the dashboard. */
export default function Panel({ title, icon: Icon, action, children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`border border-line bg-panel ${className}`} {...rest}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line bg-recess px-4 py-2">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            {Icon && <Icon aria-hidden="true" size={15} />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </Tag>
  );
}
