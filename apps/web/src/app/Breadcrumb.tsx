type BreadcrumbItem = { label: string; href?: string };

/**
 * Shared breadcrumb trail.
 * Items without `href` render as plain text (typically the current page).
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <div className="text-[11px] text-cream-dim/40 mb-4">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5">›</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-accent transition-colors">
              {item.label}
            </a>
          ) : (
            <span>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
