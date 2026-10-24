# NightWise+ (Safe Steps Circle)

Build a modern, responsive web application called **Her Safety / NightWise+**, a privacy-first women's physical and digital safety platform for a hackathon.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide React icons
- TanStack Router
- Leaflet for interactive maps

## Design

- Create a premium, modern UI using a soft lavender, pink, white, and deep-purple color palette. Use clean typography, rounded cards, subtle shadows, and intuitive navigation.
- Include a fully functional Light Mode / Night Mode toggle in the header. Persist the selected theme and apply it consistently across all pages.
- Responsive for desktop, tablet, and mobile.

## Pages and Features

- **Landing Page**: Hero section, product introduction, feature cards, how-it-works section, and Get Started button.
- **Dashboard**: Personalized greeting, quick actions, journey overview, safety statistics, recent activity, and safety tips.
- **Route Safety**: Origin and destination inputs, walking/car/bike selection, interactive map, and three route cards: Fastest, Balanced, and Safest (Limited Data). Display distance, duration, detour, Night Activity Score, data coverage, freshness, and low-activity gaps. Include contextual map layers and route details.
- **Active Journey**: Journey status, route map, estimated arrival, check-in timer, "I'm Okay", "Need Help", and "End Journey" actions. Include simulated GPS deviation and SOS workflows.
- **Trusted Circle**: Manage trusted contacts, select journey recipients, generate temporary sharing links, and provide expiration and revocation controls.
- **Community Safety**: Interactive report map, report submission form, issue categories, report cards, verification badges, and a basic moderator dashboard.
- **Digital Safety**: Incident categories covering harassment, sextortion, impersonation, account compromise, and phishing. Include a threat-description form, demo analysis results, and recommended actions.
- **Incident Management & Evidence Vault**: Incident records, evidence uploads, SHA-256 hash display, manifest verification interface, tamper-test demonstration, and report export interface.
- **Photo Cleaner**: Image upload, preview, and metadata-cleaning interface.
- **Privacy Checkup**: Interactive privacy checklist covering location sharing, account security, permissions, and evidence retention.
- **Resources & Education**: Support resources, emergency information, cybercrime reporting, and safety education.
- **Settings**: Profile, trusted contacts, privacy preferences, notifications, and theme settings.

## Getting Started Locally

Ensure you have Node.js and npm installed.

```sh
# Install dependencies
npm i

# Start local development server
npm run dev
```

---

This project was built with [Lovable](https://lovable.dev).
