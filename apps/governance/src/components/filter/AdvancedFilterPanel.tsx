"use client";

/**
 * Advanced Filter Panel Component
 *
 * Comprehensive filtering for data tables:
 * - Multiple filter types (text, select, range, date)
 * - Filter presets/saved filters
 * - Active filter badges
 * - Clear all functionality
 * - Collapsible panel
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  Check,
  RotateCcw,
  Save,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";

// ============================================
// Types
// ============================================

type FilterType = "text" | "select" | "multiselect" | "range" | "date" | "daterange" | "boolean";

interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

interface FilterConfig {
  key: string;
  label: string;
  type: FilterType;
  placeholder?: string;
  options?: FilterOption[];
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: unknown;
}

interface FilterValue {
  [key: string]: unknown;
}

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterValue;
}

interface AdvancedFilterPanelProps {
  filters: FilterConfig[];
  values: FilterValue;
  onChange: (values: FilterValue) => void;
  presets?: FilterPreset[];
  onSavePreset?: (name: string, filters: FilterValue) => void;
  onDeletePreset?: (id: string) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  showActiveFilters?: boolean;
  showPresets?: boolean;
  className?: string;
}

// ============================================
// Filter Input Components
// ============================================

interface FilterInputProps<T = unknown> {
  config: FilterConfig;
  value: T;
  onChange: (value: T) => void;
}

function TextFilter({ config, value, onChange }: FilterInputProps<string>) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={config.placeholder || `Search ${config.label.toLowerCase()}...`}
        className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function SelectFilter({ config, value, onChange }: FilterInputProps<string>) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
    >
      <option value="">All {config.label}</option>
      {config.options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {option.count !== undefined && ` (${option.count})`}
        </option>
      ))}
    </select>
  );
}

function MultiSelectFilter({ config, value, onChange }: FilterInputProps<string[]>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedValues = value || [];

  const toggleOption = (optionValue: string) => {
    if (selectedValues.includes(optionValue)) {
      onChange(selectedValues.filter((v) => v !== optionValue));
    } else {
      onChange([...selectedValues, optionValue]);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
      >
        <span className={selectedValues.length === 0 ? "text-gray-500" : ""}>
          {selectedValues.length === 0
            ? `Select ${config.label}`
            : `${selectedValues.length} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {config.options?.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 cursor-pointer"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selectedValues.includes(option.value)
                      ? "bg-blue-600 border-blue-600"
                      : "border-gray-600"
                  }`}
                >
                  {selectedValues.includes(option.value) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="text-sm text-white">{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-gray-500 ml-auto">{option.count}</span>
                )}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RangeFilter({ config, value, onChange }: FilterInputProps<{ min?: number; max?: number }>) {
  const rangeValue = value || {};

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={rangeValue.min ?? ""}
        onChange={(e) => onChange({ ...rangeValue, min: e.target.value ? Number(e.target.value) : undefined })}
        placeholder="Min"
        min={config.min}
        max={config.max}
        step={config.step}
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <span className="text-gray-500">-</span>
      <input
        type="number"
        value={rangeValue.max ?? ""}
        onChange={(e) => onChange({ ...rangeValue, max: e.target.value ? Number(e.target.value) : undefined })}
        placeholder="Max"
        min={config.min}
        max={config.max}
        step={config.step}
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function DateFilter({ config, value, onChange }: FilterInputProps<string>) {
  return (
    <div className="relative">
      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="date"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}

function DateRangeFilter({ config, value, onChange }: FilterInputProps<{ start?: string; end?: string }>) {
  const rangeValue = value || {};

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="date"
          value={rangeValue.start || ""}
          onChange={(e) => onChange({ ...rangeValue, start: e.target.value })}
          className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <span className="text-gray-500">to</span>
      <div className="relative flex-1">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="date"
          value={rangeValue.end || ""}
          onChange={(e) => onChange({ ...rangeValue, end: e.target.value })}
          className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

function BooleanFilter({ config, value, onChange }: FilterInputProps<boolean | null>) {
  return (
    <div className="flex items-center gap-2">
      {[
        { value: null, label: "All" },
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ].map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
            value === option.value
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ============================================
// Filter Badge
// ============================================

function FilterBadge({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs text-blue-400">
      <span className="text-gray-400">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="ml-1 p-0.5 hover:bg-blue-500/30 rounded"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ============================================
// Main Component
// ============================================

export function AdvancedFilterPanel({
  filters,
  values,
  onChange,
  presets = [],
  onSavePreset,
  onDeletePreset,
  collapsible = true,
  defaultCollapsed = false,
  showActiveFilters = true,
  showPresets = true,
  className = "",
}: AdvancedFilterPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [presetName, setPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    return Object.entries(values).filter(([_, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "object" && Object.keys(v).length === 0) return false;
      return true;
    }).length;
  }, [values]);

  // Get active filter badges
  const activeFilters = useMemo(() => {
    const result: { key: string; label: string; displayValue: string }[] = [];

    for (const [key, value] of Object.entries(values)) {
      if (!value || (Array.isArray(value) && value.length === 0)) continue;

      const config = filters.find((f) => f.key === key);
      if (!config) continue;

      let displayValue = "";

      if (typeof value === "string") {
        if (config.type === "select" && config.options) {
          displayValue = config.options.find((o) => o.value === value)?.label || value;
        } else {
          displayValue = value;
        }
      } else if (Array.isArray(value)) {
        displayValue = `${value.length} selected`;
      } else if (typeof value === "object") {
        if ("min" in value || "max" in value) {
          const range = value as { min?: number; max?: number };
          displayValue = `${range.min ?? "∞"} - ${range.max ?? "∞"}`;
        } else if ("start" in value || "end" in value) {
          const range = value as { start?: string; end?: string };
          displayValue = `${range.start || "..."} to ${range.end || "..."}`;
        }
      } else if (typeof value === "boolean") {
        displayValue = value ? "Yes" : "No";
      }

      if (displayValue) {
        result.push({ key, label: config.label, displayValue });
      }
    }

    return result;
  }, [values, filters]);

  const handleFilterChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value });
    },
    [values, onChange]
  );

  const handleClearFilter = useCallback(
    (key: string) => {
      const newValues = { ...values };
      delete newValues[key];
      onChange(newValues);
    },
    [values, onChange]
  );

  const handleClearAll = useCallback(() => {
    onChange({});
  }, [onChange]);

  const handleApplyPreset = useCallback(
    (preset: FilterPreset) => {
      onChange(preset.filters);
    },
    [onChange]
  );

  const handleSavePreset = useCallback(() => {
    if (presetName.trim() && onSavePreset) {
      onSavePreset(presetName.trim(), values);
      setPresetName("");
      setShowSavePreset(false);
    }
  }, [presetName, values, onSavePreset]);

  const renderFilter = (config: FilterConfig) => {
    const value = values[config.key];

    switch (config.type) {
      case "text":
        return <TextFilter config={config} value={value as string} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "select":
        return <SelectFilter config={config} value={value as string} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "multiselect":
        return <MultiSelectFilter config={config} value={value as string[]} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "range":
        return <RangeFilter config={config} value={value as { min?: number; max?: number }} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "date":
        return <DateFilter config={config} value={value as string} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "daterange":
        return <DateRangeFilter config={config} value={value as { start?: string; end?: string }} onChange={(v) => handleFilterChange(config.key, v)} />;
      case "boolean":
        return <BooleanFilter config={config} value={value as boolean | null} onChange={(v) => handleFilterChange(config.key, v)} />;
      default:
        return null;
    }
  };

  return (
    <div className={`bg-gray-900/50 border border-gray-800 rounded-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-gray-400" />
          <h3 className="font-medium text-white">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Clear all
            </button>
          )}
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Badges */}
      {showActiveFilters && activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-gray-800">
          {activeFilters.map(({ key, label, displayValue }) => (
            <FilterBadge
              key={key}
              label={label}
              value={displayValue}
              onRemove={() => handleClearFilter(key)}
            />
          ))}
        </div>
      )}

      {/* Filter Fields */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filters.map((config) => (
              <div key={config.key}>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  {config.label}
                </label>
                {renderFilter(config)}
              </div>
            ))}
          </div>

          {/* Presets */}
          {showPresets && (presets.length > 0 || onSavePreset) && (
            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-400">Filter Presets</span>
                {onSavePreset && activeFilterCount > 0 && (
                  <button
                    onClick={() => setShowSavePreset(!showSavePreset)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <Save className="w-3 h-3" />
                    Save current
                  </button>
                )}
              </div>

              {showSavePreset && (
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name..."
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!presetName.trim()}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowSavePreset(false)}
                    className="px-3 py-1.5 text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg"
                    >
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        className="text-sm text-gray-300 hover:text-white"
                      >
                        {preset.name}
                      </button>
                      {onDeletePreset && (
                        <button
                          onClick={() => onDeletePreset(preset.id)}
                          className="p-0.5 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// useFilters Hook
// ============================================

export function useFilters<T extends Record<string, unknown>>(
  initialFilters: FilterValue = {}
) {
  const [filters, setFilters] = useState<FilterValue>(initialFilters);

  const updateFilter = useCallback((key: string, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const applyFilters = useCallback(
    (data: T[]): T[] => {
      return data.filter((item) => {
        for (const [key, filterValue] of Object.entries(filters)) {
          if (!filterValue) continue;

          const itemValue = item[key];

          // Text filter
          if (typeof filterValue === "string") {
            if (!String(itemValue).toLowerCase().includes(filterValue.toLowerCase())) {
              return false;
            }
          }

          // Array filter (multiselect)
          if (Array.isArray(filterValue) && filterValue.length > 0) {
            if (!filterValue.includes(String(itemValue))) {
              return false;
            }
          }

          // Range filter
          if (typeof filterValue === "object" && ("min" in filterValue || "max" in filterValue)) {
            const range = filterValue as { min?: number; max?: number };
            const numValue = Number(itemValue);
            if (range.min !== undefined && numValue < range.min) return false;
            if (range.max !== undefined && numValue > range.max) return false;
          }

          // Boolean filter
          if (typeof filterValue === "boolean") {
            if (itemValue !== filterValue) return false;
          }
        }
        return true;
      });
    },
    [filters]
  );

  // Compute active filters for UI display
  const activeFilters = useMemo(() => {
    return Object.entries(filters)
      .filter(([, value]) => {
        if (value === null || value === undefined) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === "string" && value === "") return false;
        return true;
      })
      .map(([key, value]) => ({ id: key, key, value }));
  }, [filters]);

  return {
    filters,
    setFilters,
    updateFilter,
    clearFilter,
    clearAll,
    applyFilters,
    // Aliases for compatibility
    values: filters,
    setFilter: updateFilter,
    activeFilters,
  };
}

export type { FilterType, FilterConfig, FilterOption, FilterValue, FilterPreset, AdvancedFilterPanelProps };
