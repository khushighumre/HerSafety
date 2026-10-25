add this in readme.d 
# 🛡️ Her Safety — Privacy-First Women's Safety Platform

**NightWise · HerSafety**

*Safer journeys. Stronger privacy. Greater confidence.*

Her Safety is a privacy-first, full-stack web platform designed to support women's physical and digital safety. It combines safety-aware route planning, active journey monitoring, community safety reports, incident documentation, digital threat assessment, emergency helplines, and privacy utilities in a unified application.

The platform addresses safety challenges encountered while navigating urban environments, particularly at night, while also helping users respond to digital harassment, phishing, impersonation, sextortion, and other online threats.

Her Safety is designed around a fundamental principle: **safety tools should be transparent about their capabilities, protect sensitive information, and never promise protection they cannot guarantee.**

> **Project name:** Her Safety  
> **Application branding:** HerSafety  
> **Internal/project identity:** NightWise  
> **Category:** Women's Safety · Smart Mobility · Digital Privacy · Civic Technology  
> **Frontend:** TanStack Start, React 19, TypeScript, Vite  
> **Backend:** FastAPI, Python, SQLAlchemy, SQLite  
> **Routing and geospatial data:** OpenRouteService, OpenStreetMap, Overpass API

---

## 📑 Table of Contents

- [1. Problem Statement](#-1-problem-statement)
- [2. Our Solution](#-2-our-solution)
- [3. Project Objectives](#-3-project-objectives)
- [4. Core Features](#-4-core-features)
- [5. Application Routes](#-5-application-routes)
- [6. System Architecture](#-6-system-architecture)
- [7. Technology Stack](#-7-technology-stack)
- [8. Project Structure](#-8-project-structure)
- [9. Application Workflow](#-9-application-workflow)
- [10. Route Safety and Scoring](#-10-route-safety-and-scoring)
- [11. Incident Evidence Vault](#-11-incident-evidence-vault)
- [12. Digital Safety Engine](#-12-digital-safety-engine)
- [13. Emergency Helplines in India](#-13-emergency-helplines-in-india)
- [14. Privacy and Security](#-14-privacy-and-security)
- [15. Installation and Setup](#-15-installation-and-setup)
- [16. Environment Configuration](#-16-environment-configuration)
- [17. Running the Application](#-17-running-the-application)
- [18. API Documentation](#-18-api-documentation)
- [19. Database and Data Persistence](#-19-database-and-data-persistence)
- [20. Testing and Verification](#-20-testing-and-verification)
- [21. Limitations and Safety Disclaimers](#-21-limitations-and-safety-disclaimers)
- [22. Future Enhancements](#-22-future-enhancements)
- [23. Contributing](#-23-contributing)
- [24. License](#-24-license)

---

## 🚨 1. Problem Statement

Women navigating urban environments may face risks associated with isolated roads, insufficient street lighting, limited access to help points, harassment, and uncertainty about changing local conditions.

At the same time, digital threats such as phishing, impersonation, account compromise, online harassment, and sextortion create additional safety challenges that traditional navigation applications do not address.

Existing tools frequently address only one part of the problem:

- Navigation applications primarily optimize distance and travel time.
- Emergency applications may not provide contextual route assessments.
- Community reporting platforms may lack transparent verification workflows.
- Incident documentation tools may not provide evidence-integrity verification.
- Digital safety resources may be difficult to navigate during stressful situations.
- Privacy utilities may not be integrated with physical safety workflows.

These disconnected experiences can make it difficult for users to find relevant information, document incidents, protect their privacy, and make informed decisions.

Her Safety aims to bring these capabilities together in a single privacy-conscious platform.

## 💡 2. Our Solution

Her Safety combines physical safety, digital threat awareness, incident documentation, and privacy utilities in one application.

The platform provides:

1. **Safety-aware navigation** to compare available routes using contextual indicators.
2. **Active journey tracking** with estimated arrival information, route deviation awareness, and simulated check-ins.
3. **Community safety reporting** with persistent records and moderation workflows.
4. **Incident documentation** with unique reference identifiers and cryptographic evidence-integrity checks.
5. **Digital threat triage** with rules-based urgency assessments and practical response guidance.
6. **Emergency resources** displayed prominently on the dashboard.
7. **Privacy tools** for image metadata removal, privacy self-assessment, and trusted-contact management.

The platform is designed to make safety information easier to access without overstating the reliability of heuristic scores, simulated alerts, or incomplete geospatial data.

---

## 🎯 3. Project Objectives

- Build an integrated physical and digital safety platform.
- Help users compare routes using available safety-related information.
- Make emergency contact numbers easily accessible.
- Provide journey monitoring and transparent prototype SOS functionality.
- Enable community members to report local safety concerns.
- Preserve incident records and support evidence-integrity verification.
- Offer actionable, explainable digital threat assessments.
- Reduce unnecessary exposure of location and personal information.
- Provide client-side image metadata cleaning.
- Support privacy-conscious emergency contact and journey-sharing workflows.

---

## ✨ 4. Core Features

### 4.1 Safety-Aware Route Planning

**Application route:** `/route-safety`

The route-safety module helps users compare travel options using routing information and available contextual data.

Key capabilities include:

- Route alternatives: **Fastest**, **Balanced**, and **Safest Available**.
- Walking, cycling, and driving routes where supported by the routing provider.
- Route geometry and estimated travel duration.
- Interactive Leaflet maps.
- Start and destination markers.
- Coloured route polylines.
- Community incident visualization.
- Contextual indicators for street lighting, transit access, and nearby commercial activity.
- Configurable maximum-detour constraints where implemented.
- Graceful fallback behaviour when external services are unavailable.

#### How route assessment works

The backend retrieves route information and evaluates available safety-related signals. These may include lighting-related map data, proximity to transit, nearby commercial activity, and community reports.

Route assessments are based on heuristics rather than guaranteed predictions of real-world safety.

Missing or incomplete data should be clearly communicated to users.

#### Routing provider

OpenRouteService is used for configured routing and geocoding integrations.

Official documentation: [OpenRouteService](https://openrouteservice.org/)

### 4.2 Active Journey Tracking

**Application route:** `/active-journey`

The active-journey module supports users during a planned trip.

Designed capabilities include:

- Starting and monitoring a journey.
- Displaying the planned route and estimated arrival time.
- Tracking route deviations where location updates are available.
- Check-in prompts with countdown timers.
- A simulated SOS trigger.
- Generation of an emergency location snapshot.
- Trusted-contact notification simulation.

#### Prototype SOS disclaimer

The SOS feature is a demonstration workflow. Unless separately integrated with a real emergency dispatch service, activating it does not contact police, emergency responders, or trusted contacts automatically.

The application must make this limitation clear before users rely on the feature.

Real emergency calls should be placed directly through the device's supported calling functionality.

### 4.3 Community Safety Reports

**Application route:** `/community`

The community module enables users to document local conditions that may affect travel or personal safety.

Examples include:

- Broken streetlights.
- Isolated road stretches.
- Harassment reports.
- Public transport concerns.
- Other relevant local safety observations.

Key capabilities include:

- Creating structured reports.
- Persisting reports in SQLite.
- Filtering by category or area.
- Listing recent reports.
- Displaying report locations on maps.
- Showing reports along relevant travel corridors.
- Moderation status transitions.

#### Report moderation

The documented moderation workflow supports transitions such as:

`unverified` → `verified`

Reports may also be marked `flagged`.

Moderator operations are protected by an `X-Moderator-Key` development credential in the described implementation.

A development key is not a substitute for production authentication and authorization. Production deployment should use a secure moderator identity system, access controls, key rotation, and audit logging.

A verified status should be applied only through the project's defined verification process. User-submitted reports must not automatically be presented as official or independently confirmed incidents.

### 4.4 Incident Reporting and Evidence Vault

**Application route:** `/incidents`

The incident module supports structured incident documentation and evidence-integrity verification.

Key capabilities include:

- Creating incident records.
- Generating reference identifiers in the format `HS-YYYY-NNNN`.
- Associating evidence with an incident.
- Supporting PNG, JPEG, WebP, and PDF evidence formats, subject to configured validation.
- Computing SHA-256 hashes for uploaded evidence.
- Verifying evidence against its stored hash.
- Detecting byte-level changes to previously hashed files.
- Demonstrating evidence tampering through test utilities.

#### Incident reference identifiers

Incident identifiers help users refer to a specific record without repeatedly sharing its full contents.

For example:

`HS-2026-0001`

The example illustrates the format; actual identifiers are generated by the application.

#### Cryptographic evidence verification

The evidence vault uses SHA-256 hashing to establish a content fingerprint.

Conceptually:

\[
H = \operatorname{SHA256}(\text{file bytes})
\]

When the evidence is verified again, the system computes a new hash:

\[
H' = \operatorname{SHA256}(\text{current file bytes})
\]

If the hashes match, the current bytes match the bytes represented by the original stored hash, subject to the integrity of the hash record and verification process.

If the hashes differ, the evidence has changed or the stored reference does not match the current content.

**Important:** A matching SHA-256 hash does not establish who created a file, whether its contents are truthful, or whether the evidence was authentic before upload. Stronger chain-of-custody guarantees require additional controls, including secure timestamps, access logs, protected hash records, and controlled storage.

### 4.5 Digital Safety and Threat Triage

**Application route:** `/digital-safety`

The digital-safety module helps users assess descriptions of potentially harmful online interactions.

The rules-based assessment engine covers threat categories such as:

- Online harassment.
- Sextortion.
- Impersonation.
- Account takeover.
- Phishing.

The engine evaluates user-provided descriptions and generates structured assessments.

Potential outputs include:

- Urgency score from 0–100.
- Exposure score from 0–100.
- Confidence indicator.
- Identified threat category.
- Prioritized, step-by-step response recommendations.

#### Privacy-first processing

The described implementation processes raw threat descriptions in memory without logging or storing the submitted text.

This privacy property should be preserved throughout the request lifecycle, including error handling, analytics, debugging, and monitoring.

The scores are deterministic, rules-based assessments. They are not clinical assessments, law-enforcement determinations, or validated predictions of future harm.

Users should be able to access practical guidance even when an automated classification has low confidence.

### 4.6 Emergency Helplines

**Application route:** `/dashboard`

The dashboard displays a prominent emergency-contact banner for India.

The intended contact list includes:

| Number | Purpose |
|---|---|
| **112** | National Emergency Response Support System |
| **181** | Women Helpline, subject to local availability |
| **1091** | Women in Distress, where supported locally |
| **1930** | National Cyber Crime Helpline for relevant cyber financial fraud reporting |

The dashboard uses `tel:` links for direct calling on compatible devices.

Official references:

- [Emergency Response Support System — 112](https://112.gov.in/)
- [Ministry of Women and Child Development](https://wcd.gov.in/)
- [National Cyber Crime Reporting Portal](https://cybercrime.gov.in/)

Helpline scope and availability may vary by jurisdiction and service. Verify official guidance before deployment, particularly for location-specific claims.

The banner should remain visible and usable on mobile screens without requiring the user to navigate through multiple pages.

### 4.7 Photo Cleaner

**Application route:** `/photo-cleaner`

The photo-cleaner utility helps users reduce accidental disclosure of image metadata before sharing photographs.

Its intended capabilities include:

- Processing images in the browser.
- Removing supported EXIF metadata.
- Removing embedded GPS coordinates where present.
- Removing camera-related metadata.
- Producing a cleaned image for sharing.

Client-side processing reduces the need to upload sensitive images to a remote server.

The exact metadata removed depends on the file format and the implemented processing method. Users should be informed if the application cannot process a particular format or metadata field.

### 4.8 Privacy Checkup

**Application route:** `/privacy-checkup`

The privacy-checkup module guides users through a self-assessment of common privacy settings.

Topics may include:

- Social media visibility.
- Device permissions.
- Account security settings.
- Location-sharing exposure.
- Public profile information.
- Privacy practices for personal accounts.

The checkup provides guidance based on user responses. It should not claim to scan or inspect external accounts unless those integrations actually exist and have been authorized.

### 4.9 Trusted Circle

**Application route:** `/trusted-circle`

The trusted-circle module is designed to help users manage emergency contacts and temporary journey-sharing links.

Intended capabilities include:

- Managing trusted contacts.
- Creating temporary journey-sharing links.
- Applying expiry times to supported links.
- Supporting consent-based sharing of journey information.

Sharing links should use sufficiently unpredictable identifiers, expire as intended, and expose only the minimum necessary information.

The application must clearly indicate whether a link is a local prototype, a functioning remote sharing link, or a simulated workflow.

---

## 🗺️ 5. Application Routes

The following table describes the primary application paths supplied in the project overview.

| Path | Module | Primary purpose |
|---|---|---|
| `/dashboard` | Dashboard | Overview and emergency contact banner |
| `/route-safety` | Route Safety | Compare routes and view contextual safety information |
| `/active-journey` | Active Journey | Monitor a journey and demonstrate check-ins and SOS |
| `/community` | Community | Submit, view, filter, and moderate local safety reports |
| `/incidents` | Incident Reporting | Maintain incident records and verify evidence integrity |
| `/digital-safety` | Digital Safety | Assess online threats and provide response guidance |
| `/photo-cleaner` | Photo Cleaner | Remove supported image metadata |
| `/privacy-checkup` | Privacy Checkup | Review common privacy and account-security practices |
| `/trusted-circle` | Trusted Circle | Manage trusted contacts and temporary journey sharing |

These are application routes, not necessarily backend API endpoint paths. The actual route configuration should be used to confirm the exact URL structure.

---

## 🏗️ 6. System Architecture

Her Safety uses a full-stack architecture with a React-based frontend, a FastAPI backend, and SQLite persistence.

```text
                         USER
                          |
                          v
              HER SAFETY FRONTEND
         TanStack Start + React 19 + Vite
                          |
          +---------------+----------------+
          |               |                |
          v               v                v
     Route Safety     Digital Safety   Privacy Tools
          |               |                |
          +---------------+----------------+
                          |
                   HTTP / JSON API
                          |
                          v
                FASTAPI BACKEND
                          |
          +---------------+----------------+
          |               |                |
          v               v                v
    Route Services   Incident Services  Community Services
          |               |                |
          v               v                v
    OpenRouteService   SHA-256 Vault     SQLite / ORM
          |
          v
    OpenStreetMap /
    Overpass API
```

This is a logical overview. The actual source code determines where each operation is implemented and which services share database access.

### Frontend layer

The frontend is responsible for:

- Rendering application pages and reusable components.
- Managing navigation through TanStack Router.
- Displaying interactive Leaflet maps.
- Collecting and validating user inputs.
- Fetching API data using TanStack Query.
- Presenting route assessments and community reports.
- Providing privacy utilities and safety guidance.
- Displaying notifications through Sonner.
- Communicating errors and data limitations clearly.

### Backend layer

The FastAPI service is responsible for the configured backend functionality, including:

- API request validation.
- Routing and geospatial integrations.
- Contextual route evaluation.
- SQLite data persistence through SQLAlchemy.
- Community report lifecycle management.
- Incident record management.
- Evidence hashing and verification.
- Rules-based digital threat assessment.
- Protected moderation operations.

### Database layer

SQLite stores application records that the implementation persists, such as community reports and incident-related metadata.

Evidence storage and other files may use a separate configured storage mechanism. The actual repository should be consulted to determine how binary files and metadata are persisted.

### External data services

- OpenRouteService supplies configured routing and geocoding capabilities.
- OpenStreetMap provides map data.
- Overpass API supports queries against available OpenStreetMap features.

External services may impose usage limits and may not supply all information required for safety evaluation.

---

## 🛠️ 7. Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| TanStack Start | React-based full-stack application framework |
| TanStack Router | Type-safe client-side routing |
| React 19 | Component-based user interface |
| TypeScript | Type safety and maintainability |
| Vite | Development and build tooling |
| Tailwind CSS | Utility-first styling |
| Radix UI | Accessible interface primitives |
| Lucide icons | Interface iconography |
| Sonner | Toast notifications |
| Leaflet | Interactive maps and route visualization |
| OpenStreetMap | Map tiles and geographic data |
| TanStack Query | Server-state fetching and caching |

### Backend

| Technology | Purpose |
|---|---|
| Python | Backend language |
| FastAPI | REST API framework |
| Uvicorn | ASGI application server |
| SQLAlchemy | Database ORM |
| SQLite | Relational data persistence |
| OpenRouteService API | Routing and geocoding integration |
| Overpass API | OpenStreetMap feature queries |
| SHA-256 | Evidence-integrity verification |

Exact dependency versions should be taken from the repository's package manifest and Python dependency files.

---

## 📁 8. Project Structure

The following illustrates a possible organization of the project. It is not intended to replace the actual repository tree.

```text
her-safety/
│
├── src/
│   ├── routes/
│   │   ├── dashboard.tsx
│   │   ├── route-safety.tsx
│   │   ├── active-journey.tsx
│   │   ├── community.tsx
│   │   ├── incidents.tsx
│   │   ├── digital-safety.tsx
│   │   ├── photo-cleaner.tsx
│   │   ├── privacy-checkup.tsx
│   │   └── trusted-circle.tsx
│   ├── components/
│   ├── lib/
│   │   └── incident-utils.ts
│   ├── services/
│   └── styles/
│
├── backend/
│   ├── main.py
│   ├── routes/
│   ├── services/
│   ├── models/
│   ├── schemas/
│   ├── database.py
│   ├── requirements.txt
│   └── tests/
│
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .gitignore
├── .env.example
├── README.md
└── LICENSE
```

**Important:** Keep the real file names and directories from your repository. For example, the reported `src/lib/incident-utils.ts` utility should be documented at its actual path. Do not create placeholder modules merely to match this illustrative structure.

---

## 🔄 9. Application Workflow

### Route-safety workflow

1. The user enters an origin and destination.
2. The frontend submits a route request.
3. The backend validates the request and obtains the required geographic information.
4. OpenRouteService generates route alternatives where configured and supported.
5. The backend retrieves relevant contextual information.
6. Available indicators are evaluated by the configured heuristic.
7. Route options are compared.
8. The frontend displays route geometry, contextual information, and limitations.
9. The user selects a route based on the available information.

### Community-report workflow

1. A user submits a structured report.
2. The application validates and normalizes the input.
3. The backend persists the report in SQLite.
4. Reports are returned for listing, filtering, or map visualization.
5. Authorized moderation actions can change report status.
6. The interface communicates the report's verification status.

### Incident and evidence workflow

1. An incident is submitted.
2. The application generates a reference identifier.
3. Evidence files are validated against supported types and size restrictions.
4. The backend computes SHA-256 hashes for accepted evidence.
5. Evidence and its associated metadata are stored through the configured persistence mechanism.
6. A verification request recomputes the hash from the stored evidence bytes.
7. The verification result indicates whether the current content matches the stored hash.

### Digital-threat workflow

1. The user describes a suspected digital threat.
2. The backend evaluates the text against deterministic rules.
3. Matching rules contribute to the threat classification and scores.
4. The service returns a structured assessment and response guidance.
5. The raw description is discarded after processing if the implementation follows the documented in-memory-only design.
6. The frontend displays the result and actionable next steps.

### Active-journey workflow

1. The user starts a journey.
2. The interface displays available route and ETA information.
3. The application presents check-in prompts.
4. Route deviations may be detected when location updates are available.
5. The user can demonstrate the prototype SOS workflow.
6. The interface explains which actions are simulated and which services are genuinely connected.

---

## 🧮 10. Route Safety and Scoring

Her Safety compares travel efficiency with available safety-related information.

The three route strategies are:

- **Fastest:** prioritizes estimated travel time.
- **Balanced:** combines travel efficiency and contextual safety indicators.
- **Safest Available:** prioritizes supported safety-related indicators within configured routing constraints.

### Contextual indicators

Depending on available data, the route assessment may consider:

- Lighting-related information.
- Proximity to transit stops.
- Nearby commercial activity.
- Community safety reports.
- Relevant mapped infrastructure.
- Route length and estimated duration.
- Coverage and freshness of supporting data.

### Illustrative scoring model

A generic model can express the trade-off as:

\[
U(r)=\alpha L(r)+\beta T(r)+\gamma C(r)-\delta G(r)-\lambda D(r)
\]

Where:

- \(L(r)\) represents lighting-related context.
- \(T(r)\) represents transit access.
- \(C(r)\) represents relevant commercial or community context.
- \(G(r)\) represents penalties for long contextual gaps.
- \(D(r)\) represents travel-time or detour penalties.
- The Greek-letter parameters represent configurable weights.

This formula is illustrative, not a declaration of the exact implemented scoring equation.

### Maximum-detour constraint

Where implemented, a maximum-detour constraint limits how much longer a candidate route may be than the fastest available route.

\[
\text{Detour Ratio}=
\frac{T_{\text{candidate}}-T_{\text{fastest}}}
{T_{\text{fastest}}}
\]

The candidate route can be compared with the configured limit. Zero-duration or unavailable baseline routes must be handled explicitly.

### Data quality

Route assessments must distinguish between observed data and missing information.

A street with no mapped lighting information is not necessarily unlit. An area with few community reports is not necessarily safe. A high heuristic score is not a guarantee of safety.

The interface should explain relevant uncertainties and avoid representing heuristic assessments as statistically validated risk probabilities.

---

## 🔐 11. Incident Evidence Vault

The evidence vault is intended to preserve evidence integrity using cryptographic hashes.

### Supported formats

The described implementation supports:

- PNG images.
- JPEG images.
- WebP images.
- PDF documents.

The backend should enforce actual allowlists, file-size limits, and content validation rather than relying only on file extensions or browser-provided MIME types.

### SHA-256 verification

For each accepted evidence file, the system calculates a SHA-256 digest from the file bytes.

```python
import hashlib

def calculate_sha256(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()
```

This snippet illustrates the hashing operation; use the repository's existing utility and asynchronous file-handling approach where applicable.

### Verification process

- Retrieve the stored evidence bytes.
- Compute the current SHA-256 digest.
- Compare the result with the original stored digest.
- Report whether the contents match.

A changed hash indicates that the file contents no longer match the stored reference.

A matching hash supports byte-level integrity checking, but does not independently prove the file's authenticity, ownership, or history before ingestion.

---

## 🧠 12. Digital Safety Engine

The digital-safety module uses deterministic rules to classify reported online threats.

### Threat categories

- Harassment.
- Sextortion.
- Impersonation.
- Account takeover.
- Phishing.

### Assessment outputs

The engine can return structured fields for:

- Threat category.
- Urgency score.
- Exposure score.
- Confidence.
- Prioritized recommendations.

Scores use a 0–100 display scale in the documented design. Their meaning depends on the actual rules, thresholds, and normalization implemented in the backend.

### Privacy guarantees

The intended processing model is:

1. Receive the user-provided description.
2. Evaluate it in memory.
3. Produce a structured assessment.
4. Return the assessment without persisting or logging the raw description.

Ensure request logging, exception handling, analytics, and monitoring do not inadvertently capture the text.

### User safety

The output should offer clear, practical steps without requiring the user to trust a score alone.

For example, phishing guidance may recommend avoiding suspicious links and using official account recovery channels. Account-compromise guidance may recommend securing accounts from a trusted device, changing credentials, and reviewing active sessions.

Threat triage is informational support and does not replace emergency assistance, professional legal advice, or specialized support services.

---

## ☎️ 13. Emergency Helplines in India

The dashboard's emergency banner is designed to provide immediate access to relevant contact information.

| Number | Service |
|---|---|
| **112** | National Emergency Response Support System |
| **181** | Women Helpline, subject to local availability |
| **1091** | Women in Distress, where supported locally |
| **1930** | National Cyber Crime Helpline for relevant cyber financial fraud reporting |

Official resources:

- [Government of India's ERSS — 112](https://112.gov.in/)
- [Ministry of Women and Child Development](https://wcd.gov.in/)
- [National Cyber Crime Reporting Portal](https://cybercrime.gov.in/)

### Click-to-call behaviour

The frontend can use links such as:

```html
<a href="tel:112">Call 112</a>
```

This opens the device's supported calling interface where available. It does not guarantee that a call was placed or answered.

Emergency numbers and service descriptions must be checked against current official guidance and local availability before release.

### Prototype disclaimer

The application's simulated SOS workflow is not equivalent to contacting an emergency service. Do not claim that real emergency responders have been dispatched unless an authorized, functioning integration confirms that action.

---

## 🛡️ 14. Privacy and Security

Privacy is a core design principle of Her Safety.

### API key protection

OpenRouteService credentials and other private API keys must remain server-side.

- Store secrets in the backend environment.
- Never embed private keys in frontend bundles.
- Avoid exposing credentials in error responses.
- Exclude secret environment files from version control.
- Rotate credentials if they are accidentally exposed.

### Location privacy

- Request geolocation permission only when necessary.
- Explain location-related functionality to users.
- Minimize the data sent to external providers.
- Avoid collecting unnecessary journey history.
- Use temporary sharing links only with appropriate access controls and expiration.
- Avoid including precise locations in public reports without a clear need and appropriate consent.

### Digital-safety privacy

The raw threat description should remain in memory during processing and should not be persisted or logged if the privacy-first design is to be maintained.

### Evidence security

- Validate file types and sizes.
- Protect evidence access with appropriate authorization.
- Store hashes alongside the corresponding evidence references.
- Protect stored hash records against unauthorized changes.
- Avoid exposing sensitive evidence through public URLs.
- Define retention and deletion policies.

### Moderator security

A development `X-Moderator-Key` mechanism should not be used as the sole security control for a public production service.

Production deployment should implement appropriate identity verification, authorization, secret management, rate limiting, and audit controls.

### Privacy utility limitations

Client-side metadata cleaning reduces certain forms of accidental metadata disclosure. It does not guarantee anonymity, remove identifying information visible within the image itself, or eliminate every possible embedded metadata field.

---

## 💻 15. Installation and Setup

### Prerequisites

Install:

- Node.js and npm.
- Python 3.11 or a version supported by the backend dependencies.
- Git.
- A modern browser.
- An OpenRouteService API key if live routing or geocoding requires one.

The project overview identifies Python 3.11, 3.12, and 3.14 as intended compatible versions. Use the version actually tested with the repository's pinned dependencies; compatibility should not be assumed solely from the language version.

Check the installed versions:

```bash
node --version
npm --version
python --version
git --version
```

### Step 1: Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_DIRECTORY>
```

Replace the placeholders with the real repository URL and directory.

### Step 2: Install frontend dependencies

From the directory containing the frontend `package.json`:

```bash
npm install
```

If the project uses another package manager or lockfile, follow the repository's configured package manager.

### Step 3: Configure backend dependencies

Open a second terminal:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

If the repository uses a different dependency file, use the existing configuration.

### Step 4: Configure environment variables

Create environment files based on the repository's `.env.example` or existing configuration.

Example backend settings:

```env
OPENROUTESERVICE_API_KEY=your_server_side_api_key
```

Example frontend setting, only if referenced by the implementation:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

These examples are not a substitute for the environment variables expected by the code. Confirm exact names before starting the services.

### Step 5: Start the backend

From the backend directory, run the FastAPI application using its actual Python import path.

For example, if the entry point is `main.py` and exports `app`:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If the application is exposed through a package, adjust the module path accordingly.

The expected local backend address is:

`http://127.0.0.1:8000`

### Step 6: Start the frontend

In a separate terminal, run the project's configured development script:

```bash
npm run dev
```

The intended frontend address is:

`http://localhost:8080`

If the development server chooses a different port, use the address printed in the terminal.

### Step 7: Open the application

Navigate to:

`http://localhost:8080`

Open the backend documentation at:

`http://127.0.0.1:8000/docs`

The interactive API documentation is available when the FastAPI application exposes its standard documentation route.

---

## ⚙️ 16. Environment Configuration

The following table provides examples of configuration values. Confirm that each variable is actually referenced by the code before adding it to an environment file.

| Variable | Purpose | Exposure |
|---|---|---|
| `OPENROUTESERVICE_API_KEY` | Backend routing and geocoding requests | Secret |
| `VITE_API_BASE_URL` | Frontend backend-service URL, if supported | Public configuration |
| `DATABASE_URL` | SQLAlchemy database connection, if configurable | May contain secrets depending on the database |
| `X_MODERATOR_KEY` or equivalent | Development moderation authorization, if configured | Secret |

### Environment-file guidance

- Do not commit populated `.env` files.
- Provide safe `.env.example` files without real credentials.
- Keep API keys out of source code.
- Never use a frontend environment variable to protect a secret.
- Validate required configuration during application startup.
- Report unavailable external integrations clearly.

### Database initialization

The project overview describes automatic schema initialization.

Confirm the actual database startup and table-creation behaviour before deployment. Automatic table creation is not equivalent to a managed migration system, and production schema changes should be planned carefully.

---

## 🌐 17. Running the Application

Run the frontend and backend in separate terminals.

**Terminal 1 — Backend**

```bash
cd backend
# Activate the virtual environment first.
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend**

```bash
npm run dev
```

The backend command assumes `backend/main.py` exposes the FastAPI application as `app`. Adjust it if your actual entry point differs.

### Local development checklist

- [ ] Frontend development server starts.
- [ ] Backend starts without import errors.
- [ ] SQLite initializes as expected.
- [ ] Frontend can reach the backend.
- [ ] CORS allows the intended local origin.
- [ ] Routing works when the API key is configured.
- [ ] Missing provider configuration produces a clear message.
- [ ] Community reports persist when submitted.
- [ ] Evidence verification produces consistent results.
- [ ] Digital-safety requests return the expected response structure.
- [ ] Simulated SOS messaging clearly indicates prototype behaviour.
- [ ] Emergency contact links are accessible.

---

## 🔌 18. API Documentation

FastAPI typically exposes interactive API documentation at:

`http://127.0.0.1:8000/docs`

An OpenAPI schema may also be available at:

`http://127.0.0.1:8000/openapi.json`

The actual endpoint paths, HTTP methods, request schemas, and response formats should be obtained from the running application.

### API module overview

| Module | Responsibilities |
|---|---|
| Route safety | Routing, route alternatives, and contextual assessments |
| Active journey | Journey state, check-ins, and prototype SOS actions |
| Community | Report creation, listing, filtering, and moderation |
| Incidents | Incident records and evidence operations |
| Digital safety | Rules-based threat assessment |
| Trusted circle | Contact and journey-sharing functionality, where backed by APIs |

These are logical module descriptions, not a claim that the backend exposes a specific endpoint for every operation.

### API error handling

The backend should return appropriate HTTP status codes and structured errors for:

- Invalid input.
- Missing resources.
- Unauthorized moderator operations.
- Unsupported evidence types.
- File-size violations.
- Missing routing configuration.
- External provider failures.
- Database failures.

Error responses must not reveal private keys, raw sensitive descriptions, or internal stack traces.

---

## 🗄️ 19. Database and Data Persistence

Her Safety uses SQLite through SQLAlchemy for relational persistence.

### Community reports

Persisted reports may contain fields such as:

- Report identifier.
- Category.
- Description.
- Location or area.
- Creation timestamp.
- Moderation status.

The exact schema depends on the implemented SQLAlchemy models.

### Incident records

Incident records may associate:

- Incident reference.
- Incident metadata.
- Evidence references.
- Evidence integrity hashes.
- Creation timestamps.

The actual storage strategy determines which fields are stored in SQLite and which are stored in files or another persistence layer.

### Digital threat descriptions

Under the intended privacy-first design, raw digital-threat descriptions are processed in memory and not persisted or logged.

### Evidence storage

SQLite can store evidence metadata and hashes, while file contents may be stored separately. The precise arrangement must be verified in the implementation.

### Development and production

SQLite is appropriate for local development and many prototypes. A production deployment should assess concurrency, backup, file storage, migration, access-control, and retention requirements.

---

## 🧪 20. Testing and Verification

Safety-related functionality should be tested against both expected behaviour and failure conditions.

### Route safety

- Verify valid origin and destination requests.
- Check available travel modes.
- Test route-provider timeouts.
- Confirm missing API configuration is handled.
- Verify route geometry and marker rendering.
- Test contextual-data gaps.
- Check maximum-detour constraints.
- Ensure unavailable data is not presented as verified information.

### Active journey

- Start and end a journey.
- Check ETA presentation.
- Test simulated check-in timers.
- Test route-deviation handling.
- Verify that SOS simulation displays the correct disclaimer.
- Confirm that no real dispatch is claimed without an actual integration.

### Community reports

- Submit valid and invalid reports.
- Check required-field validation.
- Verify report persistence.
- Test category and area filtering.
- Check moderation authorization.
- Test valid and invalid moderation status transitions.

### Evidence vault

- Upload supported evidence types.
- Reject unsupported formats.
- Test configured file-size limits.
- Confirm deterministic SHA-256 output for identical bytes.
- Modify an evidence file and verify that the hash comparison fails.
- Confirm that evidence cannot be accessed without appropriate authorization.

### Digital safety

- Test examples from each supported threat category.
- Verify score bounds.
- Confirm deterministic outputs for identical inputs.
- Test low-confidence and ambiguous cases.
- Ensure raw descriptions are not persisted or logged.
- Verify that recommendations remain understandable and actionable.

### Privacy tools

- Test metadata removal with images containing supported EXIF fields.
- Confirm that the output no longer contains the supported metadata targeted by the cleaner.
- Test unsupported formats and processing errors.
- Verify that temporary journey-sharing links expire as intended, where implemented.
- Check that private contacts and location information are not publicly exposed.

### Emergency banner

- Verify the correct contact numbers and descriptions.
- Test `tel:` links on compatible devices.
- Confirm mobile accessibility.
- Ensure the banner remains available when routing APIs fail.
- Review official helpline information before deployment.

---

## ⚠️ 21. Limitations and Safety Disclaimers

Her Safety is a safety-support platform, not a guarantee of personal protection.

### Route-safety limitations

- Geospatial datasets may be incomplete.
- Street lighting information may be missing or outdated.
- OpenStreetMap coverage varies by location.
- Community reports may be unverified.
- Nearby businesses may be closed despite stale opening-hour data.
- A route's contextual score cannot guarantee real-world safety.

### Simulated SOS

The prototype SOS workflow does not automatically dispatch emergency responders unless a separately implemented and authorized integration supports that capability.

### Digital threat assessment

The digital-safety engine is rules-based. Its output depends on the implemented rules and cannot guarantee detection of every threat or predict the actions of an attacker.

### Evidence integrity

SHA-256 verification can detect changes relative to a trusted stored hash, but does not independently establish the authenticity or truthfulness of an uploaded file.

### Privacy utilities

Metadata removal cannot guarantee anonymity or eliminate every source of identifying information.

### External service availability

Routing, geocoding, and geographic-data services may impose rate limits, experience outages, or return incomplete results.

### Data protection

Sensitive reports, location information, trusted contacts, and evidence require appropriate access controls, retention policies, and careful handling.

---

## 🚀 22. Future Enhancements

Potential future work includes:

### Navigation

- Turn-by-turn navigation.
- Better route-deviation detection.
- Offline access to previously loaded route information.
- Improved route-context explanations.
- Expanded and validated lighting datasets.
- Stronger data-freshness indicators.

### Emergency support

- Secure trusted-contact notifications.
- Opt-in journey sharing.
- More reliable check-in workflows.
- Carefully designed emergency escalation integrations.
- Clear delivery and failure status for any real notifications.

### Community safety

- Stronger moderation workflows.
- Report verification and provenance.
- Duplicate-report detection.
- Privacy-preserving location aggregation.
- Improved abuse prevention.

### Incident evidence

- Protected evidence storage.
- Auditable access logs.
- Secure timestamps.
- Stronger chain-of-custody controls.
- Configurable evidence retention and deletion.

### Digital safety

- Expanded threat rules.
- Better explanations for classifications.
- Multilingual threat triage.
- More accessible recovery guidance.
- Improved testing against ambiguous and adversarial inputs.

### Platform reliability

- Automated integration tests.
- Deployment automation.
- Monitoring and diagnostics that respect privacy.
- Production authentication and authorization.
- Database migration management.
- Accessibility and performance improvements.

These are possible future enhancements, not a statement that they are already available.

---

## 🤝 23. Contributing

Contributions that improve privacy, reliability, accessibility, route assessment, and responsible safety communication are welcome.

Suggested workflow:

1. Fork the repository.
2. Create a feature branch.
3. Implement a focused change.
4. Add or update tests.
5. Run the relevant test suites.
6. Check that no secrets or personal information are included.
7. Submit a pull request with a description of the change.

Example:

```bash
git checkout -b feature/privacy-improvements
git add .
git commit -m "Improve privacy safeguards"
git push origin feature/privacy-improvements
```

Changes to scoring, emergency workflows, evidence handling, or personal-data processing should include appropriate tests and documentation.

---

## 📄 24. License

Select a license before distributing the project publicly.

For example, the MIT License permits broad reuse subject to its terms. If the team selects MIT, add the corresponding `LICENSE` file and copyright information.

Until a license is selected, no specific open-source license should be assumed.

---

## 🌟 Conclusion

Her Safety brings together physical safety awareness, digital threat triage, incident documentation, and privacy utilities in one platform.

From comparing potential routes and reporting local concerns to checking evidence integrity and finding digital-threat guidance, the project aims to make safety-related tools more accessible and transparent.

Its guiding principles are:

- **Safety first:** Support informed decisions without promising guaranteed protection.
- **Privacy by design:** Minimize unnecessary exposure of sensitive information.
- **Transparency:** Clearly distinguish verified data, heuristics, and simulated functionality.
- **Practical support:** Make emergency resources and actionable guidance accessible.
- **Responsible technology:** Treat data quality, security, and user trust as essential parts of the system.

**Her Safety — Empowering safer journeys and stronger digital privacy.**