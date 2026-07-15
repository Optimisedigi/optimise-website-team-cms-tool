import { redirect } from 'next/navigation'

export default function ContractorDetailGuard() {
  redirect('/admin/contractor-costs')
}
