import { redirect } from 'next/navigation'

export default function ContractorPaymentsListGuard() {
  redirect('/admin/contractor-costs')
}
