'use client'

import StepSolver from '@/components/solver/StepSolver'
import { generateHomepageDemo } from '@/lib/demo/homepageDemo'

// Client boundary for the live demo: StepSolver takes a generator function,
// which can't be passed as a prop from the (server) page itself.
export default function WaitlistDemo() {
  return (
    <StepSolver
      generate={generateHomepageDemo}
      skillName="Solving two-step equations"
      finalButtonLabel="Try the problem again →"
    />
  )
}
