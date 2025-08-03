# Handy - Text Replacement Browser Extension

A powerful and user-friendly browser extension that automatically replaces text as you type across all websites. Perfect for creating shortcuts, abbreviations, and custom text expansions.

![Handy Extension](icons/main.png)

## Features

### ✨ Core Functionality
- **Real-time text replacement**: Automatically replaces keywords with longer text as you type
- **Smart triggering**: Replacements activate when you type a trigger character (space, period, comma, etc.)
- **Cross-site compatibility**: Works on all websites and web applications
- **Multiple input support**: Works with text inputs, textareas, and contenteditable elements
- **Password field protection**: Automatically ignores password fields for security

### 🎛️ Management Interface
- **Easy setup**: Simple popup interface to enable/disable the extension
- **Comprehensive options page**: Full replacement management with add, edit, and delete functionality
- **Character counter**: Real-time character count with 10,000 character limit
- **Import/Export**: Backup and restore your replacements as JSON files
- **Visual feedback**: Success and error messages for all operations

### 🎨 User Experience
- **Modern UI**: Clean, responsive design with dark mode support
- **Smooth animations**: Fade-in/fade-out effects for better visual feedback
- **Keyboard-friendly**: Full keyboard navigation support
- **Accessibility**: Proper ARIA labels and semantic HTML

## Installation

### From Source
1. Clone or download this repository
2. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Firefox**: `about:addons`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the extension folder
5. The Handy extension should now appear in your extensions list

### Permissions Required
- **Storage**: To save your text replacements and settings
- **Active Tab**: To access and modify text on web pages

## Usage

### Basic Setup
1. Click the Handy extension icon in your browser toolbar
2. Use the toggle switch to enable/disable the extension
3. Click "Manage Replacements" to set up your text shortcuts

### Creating Replacements
1. Open the options page (Manage Replacements)
2. Enter a **keyword** (the text you want to trigger the replacement)
3. Enter the **replacement text** (what you want it to become)
4. Click "Save"

### How It Works
- Type your keyword followed by a trigger character (space, period, comma, etc.)
- The extension automatically replaces the keyword with your replacement text
- The trigger character is preserved after the replacement

### Example Usage
```
Keyword: "//ty"
Replacement: "Thank you"

When you type: "//ty " (//ty + space)
It becomes: "Thank you "
```

### Managing Replacements
- **Edit**: Click the "Edit" button to modify existing replacements
- **Delete**: Click the "Delete" button to remove replacements
- **Import**: Load previously exported replacement sets
- **Export**: Download your current replacements as a backup

## File Structure

```
Handy/
├── manifest.json          # Extension configuration
├── html/
│   ├── popup.html        # Main popup interface
│   └── options.html      # Replacement management page
├── js/
│   ├── content.js        # Content script for text replacement
│   ├── popup.js          # Popup functionality
│   └── options.js        # Options page functionality
├── css/
│   ├── popup.css         # Popup styling
│   └── options.css       # Options page styling
└── icons/
    ├── logo.png          # Extension icon
    └── main.png          # Main logo image
```

## Technical Details

### Manifest Version
- Uses Manifest V3 for modern browser compatibility

### Content Script
- Runs on all URLs (`<all_urls>`)
- Listens for input events on text fields
- Implements smart text replacement logic
- Handles both regular inputs and contenteditable elements

### Storage
- Uses Chrome's sync storage for cross-device synchronization
- Stores replacements as key-value pairs
- Maintains enabled/disabled state

### Security Features
- Ignores password fields automatically
- Prevents feedback loops in text replacement
- Validates input lengths and content

## Browser Compatibility

- ✅ Google Chrome (Manifest V3)
- ✅ Microsoft Edge (Chromium-based)
- ✅ Other Chromium-based browsers

## Limitations

- Maximum replacement text length: 10,000 characters
- Import validation: Individual replacements cannot exceed 10,000 characters
- Password fields are automatically excluded for security
- Works only on web pages (not in browser UI elements)
