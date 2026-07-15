import { redirect } from 'next/navigation'

export default function ContractorPaymentDetailGuard() {
  redirect('/admin/contractor-costs')
}
