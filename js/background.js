// Background script for Handy extension
// Minimal background script for extension functionality

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HANDY_IFRAME_REQUEST') {
    // Inject content script into the requesting tab
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['js/content.js']
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open for async response
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  // Extension started
}); 