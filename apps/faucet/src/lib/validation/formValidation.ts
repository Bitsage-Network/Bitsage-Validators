"use client";

/**
 * Enhanced Form Validation System
 *
 * Features:
 * - Comprehensive validation rules for crypto/blockchain fields
 * - Real-time validation with debouncing
 * - Async validation support (e.g., checking address on-chain)
 * - Field-level and form-level validation
 * - Custom validation rule builder
 * - Accessibility-friendly error messages
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

// ============================================
// Types
// ============================================

type ValidationResult = {
  valid: boolean;
  error?: string;
  warning?: string;
};

type ValidationRule<T = string> = (
  value: T,
  formValues?: Record<string, unknown>
) => ValidationResult | Promise<ValidationResult>;

type FieldState = {
  value: string;
  touched: boolean;
  dirty: boolean;
  validating: boolean;
  valid: boolean;
  error?: string;
  warning?: string;
};

type FormState = {
  fields: Record<string, FieldState>;
  isValid: boolean;
  isValidating: boolean;
  isDirty: boolean;
  errors: Record<string, string | undefined>;
  warnings: Record<string, string | undefined>;
};

interface FieldConfig {
  initialValue?: string;
  rules?: ValidationRule[];
  asyncRules?: ValidationRule[];
  debounceMs?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
}

interface FormConfig {
  fields: Record<string, FieldConfig>;
  validateOnMount?: boolean;
  onValidChange?: (isValid: boolean) => void;
}

// ============================================
// Built-in Validation Rules
// ============================================

export const ValidationRules = {
  required: (message = "This field is required"): ValidationRule => {
    return (value) => ({
      valid: value.trim().length > 0,
      error: value.trim().length === 0 ? message : undefined,
    });
  },

  minLength: (min: number, message?: string): ValidationRule => {
    return (value) => ({
      valid: value.length >= min,
      error:
        value.length < min
          ? message || `Must be at least ${min} characters`
          : undefined,
    });
  },

  maxLength: (max: number, message?: string): ValidationRule => {
    return (value) => ({
      valid: value.length <= max,
      error:
        value.length > max
          ? message || `Must be no more than ${max} characters`
          : undefined,
    });
  },

  pattern: (regex: RegExp, message: string): ValidationRule => {
    return (value) => ({
      valid: regex.test(value),
      error: !regex.test(value) ? message : undefined,
    });
  },

  email: (message = "Please enter a valid email address"): ValidationRule => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (value) => ({
      valid: !value || emailRegex.test(value),
      error: value && !emailRegex.test(value) ? message : undefined,
    });
  },

  // Starknet address validation
  starknetAddress: (message = "Please enter a valid Starknet address"): ValidationRule => {
    return (value) => {
      if (!value) return { valid: true };

      // Starknet addresses are 66 characters (0x + 64 hex chars) or less
      const isValidFormat = /^0x[a-fA-F0-9]{1,64}$/.test(value);
      const isCorrectLength = value.length >= 3 && value.length <= 66;

      return {
        valid: isValidFormat && isCorrectLength,
        error: !(isValidFormat && isCorrectLength) ? message : undefined,
      };
    };
  },

  // Ethereum address validation
  ethereumAddress: (message = "Please enter a valid Ethereum address"): ValidationRule => {
    return (value) => {
      if (!value) return { valid: true };

      const isValidFormat = /^0x[a-fA-F0-9]{40}$/.test(value);

      return {
        valid: isValidFormat,
        error: !isValidFormat ? message : undefined,
      };
    };
  },

  // Numeric amount validation
  amount: (options: {
    min?: number;
    max?: number;
    decimals?: number;
    required?: boolean;
  } = {}): ValidationRule => {
    const { min = 0, max, decimals = 18, required = true } = options;

    return (value) => {
      if (!value || value.trim() === "") {
        return {
          valid: !required,
          error: required ? "Please enter an amount" : undefined,
        };
      }

      const numValue = parseFloat(value);

      if (isNaN(numValue)) {
        return { valid: false, error: "Please enter a valid number" };
      }

      if (numValue < min) {
        return { valid: false, error: `Amount must be at least ${min}` };
      }

      if (max !== undefined && numValue > max) {
        return { valid: false, error: `Amount must be no more than ${max}` };
      }

      // Check decimals
      const parts = value.split(".");
      if (parts.length > 1 && parts[1].length > decimals) {
        return {
          valid: false,
          error: `Maximum ${decimals} decimal places allowed`,
        };
      }

      return { valid: true };
    };
  },

  // Balance check (async - checks against provided balance)
  sufficientBalance: (
    getBalance: () => number | Promise<number>,
    tokenSymbol = "tokens"
  ): ValidationRule => {
    return async (value) => {
      if (!value || value.trim() === "") return { valid: true };

      const numValue = parseFloat(value);
      if (isNaN(numValue)) return { valid: true };

      const balance = await getBalance();

      if (numValue > balance) {
        return {
          valid: false,
          error: `Insufficient balance. You have ${balance.toFixed(4)} ${tokenSymbol}`,
        };
      }

      // Warning if using most of balance
      if (numValue > balance * 0.95) {
        return {
          valid: true,
          warning: "This will use most of your available balance",
        };
      }

      return { valid: true };
    };
  },

  // Matches another field
  matches: (
    fieldName: string,
    message = "Fields must match"
  ): ValidationRule => {
    return (value, formValues) => ({
      valid: value === formValues?.[fieldName],
      error: value !== formValues?.[fieldName] ? message : undefined,
    });
  },

  // Custom validation
  custom: (
    validator: (value: string) => boolean,
    message: string
  ): ValidationRule => {
    return (value) => ({
      valid: validator(value),
      error: !validator(value) ? message : undefined,
    });
  },

  // Compound validation (all must pass)
  all: (...rules: ValidationRule[]): ValidationRule => {
    return async (value, formValues) => {
      for (const rule of rules) {
        const result = await rule(value, formValues);
        if (!result.valid) return result;
      }
      return { valid: true };
    };
  },

  // Any validation (at least one must pass)
  any: (...rules: ValidationRule[]): ValidationRule => {
    return async (value, formValues) => {
      const results = await Promise.all(rules.map((rule) => rule(value, formValues)));
      const anyValid = results.some((r) => r.valid);
      return {
        valid: anyValid,
        error: anyValid ? undefined : results[0]?.error,
      };
    };
  },

  // URL validation
  url: (message = "Please enter a valid URL"): ValidationRule => {
    return (value) => {
      if (!value) return { valid: true };
      try {
        new URL(value);
        return { valid: true };
      } catch {
        return { valid: false, error: message };
      }
    };
  },

  // Hex string validation
  hexString: (message = "Please enter a valid hex string"): ValidationRule => {
    return (value) => {
      if (!value) return { valid: true };
      const isValid = /^0x[a-fA-F0-9]*$/.test(value);
      return {
        valid: isValid,
        error: !isValid ? message : undefined,
      };
    };
  },

  // Transaction hash validation
  txHash: (message = "Please enter a valid transaction hash"): ValidationRule => {
    return (value) => {
      if (!value) return { valid: true };
      const isValid = /^0x[a-fA-F0-9]{64}$/.test(value);
      return {
        valid: isValid,
        error: !isValid ? message : undefined,
      };
    };
  },
};

// ============================================
// Debounce Utility
// ============================================

function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
}

// ============================================
// useFormValidation Hook
// ============================================

export function useFormValidation(config: FormConfig) {
  const { fields: fieldConfigs, validateOnMount = false, onValidChange } = config;

  // Initialize field states
  const initialFields = useMemo(() => {
    const fields: Record<string, FieldState> = {};
    for (const [name, cfg] of Object.entries(fieldConfigs)) {
      fields[name] = {
        value: cfg.initialValue || "",
        touched: false,
        dirty: false,
        validating: false,
        valid: true,
        error: undefined,
        warning: undefined,
      };
    }
    return fields;
  }, []);

  const [formState, setFormState] = useState<FormState>({
    fields: initialFields,
    isValid: true,
    isValidating: false,
    isDirty: false,
    errors: {},
    warnings: {},
  });

  const validationQueue = useRef<Map<string, AbortController>>(new Map());

  // Validate a single field
  const validateField = useCallback(
    async (
      name: string,
      value: string,
      formValues: Record<string, unknown>
    ): Promise<ValidationResult> => {
      const cfg = fieldConfigs[name];
      if (!cfg) return { valid: true };

      const allRules = [...(cfg.rules || []), ...(cfg.asyncRules || [])];

      for (const rule of allRules) {
        const result = await rule(value, formValues);
        if (!result.valid || result.warning) {
          return result;
        }
      }

      return { valid: true };
    },
    [fieldConfigs]
  );

  // Create debounced validators for each field
  const debouncedValidators = useMemo(() => {
    const validators: Record<string, (value: string) => void> = {};

    for (const [name, cfg] of Object.entries(fieldConfigs)) {
      const debounceMs = cfg.debounceMs ?? 300;

      validators[name] = debounce(async (value: string) => {
        // Cancel previous validation
        const previousController = validationQueue.current.get(name);
        if (previousController) {
          previousController.abort();
        }

        const controller = new AbortController();
        validationQueue.current.set(name, controller);

        setFormState((prev) => ({
          ...prev,
          fields: {
            ...prev.fields,
            [name]: { ...prev.fields[name], validating: true },
          },
          isValidating: true,
        }));

        try {
          const formValues: Record<string, unknown> = {};
          for (const [key, field] of Object.entries(formState.fields)) {
            formValues[key] = field.value;
          }
          formValues[name] = value;

          const result = await validateField(name, value, formValues);

          if (controller.signal.aborted) return;

          setFormState((prev) => {
            const newFields = {
              ...prev.fields,
              [name]: {
                ...prev.fields[name],
                validating: false,
                valid: result.valid,
                error: result.error,
                warning: result.warning,
              },
            };

            const errors: Record<string, string | undefined> = {};
            const warnings: Record<string, string | undefined> = {};
            let isValid = true;

            for (const [key, field] of Object.entries(newFields)) {
              if (field.error) {
                errors[key] = field.error;
                isValid = false;
              }
              if (field.warning) {
                warnings[key] = field.warning;
              }
            }

            return {
              ...prev,
              fields: newFields,
              isValid,
              isValidating: false,
              errors,
              warnings,
            };
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          console.error(`Validation error for ${name}:`, error);
        }
      }, debounceMs);
    }

    return validators;
  }, [fieldConfigs, validateField]);

  // Set field value
  const setValue = useCallback(
    (name: string, value: string) => {
      const cfg = fieldConfigs[name];

      setFormState((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            value,
            dirty: true,
          },
        },
        isDirty: true,
      }));

      if (cfg?.validateOnChange !== false) {
        debouncedValidators[name]?.(value);
      }
    },
    [fieldConfigs, debouncedValidators]
  );

  // Set field touched
  const setTouched = useCallback(
    (name: string, touched = true) => {
      const cfg = fieldConfigs[name];

      setFormState((prev) => ({
        ...prev,
        fields: {
          ...prev.fields,
          [name]: {
            ...prev.fields[name],
            touched,
          },
        },
      }));

      if (touched && cfg?.validateOnBlur !== false) {
        const value = formState.fields[name]?.value || "";
        debouncedValidators[name]?.(value);
      }
    },
    [fieldConfigs, debouncedValidators, formState.fields]
  );

  // Get field props for input binding
  const getFieldProps = useCallback(
    (name: string) => {
      const field = formState.fields[name];

      return {
        value: field?.value || "",
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          setValue(name, e.target.value);
        },
        onBlur: () => setTouched(name, true),
        "aria-invalid": field?.touched && !field?.valid,
        "aria-describedby": field?.error ? `${name}-error` : undefined,
      };
    },
    [formState.fields, setValue, setTouched]
  );

  // Get field state
  const getFieldState = useCallback(
    (name: string): FieldState | undefined => {
      return formState.fields[name];
    },
    [formState.fields]
  );

  // Validate all fields
  const validateAll = useCallback(async (): Promise<boolean> => {
    const formValues: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(formState.fields)) {
      formValues[key] = field.value;
    }

    const results = await Promise.all(
      Object.entries(fieldConfigs).map(async ([name]) => {
        const value = formState.fields[name]?.value || "";
        const result = await validateField(name, value, formValues);
        return { name, result };
      })
    );

    const newFields = { ...formState.fields };
    const errors: Record<string, string | undefined> = {};
    const warnings: Record<string, string | undefined> = {};
    let isValid = true;

    for (const { name, result } of results) {
      newFields[name] = {
        ...newFields[name],
        valid: result.valid,
        error: result.error,
        warning: result.warning,
        touched: true,
      };

      if (result.error) {
        errors[name] = result.error;
        isValid = false;
      }
      if (result.warning) {
        warnings[name] = result.warning;
      }
    }

    setFormState((prev) => ({
      ...prev,
      fields: newFields,
      isValid,
      errors,
      warnings,
    }));

    return isValid;
  }, [formState.fields, fieldConfigs, validateField]);

  // Reset form
  const reset = useCallback(() => {
    const fields: Record<string, FieldState> = {};
    for (const [name, cfg] of Object.entries(fieldConfigs)) {
      fields[name] = {
        value: cfg.initialValue || "",
        touched: false,
        dirty: false,
        validating: false,
        valid: true,
        error: undefined,
        warning: undefined,
      };
    }

    setFormState({
      fields,
      isValid: true,
      isValidating: false,
      isDirty: false,
      errors: {},
      warnings: {},
    });
  }, [fieldConfigs]);

  // Notify on validity change
  useEffect(() => {
    onValidChange?.(formState.isValid);
  }, [formState.isValid, onValidChange]);

  // Validate on mount if configured
  useEffect(() => {
    if (validateOnMount) {
      validateAll();
    }
  }, [validateOnMount]);

  return {
    fields: formState.fields,
    errors: formState.errors,
    warnings: formState.warnings,
    isValid: formState.isValid,
    isValidating: formState.isValidating,
    isDirty: formState.isDirty,
    setValue,
    setTouched,
    getFieldProps,
    getFieldState,
    validateAll,
    reset,
  };
}

// ============================================
// Simple Field Validation Hook
// ============================================

export function useFieldValidation(
  rules: ValidationRule[],
  options: {
    debounceMs?: number;
    validateOnMount?: boolean;
  } = {}
) {
  const { debounceMs = 300, validateOnMount = false } = options;

  const [value, setValueState] = useState("");
  const [state, setState] = useState<{
    touched: boolean;
    validating: boolean;
    valid: boolean;
    error?: string;
    warning?: string;
  }>({
    touched: false,
    validating: false,
    valid: true,
  });

  const validate = useCallback(
    async (val: string) => {
      setState((prev) => ({ ...prev, validating: true }));

      for (const rule of rules) {
        const result = await rule(val);
        if (!result.valid || result.warning) {
          setState({
            touched: true,
            validating: false,
            valid: result.valid,
            error: result.error,
            warning: result.warning,
          });
          return result;
        }
      }

      setState({
        touched: true,
        validating: false,
        valid: true,
        error: undefined,
        warning: undefined,
      });
      return { valid: true };
    },
    [rules]
  );

  const debouncedValidate = useMemo(
    () => debounce(validate, debounceMs),
    [validate, debounceMs]
  );

  const setValue = useCallback(
    (val: string) => {
      setValueState(val);
      debouncedValidate(val);
    },
    [debouncedValidate]
  );

  const setTouched = useCallback(() => {
    setState((prev) => ({ ...prev, touched: true }));
    validate(value);
  }, [validate, value]);

  useEffect(() => {
    if (validateOnMount && value) {
      validate(value);
    }
  }, [validateOnMount]);

  return {
    value,
    setValue,
    setTouched,
    ...state,
    validate: () => validate(value),
  };
}

export type {
  ValidationResult,
  ValidationRule,
  FieldState,
  FormState,
  FieldConfig,
  FormConfig,
};
