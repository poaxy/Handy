// Iframe-specific content script for Handy extension
// Specialized for CK Editor and Salesforce Lightning iframes

// Check if already initialized to prevent duplicate declarations
if (typeof window.handyIframeInitialized === 'undefined') {
  window.handyIframeInitialized = true;
  
  let replacements = {};
  let enabled = true;

// Load replacements from parent window or storage
const loadData = () => {
  try {
    // Try to get data from parent window first
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'HANDY_GET_DATA',
        source: 'handy_iframe'
      }, '*');
    }
    
    // Fallback: try to access chrome storage directly
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['replacements', 'enabled'], (data) => {
        replacements = data.replacements || {};
        enabled = data.enabled === undefined ? true : data.enabled;
        console.log('Handy iframe: Loaded replacements:', Object.keys(replacements).length);
      });
    }
  } catch (error) {
    console.log('Handy iframe: Failed to load data:', error);
  }
};

// Listen for messages from parent window
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'HANDY_DATA_UPDATE') {
    replacements = event.data.replacements || {};
    enabled = event.data.enabled !== undefined ? event.data.enabled : true;
    console.log('Handy iframe: Received data update');
  }
});

// Enhanced CK Editor specific replacement
const handleCKEditorReplacement = (keyword, replacement, triggerChar) => {
  try {
    // Look for CK Editor specific elements
    const ckEditorElements = document.querySelectorAll('.cke_editable, [data-cke-editor], .cke_editor');
    
    for (const element of ckEditorElements) {
      // Try multiple ways to get content from CK Editor
      let content = '';
      
      // Method 1: Direct textContent
      if (element.textContent) {
        content = element.textContent;
      }
      // Method 2: innerHTML (for rich text)
      else if (element.innerHTML) {
        // Strip HTML tags for comparison
        content = element.innerHTML.replace(/<[^>]*>/g, '');
      }
      // Method 3: CK Editor specific API
      else if (element.ckeditorInstance) {
        content = element.ckeditorInstance.getData();
      }
      
      if (content && content.endsWith(keyword + triggerChar)) {
        const newContent = content.substring(0, content.length - (keyword + triggerChar).length) + replacement + triggerChar;
        
        // Update content using the same method we got it, but preserve formatting
        if (element.textContent !== undefined) {
          // For textContent, we need to handle line breaks differently
          element.textContent = newContent;
        } else if (element.innerHTML !== undefined) {
          // For innerHTML, preserve line breaks as <br> tags
          element.innerHTML = newContent.replace(/\n/g, '<br>');
        } else if (element.ckeditorInstance) {
          // For CK Editor API, preserve formatting
          element.ckeditorInstance.setData(newContent.replace(/\n/g, '<br>'));
        }
        
        console.log('Handy iframe: CK Editor replacement successful');
        return true;
      }
    }
  } catch (error) {
    console.log('Handy iframe: CK Editor replacement failed:', error);
  }
  return false;
};

// Enhanced Salesforce Lightning specific replacement
const handleLightningReplacement = (keyword, replacement, triggerChar) => {
  try {
    // Look for Salesforce Lightning specific elements
    const lightningSelectors = [
      '[data-aura-rendered-by]',
      '.uiInput',
      '.forcePageBlockItem',
      '.slds-form-element',
      '.oneAlohaPage',
      '.forceContentFileDroppableZone'
    ];
    
    for (const selector of lightningSelectors) {
      const elements = document.querySelectorAll(selector);
      
      for (const element of elements) {
        // Check if element is editable
        if (element.isContentEditable || 
            element.tagName === 'TEXTAREA' || 
            element.tagName === 'INPUT' ||
            element.querySelector('[contenteditable="true"]') ||
            element.querySelector('textarea') ||
            element.querySelector('input[type="text"]')) {
          
          let content = '';
          
          // Get content from the element or its editable children
          if (element.isContentEditable) {
            content = element.textContent || element.innerText || '';
          } else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            content = element.value || '';
          } else {
            // Look for editable children
            const editableChild = element.querySelector('[contenteditable="true"], textarea, input[type="text"]');
            if (editableChild) {
              if (editableChild.isContentEditable) {
                content = editableChild.textContent || editableChild.innerText || '';
              } else {
                content = editableChild.value || '';
              }
            }
          }
          
          if (content && content.endsWith(keyword + triggerChar)) {
            const newContent = content.substring(0, content.length - (keyword + triggerChar).length) + replacement + triggerChar;
            
            // Update content with formatting preservation
            if (element.isContentEditable) {
              element.innerHTML = newContent.replace(/\n/g, '<br>');
            } else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
              element.value = newContent;
            } else {
              const editableChild = element.querySelector('[contenteditable="true"], textarea, input[type="text"]');
              if (editableChild) {
                if (editableChild.isContentEditable) {
                  editableChild.innerHTML = newContent.replace(/\n/g, '<br>');
                } else {
                  editableChild.value = newContent;
                }
              }
            }
            
            console.log('Handy iframe: Lightning replacement successful');
            return true;
          }
        }
      }
    }
  } catch (error) {
    console.log('Handy iframe: Lightning replacement failed:', error);
  }
  return false;
};

// Main input handler for iframes
const handleInput = (e) => {
  if (!enabled) return;

  const target = e.target;
  
  // Ignore password fields
  if (target.type === 'password') return;

  // Get text content
  let text = '';
  if (target.isContentEditable) {
    text = target.textContent || target.innerText || '';
  } else {
    text = target.value || '';
  }

  if (!text || text.length === 0) return;

  const triggerChar = text.slice(-1);
  const triggerRegex = /[\s.,;!?]/;

  if (triggerRegex.test(triggerChar)) {
    const textBeforeTrigger = text.slice(0, -1);

    // Find the longest matching keyword
    let longestMatch = '';
    for (const keyword in replacements) {
      if (textBeforeTrigger.endsWith(keyword) && keyword.length > longestMatch.length) {
        longestMatch = keyword;
      }
    }

    if (longestMatch) {
      const replacement = replacements[longestMatch];
      
      // Prevent feedback loops
      if (textBeforeTrigger.endsWith(replacement)) {
        return;
      }

      console.log('Handy iframe: Attempting replacement for', longestMatch);

      // Try multiple replacement strategies
      let success = false;

      // Strategy 1: CK Editor specific
      success = handleCKEditorReplacement(longestMatch, replacement, triggerChar);

      // Strategy 2: Lightning specific
      if (!success) {
        success = handleLightningReplacement(longestMatch, replacement, triggerChar);
      }

      // Strategy 3: Standard replacement
      if (!success) {
        try {
          if (target.isContentEditable) {
            const selection = window.getSelection();
            if (selection.rangeCount) {
              const range = selection.getRangeAt(0);
              const textNode = range.startContainer;

              if (textNode.nodeType === Node.TEXT_NODE) {
                const originalText = textNode.textContent;
                const textToReplace = longestMatch + triggerChar;
                
                if (originalText.endsWith(textToReplace)) {
                  const newTextNodeValue = originalText.substring(0, originalText.length - textToReplace.length) + replacement + triggerChar;
                  
                  // For contenteditable elements, use innerHTML to preserve formatting
                  const currentHTML = target.innerHTML;
                  const newHTML = currentHTML.substring(0, currentHTML.length - textToReplace.length) + replacement.replace(/\n/g, '<br>') + triggerChar;
                  target.innerHTML = newHTML;
                  
                  // Move cursor to end
                  const newRange = document.createRange();
                  newRange.selectNodeContents(target);
                  newRange.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                  success = true;
                }
              }
            }
          } else {
            const cursorPosition = target.selectionStart;
            const textToReplace = longestMatch + triggerChar;
            
            if (text.endsWith(textToReplace)) {
              const newText = text.substring(0, text.length - textToReplace.length) + replacement + triggerChar;
              target.value = newText;

              const newCursorPosition = cursorPosition - textToReplace.length + (replacement.length + 1);
              target.setSelectionRange(newCursorPosition, newCursorPosition);
              success = true;
            }
          }
        } catch (error) {
          console.log('Handy iframe: Standard replacement failed:', error);
        }
      }

      if (success) {
        console.log('Handy iframe: Replacement successful');
      } else {
        console.log('Handy iframe: All replacement strategies failed');
      }
    }
  }
};

// Enhanced event listener setup for iframes
const setupIframeEventListeners = () => {
  // Standard input events
  document.addEventListener('input', handleInput, true);
  
  // Keydown events for better trigger detection
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
      setTimeout(() => handleInput(e), 10);
    }
  }, true);
  
  // Mutation observer for dynamic content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new editable elements were added
            const editableElements = node.querySelectorAll ? node.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]') : [];
            if (node.matches && node.matches('[contenteditable="true"], textarea, input[type="text"]')) {
              editableElements.push(node);
            }
            
            editableElements.forEach(element => {
              element.addEventListener('input', handleInput, true);
              element.addEventListener('keydown', (e) => {
                if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
                  setTimeout(() => handleInput(e), 10);
                }
              }, true);
            });
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
};

// Initialize iframe content script
const initializeIframe = () => {
  console.log('Handy iframe: Initializing in', window.location.href);
  loadData();
  setupIframeEventListeners();
  
  // Notify parent that iframe is ready
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: 'HANDY_IFRAME_READY',
      source: 'handy_iframe',
      url: window.location.href
    }, '*');
  }
};

  // Start the iframe content script
  initializeIframe();
} 