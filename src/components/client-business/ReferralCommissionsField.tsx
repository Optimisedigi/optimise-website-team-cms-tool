'use client'

/**
 * Custom Field for `referralCommissions`. Each row renders as a summary card
 * (payee, sentence, notes, computed monthly amount) with an inline edit form
 * that exposes every schema sub-field using the same conditions as
 * Clients.ts:
 *   - commissionType / endDate: only when frequency === 'monthly'
 *   - percentage: monthly + (commissionType ?? 'percentage') === 'percentage'
 *   - monthlyAmount: monthly + commissionType === 'fixed'
 *   - oneOffAmount: frequency === 'one_off'
 * Validation mirrors the schema (required payee/frequency/start, end date
 * required for monthly, percentage 0–100, amounts ≥ 0) and server errors from
 * form state are shown per sub-path.
 */
import { useState, type ReactElement, type ReactNode } from 'react'

import { monthlyCommissionForDate, type ReferralCommission } from '../../lib/client-revenue'
import {
  type ArrayFieldProps,
  type ArrayRow,
  dateInputToIso,
  dateInputValue,
  formatDisplayDate,
  formatMoney,
  numberInputValue,
  parseNumberInput,
  toNumber,
  useArrayField,
} from './array-field-helpers'

const SUB_FIELDS = [
  'payeeName',
  'payeeContact',
  'frequency',
  'commissionType',
  'percentage',
  'monthlyAmount',
  'oneOffAmount',
  'startDate',
  'endDate',
  'notes',
]

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function rowToCommission(values: Record<string, unknown>): ReferralCommission {
  const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : toNumber(v))
  return {
    payeeName: str(values.payeeName) || null,
    payeeContact: str(values.payeeContact) || null,
    frequency: str(values.frequency) || 'monthly',
    commissionType: str(values.commissionType) || null,
    percentage: num(values.percentage),
    monthlyAmount: num(values.monthlyAmount),
    oneOffAmount: num(values.oneOffAmount),
    startDate: str(values.startDate) || null,
    endDate: str(values.endDate) || null,
    notes: str(values.notes) || null,
  }
}

/**
 * Monthly $ for a commission at the given gross retainer. Reuses the shared
 * revenue helper (ignoring the active window so the card always shows the rate).
 * One-off commissions return their one-off amount.
 */
export function commissionAmount(c: ReferralCommission, monthlyRetainer: number): number {
  if (c.frequency === 'one_off') return Math.max(0, toNumber(c.oneOffAmount))
  return monthlyCommissionForDate(
    [{ ...c, frequency: 'monthly', startDate: '2000-01-01T12:00:00.000Z', endDate: null }],
    monthlyRetainer,
    new Date(),
  )
}

/** '{Monthly|One-off}, {8% of retainer | $X fixed} · {start} to {end|ongoing}' */
export function commissionSentence(c: ReferralCommission): string {
  const start = formatDisplayDate(c.startDate) || 'no start date'
  if (c.frequency === 'one_off') {
    return `One-off, ${formatMoney(toNumber(c.oneOffAmount))} · ${start}`
  }
  const type = c.commissionType || 'percentage'
  const rate =
    type === 'fixed'
      ? `${formatMoney(toNumber(c.monthlyAmount))} fixed`
      : `${toNumber(c.percentage).toLocaleString('en-AU', { maximumFractionDigits: 2 })}% of retainer`
  const end = formatDisplayDate(c.endDate) || 'ongoing'
  return `Monthly, ${rate} · ${start} to ${end}`
}

/** Client-side mirror of the schema rules; returns sub-field → message. */
export function validateCommission(c: ReferralCommission): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!c.payeeName?.trim()) errs.payeeName = 'Payee is required.'
  if (!c.startDate) errs.startDate = 'Start date is required.'
  if (c.frequency === 'monthly') {
    if (!c.endDate) errs.endDate = 'End date is required for monthly commissions.'
    const type = c.commissionType ?? 'percentage'
    if (type === 'percentage' && c.percentage != null && (c.percentage < 0 || c.percentage > 100)) {
      errs.percentage = 'Percentage must be between 0 and 100.'
    }
    if (type === 'fixed' && c.monthlyAmount != null && c.monthlyAmount < 0) {
      errs.monthlyAmount = 'Amount must be 0 or more.'
    }
  } else if (c.oneOffAmount != null && c.oneOffAmount < 0) {
    errs.oneOffAmount = 'Amount must be 0 or more.'
  }
  return errs
}

type FieldWrapProps = { id: string; label: string; hint?: string; error?: string; children: ReactNode; wide?: boolean }

function FieldWrap({ id, label, hint, error, children, wide }: FieldWrapProps): ReactElement {
  return (
    <div className={`od-biz-commission-form__field${wide ? ' is-wide' : ''}`}>
      <label className="od-biz-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="od-biz-error od-biz-commission-form__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="od-biz-hint">{hint}</p>
      ) : null}
    </div>
  )
}

type CardProps = {
  row: ArrayRow
  idBase: string
  monthlyRetainer: number
  editing: boolean
  onToggleEdit: () => void
  onUpdate: (sub: string, value: unknown) => void
  onRemove: () => void
}

function CommissionCard(props: CardProps): ReactElement {
  const { row, idBase, monthlyRetainer, editing, onToggleEdit, onUpdate, onRemove } = props
  const c = rowToCommission(row.values)
  const isMonthly = c.frequency === 'monthly'
  const type = c.commissionType ?? 'percentage'
  const local = validateCommission(c)
  const err = (sub: string): string | undefined => row.errors[sub] ?? (editing ? local[sub] : undefined)
  const id = (sub: string): string => `${idBase}-${row.index}-${sub}`
  const described = (sub: string): string | undefined => (err(sub) ? `${id(sub)}-error` : undefined)
  const payee = c.payeeName || 'New commission'
  const hasServerError = Object.values(row.errors).some(Boolean)

  return (
    <div className={`od-biz-commission${hasServerError ? ' has-error' : ''}`}>
      <div className="od-biz-commission__summary">
        <div className="od-biz-commission__main">
          <div className="od-biz-commission__payee">
            {payee}
            {c.payeeContact && <span className="od-biz-commission__contact"> · {c.payeeContact}</span>}
          </div>
          <div className="od-biz-commission__sentence">{commissionSentence(c)}</div>
          {c.notes && <div className="od-biz-commission__notes">{c.notes}</div>}
        </div>
        <div className="od-biz-commission__amount">
          <div className="od-biz-commission__value">{formatMoney(commissionAmount(c, monthlyRetainer))}</div>
          <div className="od-biz-commission__unit">{isMonthly ? 'per month' : 'one-off'}</div>
        </div>
        <button
          type="button"
          className="od-biz-btn od-biz-btn--sm"
          aria-expanded={editing}
          aria-controls={`${idBase}-${row.index}-form`}
          aria-label={editing ? `Close editing commission for ${payee}` : `Edit commission for ${payee}`}
          onClick={onToggleEdit}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="od-biz-commission-form od-biz-panel" id={`${idBase}-${row.index}-form`}>
          <div className="od-biz-commission-form__grid">
            <FieldWrap id={id('payeeName')} label="Payee" hint="Who we pay" error={err('payeeName')}>
              <input
                id={id('payeeName')}
                className="od-biz-input"
                type="text"
                required
                aria-invalid={err('payeeName') ? true : undefined}
                aria-describedby={described('payeeName')}
                value={c.payeeName ?? ''}
                onChange={(e) => onUpdate('payeeName', e.target.value)}
              />
            </FieldWrap>
            <FieldWrap id={id('payeeContact')} label="Contact" hint="Email or phone (internal)" error={err('payeeContact')}>
              <input
                id={id('payeeContact')}
                className="od-biz-input"
                type="text"
                aria-describedby={described('payeeContact')}
                value={c.payeeContact ?? ''}
                onChange={(e) => onUpdate('payeeContact', e.target.value)}
              />
            </FieldWrap>
            <FieldWrap id={id('frequency')} label="Frequency" error={err('frequency')}>
              <select
                id={id('frequency')}
                className="od-biz-select"
                required
                aria-describedby={described('frequency')}
                value={c.frequency ?? 'monthly'}
                onChange={(e) => onUpdate('frequency', e.target.value)}
              >
                <option value="monthly">Monthly (ongoing)</option>
                <option value="one_off">One-off</option>
              </select>
            </FieldWrap>
            {isMonthly && (
              <FieldWrap id={id('commissionType')} label="Commission type" error={err('commissionType')}>
                <select
                  id={id('commissionType')}
                  className="od-biz-select"
                  aria-describedby={described('commissionType')}
                  value={type}
                  onChange={(e) => onUpdate('commissionType', e.target.value)}
                >
                  <option value="percentage">% of retainer</option>
                  <option value="fixed">Fixed $</option>
                </select>
              </FieldWrap>
            )}
            {isMonthly && type === 'percentage' && (
              <FieldWrap id={id('percentage')} label="Percentage" hint="8 = 8% of monthly retainer" error={err('percentage')}>
                <span className="od-biz-affix">
                  <input
                    id={id('percentage')}
                    className="od-biz-input od-biz-num od-biz-input--suffix"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    aria-invalid={err('percentage') ? true : undefined}
                    aria-describedby={described('percentage')}
                    value={numberInputValue(row.values.percentage)}
                    onChange={(e) => onUpdate('percentage', parseNumberInput(e.target.value))}
                  />
                  <span className="od-biz-affix__text od-biz-affix__text--end" aria-hidden="true">
                    %
                  </span>
                </span>
              </FieldWrap>
            )}
            {isMonthly && type === 'fixed' && (
              <FieldWrap id={id('monthlyAmount')} label="Monthly amount" hint="Fixed $ per month" error={err('monthlyAmount')}>
                <span className="od-biz-affix">
                  <span className="od-biz-affix__text od-biz-affix__text--start" aria-hidden="true">
                    $
                  </span>
                  <input
                    id={id('monthlyAmount')}
                    className="od-biz-input od-biz-num od-biz-input--prefix"
                    type="number"
                    min={0}
                    step={1}
                    aria-invalid={err('monthlyAmount') ? true : undefined}
                    aria-describedby={described('monthlyAmount')}
                    value={numberInputValue(row.values.monthlyAmount)}
                    onChange={(e) => onUpdate('monthlyAmount', parseNumberInput(e.target.value))}
                  />
                </span>
              </FieldWrap>
            )}
            {c.frequency === 'one_off' && (
              <FieldWrap id={id('oneOffAmount')} label="One-off amount" error={err('oneOffAmount')}>
                <span className="od-biz-affix">
                  <span className="od-biz-affix__text od-biz-affix__text--start" aria-hidden="true">
                    $
                  </span>
                  <input
                    id={id('oneOffAmount')}
                    className="od-biz-input od-biz-num od-biz-input--prefix"
                    type="number"
                    min={0}
                    step={1}
                    aria-invalid={err('oneOffAmount') ? true : undefined}
                    aria-describedby={described('oneOffAmount')}
                    value={numberInputValue(row.values.oneOffAmount)}
                    onChange={(e) => onUpdate('oneOffAmount', parseNumberInput(e.target.value))}
                  />
                </span>
              </FieldWrap>
            )}
            <FieldWrap id={id('startDate')} label="Start date" error={err('startDate')}>
              <input
                id={id('startDate')}
                className="od-biz-input"
                type="date"
                required
                aria-invalid={err('startDate') ? true : undefined}
                aria-describedby={described('startDate')}
                value={dateInputValue(row.values.startDate)}
                onChange={(e) => onUpdate('startDate', dateInputToIso(e.target.value))}
              />
            </FieldWrap>
            {isMonthly && (
              <FieldWrap id={id('endDate')} label="End date" hint="No longer deducted after this" error={err('endDate')}>
                <input
                  id={id('endDate')}
                  className="od-biz-input"
                  type="date"
                  required
                  aria-invalid={err('endDate') ? true : undefined}
                  aria-describedby={described('endDate')}
                  value={dateInputValue(row.values.endDate)}
                  onChange={(e) => onUpdate('endDate', dateInputToIso(e.target.value))}
                />
              </FieldWrap>
            )}
            <FieldWrap id={id('notes')} label="Notes" error={err('notes')} wide>
              <textarea
                id={id('notes')}
                className="od-biz-textarea"
                aria-describedby={described('notes')}
                value={c.notes ?? ''}
                onChange={(e) => onUpdate('notes', e.target.value)}
              />
            </FieldWrap>
          </div>
          <div className="od-biz-commission-form__actions">
            <button type="button" className="od-biz-btn od-biz-btn--primary" onClick={onToggleEdit}>
              Done
            </button>
            <button
              type="button"
              className="od-biz-btn od-biz-btn--danger"
              aria-label={`Remove commission for ${payee}`}
              onClick={() => {
                if (window.confirm(`Remove the commission for ${payee}?`)) onRemove()
              }}
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReferralCommissionsField(props: ArrayFieldProps): ReactElement {
  const { path, rows, fields, arrayError, update, add, remove } = useArrayField(props, 'referralCommissions', SUB_FIELDS)
  const monthlyRetainer = toNumber(fields.monthlyRetainer?.value)
  const [editing, setEditing] = useState<number | null>(null)
  const idBase = path.replace(/\W/g, '-')

  return (
    <div className="od-biz-billing-stack od-biz-commissions" data-testid="referralCommissions-field">
      <p className="od-biz-hint od-biz-commissions__intro">
        Monthly commissions are deducted from the retainer in all revenue figures.
      </p>
      {rows.map((row) => (
        <CommissionCard
          key={row.index}
          row={row}
          idBase={idBase}
          monthlyRetainer={monthlyRetainer}
          editing={editing === row.index || Object.values(row.errors).some(Boolean)}
          onToggleEdit={() => setEditing((cur) => (cur === row.index ? null : row.index))}
          onUpdate={(sub, value) => update(row.index, sub, value)}
          onRemove={() => {
            remove(row.index)
            setEditing(null)
          }}
        />
      ))}
      {arrayError && (
        <p className="od-biz-error" role="alert">
          {arrayError}
        </p>
      )}
      <button
        type="button"
        className="od-biz-add-dashed od-biz-commissions__add"
        onClick={() => {
          setEditing(rows.length)
          add()
        }}
      >
        + Add commission
      </button>
    </div>
  )
}
