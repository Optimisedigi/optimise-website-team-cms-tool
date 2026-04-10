'use client';

import { useState, useCallback } from 'react';

interface SitelinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SitelinkData) => void;
  initialData?: SitelinkData;
  mode?: 'create' | 'edit';
}

interface SitelinkData {
  linkText: string;
  linkUrl: string;
  description1?: string;
  description2?: string;
}

export default function GoogleAdsSitelinkDialog({
  isOpen,
  onClose,
  onSave,
  initialData,
  mode = 'create',
}: SitelinkDialogProps) {
  const [linkText, setLinkText] = useState(initialData?.linkText || '');
  const [linkUrl, setLinkUrl] = useState(initialData?.linkUrl || '');
  const [description1, setDescription1] = useState(
    initialData?.description1 || ''
  );
  const [description2, setDescription2] = useState(
    initialData?.description2 || ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!linkText.trim()) {
      newErrors.linkText = 'Link text is required';
    } else if (linkText.length > 25) {
      newErrors.linkText = 'Link text must be 25 characters or less';
    }

    if (!linkUrl.trim()) {
      newErrors.linkUrl = 'URL is required';
    } else if (!/^https?:\/\/.+/.test(linkUrl)) {
      newErrors.linkUrl = 'URL must start with http:// or https://';
    }

    if (description1.length > 35) {
      newErrors.description1 = 'Description 1 must be 35 characters or less';
    }

    if (description2.length > 35) {
      newErrors.description2 = 'Description 2 must be 35 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [linkText, linkUrl, description1, description2]);

  const handleSave = useCallback(() => {
    if (validate()) {
      onSave({
        linkText: linkText.trim(),
        linkUrl: linkUrl.trim(),
        description1: description1.trim() || undefined,
        description2: description2.trim() || undefined,
      });
      onClose();
    }
  }, [validate, onSave, onClose, linkText, linkUrl, description1, description2]);

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
            {mode === 'edit' ? 'Edit Sitelink' : 'Create Sitelink'}
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
          {/* Link Text */}
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
              Link Text <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              maxLength={25}
              placeholder="e.g. About Us, Contact, Services"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.linkText ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              {errors.linkText ? (
                <span style={{ fontSize: 12, color: '#dc2626' }}>
                  {errors.linkText}
                </span>
              ) : (
                <span />
              )}
              <span
                style={{
                  fontSize: 11,
                  color: linkText.length > 25 ? '#dc2626' : '#9ca3af',
                }}
              >
                {linkText.length}/25
              </span>
            </div>
          </div>

          {/* URL */}
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
              Landing Page URL <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://www.example.com/about"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.linkUrl ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
              }}
            />
            {errors.linkUrl && (
              <span style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>
                {errors.linkUrl}
              </span>
            )}
          </div>

          {/* Description 1 */}
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
              Description Line 1{' '}
              <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={description1}
              onChange={(e) => setDescription1(e.target.value)}
              maxLength={35}
              placeholder="e.g. Trusted by 1000+ customers"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.description1 ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Shown below link text in search ad
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: description1.length > 35 ? '#dc2626' : '#9ca3af',
                }}
              >
                {description1.length}/35
              </span>
            </div>
          </div>

          {/* Description 2 */}
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
              Description Line 2{' '}
              <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={description2}
              onChange={(e) => setDescription2(e.target.value)}
              maxLength={35}
              placeholder="e.g. Free quotes available"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${errors.description2 ? '#dc2626' : '#d1d5db'}`,
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: description2.length > 35 ? '#dc2626' : '#9ca3af',
                float: 'right',
                marginTop: 4,
              }}
            >
              {description2.length}/35
            </span>
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
            <div style={{ color: '#1a0dab', fontSize: 14 }}>
              {linkText || 'Link Text'}
            </div>
            {description1 && (
              <div style={{ color: '#545454', fontSize: 13 }}>
                {description1}
              </div>
            )}
            {description2 && (
              <div style={{ color: '#545454', fontSize: 13 }}>
                {description2}
              </div>
            )}
            <div style={{ color: '#006621', fontSize: 12, marginTop: 4 }}>
              {linkUrl || 'https://example.com'}
            </div>
          </div>
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
            {mode === 'edit' ? 'Save Changes' : 'Create Sitelink'}
          </button>
        </div>
      </div>
    </div>
  );
}
