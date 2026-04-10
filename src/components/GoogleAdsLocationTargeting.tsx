'use client';

import { useState, useCallback } from 'react';

interface Location {
  id: string;
  name: string;
  type?: string;
}

interface LocationTargetingProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (locations: Location[]) => void;
  initialLocations?: Location[];
  campaignId?: string;
}

export default function GoogleAdsLocationTargeting({
  isOpen,
  onClose,
  onSave,
  initialLocations = [],
  campaignId,
}: LocationTargetingProps) {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLocations, setSelectedLocations] =
    useState<Location[]>(initialLocations);
  const [biddingModifier, setBiddingModifier] = useState<Record<string, number>>(
    {}
  );

  const handleSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);

      // Simulated location search (in production, would call Google Ads Geolocation API)
      // For now, just show a placeholder
      const mockResults: Location[] = [
        { id: '1023191', name: 'London, England, United Kingdom', type: 'City' },
        {
          id: '28289',
          name: 'England, United Kingdom',
          type: 'Region',
        },
        {
          id: '20616',
          name: 'United Kingdom',
          type: 'Country',
        },
        {
          id: '20474',
          name: 'Greater London, England, United Kingdom',
          type: 'Metro',
        },
      ].filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase())
      );

      setSearchResults(mockResults);
      setSearching(false);
    },
    []
  );

  const addLocation = useCallback((location: Location) => {
    setSelectedLocations((prev) => {
      if (prev.some((l) => l.id === location.id)) return prev;
      return [...prev, location];
    });
    setSearch('');
    setSearchResults([]);
  }, []);

  const removeLocation = useCallback((locationId: string) => {
    setSelectedLocations((prev) => prev.filter((l) => l.id !== locationId));
    setBiddingModifier((prev) => {
      const next = { ...prev };
      delete next[locationId];
      return next;
    });
  }, []);

  const updateModifier = useCallback((locationId: string, modifier: number) => {
    setBiddingModifier((prev) => ({
      ...prev,
      [locationId]: modifier,
    }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(selectedLocations);
    onClose();
  }, [selectedLocations, onSave, onClose]);

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
          maxWidth: 600,
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
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
              Location Targeting
            </h2>
            {campaignId && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Campaign: {campaignId}
              </p>
            )}
          </div>
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

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: '#374151',
              marginBottom: 6,
            }}
          >
            Search Locations
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              handleSearch(e.target.value);
            }}
            placeholder="Search cities, regions, countries..."
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 14,
              border: '1px solid #d1d5db',
              borderRadius: 6,
              outline: 'none',
            }}
          />

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div
              style={{
                marginTop: 8,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                maxHeight: 200,
                overflow: 'auto',
                background: '#fff',
              }}
            >
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  onClick={() => addLocation(result)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#f8fafc')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'transparent')
                  }
                >
                  <div>
                    <div style={{ fontWeight: 500, color: '#1e293b' }}>
                      {result.name}
                    </div>
                    {result.type && (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {result.type}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: '#2563eb' }}>+ Add</span>
                </div>
              ))}
            </div>
          )}

          {searching && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
              Searching...
            </div>
          )}
        </div>

        {/* Selected Locations */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: '#374151',
              marginBottom: 8,
            }}
          >
            Targeted Locations ({selectedLocations.length})
          </label>

          {selectedLocations.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px dashed #d1d5db',
                color: '#64748b',
              }}
            >
              No locations targeted. Search and add locations above.
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {selectedLocations.map((location, index) => (
                <div
                  key={location.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom:
                      index < selectedLocations.length - 1
                        ? '1px solid #f1f5f9'
                        : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: '#1e293b' }}>
                      {location.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      ID: {location.id}
                      {location.type && ` • ${location.type}`}
                    </div>
                  </div>

                  {/* Bidding Modifier */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label
                      style={{
                        fontSize: 12,
                        color: '#64748b',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Bid adj:
                    </label>
                    <input
                      type="number"
                      value={biddingModifier[location.id] ?? 0}
                      onChange={(e) =>
                        updateModifier(location.id, parseInt(e.target.value) || 0)
                      }
                      min={-90}
                      max={900}
                      step={10}
                      style={{
                        width: 60,
                        padding: '4px 8px',
                        fontSize: 12,
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                      }}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>%</span>
                  </div>

                  <button
                    onClick={() => removeLocation(location.id)}
                    style={{
                      padding: '4px 8px',
                      fontSize: 12,
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div
          style={{
            padding: 12,
            background: '#eff6ff',
            borderRadius: 8,
            border: '1px solid #bfdbfe',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, color: '#1e40af' }}>
            Location Targeting Tips
          </div>
          <ul
            style={{
              margin: '8px 0 0',
              paddingLeft: 20,
              fontSize: 12,
              color: '#1e40af',
              lineHeight: 1.6,
            }}
          >
            <li>Use negative targeting to exclude specific areas within a region</li>
            <li>Bid adjustments range from -90% to +900%</li>
            <li>Consider using radius targeting for service-based businesses</li>
          </ul>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
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
            Save Locations ({selectedLocations.length})
          </button>
        </div>
      </div>
    </div>
  );
}
