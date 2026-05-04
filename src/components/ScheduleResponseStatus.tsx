'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

interface Attendee {
  name: string
  email: string
  token?: string
  responded: boolean
  respondedAt?: string
  emailSentAt?: string
  selectedSlots?: string[]
}

interface SchedulerDoc {
  id: string | number
  status: string
  matchedSlot?: string
  timezone?: string
  generatedSlots?: string[]
  attendees?: Attendee[]
}

interface SlotsByDay {
  dateKey: string
  label: string
  slots: { iso: string; timeLabel: string }[]
}

function groupSlotsByDay(slots: string[], timezone: string): SlotsByDay[] {
  const groups: Record<string, { iso: string; timeLabel: string }[]> = {}
  const dateLabels: Record<string, string> = {}

  for (const iso of slots) {
    const d = new Date(iso)
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(d)
    const label = d.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })
    const timeLabel = d.toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    })
    if (!groups[dateKey]) {
      groups[dateKey] = []
      dateLabels[dateKey] = label
    }
    groups[dateKey].push({ iso, timeLabel })
  }

  return Object.keys(groups)
    .sort()
    .map((dateKey) => ({
      dateKey,
      label: dateLabels[dateKey],
      slots: groups[dateKey].sort(
        (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
      ),
    }))
}

function intersectAll(attendees: Attendee[]): string[] {
  if (attendees.length === 0) return []
  const sets = attendees.map((a) => new Set(a.selectedSlots || []))
  const first = sets[0]
  return Array.from(first)
    .filter((slot) => sets.every((s) => s.has(slot)))
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
}

export default function ScheduleResponseStatus() {
  const { id } = useDocumentInfo()
  const [doc, setDoc] = useState<SchedulerDoc | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editSelected, setEditSelected] = useState<Set<string>>(new Set())
  const [customSlot, setCustomSlot] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmPick, setConfirmPick] = useState('')

  const refresh = () => {
    if (!id) return
    fetch(`/api/meeting-schedulers/${id}`)
      .then((r) => r.json())
      .then((d) => setDoc(d))
      .catch(() => {})
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const attendees = doc?.attendees || []
  const timezone = doc?.timezone || 'Australia/Sydney'
  const generatedSlots = doc?.generatedSlots || []
  const matchedSlot = doc?.matchedSlot || ''
  const intersection = useMemo(() => intersectAll(attendees), [attendees])

  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditSelected(new Set(attendees[idx]?.selectedSlots || []))
    setCustomSlot('')
    setErrorMsg(null)
  }

  const cancelEdit = () => {
    setEditingIdx(null)
    setEditSelected(new Set())
    setCustomSlot('')
    setErrorMsg(null)
  }

  const toggleEditSlot = (iso: string) => {
    setEditSelected((prev) => {
      const next = new Set(prev)
      if (next.has(iso)) next.delete(iso)
      else next.add(iso)
      return next
    })
  }

  const addCustomSlot = () => {
    if (!customSlot) return
    const d = new Date(customSlot)
    if (isNaN(d.getTime())) {
      setErrorMsg('Invalid date/time')
      return
    }
    const iso = d.toISOString()
    setEditSelected((prev) => {
      const next = new Set(prev)
      next.add(iso)
      return next
    })
    setCustomSlot('')
    setErrorMsg(null)
  }

  const saveEdit = async () => {
    if (editingIdx === null || !doc) return
    setSavingEdit(true)
    setErrorMsg(null)
    try {
      const selected = Array.from(editSelected).sort()
      // Merge any custom slots into generatedSlots
      const mergedGenerated = Array.from(
        new Set([...(doc.generatedSlots || []), ...selected])
      ).sort()
      const updatedAttendees = attendees.map((a, i) =>
        i === editingIdx
          ? {
              ...a,
              selectedSlots: selected,
              responded: selected.length > 0,
              respondedAt:
                selected.length > 0
                  ? a.respondedAt || new Date().toISOString()
                  : a.respondedAt,
            }
          : a
      )
      const res = await fetch(`/api/meeting-schedulers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          attendees: updatedAttendees,
          generatedSlots: mergedGenerated,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      setEditingIdx(null)
      setEditSelected(new Set())
      refresh()
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to save')
    } finally {
      setSavingEdit(false)
    }
  }

  const confirmMeeting = async (slotIso: string) => {
    if (!slotIso || !id) return
    if (!confirm(`Confirm meeting at ${new Date(slotIso).toLocaleString()}?\n\nThis creates the Google Calendar event and emails all attendees.`)) {
      return
    }
    setConfirming(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/meeting-schedulers/${id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ matchedSlot: slotIso }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || `HTTP ${res.status}`)
      refresh()
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to confirm')
    } finally {
      setConfirming(false)
    }
  }

  const editPool = useMemo(() => {
    if (editingIdx === null) return [] as string[]
    return Array.from(new Set([...(generatedSlots || []), ...editSelected])).sort()
  }, [editingIdx, generatedSlots, editSelected])
  const dayGroups = useMemo(
    () => groupSlotsByDay(editPool, timezone),
    [editPool, timezone]
  )

  if (!id || attendees.length === 0) return null

  const responded = attendees.filter((a) => a.responded).length
  const total = attendees.length

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--theme-elevation-50)',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <div style={{ marginBottom: 12, fontWeight: 600, color: 'var(--theme-text)' }}>
          Response Status ({responded}/{total} responded)
        </div>
        {matchedSlot && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--theme-success-100, #dcfce7)',
              borderRadius: 4,
              marginBottom: 12,
              color: 'var(--theme-success-500, #166534)',
              fontWeight: 500,
            }}
          >
            Confirmed: {new Date(matchedSlot).toLocaleString('en-AU', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: timezone,
            })}
          </div>
        )}
        {errorMsg && (
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--theme-error-100, #fee2e2)',
              borderRadius: 4,
              marginBottom: 12,
              color: 'var(--theme-error-500, #991b1b)',
            }}
          >
            {errorMsg}
          </div>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--theme-elevation-150)' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Email</th>
              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Status</th>
              <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}>Slots</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--theme-elevation-500)' }}></th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                <td style={{ padding: '6px 8px' }}>{a.name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--theme-elevation-500)' }}>{a.email}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {a.responded ? (
                    <span style={{ color: 'var(--theme-success-500, #22c55e)' }}>Responded</span>
                  ) : a.emailSentAt ? (
                    <span style={{ color: 'var(--theme-elevation-400)' }}>Waiting</span>
                  ) : (
                    <span style={{ color: 'var(--theme-elevation-300)' }}>Not sent</span>
                  )}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {a.responded ? a.selectedSlots?.length || 0 : '-'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => (editingIdx === i ? cancelEdit() : startEdit(i))}
                    style={{
                      padding: '3px 10px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid var(--theme-elevation-200)',
                      background: 'var(--theme-elevation-0)',
                      color: 'var(--theme-text)',
                      cursor: 'pointer',
                    }}
                  >
                    {editingIdx === i ? 'Cancel' : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {editingIdx !== null && (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              background: 'var(--theme-elevation-0)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Editing slots for {attendees[editingIdx]?.name || attendees[editingIdx]?.email}
            </div>
            <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginBottom: 10 }}>
              Tick every slot this attendee has agreed to. Custom slots you add are also added to the meeting's available pool so the intersection logic can match them.
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input
                type="datetime-local"
                value={customSlot}
                onChange={(e) => setCustomSlot(e.target.value)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: 4,
                  background: 'var(--theme-input-bg)',
                  color: 'var(--theme-text)',
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={addCustomSlot}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--theme-elevation-200)',
                  background: 'var(--theme-elevation-50)',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                }}
              >
                Add custom slot
              </button>
              <span style={{ fontSize: 11, color: 'var(--theme-elevation-400)' }}>
                ({timezone}) — entered as your local time
              </span>
            </div>

            {dayGroups.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--theme-elevation-400)' }}>
                No slots yet. Add a custom slot above.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: 8,
                }}
              >
                {dayGroups.map((g) => (
                  <div
                    key={g.dateKey}
                    style={{
                      padding: 8,
                      background: 'var(--theme-elevation-50)',
                      borderRadius: 6,
                      border: '1px solid var(--theme-elevation-150)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: 6,
                        textAlign: 'center',
                        color: 'var(--theme-elevation-500)',
                      }}
                    >
                      {g.label}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {g.slots.map((s) => {
                        const active = editSelected.has(s.iso)
                        return (
                          <button
                            key={s.iso}
                            type="button"
                            onClick={() => toggleEditSlot(s.iso)}
                            style={{
                              padding: '5px 8px',
                              fontSize: 12,
                              borderRadius: 4,
                              border: active
                                ? '2px solid var(--theme-success-500, #22c55e)'
                                : '1px solid var(--theme-elevation-200)',
                              background: active
                                ? 'var(--theme-success-100, #dcfce7)'
                                : 'var(--theme-elevation-0)',
                              color: active
                                ? 'var(--theme-success-500, #166534)'
                                : 'var(--theme-text)',
                              cursor: 'pointer',
                              fontWeight: active ? 600 : 400,
                            }}
                          >
                            {s.timeLabel}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={saveEdit}
                disabled={savingEdit}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: 'none',
                  background: 'var(--theme-success-500, #22c55e)',
                  color: '#fff',
                  cursor: savingEdit ? 'wait' : 'pointer',
                  opacity: savingEdit ? 0.6 : 1,
                  fontWeight: 600,
                }}
              >
                {savingEdit ? 'Saving...' : `Save (${editSelected.size} selected)`}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: '1px solid var(--theme-elevation-200)',
                  background: 'var(--theme-elevation-0)',
                  color: 'var(--theme-text)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!matchedSlot && responded > 0 && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: 'var(--theme-elevation-0)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 6,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Confirm meeting</div>
            {intersection.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--theme-elevation-500)', alignSelf: 'center' }}>
                  Everyone agrees on:
                </span>
                {intersection.slice(0, 6).map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => confirmMeeting(iso)}
                    disabled={confirming}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      borderRadius: 4,
                      border: '1px solid var(--theme-success-500, #22c55e)',
                      background: 'var(--theme-success-100, #dcfce7)',
                      color: 'var(--theme-success-500, #166534)',
                      cursor: confirming ? 'wait' : 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    {new Date(iso).toLocaleString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: timezone,
                    })}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)', marginBottom: 10 }}>
                No slot is selected by everyone yet. Pick any time below to manually confirm.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={confirmPick}
                onChange={(e) => setConfirmPick(e.target.value)}
                style={{
                  padding: '6px 8px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: '1px solid var(--theme-elevation-200)',
                  background: 'var(--theme-input-bg)',
                  color: 'var(--theme-text)',
                  minWidth: 220,
                }}
              >
                <option value="">— pick from generated slots —</option>
                {(generatedSlots || []).map((iso) => (
                  <option key={iso} value={iso}>
                    {new Date(iso).toLocaleString('en-AU', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: timezone,
                    })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => confirmPick && confirmMeeting(confirmPick)}
                disabled={!confirmPick || confirming}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  borderRadius: 4,
                  border: 'none',
                  background: confirmPick
                    ? 'var(--theme-success-500, #22c55e)'
                    : 'var(--theme-elevation-150)',
                  color: '#fff',
                  cursor: confirmPick && !confirming ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
              >
                {confirming ? 'Confirming...' : 'Confirm at this time'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

