import styles from '../[token]/hosting-pay.module.css'

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Checkout cancelled',
}

type CancelPageProps = {
  searchParams: Promise<{ return_to?: string | string[] }>
}

export default async function Page({ searchParams }: CancelPageProps) {
  const { return_to: returnToParam } = await searchParams
  const returnTo =
    typeof returnToParam === 'string' && returnToParam.startsWith('/hosting-pay/')
      ? returnToParam
      : null

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <a className={styles.brand} href="https://optimisedigital.com.au" aria-label="Optimise Digital">
          <img
            src="/Optimise-Digital-Logo-rocket-animation%20(larger%20file).gif"
            alt="Optimise Digital"
          />
        </a>

        <section className={styles.reviewCard} aria-labelledby="checkout-cancelled-title">
          <header className={styles.plan}>
            <h1 id="checkout-cancelled-title" className={styles.planName}>
              Checkout cancelled
            </h1>
            <p className={styles.cancelMessage}>
              No payment was completed. You can return to your payment link whenever you are ready.
            </p>
          </header>
          <div className={styles.actionArea}>
            {returnTo ? (
              <a href={returnTo}>Return to payment link</a>
            ) : (
              <p className={styles.securityNote}>
                Please return to your payment link or contact your Optimise Digital representative.
              </p>
            )}
          </div>
        </section>

        <section className={styles.terms} aria-labelledby="hosting-terms-title">
          <h2 id="hosting-terms-title">Hosting billing terms</h2>
          <p>
            Hosting billing renews according to your agreement. Capacity changes are provided with
            written notice and take effect only at a future renewal.
          </p>
        </section>
        <p className={styles.footer}>
          <a
            href="https://www.optimisedigital.online/terms"
            target="_blank"
            rel="noreferrer"
          >
            Optimise Digital hosting billing terms
          </a>
        </p>
      </div>
    </main>
  )
}
