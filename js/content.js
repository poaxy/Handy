// Check if already initialized to prevent duplicate declarations
if (typeof window.handyInitialized === 'undefined') {
  window.handyInitialized = true;
  
  let replacements = {};
  let enabled = true;
  let universalReplacer = null;
  let observers = []; // Track mutation observers for cleanup
  let eventListeners = []; // Track event listeners for cleanup
  let iframeInjectionInterval = null; // Track iframe injection interval


// Load replacements and enabled state from storage
const loadData = () => {
  chrome.storage.sync.get(['replacements', 'enabled'], (data) => {
    replacements = data.replacements || {};
    enabled = data.enabled === undefined ? true : data.enabled;
    
    // Initialize or update universal replacer
    const UniversalReplacerClass = typeof UniversalReplacer !== 'undefined' ? UniversalReplacer : 
                                   (typeof window !== 'undefined' && window.UniversalReplacer) ? window.UniversalReplacer : null;
    
    if (!universalReplacer && UniversalReplacerClass) {
      universalReplacer = new UniversalReplacerClass(new Map(Object.entries(replacements)), enabled);
    } else if (universalReplacer) {
      universalReplacer.updateReplacements(new Map(Object.entries(replacements)));
      universalReplacer.updateEnabled(enabled);
    }
  });
};

// Listen for changes to storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    loadData();
  }
});

// Enhanced event listener setup with universal approach
const setupEventListeners = () => {
  // Strategy 1: Standard input event listener
  const inputHandler = (e) => {
    if (universalReplacer) {
      universalReplacer.handleInput(e);
    }
  };
  document.addEventListener('input', inputHandler, true);
  eventListeners.push({ element: document, type: 'input', handler: inputHandler, useCapture: true });
  
  // Strategy 2: Keydown event for better trigger detection
  const keydownHandler = (e) => {
    if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
      // Prevent double handling by checking if this is a synthetic event
      if (e.isTrusted === false) {
        return;
      }
      
      setTimeout(() => {
        if (universalReplacer) {
          // Create a synthetic input event to ensure we get the updated text
          const inputEvent = new Event('input', { bubbles: true });
          inputEvent.isTrusted = false; // Mark as synthetic
          e.target.dispatchEvent(inputEvent);
          universalReplacer.handleInput(inputEvent);
        }
      }, 10);
    }
  };
  document.addEventListener('keydown', keydownHandler, true);
  eventListeners.push({ element: document, type: 'keydown', handler: keydownHandler, useCapture: true });
  
  // Strategy 3: Mutation observer for dynamic content (optimized)
    const observer = new MutationObserver((mutations) => {
      // Filter mutations to only process relevant ones
      const relevantMutations = mutations.filter(mutation => 
        mutation.type === 'childList' && 
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
      );
      
      if (relevantMutations.length === 0) return;
      
      relevantMutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new editable elements were added
            const editableElements = node.querySelectorAll ? Array.from(node.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]')) : [];
            if (node.matches && node.matches('[contenteditable="true"], textarea, input[type="text"]')) {
              editableElements.push(node);
            }
            
            // Note: We use event delegation via document listeners instead of individual element listeners
            // This is more performant and handles all elements automatically

            // Check if new iframes were added and inject handler
            const iframes = node.querySelectorAll ? Array.from(node.querySelectorAll('iframe')) : [];
            if (node.tagName === 'IFRAME') {
              iframes.push(node);
            }
            
            // Only inject if we found iframes
            if (iframes.length > 0) {
              iframes.forEach(iframe => {
                injectIntoIframe(iframe);
              });
            }
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  observers.push(observer);
};

// Inject iframe handler into iframe
const injectIntoIframe = (iframe) => {
  try {
    // Get extension ID from current script URL
    const currentScript = document.currentScript || document.querySelector('script[src*="content.js"]');
    let extensionId = '';
    
    if (currentScript && currentScript.src) {
      const match = currentScript.src.match(/chrome-extension:\/\/([^\/]+)/);
      if (match) {
        extensionId = match[1];
      }
    }
    
    // Fallback: try to get from chrome.runtime
    if (!extensionId && chrome && chrome.runtime && chrome.runtime.id) {
      extensionId = chrome.runtime.id;
    }
    
    // If we still don't have an extension ID, skip injection
    if (!extensionId) {
      // Try one more fallback: get from chrome.runtime
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        extensionId = chrome.runtime.id;
      }
      
      if (!extensionId) {
        return;
      }
    }
    
    // Wait for iframe to load
    setTimeout(() => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc && iframeDoc.readyState !== 'loading') {
          // Check if already injected
          if (iframeDoc.querySelector('script[data-handy-iframe-handler]')) {
            return;
          }

          // Check if UniversalReplacer is already available in iframe
          if (iframeDoc.defaultView && iframeDoc.defaultView.UniversalReplacer) {
            // Just inject the iframe handler
            const handlerScript = iframeDoc.createElement('script');
            handlerScript.src = `chrome-extension://${extensionId}/js/iframe-handler.js`;
            handlerScript.setAttribute('data-handy-iframe-handler', 'true');
            iframeDoc.head.appendChild(handlerScript);
            return;
          }

          // Inject UniversalReplacer first
          const replacerScript = iframeDoc.createElement('script');
          replacerScript.src = `chrome-extension://${extensionId}/js/universal-replacement.js`;
          replacerScript.onload = () => {
            // Then inject iframe handler
            const handlerScript = iframeDoc.createElement('script');
            handlerScript.src = `chrome-extension://${extensionId}/js/iframe-handler.js`;
            handlerScript.setAttribute('data-handy-iframe-handler', 'true');
            iframeDoc.head.appendChild(handlerScript);
          };
          iframeDoc.head.appendChild(replacerScript);
        }
              } catch (error) {
          // Cross-origin iframe, can't access
        }
      }, 1000);
    } catch (error) {
      // Iframe not accessible
    }
};

  // Handle message passing with iframes
  const setupMessagePassing = () => {
    // Listen for messages from iframes
    const messageHandler = (event) => {
      if (event.data && (event.data.source === 'handy_iframe' || event.data.source === 'handy_iframe_handler')) {
        if (event.data.type === 'HANDY_GET_DATA') {
          // Send data to iframe
          event.source.postMessage({
            type: 'HANDY_DATA_UPDATE',
            source: 'handy_parent',
            replacements: replacements,
            enabled: enabled
          }, '*');
        } else if (event.data.type === 'HANDY_IFRAME_READY') {
          // Iframe ready
        }
      }
    };
  
  window.addEventListener('message', messageHandler);
  eventListeners.push({ element: window, type: 'message', handler: messageHandler, useCapture: false });

  // Send data updates to all iframes when data changes
  const notifyIframes = () => {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        iframe.contentWindow.postMessage({
          type: 'HANDY_DATA_UPDATE',
          source: 'handy_parent',
          replacements: replacements,
          enabled: enabled
        }, '*');
      } catch (error) {
        // Cross-origin iframe
      }
    });
  };

  // Make notifyIframes available globally
  window.handyNotifyIframes = notifyIframes;
};

// Cleanup function to prevent memory leaks
const cleanup = () => {
  // Clear timers
  if (universalReplacer && universalReplacer.debounceTimer) {
    clearTimeout(universalReplacer.debounceTimer);
  }
  
  // Clear iframe monitoring interval
  if (iframeInjectionInterval) {
    clearInterval(iframeInjectionInterval);
    iframeInjectionInterval = null;
  }
  
  // Disconnect observers
  observers.forEach(observer => {
    if (observer && typeof observer.disconnect === 'function') {
      observer.disconnect();
    }
  });
  observers = [];
  
  // Remove event listeners
  eventListeners.forEach(({ element, type, handler, useCapture }) => {
    if (element && typeof element.removeEventListener === 'function') {
      element.removeEventListener(type, handler, useCapture);
    }
  });
  eventListeners = [];
  
  // Clear global references
  if (window.handyNotifyIframes) {
    delete window.handyNotifyIframes;
  }
  if (window.handyInitialized) {
    delete window.handyInitialized;
  }
};

// Initialize the extension
const initialize = () => {
  loadData();
  setupMessagePassing();
  
  // Wait for UniversalReplacer to be available
  const waitForUniversalReplacer = () => {
    // Check if UniversalReplacer is available (either globally or on window)
    const UniversalReplacerClass = typeof UniversalReplacer !== 'undefined' ? UniversalReplacer : 
                                   (typeof window !== 'undefined' && window.UniversalReplacer) ? window.UniversalReplacer : null;
    
    if (UniversalReplacerClass) {
      // Initialize universal replacer
      if (!universalReplacer) {
        universalReplacer = new UniversalReplacerClass(new Map(Object.entries(replacements)), enabled);
      }
      
      // Wait for document body to be ready before setting up event listeners
      if (document.body) {
        setupEventListeners();
        // Inject into existing iframes
        injectIntoExistingIframes();
        // Start continuous iframe monitoring
        startIframeMonitoring();
      } else {
        // Wait for DOM to be ready
        document.addEventListener('DOMContentLoaded', () => {
          setupEventListeners();
          // Inject into existing iframes
          injectIntoExistingIframes();
          // Start continuous iframe monitoring
          startIframeMonitoring();
        });
        eventListeners.push({ element: document, type: 'DOMContentLoaded', handler: () => {
          setupEventListeners();
          injectIntoExistingIframes();
          startIframeMonitoring();
        }, useCapture: false });
      }
    } else {
      // UniversalReplacer not ready yet, wait a bit and try again
      setTimeout(waitForUniversalReplacer, 100);
    }
  };
  
  // Start waiting for UniversalReplacer
  waitForUniversalReplacer();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
  eventListeners.push({ element: window, type: 'beforeunload', handler: cleanup, useCapture: false });
};

// Inject into existing iframes
const injectIntoExistingIframes = () => {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    injectIntoIframe(iframe);
  });
};

// Continuous iframe monitoring for dynamic iframes
const startIframeMonitoring = () => {
  let lastIframeCount = 0;
  
  iframeInjectionInterval = setInterval(() => {
    const iframes = document.querySelectorAll('iframe');
    if (iframes.length !== lastIframeCount) {
      lastIframeCount = iframes.length;
      
      // Inject into new iframes
      iframes.forEach(iframe => {
        injectIntoIframe(iframe);
      });
    }
  }, 5000); // Check every 5 seconds instead of 1
};

  // Start the extension
  initialize();
  

}
