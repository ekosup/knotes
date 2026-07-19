# Product Requirement Document (PRD) — ENotes (Eko Notes)

## 1. Overview

A lightweight, offline-first Cornell Notes application built as a full Single Page Application (SPA). The application operates entirely client-side, requiring zero internet connectivity. All data persistence, processing, and rendering happen locally on the user's machine.

## 2. Core Architecture & Philosophy

* **Full SPA:** 100% client-side execution.
* **Privacy & Offline-First:** Zero external API calls, tracking, or cloud sync.
* **Local Persistence:** Data is stored locally via `IndexedDB` (for robust note storage) or `localStorage` (for configuration).
* **KISS/DRY Design:** Minimal dependencies, predictable data flow, clean layout.

---

## 3. UI Layout & Structure

Inspired by the clean, utility-first layout of developer tools, the UI is split into fixed zones layout out in a single viewport.

```
+-----------------------------------------------------------------+
|                         Top Navbar                              |
+-----------------------------------+-----------------------------+
|                                   |                             |
|                                   |          Main Area          |
|           Left Sidebar            |        (Notes Canvas)       |
|          (Keywords/Cues)          |                             |
|                                   |                             |
+-----------------------------------+-----------------------------+
|                          Bottom Panel                           |
|                           (Summary)                             |
+-----------------------------------------------------------------+

```

### 3.1 Top Navbar (Main Control)

Acts as the global command center.

* **Controls:** New Note, Save/Export (JSON/Markdown), Import, Delete, and Note Selector dropdown.
* **Status Indicator:** Local storage footprint and "Offline Ready" confirmation badge.

### 3.2 Left Sidebar (Keywords & Cues)

* **Purpose:** Houses key phrases, questions, flags, and cues corresponding to the main notes.
* **Interaction:** Line-aligned or easily mappable inputs that match sections in the Main Area.

### 3.3 Main Area (Notes Canvas)

* **Purpose:** The core area for taking detailed, real-time notes during lectures, reading, or research.
* **Features:** Clean Markdown-supported text editor or highly structured rich-text fields.

### 3.4 Bottom Panel (Summary)

* **Purpose:** A full-width bottom section dedicated to synthesizing the entire note page into a concise, high-level summary.
* **Triggers:** Visible at all times to encourage immediate review.

---

## 4. Technical Specifications & Features

### 4.1 Data Schema (Local Model)

```json
{
  "id": "uuid-v4-string",
  "title": "Note Title",
  "createdAt": "ISO-Timestamp",
  "updatedAt": "ISO-Timestamp",
  "cues": [
    {"id": "cue-1", "text": "Key Concept"}
  ],
  "tags": ["tag1", "tag2"],
  "pinned": false,
  "content": "Detailed notes body here...",
  "summary": "Synthesized summary of the entire note structure."
}

```

### 4.2 Feature Matrix

| Feature | Description | Implementation Detail |
| --- | --- | --- |
| **Local Persistence** | Auto-saves changes locally to prevent data loss. | Debounced write to `IndexedDB`. |
| **Import/Export** | Allows backing up or moving notes as raw data. | Local file generation (`Blob` API) for JSON/MD. |
| **Search/Filter** | Quick client-side filtering across cues and content. | Local text matching index. |
| **Zero-Network Lock** | Ensures no network packets leave the app. | Hard-coded local assets, no remote fonts/CDNs. |

---

## 5. Non-Functional Requirements

* **Performance:** Initial UI load time under 200ms. Input latency under 16ms (60 FPS fluid typing).
* **Storage Limit:** Able to handle up to 50MB of local text data easily via `IndexedDB`.
* **Portability:** The entire built application should be deliverable as a single static folder (HTML, JS, CSS) runable via a local file server or directly from `file://`.
