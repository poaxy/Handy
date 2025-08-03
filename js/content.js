// Check if already initialized to prevent duplicate declarations
if (typeof window.handyInitialized === 'undefined') {
  window.handyInitialized = true;
  
  let replacements = {};
  let enabled = true;
  let isMerakiDomain = false;

// Check if we're on a Meraki Lightning domain
const checkMerakiDomain = () => {
  const currentDomain = window.location.hostname;
  isMerakiDomain = currentDomain.includes('meraki.lightning.force.com') || 
                   currentDomain.includes('lightning.force.com') ||
                   currentDomain.includes('salesforce.com');
  console.log('Handy: Detected domain:', currentDomain, 'isMeraki:', isMerakiDomain);
};

// Load replacements and enabled state from storage
const loadData = () => {
  chrome.storage.sync.get(['replacements', 'enabled'], (data) => {
    replacements = data.replacements || {};
    enabled = data.enabled === undefined ? true : data.enabled;
    console.log('Handy: Loaded replacements:', Object.keys(replacements).length, 'enabled:', enabled);
    
    // Notify iframes after loading data
    if (window.handyNotifyIframes) {
      setTimeout(window.handyNotifyIframes, 100);
    }
  });
};

// Listen for changes to storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    loadData();
  }
});

// Enhanced function to handle text replacement with multiple strategies
const handleInput = (e) => {
  if (!enabled) return;

  const target = e.target;
  
  // Ignore password fields and non-text inputs
  if (target.type === 'password' || (target.tagName === 'INPUT' && !['text', 'search', 'url', 'tel', 'email'].includes(target.type))) {
    return;
  }

  // Get text content using multiple strategies
  let text = '';
  let isContentEditable = false;
  
  // Strategy 1: Direct value/textContent
  if (target.isContentEditable) {
    text = target.textContent || target.innerText || '';
    isContentEditable = true;
  } else {
    text = target.value || '';
  }
  
  // Strategy 2: For iframes and complex editors, try to get text from selection
  if (!text && isMerakiDomain) {
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      text = selection.toString();
    }
  }

  if (text === undefined || text.length === 0) return;

  const triggerChar = text.slice(-1);
  const triggerRegex = /[\s.,;!?]/; // Matches whitespace, period, comma, etc.

  // Check for trigger character
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
      
      // To prevent feedback loops, check if the replacement is already done
      if (textBeforeTrigger.endsWith(replacement)) {
        return;
      }

      console.log('Handy: Replacing', longestMatch, 'with', replacement);

      // Try multiple replacement strategies
      let replacementSuccessful = false;

      // Strategy 1: Standard contenteditable replacement
      if (isContentEditable && !replacementSuccessful) {
        replacementSuccessful = tryContentEditableReplacement(target, longestMatch, replacement, triggerChar);
      }

      // Strategy 2: Standard input/textarea replacement
      if (!isContentEditable && !replacementSuccessful) {
        replacementSuccessful = tryInputReplacement(target, longestMatch, replacement, triggerChar);
      }

      // Strategy 3: Aggressive iframe content replacement (for Meraki)
      if (isMerakiDomain && !replacementSuccessful) {
        replacementSuccessful = tryMerakiReplacement(target, longestMatch, replacement, triggerChar);
      }

      // Strategy 4: Document-level replacement as last resort
      if (!replacementSuccessful) {
        replacementSuccessful = tryDocumentReplacement(longestMatch, replacement, triggerChar);
      }

      if (replacementSuccessful) {
        console.log('Handy: Replacement successful');
      } else {
        console.log('Handy: All replacement strategies failed');
      }
    }
  }
};

// Strategy 1: Standard contenteditable replacement
const tryContentEditableReplacement = (target, keyword, replacement, triggerChar) => {
  try {
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType === Node.TEXT_NODE) {
      const originalText = textNode.textContent;
      const textToReplace = keyword + triggerChar;
      
      if (originalText.endsWith(textToReplace)) {
        const newTextNodeValue = originalText.substring(0, originalText.length - textToReplace.length) + replacement + triggerChar;
        
        // For contenteditable elements, use innerHTML to preserve formatting
        if (target.isContentEditable) {
          const currentHTML = target.innerHTML;
          const newHTML = currentHTML.substring(0, currentHTML.length - textToReplace.length) + replacement.replace(/\n/g, '<br>') + triggerChar;
          target.innerHTML = newHTML;
          
          // Move cursor to end
          const newRange = document.createRange();
          newRange.selectNodeContents(target);
          newRange.collapse(false);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          textNode.textContent = newTextNodeValue;
          
          // Move the cursor to the end
          range.setStart(textNode, newTextNodeValue.length);
          range.setEnd(textNode, newTextNodeValue.length);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return true;
      }
    }
  } catch (error) {
    console.log('Handy: Contenteditable replacement failed:', error);
  }
  return false;
};

// Strategy 2: Standard input/textarea replacement
const tryInputReplacement = (target, keyword, replacement, triggerChar) => {
  try {
    const cursorPosition = target.selectionStart;
    const text = target.value;
    const textToReplace = keyword + triggerChar;
    
    if (text.endsWith(textToReplace)) {
      const newText = text.substring(0, text.length - textToReplace.length) + replacement + triggerChar;
      target.value = newText;

      // Restore cursor position
      const newCursorPosition = cursorPosition - textToReplace.length + (replacement.length + 1);
      target.setSelectionRange(newCursorPosition, newCursorPosition);
      return true;
    }
  } catch (error) {
    console.log('Handy: Input replacement failed:', error);
  }
  return false;
};

// Strategy 3: Aggressive Meraki-specific replacement
const tryMerakiReplacement = (target, keyword, replacement, triggerChar) => {
  try {
    // Look for iframes and try to inject content script into them
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (iframeDoc) {
          // Try to find editable elements in iframe
          const editableElements = iframeDoc.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]');
          for (const element of editableElements) {
            if (element.textContent && element.textContent.endsWith(keyword + triggerChar)) {
              const newText = element.textContent.substring(0, element.textContent.length - (keyword + triggerChar).length) + replacement + triggerChar;
              // Use innerHTML for contenteditable to preserve formatting
              if (element.isContentEditable) {
                element.innerHTML = newText.replace(/\n/g, '<br>');
              } else {
                element.textContent = newText;
              }
              return true;
            }
          }
        }
      } catch (error) {
        // Cross-origin iframe, can't access
        console.log('Handy: Cannot access iframe content (cross-origin)');
      }
    }

    // Try to find CK Editor specific elements
    const ckEditorElements = document.querySelectorAll('.cke_editable, [data-cke-editor]');
    for (const element of ckEditorElements) {
      if (element.textContent && element.textContent.endsWith(keyword + triggerChar)) {
        const newText = element.textContent.substring(0, element.textContent.length - (keyword + triggerChar).length) + replacement + triggerChar;
        // Use innerHTML for CK Editor to preserve formatting
        element.innerHTML = newText.replace(/\n/g, '<br>');
        return true;
      }
    }

    // Try to find Salesforce Lightning specific elements
    const lightningElements = document.querySelectorAll('[data-aura-rendered-by], .uiInput, .forcePageBlockItem');
    for (const element of lightningElements) {
      if (element.textContent && element.textContent.endsWith(keyword + triggerChar)) {
        const newText = element.textContent.substring(0, element.textContent.length - (keyword + triggerChar).length) + replacement + triggerChar;
        // Use innerHTML for contenteditable elements to preserve formatting
        if (element.isContentEditable) {
          element.innerHTML = newText.replace(/\n/g, '<br>');
        } else {
          element.textContent = newText;
        }
        return true;
      }
    }
  } catch (error) {
    console.log('Handy: Meraki replacement failed:', error);
  }
  return false;
};

// Strategy 4: Document-level replacement as last resort
const tryDocumentReplacement = (keyword, replacement, triggerChar) => {
  try {
    const selection = window.getSelection();
    if (selection && selection.toString().endsWith(keyword + triggerChar)) {
      const range = selection.getRangeAt(0);
      const textToReplace = keyword + triggerChar;
      
      // Create a new text node with the replacement
      const newTextNode = document.createTextNode(replacement + triggerChar);
      
      // Replace the selected content
      range.deleteContents();
      range.insertNode(newTextNode);
      
      // Move cursor to end
      range.setStartAfter(newTextNode);
      range.setEndAfter(newTextNode);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  } catch (error) {
    console.log('Handy: Document replacement failed:', error);
  }
  return false;
};

// Enhanced event listener setup with multiple strategies
const setupEventListeners = () => {
  // Strategy 1: Standard input event listener
  document.addEventListener('input', handleInput, true);
  
  // Strategy 2: Keydown event for better iframe support
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
      setTimeout(() => handleInput(e), 10); // Small delay to ensure text is updated
    }
  }, true);
  
  // Strategy 3: Mutation observer for dynamic content (especially for Meraki)
  if (isMerakiDomain) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if new iframes were added
              let iframes = [];
              if (node.querySelectorAll) {
                const foundIframes = node.querySelectorAll('iframe');
                iframes = Array.from(foundIframes);
              }
              if (node.tagName === 'IFRAME') {
                iframes.push(node);
              }
              
              iframes.forEach(iframe => {
                setTimeout(() => {
                  try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    if (iframeDoc) {
                      iframeDoc.addEventListener('input', handleInput, true);
                      iframeDoc.addEventListener('keydown', (e) => {
                        if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
                          setTimeout(() => handleInput(e), 10);
                        }
                      }, true);
                    }
                  } catch (error) {
                    // Cross-origin iframe
                  }
                }, 1000); // Wait for iframe to load
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
  }
};

// Handle message passing with iframes
const setupMessagePassing = () => {
  // Listen for messages from iframes
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'handy_iframe') {
      if (event.data.type === 'HANDY_GET_DATA') {
        // Send data to iframe
        event.source.postMessage({
          type: 'HANDY_DATA_UPDATE',
          source: 'handy_parent',
          replacements: replacements,
          enabled: enabled
        }, '*');
      } else if (event.data.type === 'HANDY_IFRAME_READY') {
        console.log('Handy: Iframe ready:', event.data.url);
      }
    }
  });

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

// Initialize the extension
const initialize = () => {
  checkMerakiDomain();
  loadData();
  setupEventListeners();
  setupMessagePassing();
  
  // For Meraki domains, also try to inject into existing iframes
  if (isMerakiDomain) {
    setTimeout(() => {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            iframeDoc.addEventListener('input', handleInput, true);
            iframeDoc.addEventListener('keydown', (e) => {
              if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
                setTimeout(() => handleInput(e), 10);
              }
            }, true);
          }
        } catch (error) {
          // Cross-origin iframe
        }
      });
    }, 2000); // Wait for page to fully load
  }
};

  // Start the extension
  initialize();
}
