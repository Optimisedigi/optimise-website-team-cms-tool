import styles from '../../[token]/hosting-pay.module.css'

export const metadata = { robots: { index: false, follow: false }, title: 'Payment received' }

export default function Page() {
  return (
    <main className={styles.page}>
      <div className={`${styles.shell} ${styles.unavailable}`}>
        <a
          className={styles.brand}
          href="https://optimisedigital.com.au"
          aria-label="Optimise Digital"
        >
          <img
            src="/Optimise-Digital-Logo-rocket-animation%20(larger%20file).gif"
            alt="Optimise Digital"
          />
        </a>
        <h1 className={styles.title}>Payment received</h1>
        <p className={styles.introduction}>
          Thank you. Stripe has received your payment and will email you a receipt.
        </p>
      </div>
    </main>
  )
}
