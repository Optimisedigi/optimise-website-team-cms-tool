'use client'

export default function ClientWishlistLink() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 16px' }}>
      <a
        href="/admin/collections/client-wishlist-items"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          borderRadius: 999,
          background: '#111827',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 1px 2px rgba(16, 24, 40, 0.12)',
        }}
      >
        Client Wishlist
      </a>
    </div>
  )
}
