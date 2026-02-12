"use client";

/**
 * Date Range Picker Component
 *
 * Features:
 * - Quick presets (Today, Last 7 days, etc.)
 * - Custom date range selection
 * - Calendar view
 * - Relative date display
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Check,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DatePreset {
  id: string;
  label: string;
  getValue: () => DateRange;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: DatePreset[];
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// ============================================
// Default Presets
// ============================================

const DEFAULT_PRESETS: DatePreset[] = [
  {
    id: "today",
    label: "Today",
    getValue: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start: today, end };
    },
  },
  {
    id: "yesterday",
    label: "Yesterday",
    getValue: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const end = new Date(yesterday);
      end.setHours(23, 59, 59, 999);
      return { start: yesterday, end };
    },
  },
  {
    id: "last7days",
    label: "Last 7 days",
    getValue: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    },
  },
  {
    id: "last30days",
    label: "Last 30 days",
    getValue: () => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const start = new Date();
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    },
  },
  {
    id: "thisMonth",
    label: "This month",
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    id: "lastMonth",
    label: "Last month",
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    id: "thisYear",
    label: "This year",
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return { start, end };
    },
  },
  {
    id: "allTime",
    label: "All time",
    getValue: () => ({ start: null, end: null }),
  },
];

// ============================================
// Utility Functions
// ============================================

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDate(date: Date | null): string {
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateRange(range: DateRange): string {
  if (!range.start && !range.end) return "All time";
  if (!range.start) return `Until ${formatDate(range.end)}`;
  if (!range.end) return `From ${formatDate(range.start)}`;

  // Check if it's the same day
  if (
    range.start.toDateString() === range.end.toDateString()
  ) {
    return formatDate(range.start);
  }

  return `${formatDate(range.start)} - ${formatDate(range.end)}`;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

function isInRange(date: Date, range: DateRange): boolean {
  if (!range.start || !range.end) return false;
  return date >= range.start && date <= range.end;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ============================================
// Calendar Component
// ============================================

interface CalendarProps {
  selectedRange: DateRange;
  onSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
}

function CalendarMonth({
  selectedRange,
  onSelect,
  minDate,
  maxDate,
  month,
  year,
  onMonthChange,
}: CalendarProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days: (Date | null)[] = [];

  // Add empty cells for days before the first of the month
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Add days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  const goToPrevMonth = () => {
    if (month === 0) {
      onMonthChange(11, year - 1);
    } else {
      onMonthChange(month - 1, year);
    }
  };

  const goToNextMonth = () => {
    if (month === 11) {
      onMonthChange(0, year + 1);
    } else {
      onMonthChange(month + 1, year);
    }
  };

  return (
    <div className="p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToPrevMonth}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-white">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={goToNextMonth}
          className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-center text-xs text-gray-500 py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} />;
          }

          const isDisabled =
            (minDate && date < minDate) || (maxDate && date > maxDate);
          const isSelected =
            (selectedRange.start && isSameDay(date, selectedRange.start)) ||
            (selectedRange.end && isSameDay(date, selectedRange.end));
          const isInSelectedRange = isInRange(date, selectedRange);
          const isToday = isSameDay(date, new Date());

          return (
            <button
              key={date.toISOString()}
              onClick={() => !isDisabled && onSelect(date)}
              disabled={isDisabled}
              className={`
                w-8 h-8 text-sm rounded transition-colors
                ${isDisabled ? "text-gray-600 cursor-not-allowed" : "hover:bg-gray-700"}
                ${isSelected ? "bg-blue-600 text-white" : ""}
                ${isInSelectedRange && !isSelected ? "bg-blue-500/20 text-blue-400" : ""}
                ${isToday && !isSelected ? "border border-blue-500 text-blue-400" : ""}
                ${!isSelected && !isInSelectedRange && !isToday && !isDisabled ? "text-gray-300" : ""}
              `}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  minDate,
  maxDate,
  placeholder = "Select date range",
  disabled = false,
  className = "",
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(value);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Calendar state
  const now = new Date();
  const [leftMonth, setLeftMonth] = useState(now.getMonth());
  const [leftYear, setLeftYear] = useState(now.getFullYear());
  const [rightMonth, setRightMonth] = useState(
    now.getMonth() === 11 ? 0 : now.getMonth() + 1
  );
  const [rightYear, setRightYear] = useState(
    now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  );

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync temp range with value
  useEffect(() => {
    setTempRange(value);
  }, [value]);

  const handleDateSelect = useCallback(
    (date: Date) => {
      if (!selectingEnd || !tempRange.start) {
        // Selecting start date
        setTempRange({ start: date, end: null });
        setSelectingEnd(true);
        setActivePreset(null);
      } else {
        // Selecting end date
        let start = tempRange.start;
        let end = date;

        // Ensure start is before end
        if (date < start) {
          [start, end] = [date, start];
        }

        end.setHours(23, 59, 59, 999);

        const newRange = { start, end };
        setTempRange(newRange);
        onChange(newRange);
        setSelectingEnd(false);
        setIsOpen(false);
      }
    },
    [selectingEnd, tempRange.start, onChange]
  );

  const handlePresetClick = useCallback(
    (preset: DatePreset) => {
      const range = preset.getValue();
      setTempRange(range);
      onChange(range);
      setActivePreset(preset.id);
      setSelectingEnd(false);
      setIsOpen(false);
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    const emptyRange = { start: null, end: null };
    setTempRange(emptyRange);
    onChange(emptyRange);
    setActivePreset(null);
    setSelectingEnd(false);
  }, [onChange]);

  const displayValue = formatDateRange(value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2
          bg-gray-800 border border-gray-700 rounded-lg text-sm
          transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          ${isOpen ? "border-blue-500 ring-2 ring-blue-500/20" : "hover:border-gray-600"}
        `}
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className={value.start || value.end ? "text-white" : "text-gray-500"}>
            {value.start || value.end ? displayValue : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(value.start || value.end) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 text-gray-500 hover:text-white rounded"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl">
          <div className="flex">
            {/* Presets */}
            <div className="w-40 p-2 border-r border-gray-800">
              <p className="px-2 py-1 text-xs text-gray-500 uppercase tracking-wider">
                Quick Select
              </p>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className={`
                    w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg
                    transition-colors
                    ${activePreset === preset.id
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-gray-300 hover:bg-gray-800"
                    }
                  `}
                >
                  {preset.label}
                  {activePreset === preset.id && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>

            {/* Calendars */}
            <div className="flex">
              <CalendarMonth
                selectedRange={tempRange}
                onSelect={handleDateSelect}
                minDate={minDate}
                maxDate={maxDate}
                month={leftMonth}
                year={leftYear}
                onMonthChange={(m, y) => {
                  setLeftMonth(m);
                  setLeftYear(y);
                }}
              />
              <CalendarMonth
                selectedRange={tempRange}
                onSelect={handleDateSelect}
                minDate={minDate}
                maxDate={maxDate}
                month={rightMonth}
                year={rightYear}
                onMonthChange={(m, y) => {
                  setRightMonth(m);
                  setRightYear(y);
                }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <div className="text-sm text-gray-400">
              {selectingEnd ? "Select end date" : "Select start date"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              {tempRange.start && tempRange.end && (
                <button
                  onClick={() => {
                    onChange(tempRange);
                    setIsOpen(false);
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                >
                  Apply
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Hook for Date Range State
// ============================================

export function useDateRange(initialRange?: DateRange) {
  const [range, setRange] = useState<DateRange>(
    initialRange || { start: null, end: null }
  );

  const setPreset = useCallback((presetId: string) => {
    const preset = DEFAULT_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setRange(preset.getValue());
    }
  }, []);

  const clear = useCallback(() => {
    setRange({ start: null, end: null });
  }, []);

  const isInRange = useCallback(
    (date: Date): boolean => {
      if (!range.start) return true;
      if (!range.end) return date >= range.start;
      return date >= range.start && date <= range.end;
    },
    [range]
  );

  return {
    range,
    setRange,
    setPreset,
    clear,
    isInRange,
  };
}

export type { DateRange, DatePreset, DateRangePickerProps };
export { DEFAULT_PRESETS };
