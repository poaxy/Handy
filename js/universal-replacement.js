if (typeof window.UniversalReplacer === 'undefined') {
  window.UniversalReplacer = class UniversalReplacer {
  constructor(replacements, enabled) {
    this.replacements = replacements;
    this.enabled = enabled;
    this.triggerRegex = /[\s.,;!?]/;
    this.debounceTimer = null;
    this.lastProcessedText = '';
    this.lastProcessedTarget = null;
    this.elementTypeCache = new WeakMap();
  }

  processReplacement(target, text, triggerChar) {
    if (!this.enabled || !text || !triggerChar) return false;

    let elementType = this.elementTypeCache.get(target);
    if (!elementType) {
      elementType = target.isContentEditable ? 'contenteditable' : 
                   target.tagName === 'TEXTAREA' ? 'textarea' : 'input';
      this.elementTypeCache.set(target, elementType);
    }

    let currentText = '';
    if (elementType === 'contenteditable') {
      currentText = target.textContent || target.innerText || '';
    } else {
      currentText = target.value || '';
    }

    if (!currentText || currentText.length === 0) return false;

    let cursorPosition = -1;
    if (elementType === 'contenteditable') {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        cursorPosition = this.getTextOffsetFromRange(range, target);
      }
    } else {
      cursorPosition = target.selectionStart;
    }

    if (cursorPosition === -1) {
      cursorPosition = currentText.length;
    }

    const textBeforeCursor = currentText.substring(0, cursorPosition);
    const textBeforeTrigger = textBeforeCursor.slice(0, -1);
    
    let longestMatch = '';
    for (const [keyword, replacement] of this.replacements) {
      if (textBeforeTrigger.endsWith(keyword) && keyword.length > longestMatch.length) {
        longestMatch = keyword;
      }
    }

    if (!longestMatch) return false;

    const replacement = this.replacements.get(longestMatch);
    
    if (textBeforeTrigger.endsWith(replacement)) return false;

    let success = false;
    
    if (elementType === 'input' || elementType === 'textarea') {
      try {
        success = this.strategyDirectValue(target, longestMatch, replacement, triggerChar);
      } catch (error) {
        try {
          success = this.strategyTextContent(target, longestMatch, replacement, triggerChar);
        } catch (error) {
        }
      }
    } else if (elementType === 'contenteditable') {
      try {
        success = this.strategySimpleTextReplacement(target, longestMatch, replacement, triggerChar);
      } catch (error) {
        const contenteditableStrategies = [
          () => this.strategySelectionRange(target, longestMatch, replacement, triggerChar),
          () => this.strategyInnerHTML(target, longestMatch, replacement, triggerChar),
          () => this.strategyDocumentExecCommand(target, longestMatch, replacement, triggerChar),
          () => this.strategyClipboardAPI(target, longestMatch, replacement, triggerChar)
        ];
        
        for (let i = 0; i < contenteditableStrategies.length; i++) {
          try {
            if (contenteditableStrategies[i]()) {
              success = true;
              break;
            }
          } catch (error) {
          }
        }
      }
    }
    
    return success;
  }

  strategyDirectValue(target, keyword, replacement, triggerChar) {
    if (target.value === undefined) return false;
    
    const text = target.value;
    const cursorPosition = target.selectionStart;
    const textToReplace = keyword + triggerChar;
    
    const textBeforeCursor = text.substring(0, cursorPosition);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);
    
    if (keywordEndIndex === -1) {
      return false;
    }

    const newText = text.substring(0, keywordEndIndex) + replacement + triggerChar + text.substring(cursorPosition);
    target.value = newText;

    const newCursorPosition = keywordEndIndex + replacement.length + 1;
    target.setSelectionRange(newCursorPosition, newCursorPosition);
    
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  strategySimpleTextReplacement(target, keyword, replacement, triggerChar) {
    if (!target.isContentEditable) return false;

    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const cursorPosition = this.getTextOffsetFromRange(range, target);
    
    const text = target.textContent || target.innerText || '';
    const textToReplace = keyword + triggerChar;
    
    const textBeforeCursor = text.substring(0, cursorPosition);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);
    
    if (keywordEndIndex === -1) {
      return false;
    }

    const formattedReplacement = this.formatTextForContentEditable(replacement);
    
    const walker = document.createTreeWalker(
      target,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentNode = null;
    let currentTextPos = 0;
    let foundNode = null;
    let foundOffset = 0;
    
    while (currentNode = walker.nextNode()) {
      const nodeText = currentNode.textContent;
      const nodeLength = nodeText.length;
      
      if (currentTextPos <= keywordEndIndex && keywordEndIndex < currentTextPos + nodeLength) {
        foundNode = currentNode;
        foundOffset = keywordEndIndex - currentTextPos;
        break;
      }
      
      currentTextPos += nodeLength;
    }
    
    if (foundNode) {
      const range = document.createRange();
      range.setStart(foundNode, foundOffset);
      range.setEnd(foundNode, foundOffset + textToReplace.length);
      
      range.deleteContents();
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = formattedReplacement + triggerChar;
      
      const fragment = document.createDocumentFragment();
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      
      range.insertNode(fragment);
      
      range.collapse(false);
      const newSelection = window.getSelection();
      newSelection.removeAllRanges();
      newSelection.addRange(range);
      
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } else {
      return false;
    }
  }

  strategySelectionRange(target, keyword, replacement, triggerChar) {
    if (!target.isContentEditable) return false;

    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType !== Node.TEXT_NODE) return false;

    const originalText = textNode.textContent;
    const textToReplace = keyword + triggerChar;
    
    const cursorOffset = range.startOffset;
    const textBeforeCursor = originalText.substring(0, cursorOffset);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);

    if (keywordEndIndex === -1) {
      return false;
    }

    const formattedReplacement = this.formatTextForContentEditable(replacement + triggerChar);
    
    range.setStart(textNode, keywordEndIndex);
    range.setEnd(textNode, keywordEndIndex + textToReplace.length);
    
    range.deleteContents();
    
    const newTextNode = document.createTextNode(formattedReplacement);
    range.insertNode(newTextNode);
    
    range.setStartAfter(newTextNode);
    range.setEndAfter(newTextNode);
    
    selection.removeAllRanges();
    selection.addRange(range);

    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  strategyInnerHTML(target, keyword, replacement, triggerChar) {
    if (!target.isContentEditable) return false;

    const text = target.textContent || target.innerText || '';
    const textToReplace = keyword + triggerChar;
    
    const selection = window.getSelection();
    if (!selection.rangeCount) return false;
    
    const range = selection.getRangeAt(0);
    const cursorPosition = this.getTextOffsetFromRange(range, target);
    
    const textBeforeCursor = text.substring(0, cursorPosition);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);

    if (keywordEndIndex === -1) {
      return false;
    }

    const walker = document.createTreeWalker(
      target,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentNode = null;
    let currentTextPos = 0;
    let foundNode = null;
    let foundOffset = 0;
    
    while (currentNode = walker.nextNode()) {
      const nodeText = currentNode.textContent;
      const nodeLength = nodeText.length;
      
      if (currentTextPos <= keywordEndIndex && keywordEndIndex < currentTextPos + nodeLength) {
        foundNode = currentNode;
        foundOffset = keywordEndIndex - currentTextPos;
        break;
      }
      
      currentTextPos += nodeLength;
    }
    
    if (foundNode) {
      const replaceRange = document.createRange();
      replaceRange.setStart(foundNode, foundOffset);
      replaceRange.setEnd(foundNode, foundOffset + textToReplace.length);
      
      replaceRange.deleteContents();
      
      const formattedReplacement = this.formatTextForContentEditable(replacement + triggerChar);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = formattedReplacement;
      
      const fragment = document.createDocumentFragment();
      while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
      }
      
      replaceRange.insertNode(fragment);
      
      replaceRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(replaceRange);
      
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    return false;
  }

  strategyTextContent(target, keyword, replacement, triggerChar) {
    const text = target.textContent || target.innerText || '';
    const textToReplace = keyword + triggerChar;
    
    let cursorPosition = text.length;
    if (target.isContentEditable) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        cursorPosition = this.getTextOffsetFromRange(range, target);
      }
    } else {
      cursorPosition = target.selectionStart;
    }
    
    const textBeforeCursor = text.substring(0, cursorPosition);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);

    if (keywordEndIndex === -1) {
      return false;
    }

    const newText = text.substring(0, keywordEndIndex) + replacement + triggerChar + text.substring(cursorPosition);
    target.textContent = newText;

    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  strategyDocumentExecCommand(target, keyword, replacement, triggerChar) {
    if (!target.isContentEditable) return false;

    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType !== Node.TEXT_NODE) return false;

    const originalText = textNode.textContent;
    const textToReplace = keyword + triggerChar;
    
    const cursorOffset = range.startOffset;
    const textBeforeCursor = originalText.substring(0, cursorOffset);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);

    if (keywordEndIndex === -1) {
      return false;
    }

    target.focus();
    
    range.setStart(textNode, keywordEndIndex);
    range.setEnd(textNode, keywordEndIndex + textToReplace.length);
    selection.removeAllRanges();
    selection.addRange(range);

    const formattedText = this.formatTextForExecCommand(replacement + triggerChar);
    document.execCommand('insertText', false, formattedText);
    return true;
  }

  strategyClipboardAPI(target, keyword, replacement, triggerChar) {
    if (!target.isContentEditable) return false;

    const selection = window.getSelection();
    if (!selection.rangeCount) return false;

    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;

    if (textNode.nodeType !== Node.TEXT_NODE) return false;

    const originalText = textNode.textContent;
    const textToReplace = keyword + triggerChar;
    
    const cursorOffset = range.startOffset;
    const textBeforeCursor = originalText.substring(0, cursorOffset);
    const keywordEndIndex = textBeforeCursor.lastIndexOf(textToReplace);

    if (keywordEndIndex === -1) {
      return false;
    }

    range.setStart(textNode, keywordEndIndex);
    range.setEnd(textNode, keywordEndIndex + textToReplace.length);
    selection.removeAllRanges();
    selection.addRange(range);

    const formattedText = this.formatTextForExecCommand(replacement + triggerChar);
    
    const clipboardData = [
      new ClipboardItem({
        'text/plain': new Blob([formattedText], { type: 'text/plain' }),
        'text/html': new Blob([this.formatTextForHTML(replacement + triggerChar)], { type: 'text/html' })
      })
    ];

    navigator.clipboard.write(clipboardData).then(() => {
      document.execCommand('paste');
    }).catch(() => {
      navigator.clipboard.writeText(formattedText).then(() => {
        document.execCommand('paste');
      }).catch(() => {
        document.execCommand('insertText', false, formattedText);
      });
    });

    return true;
  }

  handleInput(e) {
    if (e.isTrusted === false) {
      return;
    }
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processInputEvent(e);
    }, 10);
  }

  processInputEvent(e) {
    if (!e || !e.target) {
      return;
    }
    
    const target = e.target;
    
    if (target.type === 'password' || 
        (target.tagName === 'INPUT' && !['text', 'search', 'url', 'tel', 'email'].includes(target.type))) {
      return;
    }

    let text = '';
    if (target.isContentEditable) {
      text = target.textContent || target.innerText || '';
    } else {
      text = target.value || '';
    }

    if (!text || text.length === 0) return;

    const triggerChar = text.slice(-1);
    
    if (this.triggerRegex.test(triggerChar)) {
      setTimeout(() => {
        this.processReplacement(target, text, triggerChar);
      }, 5);
    }
  }

  updateReplacements(newReplacements) {
    this.replacements = newReplacements;
  }

  updateEnabled(enabled) {
    this.enabled = enabled;
  }

  formatTextForContentEditable(text) {
    return text
      .replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }

  formatTextForHTML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>')
      .replace(/  /g, '&nbsp;&nbsp;')
      .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
  }

  formatTextForPlainText(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatTextForExecCommand(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getTextOffsetFromRange(range, target) {
    let offset = 0;
    const walker = document.createTreeWalker(
      target,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    let currentNode = null;
    while (currentNode = walker.nextNode()) {
      if (currentNode === range.startContainer) {
        return offset + range.startOffset;
      }
      offset += currentNode.textContent.length;
    }
    
    return offset;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.UniversalReplacer;
}
} 