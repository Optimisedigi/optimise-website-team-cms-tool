export type ContractorCostPayment = {
  contractorId: number
  contractorName: string
  fortnightStartDate: string
  fortnightEndDate: string | null
  amount: number
  currency: string
  transferReference: string
  status: 'paid' | 'unpaid'
}

export function parseContractorCostPayments(
  actions: Array<{ tool: string; result?: unknown }> | undefined,
): ContractorCostPayment[] {
  if (!actions?.length) return []
  const seen = new Set<string>()
  const payments: ContractorCostPayment[] = []
  for (const action of actions) {
    if (action.tool !== 'listContractorCosts' || !action.result || typeof action.result !== 'object') {
      continue
    }
    const rows = (action.result as { payments?: unknown }).payments
    if (!Array.isArray(rows)) continue
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      const contractorId = Number(row.contractorId)
      const contractorName = typeof row.contractorName === 'string' ? row.contractorName : ''
      const fortnightStartDate =
        typeof row.fortnightStartDate === 'string' ? row.fortnightStartDate.slice(0, 10) : ''
      if (!contractorId || !contractorName || !/^\d{4}-\d{2}-\d{2}$/.test(fortnightStartDate)) continue
      const key = `${contractorId}:${fortnightStartDate}`
      if (seen.has(key)) continue
      seen.add(key)
      payments.push({
        contractorId,
        contractorName,
        fortnightStartDate,
        fortnightEndDate:
          typeof row.fortnightEndDate === 'string' ? row.fortnightEndDate.slice(0, 10) : null,
        amount: Number(row.amount) || 0,
        currency: typeof row.currency === 'string' ? row.currency : 'AUD',
        transferReference: typeof row.transferReference === 'string' ? row.transferReference : '',
        status: row.status === 'paid' ? 'paid' : 'unpaid',
      })
    }
  }
  return payments
}
