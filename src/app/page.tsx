// The site's front door is the beta waitlist landing page for now.
// The previous homepage is kept at /app-preview (src/app/app-preview/page.tsx).
import WaitlistPage, { metadata as waitlistMetadata } from './waitlist/page'

export const metadata = waitlistMetadata

export default WaitlistPage
