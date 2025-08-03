let replacements = {};
let enabled = true;

// Load replacements and enabled state from storage
const loadData = () => {
  chrome.storage.sync.get(['replacements', 'enabled'], (data) => {
    replacements = data.replacements || {};
    enabled = data.enabled === undefined ? true : data.enabled;
  });
};

// Listen for changes to storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    loadData();
  }
});

// Function to handle text replacement
const handleInput = (e) => {
  if (!enabled) return;

  const target = e.target;
  // Ignore password fields and non-text inputs
  if (target.type === 'password' || (target.tagName === 'INPUT' && !['text', 'search', 'url', 'tel', 'email'].includes(target.type))) {
      return;
  }

  const text = target.isContentEditable ? target.textContent : target.value;
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

      if (target.isContentEditable) {
        // For contenteditable elements
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;

        if (textNode.nodeType === Node.TEXT_NODE) {
            const originalText = textNode.textContent;
            const textToReplace = longestMatch + triggerChar;
            
            // Ensure we are replacing at the end of the text node
            if (originalText.endsWith(textToReplace)) {
                const newTextNodeValue = originalText.substring(0, originalText.length - textToReplace.length) + replacement + triggerChar;
                textNode.textContent = newTextNodeValue;

                // Move the cursor to the end
                range.setStart(textNode, newTextNodeValue.length);
                range.setEnd(textNode, newTextNodeValue.length);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
      } else {
        // For input and textarea elements
        const cursorPosition = target.selectionStart;
        const textToReplace = longestMatch + triggerChar;
        
        const newText = text.substring(0, text.length - textToReplace.length) + replacement + triggerChar;
        target.value = newText;

        // Restore cursor position
        const newCursorPosition = cursorPosition - textToReplace.length + (replacement.length + 1);
        target.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }
  }
};

// Use the 'input' event for better real-time feedback
document.addEventListener('input', handleInput, true);

// Initial load of data
loadData();
