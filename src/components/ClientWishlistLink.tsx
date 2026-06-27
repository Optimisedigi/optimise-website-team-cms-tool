'use client'

export default function ClientWishlistLink() {
  return (
    <div className="client-wishlist-list-action" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', margin: '0 0 12px' }}>
      <a
        href="/admin/collections/client-wishlist-items"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 13px',
          borderRadius: 999,
          background: '#111827',
          color: '#ffffff',
          fontSize: 10,
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
