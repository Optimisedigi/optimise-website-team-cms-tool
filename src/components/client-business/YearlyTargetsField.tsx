'use client'

import type { ReactElement } from 'react'

import type { ArrayFieldProps } from './array-field-helpers'
import { YearAmountTable } from './YearAmountTable'

/** Custom Field for `yearlyTargets` (year + target). Tracking only — no total in the design. */
export default function YearlyTargetsField(props: ArrayFieldProps): ReactElement {
  return (
    <YearAmountTable
      fieldProps={props}
      defaultPath="yearlyTargets"
      amountKey="target"
      heading={
        <>
          Yearly sales targets <small>· tracking only</small>
        </>
      }
      addLabel="+ Add target"
      rowNoun="Target"
      showTotal={false}
    />
  )
}
