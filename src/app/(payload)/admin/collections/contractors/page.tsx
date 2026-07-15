import { redirect } from 'next/navigation'

export default function ContractorsListGuard() {
  redirect('/admin/contractor-costs')
}
