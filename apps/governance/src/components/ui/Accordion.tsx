"use client";

import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (id: string) => void;
  type: "single" | "multiple";
}

interface AccordionItemContextValue {
  isOpen: boolean;
  toggle: () => void;
  id: string;
}

// ============================================================================
// Context
// ============================================================================

const AccordionContext = createContext<AccordionContextValue | null>(null);
const AccordionItemContext = createContext<AccordionItemContextValue | null>(null);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be used within an Accordion");
  }
  return context;
}

function useAccordionItemContext() {
  const context = useContext(AccordionItemContext);
  if (!context) {
    throw new Error("AccordionTrigger/Content must be used within AccordionItem");
  }
  return context;
}

// ============================================================================
// Accordion Root
// ============================================================================

interface AccordionProps {
  type?: "single" | "multiple";
  defaultOpen?: string | string[];
  children: ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  defaultOpen,
  children,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(() => {
    if (!defaultOpen) return new Set();
    return new Set(Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen]);
  });

  const toggle = useCallback((id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (type === "single") {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  }, [type]);

  return (
    <AccordionContext.Provider value={{ openItems, toggle, type }}>
      <div className={cn("space-y-2", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

// ============================================================================
// Accordion Item
// ============================================================================

interface AccordionItemProps {
  id: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function AccordionItem({
  id,
  children,
  className,
  disabled = false,
}: AccordionItemProps) {
  const { openItems, toggle } = useAccordionContext();
  const isOpen = openItems.has(id);

  const handleToggle = useCallback(() => {
    if (!disabled) {
      toggle(id);
    }
  }, [disabled, id, toggle]);

  return (
    <AccordionItemContext.Provider value={{ isOpen, toggle: handleToggle, id }}>
      <div
        className={cn(
          "rounded-xl border border-surface-border overflow-hidden",
          "bg-surface-card/50 backdrop-blur-sm",
          disabled && "opacity-50",
          className
        )}
        data-state={isOpen ? "open" : "closed"}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  );
}

// ============================================================================
// Accordion Trigger
// ============================================================================

interface AccordionTriggerProps {
  children: ReactNode;
  className?: string;
  icon?: "chevron" | "plus-minus" | "none";
  iconPosition?: "left" | "right";
}

export function AccordionTrigger({
  children,
  className,
  icon = "chevron",
  iconPosition = "right",
}: AccordionTriggerProps) {
  const { isOpen, toggle } = useAccordionItemContext();

  const renderIcon = () => {
    if (icon === "none") return null;

    if (icon === "plus-minus") {
      return isOpen ? (
        <Minus className="w-4 h-4 text-gray-400" />
      ) : (
        <Plus className="w-4 h-4 text-gray-400" />
      );
    }

    return (
      <motion.div
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </motion.div>
    );
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "w-full flex items-center gap-3 p-4 text-left",
        "text-white font-medium transition-colors",
        "hover:bg-white/5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
        className
      )}
      aria-expanded={isOpen}
    >
      {iconPosition === "left" && renderIcon()}
      <span className="flex-1">{children}</span>
      {iconPosition === "right" && renderIcon()}
    </button>
  );
}

// ============================================================================
// Accordion Content
// ============================================================================

interface AccordionContentProps {
  children: ReactNode;
  className?: string;
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const { isOpen } = useAccordionItemContext();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className={cn("px-4 pb-4 text-gray-300", className)}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Simple Accordion (All-in-one)
// ============================================================================

interface SimpleAccordionItem {
  id: string;
  title: string;
  content: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SimpleAccordionProps {
  items: SimpleAccordionItem[];
  type?: "single" | "multiple";
  defaultOpen?: string | string[];
  variant?: "default" | "bordered" | "separated";
  className?: string;
}

export function SimpleAccordion({
  items,
  type = "single",
  defaultOpen,
  variant = "default",
  className,
}: SimpleAccordionProps) {
  const variantClasses = {
    default: "space-y-0 divide-y divide-surface-border rounded-xl border border-surface-border overflow-hidden",
    bordered: "space-y-2",
    separated: "space-y-3",
  };

  const itemClasses = {
    default: "border-0 rounded-none",
    bordered: "border border-surface-border rounded-xl",
    separated: "border border-surface-border rounded-xl bg-surface-card",
  };

  return (
    <Accordion type={type} defaultOpen={defaultOpen} className={cn(variantClasses[variant], className)}>
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          id={item.id}
          disabled={item.disabled}
          className={itemClasses[variant]}
        >
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              {item.icon}
              <span>{item.title}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

// ============================================================================
// Collapsible (Standalone collapse component)
// ============================================================================

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Collapsible({
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  children,
  className,
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggle = useCallback(() => {
    const newState = !isOpen;
    setInternalOpen(newState);
    onOpenChange?.(newState);
  }, [isOpen, onOpenChange]);

  return (
    <AccordionItemContext.Provider value={{ isOpen, toggle, id: "collapsible" }}>
      <div className={className}>{children}</div>
    </AccordionItemContext.Provider>
  );
}

export function CollapsibleTrigger({
  children,
  className,
  asChild,
}: {
  children: ReactNode;
  className?: string;
  asChild?: boolean;
}) {
  const { toggle } = useAccordionItemContext();

  if (asChild) {
    return (
      <div onClick={toggle} className={cn("cursor-pointer", className)}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "flex items-center gap-2 text-left transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
        className
      )}
    >
      {children}
    </button>
  );
}

export function CollapsibleContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isOpen } = useAccordionItemContext();

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// FAQ Accordion
// ============================================================================

interface FAQItem {
  question: string;
  answer: ReactNode;
}

interface FAQAccordionProps {
  items: FAQItem[];
  className?: string;
}

export function FAQAccordion({ items, className }: FAQAccordionProps) {
  return (
    <Accordion type="single" className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <AccordionItem
          key={index}
          id={`faq-${index}`}
          className="bg-surface-elevated/50"
        >
          <AccordionTrigger icon="plus-minus">
            <span className="text-base">{item.question}</span>
          </AccordionTrigger>
          <AccordionContent className="text-gray-400 leading-relaxed">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
