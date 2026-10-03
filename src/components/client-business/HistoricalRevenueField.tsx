'use client'

import type { ReactElement } from 'react'

import type { ArrayFieldProps } from './array-field-helpers'
import { YearAmountTable } from './YearAmountTable'

/** Custom Field for `historicalRevenueByYear` (year + amount). */
export default function HistoricalRevenueField(props: ArrayFieldProps): ReactElement {
  return (
    <YearAmountTable
      fieldProps={props}
      defaultPath="historicalRevenueByYear"
      amountKey="amount"
      heading={
        <>
          Historical revenue <small>· before the CMS</small>
        </>
      }
      addLabel="+ Add year"
      rowNoun="Historical year"
      showTotal
    />
  )
}
