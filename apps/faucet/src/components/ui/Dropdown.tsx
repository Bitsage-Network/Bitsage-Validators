"use client";

import { useState, useRef, useEffect, ReactNode, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

type DropdownPosition = "bottom-start" | "bottom-end" | "top-start" | "top-end";

interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
  submenu?: DropdownMenuItem[];
}

interface DropdownMenuGroup {
  label?: string;
  items: DropdownMenuItem[];
}

// ============================================================================
// Keyboard Navigation Hook
// ============================================================================

function useDropdownKeyboard(
  items: DropdownMenuItem[],
  isOpen: boolean,
  onSelect: (item: DropdownMenuItem) => void,
  onClose: () => void
) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [typeahead, setTypeahead] = useState("");
  const typeaheadTimeout = useRef<NodeJS.Timeout>();

  // Reset focus when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      setTypeahead("");
    }
  }, [isOpen]);

  // Get navigable (non-disabled) items
  const navigableItems = useMemo(
    () => items.filter((item) => !item.disabled),
    [items]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex = prev + 1;
            return nextIndex >= navigableItems.length ? 0 : nextIndex;
          });
          break;

        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => {
            const nextIndex = prev - 1;
            return nextIndex < 0 ? navigableItems.length - 1 : nextIndex;
          });
          break;

        case "Home":
          e.preventDefault();
          setFocusedIndex(0);
          break;

        case "End":
          e.preventDefault();
          setFocusedIndex(navigableItems.length - 1);
          break;

        case "Enter":
        case " ":
          e.preventDefault();
          if (focusedIndex >= 0 && navigableItems[focusedIndex]) {
            onSelect(navigableItems[focusedIndex]);
          }
          break;

        case "Tab":
          onClose();
          break;

        default:
          // Type-ahead search
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const newTypeahead = typeahead + e.key.toLowerCase();
            setTypeahead(newTypeahead);

            // Find matching item
            const matchIndex = navigableItems.findIndex((item) =>
              item.label.toLowerCase().startsWith(newTypeahead)
            );
            if (matchIndex >= 0) {
              setFocusedIndex(matchIndex);
            }

            // Clear typeahead after delay
            if (typeaheadTimeout.current) {
              clearTimeout(typeaheadTimeout.current);
            }
            typeaheadTimeout.current = setTimeout(() => {
              setTypeahead("");
            }, 500);
          }
      }
    },
    [isOpen, focusedIndex, navigableItems, onSelect, onClose, typeahead]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Get the actual index in the original items array
  const getFocusedItemId = useCallback(() => {
    if (focusedIndex >= 0 && navigableItems[focusedIndex]) {
      return navigableItems[focusedIndex].id;
    }
    return null;
  }, [focusedIndex, navigableItems]);

  return { focusedIndex, focusedItemId: getFocusedItemId(), setFocusedIndex };
}

// ============================================================================
// Dropdown Menu
// ============================================================================

interface DropdownMenuProps {
  trigger: ReactNode;
  items: (DropdownMenuItem | DropdownMenuGroup)[];
  position?: DropdownPosition;
  align?: "start" | "end";
  width?: "auto" | "trigger" | number;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

export function DropdownMenu({
  trigger,
  items,
  position = "bottom-start",
  width = "auto",
  className,
  triggerClassName,
  contentClassName,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    const result: DropdownMenuItem[] = [];
    items.forEach((item) => {
      if ("items" in item) {
        result.push(...item.items);
      } else {
        result.push(item);
      }
    });
    return result;
  }, [items]);

  const isGroup = (item: DropdownMenuItem | DropdownMenuGroup): item is DropdownMenuGroup => {
    return "items" in item;
  };

  const handleItemClick = useCallback((item: DropdownMenuItem) => {
    if (item.disabled) return;
    item.onClick?.();
    if (!item.submenu) {
      setIsOpen(false);
    }
  }, []);

  const { focusedItemId } = useDropdownKeyboard(
    flatItems,
    isOpen,
    handleItemClick,
    () => setIsOpen(false)
  );

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !menuRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const padding = 8;

    let top = 0;
    let left = 0;

    // Vertical position
    if (position.startsWith("bottom")) {
      top = triggerRect.bottom + padding;
    } else {
      top = triggerRect.top - menuRect.height - padding;
    }

    // Horizontal position
    if (position.endsWith("start")) {
      left = triggerRect.left;
    } else {
      left = triggerRect.right - menuRect.width;
    }

    // Handle trigger width
    if (width === "trigger") {
      left = triggerRect.left;
    }

    // Keep in viewport
    const viewportPadding = 16;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuRect.width - viewportPadding));
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - menuRect.height - viewportPadding));

    setCoords({ top, left });
  }, [position, width]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      window.addEventListener("scroll", calculatePosition, true);
      window.addEventListener("resize", calculatePosition);

      const handleClickOutside = (e: MouseEvent) => {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false);
      };
      document.addEventListener("keydown", handleEscape);

      return () => {
        window.removeEventListener("scroll", calculatePosition, true);
        window.removeEventListener("resize", calculatePosition);
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen, calculatePosition]);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  const triggerWidth = width === "trigger" && triggerRef.current
    ? triggerRef.current.offsetWidth
    : typeof width === "number"
    ? width
    : undefined;

  return (
    <div className={cn("relative inline-flex", className)}>
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        tabIndex={0}
        role="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn("cursor-pointer outline-none", triggerClassName)}
      >
        {trigger}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                role="menu"
                aria-orientation="vertical"
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "fixed z-[9999] py-1.5 rounded-xl overflow-hidden",
                  "bg-surface-card border border-surface-border shadow-2xl",
                  "min-w-[180px] outline-none",
                  contentClassName
                )}
                style={{
                  top: coords.top,
                  left: coords.left,
                  width: triggerWidth,
                }}
              >
                {items.map((item, index) => {
                  if (isGroup(item)) {
                    return (
                      <div key={index} role="group" aria-label={item.label}>
                        {item.label && (
                          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {item.label}
                          </div>
                        )}
                        {item.items.map((subItem) => (
                          <DropdownMenuItemComponent
                            key={subItem.id}
                            item={subItem}
                            onClick={() => handleItemClick(subItem)}
                            isFocused={focusedItemId === subItem.id}
                          />
                        ))}
                        {index < items.length - 1 && (
                          <div className="my-1.5 mx-2 border-t border-surface-border" role="separator" />
                        )}
                      </div>
                    );
                  }

                  return (
                    <DropdownMenuItemComponent
                      key={item.id}
                      item={item}
                      onClick={() => handleItemClick(item)}
                      isFocused={focusedItemId === item.id}
                    />
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

// ============================================================================
// Dropdown Menu Item
// ============================================================================

function DropdownMenuItemComponent({
  item,
  onClick,
  isFocused = false,
}: {
  item: DropdownMenuItem;
  onClick: () => void;
  isFocused?: boolean;
}) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view when focused via keyboard
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isFocused]);

  const content = (
    <div
      ref={itemRef}
      onClick={!item.submenu ? onClick : undefined}
      onMouseEnter={() => item.submenu && setShowSubmenu(true)}
      onMouseLeave={() => item.submenu && setShowSubmenu(false)}
      role="menuitem"
      aria-disabled={item.disabled}
      tabIndex={-1}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors",
        item.disabled
          ? "text-gray-600 cursor-not-allowed"
          : item.danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-gray-300 hover:bg-white/5 hover:text-white",
        isFocused && !item.disabled && "bg-white/5 text-white ring-1 ring-inset ring-brand-500/50"
      )}
    >
      {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <span className="text-xs text-gray-500 font-mono">{item.shortcut}</span>
      )}
      {item.submenu && <ChevronRight className="w-4 h-4 text-gray-500" />}

      {/* Submenu */}
      {item.submenu && showSubmenu && (
        <div className="absolute left-full top-0 ml-1 py-1.5 rounded-xl min-w-[160px] bg-surface-card border border-surface-border shadow-2xl">
          {item.submenu.map((subItem) => (
            <DropdownMenuItemComponent
              key={subItem.id}
              item={subItem}
              onClick={() => {
                subItem.onClick?.();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (item.href && !item.disabled) {
    return (
      <a href={item.href} className="block">
        {content}
      </a>
    );
  }

  return content;
}

// ============================================================================
// Select Dropdown
// ============================================================================

interface SelectDropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
}

interface SelectDropdownProps {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectDropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function SelectDropdown({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  error = false,
  size = "md",
  className,
}: SelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [typeahead, setTypeahead] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadTimeout = useRef<NodeJS.Timeout>();

  const selectedOption = options.find((opt) => opt.value === value);
  const navigableOptions = useMemo(
    () => options.filter((opt) => !opt.disabled),
    [options]
  );

  // Reset focus when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      setTypeahead("");
    } else {
      // Focus current value when opening
      const currentIndex = navigableOptions.findIndex((opt) => opt.value === value);
      if (currentIndex >= 0) {
        setFocusedIndex(currentIndex);
      }
    }
  }, [isOpen, value, navigableOptions]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = useCallback(
    (option: SelectDropdownOption) => {
      if (option.disabled) return;
      onChange?.(option.value);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (focusedIndex >= 0 && navigableOptions[focusedIndex]) {
          handleSelect(navigableOptions[focusedIndex]);
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex((prev) => {
            const next = prev + 1;
            return next >= navigableOptions.length ? 0 : next;
          });
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? navigableOptions.length - 1 : next;
          });
        }
        break;

      case "Home":
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(0);
        }
        break;

      case "End":
        if (isOpen) {
          e.preventDefault();
          setFocusedIndex(navigableOptions.length - 1);
        }
        break;

      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;

      case "Tab":
        setIsOpen(false);
        break;

      default:
        // Type-ahead search
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && isOpen) {
          e.preventDefault();
          const newTypeahead = typeahead + e.key.toLowerCase();
          setTypeahead(newTypeahead);

          const matchIndex = navigableOptions.findIndex((opt) =>
            opt.label.toLowerCase().startsWith(newTypeahead)
          );
          if (matchIndex >= 0) {
            setFocusedIndex(matchIndex);
          }

          if (typeaheadTimeout.current) {
            clearTimeout(typeaheadTimeout.current);
          }
          typeaheadTimeout.current = setTimeout(() => {
            setTypeahead("");
          }, 500);
        }
    }
  };

  // Scroll focused option into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex]);

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-base",
    lg: "px-5 py-3 text-lg",
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-activedescendant={
          focusedIndex >= 0 ? `select-option-${navigableOptions[focusedIndex]?.value}` : undefined
        }
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-xl",
          "bg-surface-elevated border transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-offset-0",
          !error
            ? "border-surface-border focus:border-brand-500 focus:ring-brand-500/20"
            : "border-red-500/50 focus:border-red-500 focus:ring-red-500/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen && "border-brand-500 ring-2 ring-brand-500/20",
          sizes[size]
        )}
      >
        <span className={cn(selectedOption ? "text-white" : "text-gray-500")}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-500 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={listRef}
            role="listbox"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute z-50 w-full mt-2 py-1.5 rounded-xl",
              "bg-surface-card border border-surface-border shadow-2xl",
              "max-h-[280px] overflow-auto"
            )}
          >
            {options.map((option, index) => {
              const navIndex = navigableOptions.findIndex((o) => o.value === option.value);
              const isFocused = navIndex === focusedIndex;

              return (
                <button
                  key={option.value}
                  id={`select-option-${option.value}`}
                  type="button"
                  role="option"
                  aria-selected={value === option.value}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => !option.disabled && setFocusedIndex(navIndex)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    option.disabled
                      ? "text-gray-600 cursor-not-allowed"
                      : value === option.value
                      ? "bg-brand-500/10 text-brand-400"
                      : "text-gray-300 hover:bg-white/5 hover:text-white",
                    isFocused && !option.disabled && "bg-white/5 ring-1 ring-inset ring-brand-500/50"
                  )}
                >
                  {option.icon && <span className="w-5 h-5 flex-shrink-0">{option.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-gray-500 truncate">{option.description}</div>
                    )}
                  </div>
                  {value === option.value && <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Action Dropdown (Quick actions button)
// ============================================================================

interface ActionDropdownProps {
  label?: string;
  icon?: ReactNode;
  items: DropdownMenuItem[];
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ActionDropdown({
  label,
  icon,
  items,
  variant = "secondary",
  size = "md",
  className,
}: ActionDropdownProps) {
  const variants = {
    primary: "bg-brand-600 hover:bg-brand-500 text-white",
    secondary: "bg-surface-elevated hover:bg-surface-card text-gray-300 hover:text-white border border-surface-border",
    ghost: "hover:bg-surface-elevated text-gray-400 hover:text-white",
  };

  const sizes = {
    sm: "px-2.5 py-1.5 text-xs gap-1.5",
    md: "px-3 py-2 text-sm gap-2",
    lg: "px-4 py-2.5 text-base gap-2",
  };

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          className={cn(
            "inline-flex items-center rounded-xl font-medium transition-colors",
            variants[variant],
            sizes[size],
            className
          )}
        >
          {icon}
          {label && <span>{label}</span>}
          <ChevronDown className="w-4 h-4" />
        </button>
      }
      items={items}
    />
  );
}

// ============================================================================
// Context Menu (Right-click menu)
// ============================================================================

interface ContextMenuProps {
  children: ReactNode;
  items: DropdownMenuItem[];
  disabled?: boolean;
}

export function ContextMenu({ children, items, disabled = false }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setCoords({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = () => setIsOpen(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className={cn(
                  "fixed z-[9999] py-1.5 rounded-xl",
                  "bg-surface-card border border-surface-border shadow-2xl",
                  "min-w-[160px]"
                )}
                style={{
                  top: coords.y,
                  left: coords.x,
                }}
              >
                {items.map((item) => (
                  <DropdownMenuItemComponent
                    key={item.id}
                    item={item}
                    onClick={() => {
                      item.onClick?.();
                      setIsOpen(false);
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
