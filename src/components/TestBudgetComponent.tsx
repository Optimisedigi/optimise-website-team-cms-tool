'use client'

import { useState } from 'react'

const TestBudgetComponent = () => {
  const [count, setCount] = useState(0)
  
  return (
    <div style={{ padding: 20, border: '2px solid #ccc', borderRadius: 8, margin: 10 }}>
      <h3>Test Component Works!</h3>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  )
}

export default TestBudgetComponent
