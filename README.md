# Boolean Bookmark Search (Chrome/Vivaldi Extension)

A lightweight browser extension that lets you search your bookmarks using **Boolean logic** (AND, OR, NOT, parentheses, quoted phrases).  
Includes **Saved Searches** so you can ⭐ save your favorite queries, ▶ re‑run them instantly, and ❌ delete them when no longer needed.

---

## ✨ Features

- **Boolean search** over bookmark descriptions:
  - Supports `AND`, `OR`, `NOT`, parentheses `( )`, and quoted phrases `"like this"`.
- **Tag filtering**:
  - Use `tag:example` in your bookmark descriptions and enable the **Tags only** checkbox to restrict searches to tags.
- **Saved Searches**:
  - ⭐ Save any query for later.
  - ▶ Re‑run saved queries with one click.
  - ❌ Delete saved queries you no longer need.
  - Deduplication ensures no duplicates, and newest saves appear at the top.
- **Highlighting**:
  - Shows which terms matched (bold) and which didn’t (struck‑through).

---

## 📦 Installation

1. Clone or download this repository.
2. Open your browser’s extensions page:
   - Chrome/Edge/Vivaldi: `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right).
4. Click **Load unpacked** and select the project folder.
5. The extension icon will appear in your toolbar. Click it to open the popup.

---

## 🖥️ Usage

1. Open the popup.
2. Enter a Boolean query in the search box. Examples:
   - `design AND (UI OR UX)`
   - `"project alpha" AND NOT tag:archive`
3. Click **Search** or press **Enter**.
4. Results show matching bookmarks with term highlights.
5. To save a query:
   - Click ⭐ **Save**.
   - It will appear under **Saved Searches** with ▶ and ❌ controls.

---

## ⚙️ Permissions

- `"bookmarks"` — required to read your bookmarks tree.
- `"storage"` — required to persist saved searches.

---

## 🛠️ Development Notes

- **popup.html** — UI layout and CSS.
- **popup.js** — Boolean parser, evaluator, search logic, and Saved Searches.
- **manifest.json** — declares permissions and popup entry point.

---

## 🚀 Future Ideas

- Auto‑expanding textarea for long queries.
- Export/import of saved searches.
- Optional sync storage across devices.

---

## 📄 License

MIT License — feel free to fork, modify, and share.
