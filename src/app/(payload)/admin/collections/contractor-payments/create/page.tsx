import config from '@payload-config'
import { RootPage } from '@payloadcms/next/views'
import { importMap } from '../../../importMap'

type Args = { searchParams: Promise<Record<string, string | string[]>> }

export default function ContractorPaymentCreatePage({ searchParams }: Args) {
  return RootPage({
    config,
    params: Promise.resolve({ segments: ['collections', 'contractor-payments', 'create'] }),
    searchParams,
    importMap,
  })
}
