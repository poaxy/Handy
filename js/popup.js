document.addEventListener('DOMContentLoaded', () => {
  const extensionToggle = document.getElementById('extension-toggle');

  // Load enabled state from storage
  chrome.storage.sync.get('enabled', (data) => {
    extensionToggle.checked = data.enabled === undefined ? true : data.enabled;
  });

  // Handle extension enable/disable toggle
  extensionToggle.addEventListener('change', () => {
    const enabled = extensionToggle.checked;
    chrome.storage.sync.set({ enabled });
  });
});
