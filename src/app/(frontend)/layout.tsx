import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Optimise Digital Client Manager',
  title: 'Optimise Digital',
  icons: {
    icon: '/optimise-digital-favicon.png',
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
