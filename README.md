# SwissRe-UICaseStudy
UI case study for Swiss Re

Senior UI Engineering Use Case — Problem Statement (One Page)

Problem Statement:
ABC Insurance company would like to leverage modern technologies to provide experience integrating various internal/external services to provide risk assessment modules for the user. Insurance is a data/document heavy business process. Case in point, for processing Claims based application to deliver detailed workflow to adjudicate the claims coming from various channels such as (emails/documents using SFTP/structured and unstructured data sharing for processing the claims. This is an existing system using legacy technologies, and business decided to re-build this application with modern UI stack.

Context

Design a scalable, high-performance web application that lets users manage large datasets and interact with extremely large documents (100 MB–1 GB). The solution must support role-based access and advanced data/document operations, and your discussion should cover architecture, performance strategy, data flow, and trade-offs.

Inputs provided to you: Figma design screens, Company specific UX and UI Standards. (e.g. CRM Dashboard Customers List | Figma)

Functional Requirements

- Landing page data grid: display 20,000+ records with sorting, filtering, and row actions (Edit/Delete/Assign). Use pagination or justify an alternative (e.g., virtualization/infinite scroll).
- Role-based access (RBAC): records and UI actions must be filtered/controlled by user permissions (show/hide/disable). Define where authorization is enforced (backend as source of truth; frontend for UX).
- Row → document loading: selecting a row opens associated documents sized 1500 MB–1 GB. Propose design patterns keeping in user experience; ensure smooth transition from grid to workspace.
- Document workspace: view large documents efficiently and support operations: edit, split, merge, delete and add page-level comments, provide annotations on the documents

Non-Functional Requirements

- Performance: responsive UI with minimal re-renders and memory footprint for both the 20k+ grid and large-document viewing/interaction.
- Scalability: support growth in record volume, document size, and concurrent users/operations.
- UX: clear loading/progress states, perceived performance, errors and recovery, safe cancel/retry for long-running tasks.
- Reliability: consistent document state after split/merge/comment operations; handle partial failures gracefully.

What We Expect You to Cover (Discussion/Evaluation Focus)

- Architecture: component boundaries, state management, data fetching/caching, backend API assumptions, and where critical enforcement (authz, validation) lives.
- Performance strategy: techniques for rendering 20k+ rows (e.g., server-side ops, virtualization) and for handling 1500 MB–1 GB documents (e.g., streaming/partial loading, web workers, chunked operations).
- Trade-offs: pagination vs infinite scroll vs virtualization; client vs server processing; caching; optimistic vs pessimistic updates.

**Project Scaffold (React + Vite)**

This repository now includes a minimal React application scaffolded with Vite to help you prototype the UI components for the case study.

Files added:

- `package.json` – project metadata and scripts
- `index.html` – Vite entry HTML
- `src/main.jsx` – React entry
- `src/App.jsx` – minimal app shell
- `src/index.css` – basic styles

Getting started (Windows PowerShell)

1. Install dependencies:

```powershell
cd "c:\Users\rajes\Desktop\SwissRe-UICaseStudy"
npm install
```

2. Start the development server:

```powershell
npm run dev
```

Open the provided localhost URL in your browser (Vite will print it in the terminal).

Build for production:

```powershell
npm run build
npm run preview
```

Next steps you might want me to help with:

- Add a grid component (virtualized) for the 20k+ records example
- Wire up a simple mock API to demonstrate RBAC and row/document loading
- Add document workspace with streaming/chunked viewer and web-worker helpers

Phase 1: Byte-range loading (how to test)

To test byte-range loading and pdf.js range transport in the demo you can add a sample PDF to the dev server's `public/` folder. The mock handlers will attempt to honor Range requests when a file is present. Steps:

1. Create a `public` folder at the project root if it doesn't exist.
2. Copy a sample PDF to `public/sample.pdf` (a small one-page PDF is fine for testing).
3. Start the dev server:

```powershell
cd "c:\Users\rajes\Desktop\SwissRe-UICaseStudy"
npm install
npm run dev
```

4. In the app's Document Workspace, enable the *"Use byte-range loading"* option (toggle) to exercise the range-path code.

Notes:
- The repo includes worker and viewer code that can request byte ranges and fall back to a full download if Range requests aren't supported by the server or mock layer.
- For full production-like testing, you may replace the in-browser mock with an express server that serves `public/sample.pdf` and supports `Range` headers (this repo's Phase 4 covers that option).

If you want, I can now implement the worker+mock changes to simulate byte-range responses internally (or add an optional Node dev server that serves `public/sample.pdf` with correct `206 Partial Content` headers). Say which you'd prefer and I'll proceed.

Tell me which next step you'd like and I'll implement it.