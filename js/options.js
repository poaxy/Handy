document.addEventListener('DOMContentLoaded', () => {
  const keywordInput = document.getElementById('keyword-input');
  const replacementInput = document.getElementById('replacement-input');
  const saveButton = document.getElementById('save-button');
  const replacementsList = document.getElementById('replacements-list');
  const emptyState = document.getElementById('empty-state');
  const form = document.getElementById('replacement-form');
  const feedbackMessage = document.getElementById('feedback-message');
  const extensionToggle = document.getElementById('extension-toggle');
  const importButton = document.getElementById('import-button');
  const exportButton = document.getElementById('export-button');
  const importFile = document.getElementById('import-file');
  const charCounter = document.getElementById('char-counter');

  let replacements = {};
  let currentlyEditing = null;

  // Constants
  const MAX_REPLACEMENT_LENGTH = 3500;
  const MAX_KEYWORD_LENGTH = 100;
  const INVALID_KEYWORD_CHARS = /[<>:"\\|?*]/; // Characters that could cause issues

  const loadData = () => {
    chrome.storage.sync.get(['replacements', 'enabled'], (data) => {
      replacements = data.replacements || {};
      extensionToggle.checked = data.enabled === undefined ? true : data.enabled;
      renderList();
    });
  };

  const renderList = () => {
    replacementsList.innerHTML = '';
    const keywords = Object.keys(replacements);
    if (keywords.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      keywords.sort().forEach(keyword => {
        const item = createListItem(keyword, replacements[keyword]);
        replacementsList.appendChild(item);
      });
    }
  };

  const createListItem = (keyword, replacement) => {
    const item = document.createElement('div');
    item.className = 'replacement-item';
    item.dataset.keyword = keyword;

    const textContainer = document.createElement('div');
    textContainer.className = 'replacement-text-container';

    const keywordSpan = document.createElement('span');
    keywordSpan.className = 'replacement-keyword';
    keywordSpan.textContent = keyword;

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'arrow';
    arrowSpan.textContent = ' → ';

    const replacementSpan = document.createElement('span');
    replacementSpan.className = 'replacement-value';
    replacementSpan.textContent = replacement;

    textContainer.appendChild(keywordSpan);
    textContainer.appendChild(arrowSpan);
    textContainer.appendChild(replacementSpan);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const editButton = document.createElement('button');
    editButton.className = 'edit-button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => handleEdit(item, keyword, replacement));

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => handleDelete(keyword));

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    item.appendChild(textContainer);
    item.appendChild(actions);

    return item;
  };

  const handleEdit = (item, oldKeyword, oldReplacement) => {
    if (currentlyEditing) {
      const previousItem = replacementsList.querySelector('.editing');
      if (previousItem) {
        const originalKeyword = previousItem.dataset.keyword;
        const originalReplacement = replacements[originalKeyword];
        cancelEdit(previousItem, originalKeyword, originalReplacement);
      }
    }

    currentlyEditing = oldKeyword;
    item.classList.add('editing');
    const textContainer = item.querySelector('.replacement-text-container');
    const actions = item.querySelector('.actions');

    textContainer.innerHTML = `
      <input type="text" class="edit-keyword" value="${oldKeyword}" maxlength="${MAX_KEYWORD_LENGTH}">
      <span class="arrow"> → </span>
      <textarea class="edit-replacement" rows="3" maxlength="${MAX_REPLACEMENT_LENGTH}">${oldReplacement}</textarea>
    `;

    actions.innerHTML = `
      <button class="save-edit-button">Save</button>
      <button class="cancel-edit-button">Cancel</button>
    `;

    actions.querySelector('.save-edit-button').addEventListener('click', () => saveEdit(item, oldKeyword));
    actions.querySelector('.cancel-edit-button').addEventListener('click', () => cancelEdit(item, oldKeyword, oldReplacement));
  };

  const validateKeyword = (keyword) => {
    if (!keyword || keyword.trim().length === 0) {
      return { valid: false, error: 'Keyword cannot be empty.' };
    }
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      return { valid: false, error: `Keyword cannot exceed ${MAX_KEYWORD_LENGTH} characters.` };
    }
    if (INVALID_KEYWORD_CHARS.test(keyword)) {
      return { valid: false, error: 'Keyword contains invalid characters.' };
    }
    return { valid: true };
  };

  const validateReplacement = (replacement) => {
    if (!replacement || replacement.trim().length === 0) {
      return { valid: false, error: 'Replacement cannot be empty.' };
    }
    if (replacement.length > MAX_REPLACEMENT_LENGTH) {
      return { valid: false, error: `Replacement text cannot exceed ${MAX_REPLACEMENT_LENGTH} characters.` };
    }
    return { valid: true };
  };

  const saveEdit = (item, oldKeyword) => {
    const newKeyword = item.querySelector('.edit-keyword').value.trim();
    const newReplacement = item.querySelector('.edit-replacement').value;

    // Validate inputs
    const keywordValidation = validateKeyword(newKeyword);
    if (!keywordValidation.valid) {
      showFeedback(keywordValidation.error, 'error');
      return;
    }

    const replacementValidation = validateReplacement(newReplacement);
    if (!replacementValidation.valid) {
      showFeedback(replacementValidation.error, 'error');
      return;
    }

    if (oldKeyword !== newKeyword && replacements[newKeyword]) {
      showFeedback('Keyword already exists.', 'error');
      return;
    }

    delete replacements[oldKeyword];
    replacements[newKeyword] = newReplacement;

    chrome.storage.sync.set({ replacements }, () => {
      if (chrome.runtime.lastError) {
        showFeedback('Failed to save replacement. Please try again.', 'error');
        return;
      }
      showFeedback('Replacement updated.', 'success');
      currentlyEditing = null;
      renderList();
    });
  };

  const cancelEdit = (item, keyword, replacement) => {
    currentlyEditing = null;
    item.classList.remove('editing');
    const textContainer = item.querySelector('.replacement-text-container');
    const actions = item.querySelector('.actions');

    textContainer.innerHTML = '';
    const keywordSpan = document.createElement('span');
    keywordSpan.className = 'replacement-keyword';
    keywordSpan.textContent = keyword;

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'arrow';
    arrowSpan.textContent = ' → ';

    const replacementSpan = document.createElement('span');
    replacementSpan.className = 'replacement-value';
    replacementSpan.textContent = replacement;

    textContainer.appendChild(keywordSpan);
    textContainer.appendChild(arrowSpan);
    textContainer.appendChild(replacementSpan);

    actions.innerHTML = '';
    const editButton = document.createElement('button');
    editButton.className = 'edit-button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => handleEdit(item, keyword, replacement));

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => handleDelete(keyword));

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const keyword = keywordInput.value.trim();
    const replacement = replacementInput.value;

    // Validate inputs
    const keywordValidation = validateKeyword(keyword);
    if (!keywordValidation.valid) {
      showFeedback(keywordValidation.error, 'error');
      return;
    }

    const replacementValidation = validateReplacement(replacement);
    if (!replacementValidation.valid) {
      showFeedback(replacementValidation.error, 'error');
      return;
    }

    if (replacements[keyword]) {
      showFeedback('Keyword already exists.', 'error');
      return;
    }

    replacements[keyword] = replacement;
    chrome.storage.sync.set({ replacements }, () => {
      if (chrome.runtime.lastError) {
        showFeedback('Failed to save replacement. Please try again.', 'error');
        return;
      }
      showFeedback('Replacement saved.', 'success');
      form.reset();
      validateInputs();
      renderList();
    });
  });

  const handleDelete = (keyword) => {
    const item = replacementsList.querySelector(`[data-keyword="${CSS.escape(keyword)}"]`);
    if (item) {
      item.classList.add('fade-out');
      setTimeout(() => {
        delete replacements[keyword];
        chrome.storage.sync.set({ replacements }, () => {
          if (chrome.runtime.lastError) {
            showFeedback('Failed to delete replacement. Please try again.', 'error');
            return;
          }
          showFeedback('Replacement deleted.', 'success');
          renderList();
        });
      }, 300);
    }
  };

  const showFeedback = (message, type) => {
    feedbackMessage.textContent = message;
    feedbackMessage.className = `show ${type}`;
    setTimeout(() => {
      feedbackMessage.className = 'hidden';
    }, 3000); // Increased timeout for better UX
  };

  const validateInputs = () => {
    const keyword = keywordInput.value.trim();
    const replacement = replacementInput.value;
    const replacementLength = replacement.length;

    charCounter.textContent = `${replacementLength} / ${MAX_REPLACEMENT_LENGTH}`;

    if (replacementLength > MAX_REPLACEMENT_LENGTH) {
      charCounter.classList.add('error');
      saveButton.disabled = true;
    } else {
      charCounter.classList.remove('error');
      saveButton.disabled = !keyword || !replacement;
    }
  };

  [keywordInput, replacementInput].forEach(input => {
    input.addEventListener('input', validateInputs);
  });

  extensionToggle.addEventListener('change', () => {
    const enabled = extensionToggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      if (chrome.runtime.lastError) {
        showFeedback('Failed to update extension state. Please try again.', 'error');
        extensionToggle.checked = !enabled; // Revert the toggle
      }
    });
  });

  importButton.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (importedData.replacements) {
            let hasError = false;
            let errorMessage = '';
            
            // Validate imported data
            for (const key in importedData.replacements) {
              const keywordValidation = validateKeyword(key);
              if (!keywordValidation.valid) {
                errorMessage = `Import failed: Invalid keyword "${key}" - ${keywordValidation.error}`;
                hasError = true;
                break;
              }
              
              const replacementValidation = validateReplacement(importedData.replacements[key]);
              if (!replacementValidation.valid) {
                errorMessage = `Import failed: Invalid replacement for "${key}" - ${replacementValidation.error}`;
                hasError = true;
                break;
              }
            }
            
            if (hasError) {
              showFeedback(errorMessage, 'error');
              return;
            }

            replacements = { ...replacements, ...importedData.replacements };
            chrome.storage.sync.set({ replacements }, () => {
              if (chrome.runtime.lastError) {
                showFeedback('Failed to import replacements. Please try again.', 'error');
                return;
              }
              showFeedback('Replacements imported successfully.', 'success');
              renderList();
            });
          } else {
            showFeedback('Invalid file format. Please select a valid Handy export file.', 'error');
          }
        } catch (error) {
          showFeedback('Invalid JSON file. Please select a valid Handy export file.', 'error');
        }
      };
      reader.onerror = () => {
        showFeedback('Failed to read file. Please try again.', 'error');
      };
      reader.readAsText(file);
    }
  });

  exportButton.addEventListener('click', () => {
    try {
      const data = JSON.stringify({ replacements }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handy-replacements-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('Replacements exported successfully.', 'success');
    } catch (error) {
      showFeedback('Failed to export replacements. Please try again.', 'error');
    }
  });

  loadData();
  validateInputs();
});