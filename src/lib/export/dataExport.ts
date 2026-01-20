"use client";

/**
 * Data Export Utility
 *
 * Comprehensive data export functionality:
 * - CSV export with customizable columns
 * - JSON export with formatting
 * - PDF report generation
 * - Excel-compatible CSV
 * - Download management
 */

// ============================================
// Types
// ============================================

type ExportFormat = "csv" | "json" | "pdf";

interface ExportColumn<T> {
  key: keyof T | string;
  header: string;
  formatter?: (value: unknown, row: T) => string;
  width?: number; // For PDF
}

interface ExportOptions<T> {
  filename: string;
  format: ExportFormat;
  columns?: ExportColumn<T>[];
  title?: string;
  subtitle?: string;
  includeTimestamp?: boolean;
  dateFormat?: string;
}

interface CSVOptions {
  delimiter?: string;
  includeHeaders?: boolean;
  quoteStrings?: boolean;
  nullValue?: string;
}

interface PDFOptions {
  orientation?: "portrait" | "landscape";
  pageSize?: "a4" | "letter";
  margins?: { top: number; right: number; bottom: number; left: number };
  headerColor?: string;
  fontSize?: number;
}

// ============================================
// Utility Functions
// ============================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current, key) => {
    return current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined;
  }, obj as unknown);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCSV(value: string, delimiter: string, quoteStrings: boolean): string {
  const needsQuoting =
    quoteStrings ||
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");

  if (needsQuoting) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// CSV Export
// ============================================

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  options: ExportOptions<T>,
  csvOptions: CSVOptions = {}
): void {
  const {
    delimiter = ",",
    includeHeaders = true,
    quoteStrings = true,
    nullValue = "",
  } = csvOptions;

  const { filename, columns, includeTimestamp = true } = options;

  // Determine columns
  const exportColumns: ExportColumn<T>[] = columns ||
    (data.length > 0
      ? Object.keys(data[0]).map((key) => ({ key, header: key }))
      : []);

  // Build CSV content
  const lines: string[] = [];

  // Add BOM for Excel compatibility
  const BOM = "\uFEFF";

  // Headers
  if (includeHeaders) {
    const headers = exportColumns.map((col) =>
      escapeCSV(col.header, delimiter, quoteStrings)
    );
    lines.push(headers.join(delimiter));
  }

  // Data rows
  for (const row of data) {
    const values = exportColumns.map((col) => {
      const rawValue = getNestedValue(row, String(col.key));
      const formattedValue = col.formatter
        ? col.formatter(rawValue, row)
        : formatValue(rawValue);
      return escapeCSV(formattedValue || nullValue, delimiter, quoteStrings);
    });
    lines.push(values.join(delimiter));
  }

  const content = BOM + lines.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });

  const finalFilename = includeTimestamp
    ? `${filename}_${generateTimestamp()}.csv`
    : `${filename}.csv`;

  downloadBlob(blob, finalFilename);
}

// ============================================
// JSON Export
// ============================================

export function exportToJSON<T>(
  data: T[],
  options: ExportOptions<T>
): void {
  const { filename, columns, includeTimestamp = true, title, subtitle } = options;

  let exportData: unknown;

  if (columns) {
    // Export only specified columns
    exportData = data.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const col of columns) {
        const value = getNestedValue(row as Record<string, unknown>, String(col.key));
        obj[col.header] = col.formatter ? col.formatter(value, row) : value;
      }
      return obj;
    });
  } else {
    exportData = data;
  }

  const output = {
    metadata: {
      title,
      subtitle,
      exportedAt: new Date().toISOString(),
      recordCount: data.length,
    },
    data: exportData,
  };

  const content = JSON.stringify(output, null, 2);
  const blob = new Blob([content], { type: "application/json" });

  const finalFilename = includeTimestamp
    ? `${filename}_${generateTimestamp()}.json`
    : `${filename}.json`;

  downloadBlob(blob, finalFilename);
}

// ============================================
// PDF Export (Simple HTML-based)
// ============================================

export function exportToPDF<T extends Record<string, unknown>>(
  data: T[],
  options: ExportOptions<T>,
  pdfOptions: PDFOptions = {}
): void {
  const {
    orientation = "portrait",
    pageSize = "a4",
    margins = { top: 20, right: 20, bottom: 20, left: 20 },
    headerColor = "#1e40af",
    fontSize = 10,
  } = pdfOptions;

  const { filename, columns, title, subtitle, includeTimestamp = true } = options;

  // Determine columns
  const exportColumns: ExportColumn<T>[] = columns ||
    (data.length > 0
      ? Object.keys(data[0]).map((key) => ({ key, header: key }))
      : []);

  // Build HTML content for printing
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${title || filename}</title>
      <style>
        @page {
          size: ${pageSize} ${orientation};
          margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: ${fontSize}pt;
          color: #1f2937;
          line-height: 1.4;
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid ${headerColor};
        }
        .header h1 {
          margin: 0 0 5px 0;
          font-size: 18pt;
          color: ${headerColor};
        }
        .header p {
          margin: 0;
          color: #6b7280;
          font-size: 10pt;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          margin-bottom: 15px;
          font-size: 9pt;
          color: #6b7280;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background-color: ${headerColor};
          color: white;
          padding: 8px 6px;
          text-align: left;
          font-weight: 600;
          font-size: 9pt;
        }
        td {
          padding: 6px;
          border-bottom: 1px solid #e5e7eb;
          font-size: 9pt;
        }
        tr:nth-child(even) {
          background-color: #f9fafb;
        }
        .footer {
          margin-top: 20px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 8pt;
          color: #9ca3af;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${title ? `<h1>${title}</h1>` : ""}
        ${subtitle ? `<p>${subtitle}</p>` : ""}
      </div>
      <div class="meta">
        <span>Total Records: ${data.length}</span>
        <span>Generated: ${new Date().toLocaleString()}</span>
      </div>
      <table>
        <thead>
          <tr>
            ${exportColumns.map((col) => `<th>${col.header}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
            <tr>
              ${exportColumns
                .map((col) => {
                  const value = getNestedValue(row, String(col.key));
                  const formatted = col.formatter
                    ? col.formatter(value, row)
                    : formatValue(value);
                  return `<td>${formatted}</td>`;
                })
                .join("")}
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
      <div class="footer">
        BitSage Validator - Data Export
      </div>
    </body>
    </html>
  `;

  // Open print dialog
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print();
      // Close after print dialog
      printWindow.onafterprint = () => printWindow.close();
    }, 250);
  }
}

// ============================================
// Unified Export Function
// ============================================

export function exportData<T extends Record<string, unknown>>(
  data: T[],
  options: ExportOptions<T>,
  formatOptions?: CSVOptions | PDFOptions
): void {
  switch (options.format) {
    case "csv":
      exportToCSV(data, options, formatOptions as CSVOptions);
      break;
    case "json":
      exportToJSON(data, options);
      break;
    case "pdf":
      exportToPDF(data, options, formatOptions as PDFOptions);
      break;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

// ============================================
// React Hook for Export
// ============================================

import { useState, useCallback } from "react";

interface UseExportOptions {
  onSuccess?: (filename: string) => void;
  onError?: (error: Error) => void;
}

export function useDataExport<T extends Record<string, unknown>>(
  options: UseExportOptions = {}
) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const exportCSV = useCallback(
    (data: T[], exportOptions: Omit<ExportOptions<T>, "format">, csvOptions?: CSVOptions) => {
      setIsExporting(true);
      setError(null);

      try {
        exportToCSV(data, { ...exportOptions, format: "csv" }, csvOptions);
        options.onSuccess?.(`${exportOptions.filename}.csv`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Export failed");
        setError(error);
        options.onError?.(error);
      } finally {
        setIsExporting(false);
      }
    },
    [options]
  );

  const exportJSON = useCallback(
    (data: T[], exportOptions: Omit<ExportOptions<T>, "format">) => {
      setIsExporting(true);
      setError(null);

      try {
        exportToJSON(data, { ...exportOptions, format: "json" });
        options.onSuccess?.(`${exportOptions.filename}.json`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Export failed");
        setError(error);
        options.onError?.(error);
      } finally {
        setIsExporting(false);
      }
    },
    [options]
  );

  const exportPDF = useCallback(
    (data: T[], exportOptions: Omit<ExportOptions<T>, "format">, pdfOptions?: PDFOptions) => {
      setIsExporting(true);
      setError(null);

      try {
        exportToPDF(data, { ...exportOptions, format: "pdf" }, pdfOptions);
        options.onSuccess?.(`${exportOptions.filename}.pdf`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Export failed");
        setError(error);
        options.onError?.(error);
      } finally {
        setIsExporting(false);
      }
    },
    [options]
  );

  return {
    isExporting,
    error,
    exportCSV,
    exportJSON,
    exportPDF,
  };
}

// ============================================
// Pre-configured Export Templates
// ============================================

export const ExportTemplates = {
  jobs: <T extends Record<string, unknown>>(data: T[]) => ({
    filename: "bitsage_jobs",
    title: "BitSage Jobs Export",
    subtitle: "Complete job history",
    columns: [
      { key: "id", header: "Job ID" },
      { key: "type", header: "Type" },
      { key: "status", header: "Status" },
      { key: "reward", header: "Reward (SAGE)", formatter: (v: unknown) => String(v || 0) },
      { key: "duration", header: "Duration (s)", formatter: (v: unknown) => String(v || 0) },
      { key: "gpuId", header: "GPU" },
      { key: "createdAt", header: "Created", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleString() : String(v || "") },
      { key: "completedAt", header: "Completed", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleString() : String(v || "") },
    ] as ExportColumn<T>[],
  }),

  proofs: <T extends Record<string, unknown>>(data: T[]) => ({
    filename: "bitsage_proofs",
    title: "BitSage Proofs Export",
    subtitle: "Proof generation history",
    columns: [
      { key: "id", header: "Proof ID" },
      { key: "circuitType", header: "Circuit Type" },
      { key: "status", header: "Status" },
      { key: "generationTime", header: "Generation Time (ms)" },
      { key: "verificationTime", header: "Verification Time (ms)" },
      { key: "method", header: "Method" },
      { key: "gpuId", header: "GPU" },
      { key: "timestamp", header: "Timestamp", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleString() : String(v || "") },
    ] as ExportColumn<T>[],
  }),

  earnings: <T extends Record<string, unknown>>(data: T[]) => ({
    filename: "bitsage_earnings",
    title: "BitSage Earnings Report",
    subtitle: "Earnings and rewards history",
    columns: [
      { key: "date", header: "Date", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleDateString() : String(v || "") },
      { key: "type", header: "Type" },
      { key: "amount", header: "Amount (SAGE)", formatter: (v: unknown) =>
        typeof v === "number" ? v.toFixed(4) : String(v || 0) },
      { key: "source", header: "Source" },
      { key: "txHash", header: "Transaction Hash" },
      { key: "status", header: "Status" },
    ] as ExportColumn<T>[],
  }),

  transactions: <T extends Record<string, unknown>>(data: T[]) => ({
    filename: "bitsage_transactions",
    title: "BitSage Transactions",
    subtitle: "Wallet transaction history",
    columns: [
      { key: "hash", header: "Transaction Hash" },
      { key: "type", header: "Type" },
      { key: "from", header: "From" },
      { key: "to", header: "To" },
      { key: "amount", header: "Amount", formatter: (v: unknown) =>
        typeof v === "number" ? v.toFixed(6) : String(v || 0) },
      { key: "token", header: "Token" },
      { key: "fee", header: "Fee" },
      { key: "status", header: "Status" },
      { key: "timestamp", header: "Timestamp", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleString() : String(v || "") },
    ] as ExportColumn<T>[],
  }),

  governance: <T extends Record<string, unknown>>(data: T[]) => ({
    filename: "bitsage_governance",
    title: "BitSage Governance History",
    subtitle: "Voting and proposal history",
    columns: [
      { key: "proposalId", header: "Proposal ID" },
      { key: "title", header: "Title" },
      { key: "vote", header: "Your Vote" },
      { key: "votePower", header: "Vote Power" },
      { key: "result", header: "Result" },
      { key: "votedAt", header: "Voted At", formatter: (v: unknown) =>
        v instanceof Date ? v.toLocaleString() : String(v || "") },
    ] as ExportColumn<T>[],
  }),
};

export type { ExportFormat, ExportColumn, ExportOptions, CSVOptions, PDFOptions };
