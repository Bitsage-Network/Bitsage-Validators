"use client";

/**
 * Export Button Component
 *
 * Dropdown button for data export with format selection:
 * - CSV export
 * - JSON export
 * - PDF export (print)
 * - Loading states
 * - Success/error feedback
 */

import React, { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  ChevronDown,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { exportData, type ExportFormat, type ExportOptions, type ExportColumn } from "@/lib/export/dataExport";

// ============================================
// Types
// ============================================

interface ExportButtonProps<T extends Record<string, unknown>> {
  data: T[];
  filename: string;
  title?: string;
  subtitle?: string;
  columns?: ExportColumn<T>[];
  formats?: ExportFormat[];
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  onExportStart?: (format: ExportFormat) => void;
  onExportComplete?: (format: ExportFormat) => void;
  onExportError?: (error: Error) => void;
  className?: string;
}

// ============================================
// Constants
// ============================================

const FORMAT_CONFIG: Record<ExportFormat, { label: string; icon: React.ElementType; description: string }> = {
  csv: {
    label: "CSV",
    icon: FileSpreadsheet,
    description: "Excel-compatible spreadsheet",
  },
  json: {
    label: "JSON",
    icon: FileJson,
    description: "Structured data format",
  },
  pdf: {
    label: "PDF",
    icon: FileText,
    description: "Printable document",
  },
};

const SIZE_CLASSES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

const VARIANT_CLASSES = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white border-transparent",
  secondary: "bg-gray-800 hover:bg-gray-700 text-white border-gray-700",
  ghost: "bg-transparent hover:bg-gray-800 text-gray-300 border-gray-700",
};

// ============================================
// Component
// ============================================

export function ExportButton<T extends Record<string, unknown>>({
  data,
  filename,
  title,
  subtitle,
  columns,
  formats = ["csv", "json", "pdf"],
  disabled = false,
  size = "md",
  variant = "secondary",
  onExportStart,
  onExportComplete,
  onExportError,
  className = "",
}: ExportButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [success, setSuccess] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportingFormat(format);
    setError(null);
    setSuccess(null);
    onExportStart?.(format);

    try {
      const options: ExportOptions<T> = {
        filename,
        format,
        title,
        subtitle,
        columns,
        includeTimestamp: true,
      };

      exportData(data, options);

      setSuccess(format);
      onExportComplete?.(format);

      // Clear success after 2 seconds
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Export failed";
      setError(errorMessage);
      onExportError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setIsExporting(false);
      setExportingFormat(null);
      setIsOpen(false);
    }
  };

  const isDisabled = disabled || data.length === 0;

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled || isExporting}
        className={`
          flex items-center gap-2 rounded-lg border transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${SIZE_CLASSES[size]}
          ${VARIANT_CLASSES[variant]}
        `}
      >
        {isExporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : success ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : error ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        <span>Export</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {isOpen && !isExporting && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2">
              <p className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider">
                Export Format
              </p>
              {formats.map((format) => {
                const config = FORMAT_CONFIG[format];
                const Icon = config.icon;

                return (
                  <button
                    key={format}
                    onClick={() => handleExport(format)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800 transition-colors text-left"
                  >
                    <Icon className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-white">{config.label}</p>
                      <p className="text-xs text-gray-500">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Data Info */}
            <div className="px-4 py-2 bg-gray-800/50 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                {data.length} {data.length === 1 ? "record" : "records"} to export
              </p>
            </div>
          </div>
        </>
      )}

      {/* Error Toast */}
      {error && (
        <div className="absolute top-full right-0 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================
// Quick Export Buttons (Single Format)
// ============================================

interface QuickExportProps<T extends Record<string, unknown>> {
  data: T[];
  filename: string;
  columns?: ExportColumn<T>[];
  disabled?: boolean;
  className?: string;
}

export function ExportCSVButton<T extends Record<string, unknown>>({
  data,
  filename,
  columns,
  disabled,
  className,
}: QuickExportProps<T>) {
  const handleExport = () => {
    exportData(data, { filename, format: "csv", columns });
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50 ${className}`}
    >
      <FileSpreadsheet className="w-4 h-4" />
      CSV
    </button>
  );
}

export function ExportJSONButton<T extends Record<string, unknown>>({
  data,
  filename,
  columns,
  disabled,
  className,
}: QuickExportProps<T>) {
  const handleExport = () => {
    exportData(data, { filename, format: "json", columns });
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50 ${className}`}
    >
      <FileJson className="w-4 h-4" />
      JSON
    </button>
  );
}

export type { ExportButtonProps };
