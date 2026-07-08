'use client'

import { useEffect } from 'react'

const TAB_LABEL = 'Models & Chat'

function activateModelsTab() {
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button'))
  const modelsTabButton = tabButtons.find((button) => button.textContent?.includes(TAB_LABEL))

  if (modelsTabButton && !modelsTabButton.classList.contains('tabs-field__tab-button--active')) {
    modelsTabButton.click()
  }
}

export default function OptiMateSettingsDefaultTab() {
  useEffect(() => {
    const timeouts = [0, 50, 250].map((delay) => window.setTimeout(activateModelsTab, delay))

    return () => {
      timeouts.forEach(window.clearTimeout)
    }
  }, [])

  return null
}
