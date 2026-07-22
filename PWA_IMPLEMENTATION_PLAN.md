# PWA Implementation Plan
**Version:** 1.0  
**Stack Target:** Next.js (App Router) + TypeScript + Supabase  
**Primary Focus:** Offline-First Capability  
**Author:** ElkanHub  

---

## What This Document Is.

This is a complete, step-by-step implementation plan for adding Progressive Web App (PWA) capabilities to any Next.js project. It is written to be:

- **Framework-agnostic in principle** — all concepts apply broadly, but code examples target Next.js 14/15 with the App Router.
- **Agent-executable** — every step is explicit. An AI agent can read this and implement without ambiguity.
- **Offline-first in architecture** — the primary goal is reliable functionality with no internet connection, not just installability.

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Prerequisites & Dependencies](#2-prerequisites--dependencies)
3. [Phase 1 — Web App Manifest](#3-phase-1--web-app-manifest)
4. [Phase 2 — Service Worker Setup (Serwist)](#4-phase-2--service-worker-setup-serwist)
5. [Phase 3 — Asset & Route Caching Strategy](#5-phase-3--asset--route-caching-strategy)
6. [Phase 4 — Offline Data Layer (IndexedDB)](#6-phase-4--offline-data-layer-indexeddb)
7. [Phase 5 — Background Sync (Offline Write Queue)](#7-phase-5--background-sync-offline-write-queue)
8. [Phase 6 — Conflict Resolution](#8-phase-6--conflict-resolution)
9. [Phase 7 — UI: Offline Indicators & Feedback](#9-phase-7--ui-offline-indicators--feedback)
10. [Phase 8 — Icons & Splash Screens](#10-phase-8--icons--splash-screens)
11. [Phase 9 — Push Notifications (Optional)](#11-phase-9--push-notifications-optional)
12. [Phase 10 — Testing & Validation](#12-phase-10--testing--validation)
13. [Phase 11 — Deployment Checklist](#13-phase-11--deployment-checklist)
14. [Appendix A — Caching Strategy Reference](#appendix-a--caching-strategy-reference)
15. [Appendix B — App Store Packaging (Optional)](#appendix-b--app-store-packaging-optional)

---

## 1. Core Concepts

Before any code is written, understand these four pillars.

### 1.1 What a PWA Actually Is

A Progressive Web App is a standard web application that has been enhanced with three capabilities:

| Capability | What It Means | Tech Behind It |
|---|---|---|
| **Installable** | Users can add it to their home screen/desktop with its own icon and no browser UI | Web App Manifest |
| **Offline Support** | The app works with no internet connection | Service Worker + Cache API |
| **App-Like Feel** | Full-screen, fast loads, push notifications | Manifest `display` + Caching |

### 1.2 The Service Worker

The Service Worker is a JavaScript file that runs in the background, completely separate from your app's UI thread. Think of it as a **programmable network proxy** sitting between your app and the internet.

- It intercepts every network request the app makes.
- It decides: "Should I serve this from the cache, or fetch from the network?"
- It runs even when the browser tab is closed.
- It is the ONLY reason offline functionality is possible.

### 1.3 Local-First Architecture

For offline data to work, you must adopt a "Local-First" mental model:

> **Write to local storage first. Sync to the server when a connection is available.**

This is the opposite of the default web model (write to server, show the response). The flow looks like this:

```
User Action
    ↓
Write to IndexedDB (local, instant)
    ↓
Show success to user immediately
    ↓
[Background] Check for internet
    ↓
If online → Sync to Supabase
If offline → Queue the write, retry later
```

### 1.4 HTTPS Requirement

PWAs will not function on HTTP. They require a secure context (HTTPS). This is automatically handled on Vercel, Netlify, and most modern hosting platforms.

---

## 2. Prerequisites & Dependencies

### 2.1 Required Stack

- Next.js 14+ with App Router
- TypeScript (strict mode)
- Node.js 18+
- An existing Supabase project (for data sync)

### 2.2 Packages to Install

Run this command at the project root:

```bash
npm install @serwist/next serwist idb
```

| Package | Purpose |
|---|---|
| `@serwist/next` | Next.js plugin that integrates Serwist into the build pipeline |
| `serwist` | The core service worker library (successor to Workbox + next-pwa) |
| `idb` | A lightweight, promise-based wrapper around the browser's IndexedDB API |

### 2.3 Development Dependencies

```bash
npm install --save-dev @serwist/sw
```

### 2.4 Verify next.config.ts Compatibility

Your `next.config.ts` (or `next.config.js`) will be modified in Phase 2. Make sure it is not using `next export` (static export) — PWA service workers require a server or edge runtime to function correctly. If you are using `output: 'export'`, remove it or switch to standard server rendering.

---

## 3. Phase 1 — Web App Manifest

**Goal:** Tell browsers that this web app is installable and provide metadata for the home screen icon, name, and theme.

### 3.1 Create the Manifest File

In Next.js App Router, create the following file:

**File path:** `app/manifest.ts`

```typescript
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Your App Full Name',           // Shown on splash screen
    short_name: 'AppName',                // Shown under home screen icon (max ~12 chars)
    description: 'A short description of what your app does.',
    start_url: '/',                       // Where the app opens on launch
    scope: '/',                           // Which URLs are "inside" the app
    display: 'standalone',                // 'standalone' = no browser chrome (feels native)
    orientation: 'portrait',             // 'portrait', 'landscape', or 'any'
    background_color: '#ffffff',          // Splash screen background
    theme_color: '#0D2B55',               // Browser toolbar color (use your brand color)
    categories: ['productivity', 'business'],
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',              // 'maskable' = safe for all Android icon shapes
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      // Optional but recommended for app store-like install prompts
      {
        src: '/screenshots/desktop.png',
        sizes: '1280x720',
        type: 'image/png',
        // @ts-ignore — 'form_factor' is valid but not yet in TypeScript types
        form_factor: 'wide',
        label: 'Dashboard view',
      },
    ],
  }
}
```

### 3.2 Key `display` Values — Choose Carefully

| Value | Effect | Use When |
|---|---|---|
| `standalone` | No browser UI. Feels like a native app. | Most apps — this is the default recommendation. |
| `fullscreen` | No browser UI AND no status bar. | Games, media, kiosk apps. |
| `minimal-ui` | Small browser controls, but minimal. | If users need browser navigation. |
| `browser` | Opens in a normal browser tab. | Not a PWA — defeats the purpose. |

### 3.3 Add Manifest Link to Root Layout

In `app/layout.tsx`, Next.js will automatically inject the manifest link if the `manifest.ts` file exists in the `app/` directory. No manual `<link>` tag is needed.

Verify by checking the rendered HTML for:
```html
<link rel="manifest" href="/manifest.webmanifest" />
```

---

## 4. Phase 2 — Service Worker Setup (Serwist)

**Goal:** Register a service worker that intercepts network requests and serves cached assets when offline.

### 4.1 Update `next.config.ts`

**File path:** `next.config.ts`

```typescript
import type { NextConfig } from 'next'
import withSerwist from '@serwist/next'

const withPWA = withSerwist({
  swSrc: 'app/sw.ts',         // Your custom service worker source file
  swDest: 'public/sw.js',     // Where the compiled SW will be output
  reloadOnOnline: true,        // Auto-reload app when connection is restored
  disable: process.env.NODE_ENV === 'development',  // Disable SW in dev to avoid caching issues
})

const nextConfig: NextConfig = {
  // ...your existing config
}

export default withPWA(nextConfig)
```

> **Agent note:** If `next.config.ts` already has a `withPWA` or similar wrapper, it must be merged, not replaced. Check for existing wrappers before modifying.

### 4.2 Create the Service Worker Source File

**File path:** `app/sw.ts`

```typescript
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { defaultCache, Serwist } from 'serwist'

// This tells TypeScript about the Serwist global injected at build time
declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,  // Auto-generated list of all static assets
  skipWaiting: true,                    // New SW activates immediately without waiting
  clientsClaim: true,                   // SW takes control of all open tabs immediately
  navigationPreload: true,              // Speeds up navigation by pre-loading responses
  runtimeCaching: defaultCache,         // Sensible default caching rules (customized in Phase 3)
})

serwist.addEventListeners()
```

### 4.3 Add TypeScript Config for Service Worker

**File path:** `tsconfig.sw.json` (create new, in project root)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext", "WebWorker"],
    "types": []
  },
  "include": ["app/sw.ts"]
}
```

### 4.4 Update `.gitignore`

Add the compiled service worker to `.gitignore` (it is generated at build time):

```
# PWA - generated files
public/sw.js
public/sw.js.map
public/worker-*.js
public/worker-*.js.map
```

---

## 5. Phase 3 — Asset & Route Caching Strategy

**Goal:** Define what gets cached, for how long, and using which strategy.

### 5.1 Understanding Caching Strategies

| Strategy | Logic | Best For |
|---|---|---|
| **Cache First** | Check cache → if miss, go to network | Static assets: fonts, images, icons |
| **Network First** | Try network → if offline, use cache | API data, frequently updated content |
| **Stale-While-Revalidate** | Return cache immediately AND fetch fresh data in background | Pages, UI components |
| **Cache Only** | Cache only, never network | Pre-cached assets for offline use |
| **Network Only** | Network only, no caching | Analytics, POST requests |

### 5.2 Recommended Caching Rules

Update `app/sw.ts` to replace `runtimeCaching: defaultCache` with a custom config:

```typescript
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from 'serwist'

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [

    // --- 1. Static Assets (fonts, icons, images) ---
    {
      matcher: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|woff|woff2|ttf|eot)$/i,
      handler: new CacheFirst({
        cacheName: 'static-assets',
        plugins: [
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }), // 30 days
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },

    // --- 2. Next.js Static Chunks (_next/static) ---
    {
      matcher: /^\/_next\/static\/.*/i,
      handler: new CacheFirst({
        cacheName: 'next-static',
        plugins: [
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 365 * 24 * 60 * 60 }), // 1 year
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },

    // --- 3. Next.js Image Optimization (_next/image) ---
    {
      matcher: /^\/_next\/image\/.*/i,
      handler: new StaleWhileRevalidate({
        cacheName: 'next-image',
        plugins: [
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 }), // 1 day
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },

    // --- 4. App Pages (HTML navigation) ---
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new StaleWhileRevalidate({
        cacheName: 'pages',
        plugins: [
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }), // 1 day
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },

    // --- 5. API Routes (Supabase or internal /api/*) ---
    // Use Network First so users always get fresh data when online
    {
      matcher: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: new NetworkFirst({
        cacheName: 'supabase-api',
        networkTimeoutSeconds: 5,         // Fall back to cache after 5 seconds
        plugins: [
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 5 * 60 }), // 5 minutes
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },

    // --- 6. Google Fonts ---
    {
      matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [
          new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
          new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
      }),
    },
  ],
})
```

### 5.3 Offline Fallback Page

Create a page that displays when a user tries to navigate to a page they haven't visited yet, while offline.

**File path:** `app/offline/page.tsx`

```tsx
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">You are offline</h1>
      <p className="text-muted-foreground mb-6">
        This page is not available offline. Please check your internet connection and try again.
      </p>
      <p className="text-sm text-muted-foreground">
        Pages you have already visited are still accessible.
      </p>
    </div>
  )
}
```

Register the fallback in `app/sw.ts` by adding to the Serwist config:

```typescript
const serwist = new Serwist({
  // ...existing config
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document'
        },
      },
    ],
  },
})
```

---

## 6. Phase 4 — Offline Data Layer (IndexedDB)

**Goal:** Store a local copy of critical app data so the app is fully functional without a network connection.

### 6.1 Define Your IndexedDB Schema

Create a centralized database configuration file.

**File path:** `lib/db/offline-db.ts`

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb'

// --- Define your database schema ---
// Add all stores (tables) your app needs to work offline
interface AppDB extends DBSchema {
  // Example: SOPs or Documents store
  documents: {
    key: string                    // Primary key (e.g., UUID)
    value: {
      id: string
      title: string
      content: string
      updated_at: string
      synced: boolean              // Track if this record is synced to server
    }
    indexes: { 'by-updated': string }
  }

  // Sync queue: holds offline writes waiting to be pushed to Supabase
  sync_queue: {
    key: number                   // Auto-increment
    value: {
      id?: number
      table: string               // Which Supabase table to write to
      action: 'INSERT' | 'UPDATE' | 'DELETE'
      payload: Record<string, unknown>
      created_at: string
      retries: number
    }
  }

  // Add more stores here as needed by your application
}

const DB_NAME = 'app-offline-db'
const DB_VERSION = 1

let dbInstance: IDBPDatabase<AppDB> | null = null

export async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance

  dbInstance = await openDB<AppDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // documents store
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' })
        docStore.createIndex('by-updated', 'updated_at')
      }

      // sync_queue store
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true })
      }
    },
  })

  return dbInstance
}
```

### 6.2 Create Data Access Functions

**File path:** `lib/db/documents.ts` (create one file per entity/store)

```typescript
import { getDB } from './offline-db'

// Read all documents from local IndexedDB
export async function getLocalDocuments() {
  const db = await getDB()
  return db.getAll('documents')
}

// Read a single document by ID
export async function getLocalDocument(id: string) {
  const db = await getDB()
  return db.get('documents', id)
}

// Write (upsert) a document locally
export async function saveLocalDocument(doc: {
  id: string
  title: string
  content: string
  updated_at: string
  synced: boolean
}) {
  const db = await getDB()
  await db.put('documents', doc)
}

// Delete a document locally
export async function deleteLocalDocument(id: string) {
  const db = await getDB()
  await db.delete('documents', id)
}

// Seed local DB from Supabase data (run on app load when online)
export async function seedLocalDocuments(docs: Array<{
  id: string
  title: string
  content: string
  updated_at: string
}>) {
  const db = await getDB()
  const tx = db.transaction('documents', 'readwrite')
  await Promise.all([
    ...docs.map(doc => tx.store.put({ ...doc, synced: true })),
    tx.done,
  ])
}
```

### 6.3 Data Seeding Hook

This React hook seeds the local database when the user first loads the app with an internet connection.

**File path:** `hooks/use-offline-seed.ts`

```typescript
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { seedLocalDocuments } from '@/lib/db/documents'

export function useOfflineSeed() {
  useEffect(() => {
    async function seed() {
      // Only seed if online
      if (!navigator.onLine) return

      const supabase = createClient()
      const { data, error } = await supabase
        .from('documents')  // Replace with your actual table name
        .select('id, title, content, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200)          // Limit to a reasonable number for offline use

      if (error || !data) return

      await seedLocalDocuments(data)
    }

    seed()
  }, [])
}
```

Use this hook in your root layout or a top-level component:

```typescript
// In your layout or a top-level client component
useOfflineSeed()
```

---

## 7. Phase 5 — Background Sync (Offline Write Queue)

**Goal:** When a user performs a write action (create, update, delete) while offline, queue it locally and automatically sync it to Supabase when the connection is restored.

### 7.1 Queue Write Actions

**File path:** `lib/db/sync-queue.ts`

```typescript
import { getDB } from './offline-db'

// Add an action to the sync queue
export async function enqueueSync(
  table: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: Record<string, unknown>
) {
  const db = await getDB()
  await db.add('sync_queue', {
    table,
    action,
    payload,
    created_at: new Date().toISOString(),
    retries: 0,
  })
}

// Get all pending sync items
export async function getPendingSyncItems() {
  const db = await getDB()
  return db.getAll('sync_queue')
}

// Remove a synced item from the queue
export async function removeSyncItem(id: number) {
  const db = await getDB()
  await db.delete('sync_queue', id)
}

// Increment retry count for a failed item
export async function incrementRetry(id: number) {
  const db = await getDB()
  const item = await db.get('sync_queue', id)
  if (item) {
    await db.put('sync_queue', { ...item, retries: item.retries + 1 })
  }
}
```

### 7.2 The Sync Engine

**File path:** `lib/sync/sync-engine.ts`

```typescript
import { createClient } from '@/lib/supabase/client'
import {
  getPendingSyncItems,
  removeSyncItem,
  incrementRetry,
} from '@/lib/db/sync-queue'

const MAX_RETRIES = 3

export async function runSync(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient()
  const queue = await getPendingSyncItems()

  let synced = 0
  let failed = 0

  for (const item of queue) {
    if (item.retries >= MAX_RETRIES) {
      // Too many retries — remove from queue to prevent infinite loops
      // In production: log to an error monitoring service
      if (item.id !== undefined) await removeSyncItem(item.id)
      failed++
      continue
    }

    try {
      let error = null

      if (item.action === 'INSERT') {
        ;({ error } = await supabase.from(item.table).insert(item.payload))
      } else if (item.action === 'UPDATE') {
        const { id, ...rest } = item.payload as { id: string; [key: string]: unknown }
        ;({ error } = await supabase.from(item.table).update(rest).eq('id', id))
      } else if (item.action === 'DELETE') {
        const { id } = item.payload as { id: string }
        ;({ error } = await supabase.from(item.table).delete().eq('id', id))
      }

      if (error) throw new Error(error.message)

      if (item.id !== undefined) await removeSyncItem(item.id)
      synced++
    } catch {
      if (item.id !== undefined) await incrementRetry(item.id)
      failed++
    }
  }

  return { synced, failed }
}
```

### 7.3 Auto-Sync on Reconnect Hook

**File path:** `hooks/use-sync-on-reconnect.ts`

```typescript
'use client'

import { useEffect, useCallback } from 'react'
import { runSync } from '@/lib/sync/sync-engine'

export function useSyncOnReconnect() {
  const sync = useCallback(async () => {
    if (!navigator.onLine) return
    const result = await runSync()
    if (result.synced > 0) {
      console.log(`[Sync] Pushed ${result.synced} offline actions to server.`)
      // Optionally: trigger a router refresh or query invalidation here
    }
  }, [])

  useEffect(() => {
    // Sync on mount if online
    sync()

    // Sync whenever the user comes back online
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])
}
```

### 7.4 Using the Queue in a Write Action

Anywhere in your app where you write data, use this pattern:

```typescript
import { saveLocalDocument } from '@/lib/db/documents'
import { enqueueSync } from '@/lib/db/sync-queue'

async function handleSave(formData: { id: string; title: string; content: string }) {
  const doc = {
    ...formData,
    updated_at: new Date().toISOString(),
    synced: false,
  }

  // Step 1: Write to local IndexedDB immediately (always succeeds)
  await saveLocalDocument(doc)

  // Step 2: If online, also push to Supabase immediately
  if (navigator.onLine) {
    const supabase = createClient()
    const { error } = await supabase.from('documents').upsert(doc)

    if (!error) {
      // Mark as synced in local DB
      await saveLocalDocument({ ...doc, synced: true })
    } else {
      // Failed despite being "online" — queue for retry
      await enqueueSync('documents', 'UPDATE', doc)
    }
  } else {
    // Offline — add to sync queue
    await enqueueSync('documents', 'UPDATE', doc)
  }
}
```

---

## 8. Phase 6 — Conflict Resolution

**Goal:** Handle the case where two users (or the same user on two devices) edit the same record offline and both try to sync.

### 8.1 Recommended Strategy: Last-Write-Wins with Timestamps

This is the simplest and most practical approach for most apps.

**Rule:** The record with the most recent `updated_at` timestamp wins.

**Implementation in Supabase:**

Use PostgreSQL's `ON CONFLICT DO UPDATE` with a timestamp check:

```sql
-- In your Supabase migration, add this function:
CREATE OR REPLACE FUNCTION upsert_with_timestamp_check(
  p_table TEXT,
  p_record JSONB
) RETURNS VOID AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)
     ON CONFLICT (id) DO UPDATE SET
       -- Update all fields only if incoming timestamp is newer
       updated_at = CASE
         WHEN EXCLUDED.updated_at > %I.updated_at THEN EXCLUDED.updated_at
         ELSE %I.updated_at
       END',
    p_table, p_table, p_table, p_table
  ) USING p_record;
END;
$$ LANGUAGE plpgsql;
```

Or, simpler — use Supabase's built-in upsert with a client-side timestamp check:

```typescript
// In sync-engine.ts, update the UPDATE handler:
if (item.action === 'UPDATE') {
  const { id, updated_at, ...rest } = item.payload as {
    id: string
    updated_at: string
    [key: string]: unknown
  }

  // Only update if the server version is older than our local version
  const { error } = await supabase
    .from(item.table)
    .update({ ...rest, updated_at })
    .eq('id', id)
    .lt('updated_at', updated_at)  // Only write if our data is newer

  // If no rows were updated, the server had a newer version — discard our change
}
```

### 8.2 Storing Supabase Timestamps

All tables intended for offline sync must have an `updated_at` column that auto-updates:

```sql
-- Add to any Supabase table that needs offline sync
ALTER TABLE your_table
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL;

-- Auto-update on write
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON your_table
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 8.3 Storage Limits

IndexedDB can store hundreds of MB on most browsers. For safety, keep offline data within reasonable bounds:

- Limit synced records per store to ~200–500 most recent items
- Use the `ExpirationPlugin` in your service worker for cached API responses
- Monitor usage with `navigator.storage.estimate()`

```typescript
// Check available storage
const estimate = await navigator.storage.estimate()
const percentUsed = ((estimate.usage ?? 0) / (estimate.quota ?? 1)) * 100
console.log(`Storage used: ${percentUsed.toFixed(1)}%`)
```

---

## 9. Phase 7 — UI: Offline Indicators & Feedback

**Goal:** Always make it clear to the user whether they are online or offline, and show when data was last synced.

### 9.1 Online Status Hook

**File path:** `hooks/use-online-status.ts`

```typescript
'use client'

import { useState, useEffect } from 'react'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Use the actual value on mount (not always true on mobile)
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```

### 9.2 Offline Status Banner Component

**File path:** `components/offline-banner.tsx`

```tsx
'use client'

import { useOnlineStatus } from '@/hooks/use-online-status'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm py-2 px-4">
      <WifiOff className="h-4 w-4" />
      <span>Working offline — changes will sync when reconnected</span>
    </div>
  )
}
```

Add to `app/layout.tsx`:

```tsx
import { OfflineBanner } from '@/components/offline-banner'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
```

### 9.3 Last Synced Indicator

**File path:** `components/sync-status.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { getPendingSyncItems } from '@/lib/db/sync-queue'

export function SyncStatus() {
  const isOnline = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)

  useEffect(() => {
    getPendingSyncItems().then(items => setPendingCount(items.length))
  }, [isOnline])

  useEffect(() => {
    if (isOnline) {
      setLastSynced(new Date())
      setPendingCount(0)
    }
  }, [isOnline])

  if (!isOnline && pendingCount > 0) {
    return (
      <span className="text-xs text-amber-600">
        {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
      </span>
    )
  }

  if (lastSynced) {
    return (
      <span className="text-xs text-muted-foreground">
        Last synced: {lastSynced.toLocaleTimeString()}
      </span>
    )
  }

  return null
}
```

---

## 10. Phase 8 — Icons & Splash Screens

**Goal:** Provide correctly sized icons so the installed PWA looks professional on all devices.

### 10.1 Required Icon Sizes

Place all icons in `public/icons/`:

| File | Size | Purpose |
|---|---|---|
| `icon-72x72.png` | 72×72 | Android legacy |
| `icon-96x96.png` | 96×96 | Android |
| `icon-128x128.png` | 128×128 | Chrome Web Store |
| `icon-144x144.png` | 144×144 | Windows tiles |
| `icon-152x152.png` | 152×152 | iOS |
| `icon-192x192.png` | 192×192 | Android home screen (required) |
| `icon-384x384.png` | 384×384 | Android splash |
| `icon-512x512.png` | 512×512 | Splash screen & app store (required) |
| `apple-touch-icon.png` | 180×180 | iOS home screen |

### 10.2 Generating Icons from a Single Source

If you have a single high-resolution source image (1024×1024 recommended), use this script:

```bash
# Install sharp CLI globally
npm install -g sharp-cli

# Generate all sizes from one source image
for size in 72 96 128 144 152 180 192 384 512; do
  sharp -i public/icons/source.png -o public/icons/icon-${size}x${size}.png resize $size $size
done
```

### 10.3 Maskable Icons

Android uses "adaptive icons" which apply a mask (circle, rounded square, etc.) to your icon. If your icon is not designed for this, the mask will cut off edges.

Use https://maskable.app to check and edit your 512×512 icon.

The safe zone is the inner **80% of the image**. Keep your logo/mark within that area.

### 10.4 iOS-Specific Meta Tags

Add these to `app/layout.tsx` for iOS Safari support:

```tsx
export const metadata = {
  // ...your existing metadata
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Your App Name',
  },
}
```

---

## 11. Phase 9 — Push Notifications (Optional)

**Goal:** Send notifications to installed users even when the app is not open.

> **Note:** Push notifications require a backend endpoint and user permission. Skip this phase if not needed. On iOS, push notifications in PWAs require iOS 16.4+ with the app installed to the home screen.

### 11.1 Request Notification Permission

```typescript
async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'

  const permission = await Notification.requestPermission()
  return permission // 'granted', 'denied', or 'default'
}
```

### 11.2 Subscribe to Push

```typescript
async function subscribeToPush(vapidPublicKey: string) {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey,
  })

  // Send subscription to your server/Supabase for storage
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  })
}
```

### 11.3 Handle Push in Service Worker

In `app/sw.ts`:

```typescript
// Add push event listener
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Notification', {
      body: data.body ?? '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: data.url ?? '/' },
    })
  )
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

---

## 12. Phase 10 — Testing & Validation

**Goal:** Verify the PWA works correctly before shipping.

### 12.1 Build & Run in Production Mode

PWA service workers are **disabled in development** (as configured in Phase 2). Always test on a production build:

```bash
npm run build
npm run start
```

### 12.2 Lighthouse PWA Audit

Run a Lighthouse audit in Chrome DevTools:

1. Open Chrome DevTools → Lighthouse tab
2. Select "Progressive Web App" category
3. Click "Analyze page load"
4. Target score: **90+** in PWA category

Required Lighthouse PWA checks to pass:
- [ ] Has a `<meta name="viewport">` tag
- [ ] Page content is not wider than screen on mobile
- [ ] Has a web app manifest
- [ ] Manifest has icons
- [ ] Service worker registered
- [ ] App redirects HTTP to HTTPS
- [ ] Has a theme color in manifest
- [ ] Has a short_name in manifest

### 12.3 Offline Testing Checklist

In Chrome DevTools → Application → Service Workers:

- [ ] Service worker shows as "activated and running"
- [ ] Click "Offline" checkbox to simulate offline mode
- [ ] Navigate to a previously visited page — it should load
- [ ] Navigate to an unvisited page — the offline fallback should show
- [ ] Perform a write action (create/update) — no error should appear
- [ ] Uncheck "Offline" — pending sync should execute automatically

In Chrome DevTools → Application → Storage:
- [ ] IndexedDB → `app-offline-db` → `documents` store contains data
- [ ] IndexedDB → `app-offline-db` → `sync_queue` empties after going back online

### 12.4 Install Prompt Testing

- [ ] On Chrome mobile: "Add to Home Screen" banner should appear
- [ ] On Chrome desktop: Install icon should appear in the address bar
- [ ] After installing: App opens without browser address bar
- [ ] After installing: App has correct icon and name

### 12.5 Test on Real Devices

Do not rely only on DevTools emulation. Test on:

- [ ] Android Chrome (primary target for most users)
- [ ] iOS Safari 16.4+ (for push notifications) or iOS 14+ (for basic install)
- [ ] Windows Chrome (desktop PWA)

---

## 13. Phase 11 — Deployment Checklist

Before marking the PWA implementation as complete, verify every item below:

### Pre-Deploy
- [ ] `next.config.ts` has the Serwist plugin configured
- [ ] `app/sw.ts` exists and registers the service worker
- [ ] `app/manifest.ts` exists with correct name, icons, and colors
- [ ] All icon sizes are present in `public/icons/`
- [ ] IndexedDB schema is defined in `lib/db/offline-db.ts`
- [ ] All writable data operations use the local-first pattern
- [ ] `OfflineBanner` component added to root layout
- [ ] `useSyncOnReconnect()` hook called in root layout or provider
- [ ] `useOfflineSeed()` hook called to populate local DB on first load
- [ ] Supabase tables have `updated_at` columns and triggers
- [ ] `.gitignore` includes compiled SW files

### Post-Deploy
- [ ] HTTPS is active on the deployed URL
- [ ] Lighthouse PWA score is 90+
- [ ] Service worker visible in DevTools → Application → Service Workers
- [ ] Manifest visible in DevTools → Application → Manifest
- [ ] Install prompt works on mobile
- [ ] Offline mode works on deployed URL (not just localhost)
- [ ] Sync queue processes correctly after offline writes

---

## Appendix A — Caching Strategy Reference

Quick reference for choosing the right caching strategy per resource type:

| Resource Type | Recommended Strategy | Reason |
|---|---|---|
| HTML pages | Stale-While-Revalidate | Balance between speed and freshness |
| JavaScript chunks | Cache First (long TTL) | Hashed filenames guarantee freshness |
| CSS files | Cache First (long TTL) | Hashed filenames guarantee freshness |
| Images | Cache First (30 days) | Rarely change |
| Fonts | Cache First (1 year) | Never change |
| API: read endpoints | Network First (5s timeout) | Always want fresh data, fall back to cache |
| API: write endpoints | Network Only + Queue | Must reach server; queue if offline |
| User-uploaded files | Cache First | Asset URLs are content-addressed |

---

## Appendix B — App Store Packaging (Optional)

If you need to submit to the Google Play Store or Apple App Store later, your PWA does not need to be rewritten.

### Google Play Store — Trusted Web Activity (TWA)

1. Use **PWABuilder** (pwabuilder.com) — upload your PWA URL
2. Download the generated Android APK / AAB
3. Submit to Google Play Console

### Apple App Store

1. Use **Capacitor** (`npm install @capacitor/core @capacitor/cli`)
2. Run `npx cap add ios`
3. Build and open in Xcode: `npx cap open ios`
4. Submit through Xcode to App Store Connect

> **Important:** Capacitor wraps your entire Next.js app in a WKWebView. Most features work identically. The main additions you get are: full Bluetooth access, Face ID, and deeper native API support.

---

*End of PWA Implementation Plan v1.0*
