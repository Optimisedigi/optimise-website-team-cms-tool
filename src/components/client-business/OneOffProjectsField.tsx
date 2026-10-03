'use client'

/**
 * Custom Field for `oneOffProjects`: Project | Date | Counts toward | Amount | ×.
 * Every schema sub-field (projectName, date, amount, countTowardsRetainer) is
 * editable inline, so no expandable detail row is needed.
 */
import type { ReactElement } from 'react'

import {
  type ArrayFieldProps,
  dateInputToIso,
  dateInputValue,
  formatMoney,
  numberInputValue,
  parseNumberInput,
  toNumber,
  useArrayField,
} from './array-field-helpers'

const SUB_FIELDS = ['projectName', 'date', 'countTowardsRetainer', 'amount']

export default function OneOffProjectsField(props: ArrayFieldProps): ReactElement {
  const { rows, arrayError, update, add, remove } = useArrayField(props, 'oneOffProjects', SUB_FIELDS)
  const total = rows.reduce((sum, r) => sum + toNumber(r.values.amount), 0)

  return (
    <div className="od-biz-billing-stack" data-testid="oneOffProjects-field">
      <div className="od-biz-table-wrap">
        <table className="od-biz-table od-biz-projects-table" aria-label="One-off projects">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Date</th>
              <th scope="col">Counts toward</th>
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
              const n = row.index + 1
              const name = typeof row.values.projectName === 'string' ? row.values.projectName : ''
              const retainer = row.values.countTowardsRetainer === true
              const { projectName: nameErr, date: dateErr, amount: amountErr } = row.errors
              return (
                <tr key={row.index}>
                  <td>
                    <input
                      className="od-biz-cell-input od-biz-cell-input--strong"
                      type="text"
                      required
                      placeholder="Project name"
                      aria-label={`Project ${n} name`}
                      aria-invalid={nameErr ? true : undefined}
                      value={name}
                      onChange={(e) => update(row.index, 'projectName', e.target.value)}
                    />
                    {nameErr && <div className="od-biz-error">{nameErr}</div>}
                  </td>
                  <td>
                    <input
                      className="od-biz-cell-input od-biz-cell-input--muted"
                      type="date"
                      required
                      aria-label={`Project ${n} date`}
                      aria-invalid={dateErr ? true : undefined}
                      value={dateInputValue(row.values.date)}
                      onChange={(e) => update(row.index, 'date', dateInputToIso(e.target.value))}
                    />
                    {dateErr && <div className="od-biz-error">{dateErr}</div>}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`od-biz-pill od-biz-pill-toggle${retainer ? ' od-biz-pill--teal' : ''}`}
                      aria-pressed={retainer}
                      aria-label={`Project ${n} counts toward ${retainer ? 'retainer' : 'one-off'}. Toggle to count toward ${retainer ? 'one-off' : 'retainer'}`}
                      onClick={() => update(row.index, 'countTowardsRetainer', !retainer)}
                    >
                      {retainer ? 'Retainer' : 'One-off'}
                    </button>
                  </td>
                  <td className="is-num">
                    <input
                      className="od-biz-cell-input od-biz-cell-input--strong is-num"
                      type="number"
                      min={0}
                      step={1}
                      required
                      aria-label={`Project ${n} amount`}
                      aria-invalid={amountErr ? true : undefined}
                      value={numberInputValue(row.values.amount)}
                      onChange={(e) => update(row.index, 'amount', parseNumberInput(e.target.value))}
                    />
                    {amountErr && <div className="od-biz-error">{amountErr}</div>}
                  </td>
                  <td className="is-action">
                    <button
                      type="button"
                      className="od-biz-remove"
                      aria-label={`Remove project ${name || n}`}
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
            + Add project
          </button>
          <span>
            Total <strong data-testid="oneOffProjects-total">{formatMoney(total)}</strong>
          </span>
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
