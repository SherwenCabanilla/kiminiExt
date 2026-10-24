# Kimini Lesson Report Generator (Chrome Extension - Manifest V3)

A lightweight, privacy-focused Chrome Extension designed specifically for ESL online tutors teaching on the Kimini platform (and Glats portal). It instantly extracts lesson details from the active page, allows quick selection of issues or custom notes, formats the report into standard format, and copies it to your clipboard with a single click.

---

## 📋 Example Generated Output

```text
Date: 2026-09-30 
Time: 11:45-12:10  JST

Class: SP
Student's name: test name
Teacher: Page Teacher
School: Fujimigaoka

Details: The student hasn't entered the KR yet.
```

---

## ✨ Key Features

1. **Selectable Class (`SP` / `Regular`)**:
   - Quick dropdown selector for **Class**: choose between **SP** and **Regular** (plus a custom option if ever needed).
   - Automatically detects whether the lesson is SP or Regular from the active page.

2. **Clean School Name Extraction (School Name Only)**:
   - Automatically cleans raw classroom strings (e.g., `Fujimigaoka/2026/Jr3`) to extract **only the school name** (`Fujimigaoka`).
   - Slashes, year numbers, and grade tags (e.g. `/2026/Jr3`) are automatically stripped.

3. **One-Click Lesson Data Extraction**:
   - Automatically extracts **Date**, **Time**, **Class**, **Student's name**, **Teacher**, and **School** when opening the popup on any Kimini/Glats page.
   - When a Kimini/Glats dashboard is open in another tab, it uses the English student name only when the lesson date and time match.
   - Dedicated **"Pull from Page"** button to re-extract on demand if page content loaded late.
   - Robust fallback handling: works seamlessly even if elements are missing or opened outside Kimini (in Manual Mode).

2. **Pre-Loaded & Custom Issue Presets**:
   - Quick dropdown to select common report issues (e.g., student no-show in KR, late entry, audio/mic issue, camera issue, network lag, etc.).
   - **"+ Add Custom Detail"** button: easily add your own reusable notes that save permanently to Chrome's local storage.
   - Use **Manage saved presets** to edit or delete built-in and custom notes; deletion asks for confirmation.
   - Hover over a preset in the manager or dropdown to see its full text.
   - Fully editable **Details** textarea with real-time preview synchronization.

3. **Instant Clipboard Copy**:
   - Single-click **"Copy to Clipboard"** button using modern Web Clipboard APIs.
   - Instant visual feedback: transforms to `✓ Copied to Clipboard!` with green highlight and animated toast banner.

4. **Reusable Student Feedback**:
   - Select feedback statements from a checklist, or add custom statements that stay available in future sessions.
   - Edit or delete built-in and custom statements; changes are saved locally in Chrome storage.

5. **100% Local & Privacy-Focused**:
   - Zero external tracking, zero analytics, zero external network requests.
   - All preferences and custom presets are stored securely in `chrome.storage.local`.

6. **Settings & Customization**:
   - Teacher name is pulled from the active lesson page instead of using a hardcoded default.
   - Choose a custom popup color or select one of the built-in color swatches.

---

## 🚀 How to Install in Google Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in your address bar.
3. In the top-right corner, turn on **Developer mode** (toggle switch).
4. Click the **"Load unpacked"** button in the top-left corner.
5. Select the project folder:
   ```
   d:\Apps\autocopy
   ```
6. The **Kimini Lesson Report Generator** extension is now installed and ready to use! Pin it to your Chrome toolbar for quick access.

---

## 🧪 Testing with the Included Demo Page

1. In Chrome, press `Ctrl + O` (or drag and drop) to open `sample_kimini_page.html` located in `d:\Apps\autocopy\sample_kimini_page.html`.
2. Click the extension icon in your Chrome toolbar.
3. Click **"Pull from Page"**.
4. All fields (Date, Time, Class, Student name, Teacher, School) will populate instantly.
5. Select an issue from the dropdown or type a custom note, then click **"Copy to Clipboard"**.
6. Paste anywhere with `Ctrl + V`!

---

## 📂 File Structure

```
d:\Apps\autocopy/
├── manifest.json            # Chrome Manifest V3 configuration
├── popup.html               # Clean, modern extension popup UI
├── popup.js                 # UI logic, extraction coordination & storage
├── styles.css               # Compact and modern ESL styling
├── content.js               # Multi-strategy DOM & regex page scraper
├── sample_kimini_page.html  # Demo page for instant testing
├── icons/                   # Pixel-perfect extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── create_icons.ps1         # Script used to generate icon assets
└── README.md                # Documentation and user guide
```
