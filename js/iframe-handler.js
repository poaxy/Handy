// Iframe handler for Handy extension
// This script is injected into iframes to handle text replacement

(function() {
  // Check if already initialized to prevent duplicate injection
  if (window.handyIframeHandlerInitialized) {
    return;
  }
  window.handyIframeHandlerInitialized = true;

  let replacements = {};
  let enabled = true;
  let universalReplacer = null;
  let observer = null; // Track observer for cleanup

  // Load data from parent window
  const loadData = () => {
    try {
      // Try to get data from parent window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'HANDY_GET_DATA',
          source: 'handy_iframe_handler'
        }, '*');
      }
    } catch (error) {
      // Parent window not accessible
    }
  };

  // Listen for messages from parent window
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'HANDY_DATA_UPDATE') {
      replacements = event.data.replacements || {};
      enabled = event.data.enabled !== undefined ? event.data.enabled : true;
      
      // Initialize or update universal replacer
      if (!universalReplacer && typeof UniversalReplacer !== 'undefined') {
        universalReplacer = new UniversalReplacer(new Map(Object.entries(replacements)), enabled);
      } else if (universalReplacer) {
        universalReplacer.updateReplacements(new Map(Object.entries(replacements)));
        universalReplacer.updateEnabled(enabled);
      }
    }
  });

  // Setup event listeners for iframe
  const setupIframeEventListeners = (retryCount = 0) => {
    // Wait for UniversalReplacer to be available
    if (!universalReplacer || typeof UniversalReplacer === 'undefined') {
      if (retryCount < 50) { // Max 5 seconds
        setTimeout(() => setupIframeEventListeners(retryCount + 1), 100);
      }
      return;
    }

    // Standard input event listener
    const inputHandler = (e) => {
      if (universalReplacer) {
        universalReplacer.handleInput(e);
      }
    };
    document.addEventListener('input', inputHandler, true);
    
    // Keydown event for better trigger detection
    const keydownHandler = (e) => {
      if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
        // Prevent double handling by checking if this is a synthetic event
        if (e.isTrusted === false) {
          return;
        }
        
        setTimeout(() => {
          // Create a synthetic input event to ensure we get the updated text
          const inputEvent = new Event('input', { bubbles: true });
          inputEvent.isTrusted = false; // Mark as synthetic
          e.target.dispatchEvent(inputEvent);
          universalReplacer.handleInput(inputEvent);
        }, 10);
      }
    };
    document.addEventListener('keydown', keydownHandler, true);
    
    // Mutation observer for dynamic content (optimized)
    observer = new MutationObserver((mutations) => {
      // Filter mutations to only process relevant ones
      const relevantMutations = mutations.filter(mutation => 
        mutation.type === 'childList' && mutation.addedNodes.length > 0
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
          }
        });
      });
    });
    
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  };

  // Cleanup function
  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (universalReplacer && universalReplacer.debounceTimer) {
      clearTimeout(universalReplacer.debounceTimer);
    }
  };

  // Initialize iframe handler
  const initializeIframeHandler = () => {
    loadData();
    
    // Wait for document to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupIframeEventListeners);
    } else {
      setupIframeEventListeners();
    }
    
    // Notify parent that iframe is ready
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'HANDY_IFRAME_READY',
        source: 'handy_iframe_handler',
        url: window.location.href
      }, '*');
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
  };

  // Start the iframe handler
  initializeIframeHandler();
})(); 