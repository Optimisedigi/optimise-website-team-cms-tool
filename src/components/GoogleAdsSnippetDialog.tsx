'use client';

import { useState, useCallback } from 'react';

interface SnippetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SnippetData) => void;
  initialData?: SnippetData;
  mode?: 'create' | 'edit';
}

interface SnippetData {
  header: string;
  values: string[];
}

const SNIPPET_HEADERS = [
  { value: 'Destinations', label: 'Destinations' },
  { value: 'Services', label: 'Services' },
  { value: 'Brands', label: 'Brands' },
  { value: 'Schools', label: 'Schools' },
  { value: 'Neighborhoods', label: 'Neighborhoods' },
  { value: 'Types', label: 'Types' },
  { value: 'Collections', label: 'Collections' },
  { value: 'Hotels', label: 'Hotels' },
  { value: 'Insurance Coverage', label: 'Insurance Coverage' },
  { value: 'Models', label: 'Models' },
  { value: 'Entertainment', label: 'Entertainment' },
  { value: 'Activities', label: 'Activities' },
  { value: 'Natural Landmarks', label: 'Natural Landmarks' },
  { value: 'Featured Items', label: 'Featured Items' },
  { value: 'Product Types', label: 'Product Types' },
  { value: 'Services Offered', label: 'Services Offered' },
  { value: 'Programs', label: 'Programs' },
  { value: 'Events', label: 'Events' },
  { value: 'Departments', label: 'Departments' },
  { value: 'Amenities', label: 'Amenities' },
  { value: 'Styles', label: 'Styles' },
  { value: 'Artists', label: 'Artists' },
  { value: 'Benefits', label: 'Benefits' },
  { value: 'Menu Items', label: 'Menu Items' },
  { value: 'Dining Options', label: 'Dining Options' },
];

export default function GoogleAdsSnippetDialog({
  isOpen,
  onClose,
  onSave,
  initialData,
  mode = 'create',
}: SnippetDialogProps) {
  const [header, setHeader] = useState(initialData?.header || '');
  const [valuesText, setValuesText] = useState(
    initialData?.values?.join('\n') || ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const values = valuesText
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!header) {
      newErrors.header = 'Please select a header';
    }

    if (values.length < 3) {
      newErrors.values = 'At least 3 values are required';
    } else if (values.length > 10) {
      newErrors.values = 'Maximum 10 values allowed';
    }

    const invalidValues = values.filter((v) => v.length > 25);
    if (invalidValues.length > 0) {
      newErrors.values = 'Each value must be 25 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [header, values]);

  const handleSave = useCallback(() => {
    if (validate()) {
      onSave({
        header,
        values,
      });
      onClose();
    }
  }, [validate, onSave, onClose, header, values]);

  const addSampleValues = useCallback(() => {
    const samples: Record<string, string[]> = {
      Services: [
        'Plumbing',
        'Gas Fitting',
        'Drain Cleaning',
        'Hot Water Systems',
        'Bathroom Renovations',
        'Leak Detection',
      ],
      Brands: [
        'Rheem',
        'Dux',
        'Aquarel',
        'Thermann',
        'Bosh',
        'Nova',
      ],
      Products: [
        'Tapware',
        'Toilets',
        'Sinks',
        'Showers',
        'Accessories',
        'Water Filters',
      ],
    };

    const sample = samples[header] || [];
    if (sample.length > 0 && !valuesText.trim()) {
      setValuesText(sample.join('\n'));
    }
  }, [header, valuesText]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          width: '90%',
          maxWidth: 500,
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
            {mode === 'edit' ? 'Edit Structured Snippet' : 'Create Structured Snippet'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Header <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <select
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.header ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
                background: '#fff',
              }}
            >
              <option value="">Select a header...</option>
              {SNIPPET_HEADERS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
            {errors.header && (
              <span style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                {errors.header}
              </span>
            )}
          </div>

          {/* Values */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: '#374151',
                marginBottom: 6,
              }}
            >
              Values <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
              placeholder="Enter values, one per line&#10;e.g. Plumbing&#10;Gas Fitting&#10;Drain Cleaning"
              rows={6}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.values ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              {errors.values ? (
                <span style={{ fontSize: 12, color: '#dc2626' }}>
                  {errors.values}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  3-10 values, max 25 chars each
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  color:
                    values.length < 3 || values.length > 10
                      ? '#dc2626'
                      : '#9ca3af',
                }}
              >
                {values.length}/10 values
              </span>
            </div>

            {/* Add sample button */}
            {header && !valuesText.trim() && (
              <button
                type="button"
                onClick={addSampleValues}
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                Add sample values for &quot;{header}&quot;
              </button>
            )}
          </div>

          {/* Preview */}
          <div
            style={{
              padding: 16,
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#64748b',
                marginBottom: 8,
              }}
            >
              Preview
            </div>
            <div style={{ color: '#545454', fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{header || 'Header'}:</span>{' '}
              {values.length > 0 ? values.join(' | ') : 'Values...'}
            </div>
          </div>

          {/* Value list with character counts */}
          {values.length > 0 && (
            <div
              style={{
                padding: 12,
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#64748b',
                  marginBottom: 8,
                }}
              >
                Value validation
              </div>
              {values.map((v, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    padding: '2px 0',
                    color: v.length > 25 ? '#dc2626' : '#475569',
                  }}
                >
                  <span>
                    {i + 1}. {v}
                  </span>
                  <span>{v.length}/25</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 24,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {mode === 'edit' ? 'Save Changes' : 'Create Snippet'}
          </button>
        </div>
      </div>
    </div>
  );
}
