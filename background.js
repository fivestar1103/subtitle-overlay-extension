// Listen for when the user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  console.log('Subtitle Overlay extension clicked');
});

// Handle messages from popup to ensure content script injection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ensureContentScriptInjected') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      
      // Check if content script is already injected
      chrome.tabs.sendMessage(activeTab.id, { action: 'ping' }, function(response) {
        if (chrome.runtime.lastError) {
          // Content script is not yet injected, inject it
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          }).then(() => {
            sendResponse({ success: true });
          }).catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
        } else {
          // Content script is already injected
          sendResponse({ success: true });
        }
      });
    });
    
    return true; // Keep the message channel open for async response
  }
});