// Shared utilities for Handy extension
// Common functions used by both content.js and iframe-content.js

// Common replacement strategies
const ReplacementStrategies = {
  // Standard contenteditable replacement
  contentEditable: (target, keyword, replacement, triggerChar) => {
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
      // Contenteditable replacement failed
    }
    return false;
  },

  // Standard input/textarea replacement
  input: (target, keyword, replacement, triggerChar) => {
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
      // Input replacement failed
    }
    return false;
  },

  // Document-level replacement as last resort
  document: (keyword, replacement, triggerChar) => {
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
      // Document replacement failed
    }
    return false;
  }
};

// Common input handler
const createInputHandler = (replacements, enabled, additionalStrategies = []) => {
  return (e) => {
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

        // Try multiple replacement strategies
        let replacementSuccessful = false;

        // Try additional strategies first (if any)
        for (const strategy of additionalStrategies) {
          if (!replacementSuccessful) {
            replacementSuccessful = strategy(target, longestMatch, replacement, triggerChar);
          }
        }

        // Strategy 1: Standard contenteditable replacement
        if (isContentEditable && !replacementSuccessful) {
          replacementSuccessful = ReplacementStrategies.contentEditable(target, longestMatch, replacement, triggerChar);
        }

        // Strategy 2: Standard input/textarea replacement
        if (!isContentEditable && !replacementSuccessful) {
          replacementSuccessful = ReplacementStrategies.input(target, longestMatch, replacement, triggerChar);
        }

        // Strategy 3: Document-level replacement as last resort
        if (!replacementSuccessful) {
          replacementSuccessful = ReplacementStrategies.document(longestMatch, replacement, triggerChar);
        }

        // Replacement completed (successful or failed)
      }
    }
  };
};

// Common event listener setup
const setupEventListeners = (handler, isIframe = false) => {
  // Strategy 1: Standard input event listener
  document.addEventListener('input', handler, true);
  
  // Strategy 2: Keydown event for better iframe support
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
      setTimeout(() => handler(e), 10); // Small delay to ensure text is updated
    }
  }, true);
  
  // Strategy 3: Mutation observer for dynamic content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if new iframes were added (only for main content script)
            if (!isIframe) {
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
                      iframeDoc.addEventListener('input', handler, true);
                      iframeDoc.addEventListener('keydown', (e) => {
                        if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
                          setTimeout(() => handler(e), 10);
                        }
                      }, true);
                    }
                  } catch (error) {
                    // Cross-origin iframe
                  }
                }, 1000); // Wait for iframe to load
              });
            } else {
              // For iframes, check if new editable elements were added
              const editableElements = node.querySelectorAll ? node.querySelectorAll('[contenteditable="true"], textarea, input[type="text"]') : [];
              if (node.matches && node.matches('[contenteditable="true"], textarea, input[type="text"]')) {
                editableElements.push(node);
              }
              
              editableElements.forEach(element => {
                element.addEventListener('input', handler, true);
                element.addEventListener('keydown', (e) => {
                  if (e.key === ' ' || e.key === '.' || e.key === ',' || e.key === ';' || e.key === '!' || e.key === '?') {
                    setTimeout(() => handler(e), 10);
                  }
                }, true);
              });
            }
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

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReplacementStrategies, createInputHandler, setupEventListeners };
} 