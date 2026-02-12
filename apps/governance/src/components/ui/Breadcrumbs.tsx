"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  separator?: ReactNode;
  className?: string;
}

// ============================================================================
// Route Label Mapping
// ============================================================================

const routeLabels: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  earnings: "Earnings",
  stake: "Stake",
  governance: "Governance",
  create: "Create Proposal",
  network: "Network",
  proofs: "Proofs",
  wallet: "Wallet",
  "privacy-pool": "Privacy Pool",
  stealth: "Stealth Addresses",
  send: "Send",
  trade: "Trade",
  settings: "Settings",
  faucet: "Faucet",
  docs: "Documentation",
  workloads: "Workloads",
};

// ============================================================================
// Auto Breadcrumbs (from pathname)
// ============================================================================

export function AutoBreadcrumbs({
  showHome = true,
  separator,
  className,
}: Omit<BreadcrumbsProps, "items">) {
  const pathname = usePathname();

  // Generate breadcrumb items from pathname
  const items: BreadcrumbItem[] = [];

  if (pathname) {
    const segments = pathname.split("/").filter(Boolean);

    segments.forEach((segment, index) => {
      // Skip dynamic segments that look like IDs
      if (segment.match(/^[0-9a-f]{8,}$/i) || segment.match(/^0x[0-9a-f]+$/i)) {
        items.push({
          label: `${segment.slice(0, 8)}...`,
          href: "/" + segments.slice(0, index + 1).join("/"),
        });
      } else {
        items.push({
          label: routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1),
          href: index === segments.length - 1 ? undefined : "/" + segments.slice(0, index + 1).join("/"),
        });
      }
    });
  }

  return (
    <Breadcrumbs
      items={items}
      showHome={showHome}
      separator={separator}
      className={className}
    />
  );
}

// ============================================================================
// Breadcrumbs Component
// ============================================================================

export function Breadcrumbs({
  items = [],
  showHome = true,
  separator = <ChevronRight className="w-4 h-4 text-gray-600" />,
  className,
}: BreadcrumbsProps) {
  if (items.length === 0 && !showHome) return null;

  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: "Home", href: "/dashboard", icon: <Home className="w-4 h-4" /> }, ...items]
    : items;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1.5 text-sm">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && <span className="text-gray-600">{separator}</span>}

              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 transition-colors",
                    "text-gray-400 hover:text-white"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    "flex items-center gap-1.5",
                    isLast ? "text-white font-medium" : "text-gray-400"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ============================================================================
// Compact Breadcrumbs (for mobile)
// ============================================================================

export function CompactBreadcrumbs({
  items = [],
  showHome = true,
  className,
}: BreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = showHome
    ? [{ label: "Home", href: "/dashboard", icon: <Home className="w-4 h-4" /> }, ...items]
    : items;

  // Only show last 2 items on mobile
  const displayItems = allItems.length > 2
    ? [allItems[0], { label: "...", href: undefined }, allItems[allItems.length - 1]]
    : allItems;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center", className)}>
      <ol className="flex items-center gap-1 text-sm">
        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-3 h-3 text-gray-600" />}

              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {item.icon || item.label}
                </Link>
              ) : (
                <span className={isLast ? "text-white font-medium truncate max-w-[120px]" : "text-gray-500"}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ============================================================================
// Page Header with Breadcrumbs
// ============================================================================

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumbs items={breadcrumbs} showHome />
      )}

      {/* Title and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{title}</h1>
          {description && (
            <p className="text-gray-400 mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// Back Link
// ============================================================================

interface BackLinkProps {
  href?: string;
  label?: string;
  className?: string;
}

export function BackLink({
  href,
  label = "Back",
  className,
}: BackLinkProps) {
  const content = (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors",
      className
    )}>
      <ChevronRight className="w-4 h-4 rotate-180" />
      {label}
    </span>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return (
    <button onClick={() => window.history.back()} className="cursor-pointer">
      {content}
    </button>
  );
}
