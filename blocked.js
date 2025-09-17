// Script for blocked.html page
document.addEventListener('DOMContentLoaded', function() {
  const backToWorkButton = document.getElementById('backToWork');
  
  if (backToWorkButton) {
    backToWorkButton.addEventListener('click', async function() {
      const button = this;
      const originalText = button.textContent;
      
      // Disable button and show loading state
      button.disabled = true;
      button.textContent = 'Closing tabs...';
      
      try {
        // Send message to background script to close blocked tabs
        const response = await chrome.runtime.sendMessage({ type: "closeBlockedTabs" });
        
        if (response && response.success) {
          console.log(`Successfully closed ${response.closedTabs} blocked page tabs`);
          button.textContent = 'Done!';
          // The current tab should navigate away, so this message might not be visible
        } else {
          console.error('Failed to close blocked tabs:', response?.error);
          button.textContent = 'Error - try again';
          button.disabled = false;
        }
        
      } catch (error) {
        console.error('Error communicating with background script:', error);
        button.textContent = 'Error - try again';
        button.disabled = false;
        
        // Fallback: try to open new tab (this might not work in blocked page context)
        try {
          window.open('chrome://newtab/', '_blank');
        } catch (e) {
          console.error('Could not open new tab:', e);
        }
      }
    });
  }
});
