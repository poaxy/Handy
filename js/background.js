// Background script for Handy extension
// Handles iframe injection and Meraki domain support

// Listen for tab updates to inject content scripts into iframes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = new URL(tab.url);
    
    // Check if this is a Meraki/Salesforce domain
    if (url.hostname.includes('meraki.lightning.force.com') || 
        url.hostname.includes('lightning.force.com') || 
        url.hostname.includes('salesforce.com')) {
      
      console.log('Handy: Detected Meraki/Salesforce domain, injecting content script');
      
      // Inject content script into the main page
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['js/content.js']
      }).catch(error => {
        console.log('Handy: Failed to inject content script:', error);
      });
      
      // Wait a bit and try to inject into iframes
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: injectIntoIframes
        }).catch(error => {
          console.log('Handy: Failed to inject into iframes:', error);
        });
      }, 2000);
    }
  }
});

// Function to inject content script into iframes
function injectIntoIframes() {
  const iframes = document.querySelectorAll('iframe');
  console.log('Handy: Found', iframes.length, 'iframes');
  
  iframes.forEach((iframe, index) => {
    setTimeout(() => {
      try {
        // Try to access iframe content
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          console.log('Handy: Injecting into iframe', index);
          
          // Create a script element to inject our iframe-specific content script
          const script = iframeDoc.createElement('script');
          script.src = chrome.runtime.getURL('js/iframe-content.js');
          iframeDoc.head.appendChild(script);
        }
      } catch (error) {
        console.log('Handy: Cannot access iframe', index, 'content (cross-origin):', error);
        
        // For cross-origin iframes, try to inject via message passing
        try {
          iframe.contentWindow.postMessage({
            type: 'HANDY_INJECT',
            source: 'handy_extension'
          }, '*');
        } catch (e) {
          console.log('Handy: Failed to send message to iframe:', e);
        }
      }
    }, index * 500); // Stagger injections
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HANDY_IFRAME_REQUEST') {
    console.log('Handy: Received iframe injection request');
    
    // Inject content script into the requesting tab
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['js/content.js']
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.log('Handy: Failed to inject content script:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Keep message channel open for async response
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Handy: Extension installed');
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('Handy: Extension started');
}); 