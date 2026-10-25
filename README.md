
# Safe Steps Circle

Build a modern, responsive web application called Her Safety, a privacy-first women's physical and digital safety platform for a hackathon.

Tech Stack

React + Vite + TypeScript

Tailwind CSS

shadcn/ui

Lucide React icons

React Router

Leaflet for interactive maps

Design

Create a premium, modern UI using a soft lavender, pink, white, and deep-purple color palette. Use clean typography, rounded cards, subtle shadows, and intuitive navigation.

Include a fully functional Light Mode / Night Mode toggle in the header. Persist the selected theme and apply it consistently across all pages.

Make the application responsive for desktop, tablet, and mobile.

Pages and Features

Landing Page: Hero section, product introduction, feature cards, how-it-works section, and Get Started button.

Dashboard: Personalized greeting, quick actions, journey overview, safety statistics, recent activity, and safety tips.

Route Safety: Origin and destination inputs, walking/car/bike selection, interactive map, and three route cards: Fastest, Balanced, and Safest (Limited Data). Display distance, duration, detour, Night Activity Score, data coverage, freshness, and low-activity gaps. Include contextual map layers and route details.

Active Journey: Journey status, route map, estimated arrival, check-in timer, "I'm Okay", "Need Help", and "End Journey" actions. Include simulated GPS deviation and SOS workflows.

Trusted Circle: Manage trusted contacts, select journey recipients, generate temporary sharing links, and provide expiration and revocation controls.

Community Safety: Interactive report map, report submission form, issue categories, report cards, verification badges, and a basic moderator dashboard.

Digital Safety: Incident categories covering harassment, sextortion, impersonation, account compromise, and phishing. Include a threat-description form, demo analysis results, and recommended actions.

Incident Management & Evidence Vault: Incident records, evidence uploads, SHA-256 hash display, manifest verification interface, tamper-test demonstration, and report export interface.

Photo Cleaner: Image upload, preview, and metadata-cleaning interface.

Privacy Checkup: Interactive privacy checklist covering location sharing, account security, permissions, and evidence retention.

Resources & Education: Support resources, emergency information, cybercrime reporting, and safety education.

Settings: Profile, trusted contacts, privacy preferences, notifications, and theme settings.

Implementation Requirements

Create a reusable component-based architecture.

Use React Router for navigation.

Create a shared application layout with a sidebar, header, notifications, profile menu, and prominent SOS button.

Use realistic, clearly labelled demo data.

Make buttons, forms, tabs, dialogs, and navigation interactive wherever practical.

Implement basic frontend state management and local persistence for demo preferences.

Include loading, empty, and error states where appropriate.

Clearly distinguish simulated functionality from real functionality.

Never claim that emergency services have been contacted when the action is simulated.

Do not present route scores or community reports based on demo data as verified real-world information.

Do not fabricate safety infrastructure data.

Keep the code modular and easy to extend. Separate pages, components, types, mock data, and service logic so that a FastAPI backend can be integrated later.

Important: Prioritize the complete UI, visual consistency, navigation, and basic interactions. Advanced backend integrations, authentication security, live routing, AI APIs, real notifications, and advanced evidence processing will be implemented later using Antigravity or Cursor.

Build the application directly. Do not stop after creating the landing page. Generate the main pages and navigation with a consistent design system.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/10b52af4-e2bb-4443-a160-e99c01d8bcaf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
