'use client'

import type { ReactElement, ReactNode } from 'react'

import {
  type ArrayFieldProps,
  formatMoney,
  numberInputValue,
  parseNumberInput,
  toNumber,
  useArrayField,
} from './array-field-helpers'

type Props = {
  fieldProps: ArrayFieldProps | undefined
  defaultPath: string
  amountKey: string
  heading: ReactNode
  addLabel: string
  rowNoun: string
  showTotal: boolean
}

/** Compact Year | Amount | × table shared by historical revenue + yearly targets. */
export function YearAmountTable(props: Props): ReactElement {
  const { fieldProps, defaultPath, amountKey, heading, addLabel, rowNoun, showTotal } = props
  const { path, rows, arrayError, update, add, remove } = useArrayField(fieldProps, defaultPath, ['year', amountKey])
  const total = rows.reduce((sum, r) => sum + toNumber(r.values[amountKey]), 0)
  const headingId = `${path.replace(/\W/g, '-')}-heading`

  return (
    <div className="od-biz-billing-stack" data-testid={`${defaultPath}-field`}>
      <h3 className="od-biz-subhead" id={headingId}>
        {heading}
      </h3>
      <div className="od-biz-table-wrap">
        <table className="od-biz-table" aria-labelledby={headingId}>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" className="is-num">
                Amount
              </th>
              <th scope="col" className="is-action">
                <span className="od-biz-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const yearErr = row.errors.year
              const amountErr = row.errors[amountKey]
              return (
                <tr key={row.index}>
                  <td>
                    <input
                      className="od-biz-cell-input od-biz-num"
                      type="number"
                      min={2000}
                      max={2100}
                      step={1}
                      required
                      aria-label={`${rowNoun} ${row.index + 1} year`}
                      aria-invalid={yearErr ? true : undefined}
                      value={numberInputValue(row.values.year)}
                      onChange={(e) => update(row.index, 'year', parseNumberInput(e.target.value))}
                    />
                    {yearErr && <div className="od-biz-error">{yearErr}</div>}
                  </td>
                  <td className="is-num">
                    <input
                      className="od-biz-cell-input is-num"
                      type="number"
                      min={0}
                      step={1}
                      required
                      aria-label={`${rowNoun} ${row.index + 1} amount`}
                      aria-invalid={amountErr ? true : undefined}
                      value={numberInputValue(row.values[amountKey])}
                      onChange={(e) => update(row.index, amountKey, parseNumberInput(e.target.value))}
                    />
                    {amountErr && <div className="od-biz-error">{amountErr}</div>}
                  </td>
                  <td className="is-action">
                    <button
                      type="button"
                      className="od-biz-remove"
                      aria-label={`Remove ${rowNoun.toLowerCase()} ${numberInputValue(row.values.year) || row.index + 1}`}
                      onClick={() => remove(row.index)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="od-biz-table-foot">
          <button type="button" className="od-biz-link" onClick={add}>
            {addLabel}
          </button>
          {showTotal && (
            <span>
              Total <strong data-testid={`${defaultPath}-total`}>{formatMoney(total)}</strong>
            </span>
          )}
        </div>
      </div>
      {arrayError && (
        <p className="od-biz-error" role="alert">
          {arrayError}
        </p>
      )}
    </div>
  )
}
