"use client";

import { useState, useCallback, useMemo } from "react";

// ============================================================================
// Types
// ============================================================================

export type ValidationRule<T = string> = {
  validate: (value: T, formValues?: Record<string, unknown>) => boolean;
  message: string;
};

export type FieldConfig = {
  initialValue: string;
  rules?: ValidationRule<string>[];
  transform?: (value: string) => string;
};

export type FieldState<T = string> = {
  value: T;
  error: string | null;
  touched: boolean;
  dirty: boolean;
};

export type FormState<T extends Record<string, string>> = {
  [K in keyof T]: FieldState<string>;
};

// ============================================================================
// Common Validation Rules
// ============================================================================

export const ValidationRules = {
  required: (message = "This field is required"): ValidationRule<string> => ({
    validate: (value) => value.trim().length > 0,
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value) => value.length >= min,
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value) => value.length <= max,
    message: message || `Must be no more than ${max} characters`,
  }),

  min: (min: number, message?: string): ValidationRule<string> => ({
    validate: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num >= min;
    },
    message: message || `Must be at least ${min}`,
  }),

  max: (max: number, message?: string): ValidationRule<string> => ({
    validate: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num <= max;
    },
    message: message || `Must be no more than ${max}`,
  }),

  pattern: (regex: RegExp, message: string): ValidationRule<string> => ({
    validate: (value) => regex.test(value),
    message,
  }),

  email: (message = "Invalid email address"): ValidationRule<string> => ({
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message,
  }),

  starknetAddress: (message = "Invalid Starknet address"): ValidationRule<string> => ({
    validate: (value) => /^0x[a-fA-F0-9]{63,64}$/.test(value),
    message,
  }),

  ethereumAddress: (message = "Invalid Ethereum address"): ValidationRule<string> => ({
    validate: (value) => /^0x[a-fA-F0-9]{40}$/.test(value),
    message,
  }),

  positiveNumber: (message = "Must be a positive number"): ValidationRule<string> => ({
    validate: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num > 0;
    },
    message,
  }),

  integer: (message = "Must be a whole number"): ValidationRule<string> => ({
    validate: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && Number.isInteger(num);
    },
    message,
  }),

  decimals: (maxDecimals: number, message?: string): ValidationRule<string> => ({
    validate: (value) => {
      const parts = value.split(".");
      return parts.length === 1 || parts[1].length <= maxDecimals;
    },
    message: message || `Maximum ${maxDecimals} decimal places`,
  }),

  custom: <T>(
    validate: (value: T, formValues?: Record<string, unknown>) => boolean,
    message: string
  ): ValidationRule<T> => ({
    validate,
    message,
  }),
};

// ============================================================================
// useFormValidation Hook
// ============================================================================

export function useFormValidation<T extends Record<string, string>>(
  config: { [K in keyof T]: FieldConfig }
) {
  // Initialize form state
  const initialState = useMemo(() => {
    const state: Record<string, FieldState<string>> = {};
    for (const key in config) {
      state[key] = {
        value: config[key].initialValue,
        error: null,
        touched: false,
        dirty: false,
      };
    }
    return state as FormState<T>;
  }, []);

  const [formState, setFormState] = useState<FormState<T>>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate a single field
  const validateField = useCallback(
    (name: keyof T, value: string): string | null => {
      const fieldConfig = config[name];
      if (!fieldConfig.rules) return null;

      const allValues: Record<string, unknown> = {};
      for (const key in formState) {
        allValues[key] = formState[key].value;
      }
      allValues[name as string] = value;

      for (const rule of fieldConfig.rules) {
        if (!rule.validate(value, allValues)) {
          return rule.message;
        }
      }
      return null;
    },
    [config, formState]
  );

  // Set field value
  const setValue = useCallback(
    (name: keyof T, value: string) => {
      const fieldConfig = config[name];
      const transformedValue = fieldConfig.transform ? fieldConfig.transform(value) : value;

      setFormState((prev) => ({
        ...prev,
        [name]: {
          ...prev[name],
          value: transformedValue,
          dirty: transformedValue !== config[name].initialValue,
          error: prev[name].touched ? validateField(name, transformedValue) : null,
        },
      }));
    },
    [config, validateField]
  );

  // Mark field as touched (on blur)
  const setTouched = useCallback(
    (name: keyof T) => {
      setFormState((prev) => {
        const error = validateField(name, prev[name].value);
        return {
          ...prev,
          [name]: {
            ...prev[name],
            touched: true,
            error,
          },
        };
      });
    },
    [validateField]
  );

  // Clear field error
  const clearError = useCallback((name: keyof T) => {
    setFormState((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        error: null,
      },
    }));
  }, []);

  // Validate all fields
  const validateAll = useCallback((): boolean => {
    let isValid = true;
    const newState = { ...formState };

    for (const name in config) {
      const error = validateField(name, formState[name].value);
      newState[name] = {
        ...newState[name],
        touched: true,
        error,
      };
      if (error) isValid = false;
    }

    setFormState(newState as FormState<T>);
    return isValid;
  }, [config, formState, validateField]);

  // Reset form to initial state
  const reset = useCallback(() => {
    setFormState(initialState);
    setIsSubmitting(false);
  }, [initialState]);

  // Reset a single field
  const resetField = useCallback(
    (name: keyof T) => {
      setFormState((prev) => ({
        ...prev,
        [name]: {
          value: config[name].initialValue,
          error: null,
          touched: false,
          dirty: false,
        },
      }));
    },
    [config]
  );

  // Get field props for input binding
  const getFieldProps = useCallback(
    (name: keyof T) => ({
      value: formState[name].value,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setValue(name, e.target.value),
      onBlur: () => setTouched(name),
      name: name as string,
      "aria-invalid": !!formState[name].error,
      "aria-describedby": formState[name].error ? `${String(name)}-error` : undefined,
    }),
    [formState, setValue, setTouched]
  );

  // Get field state for display
  const getFieldState = useCallback(
    (name: keyof T) => ({
      value: formState[name].value,
      error: formState[name].error,
      touched: formState[name].touched,
      dirty: formState[name].dirty,
      hasError: !!formState[name].error && formState[name].touched,
    }),
    [formState]
  );

  // Get all values
  const values = useMemo(() => {
    const vals: Record<string, string> = {};
    for (const key in formState) {
      vals[key] = formState[key].value;
    }
    return vals as T;
  }, [formState]);

  // Check if form is valid
  const isValid = useMemo(() => {
    for (const name in config) {
      const error = validateField(name, formState[name].value);
      if (error) return false;
    }
    return true;
  }, [config, formState, validateField]);

  // Check if form is dirty
  const isDirty = useMemo(() => {
    for (const key in formState) {
      if (formState[key].dirty) return true;
    }
    return false;
  }, [formState]);

  // Handle form submission
  const handleSubmit = useCallback(
    (onSubmit: (values: T) => Promise<void> | void) => async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!validateAll()) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [validateAll, values]
  );

  return {
    formState,
    values,
    isValid,
    isDirty,
    isSubmitting,
    setValue,
    setTouched,
    clearError,
    validateField,
    validateAll,
    reset,
    resetField,
    getFieldProps,
    getFieldState,
    handleSubmit,
  };
}

// ============================================================================
// useFieldValidation Hook (for single field validation)
// ============================================================================

export function useFieldValidation<T = string>(
  initialValue: T,
  rules: ValidationRule<T>[] = []
) {
  const [value, setValueState] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const validate = useCallback(
    (val: T): string | null => {
      for (const rule of rules) {
        if (!rule.validate(val)) {
          return rule.message;
        }
      }
      return null;
    },
    [rules]
  );

  const setValue = useCallback(
    (newValue: T) => {
      setValueState(newValue);
      if (touched) {
        setError(validate(newValue));
      }
    },
    [touched, validate]
  );

  const blur = useCallback(() => {
    setTouched(true);
    setError(validate(value));
  }, [validate, value]);

  const reset = useCallback(() => {
    setValueState(initialValue);
    setError(null);
    setTouched(false);
  }, [initialValue]);

  return {
    value,
    error,
    touched,
    hasError: !!error && touched,
    setValue,
    blur,
    reset,
    validate: () => {
      const err = validate(value);
      setError(err);
      setTouched(true);
      return !err;
    },
  };
}
