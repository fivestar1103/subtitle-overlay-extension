// Check if the extension is already loaded to avoid duplicate initialization
if (typeof subtitleOverlayLoaded === 'undefined') {
    // Mark as loaded
    window.subtitleOverlayLoaded = true;
    
    // Global variables
    let subtitles = [];
    let overlayContainer = null;
    let subtitleElement = null;
    let intervalId = null;
    let fontSize = 30; // Default font size
    let syncOffset = 0; // Time offset in seconds for sync adjustment
    let currentFullscreenElement = null; // Track fullscreen element
    let subtitleColor = '#FFFFFF'; // Default subtitle color
    let backgroundColor = 'rgba(0, 0, 0, 0.75)'; // Default background color
    
    // Add ping handler to respond to background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'ping') {
            sendResponse({ status: 'alive' });
            return;
        }
        
        if (message.action === 'loadSubtitles') {
            subtitles = message.subtitles;
            console.log('Loaded subtitles:', subtitles);
            initializeOverlay();
            sendResponse({ success: true });
        }
        return true; // Keep the message channel open for async response
    });
    
    // Create and initialize the subtitle overlay
    function initializeOverlay() {
        // Remove existing overlay if any
        if (overlayContainer) {
            if (overlayContainer.parentNode) {
                overlayContainer.parentNode.removeChild(overlayContainer);
            }
        }
        
        // Clear existing interval
        if (intervalId) {
            clearInterval(intervalId);
        }
        
        // Create overlay container
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'subtitle-overlay-container';
        overlayContainer.style.position = 'fixed';
        overlayContainer.style.bottom = '80px';
        overlayContainer.style.left = '0';
        overlayContainer.style.width = '100%';
        overlayContainer.style.display = 'flex';
        overlayContainer.style.justifyContent = 'center';
        overlayContainer.style.zIndex = '9999999';
        overlayContainer.style.pointerEvents = 'none'; // Allow clicking through
        
        // Create subtitle element
        subtitleElement = document.createElement('div');
        subtitleElement.id = 'subtitle-text';
        subtitleElement.style.backgroundColor = backgroundColor;
        subtitleElement.style.color = subtitleColor;
        subtitleElement.style.padding = '8px 16px';
        subtitleElement.style.borderRadius = '4px';
        subtitleElement.style.fontSize = `${fontSize}px`;
        subtitleElement.style.fontFamily = 'Arial, sans-serif';
        subtitleElement.style.textAlign = 'center';
        subtitleElement.style.maxWidth = '80%';
        subtitleElement.style.textShadow = '1px 1px 1px #000';
        
        // Add to DOM
        overlayContainer.appendChild(subtitleElement);
        document.body.appendChild(overlayContainer);
        
        console.log('Subtitle overlay initialized');
        
        // Add keyboard event listener for font size control
        setupKeyboardShortcuts();
        
        // Setup fullscreen change monitoring
        setupFullscreenChangeListener();
        
        // Start checking for subtitles to display
        startSubtitleDisplay();
    }
    
    // Setup fullscreen change listener
    function setupFullscreenChangeListener() {
        // Handle all possible fullscreen change events for cross-browser support
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    }
    
    // Handle fullscreen change events
    function handleFullscreenChange() {
        // Get the current fullscreen element
        const fullscreenElement = 
            document.fullscreenElement || 
            document.webkitFullscreenElement || 
            document.mozFullScreenElement ||
            document.msFullscreenElement;
        
        // Update our tracking variable
        currentFullscreenElement = fullscreenElement;
        
        if (fullscreenElement) {
            console.log('Entered fullscreen mode');
            // Move subtitle overlay into the fullscreen element
            if (overlayContainer && overlayContainer.parentNode) {
                overlayContainer.parentNode.removeChild(overlayContainer);
                fullscreenElement.appendChild(overlayContainer);
                
                // Adjust styles for fullscreen if needed
                overlayContainer.style.position = 'absolute';
                overlayContainer.style.bottom = '80px';
            }
        } else {
            console.log('Exited fullscreen mode');
            // Move subtitle overlay back to body when exiting fullscreen
            if (overlayContainer && overlayContainer.parentNode) {
                overlayContainer.parentNode.removeChild(overlayContainer);
                document.body.appendChild(overlayContainer);
                
                // Reset to fixed positioning
                overlayContainer.style.position = 'fixed';
                overlayContainer.style.bottom = '80px';
            }
        }
    }
    
    // Setup keyboard shortcuts
    function setupKeyboardShortcuts() {
        // Remove any existing event listeners first
        document.removeEventListener('keydown', handleKeyPress);
        
        // Add the event listener
        document.addEventListener('keydown', handleKeyPress);
    }
    
    // Handle keyboard shortcuts
    function handleKeyPress(event) {
        // Check if subtitles are loaded and overlay exists
        if (!subtitleElement || subtitles.length === 0) return;

        if (event.ctrlKey || event.metaKey) return; // Ignore Ctrl or Command key
        
        // Plus key (+ or =) increases font size
        if (event.key === '+' || event.key === '=') {
            increaseFontSize();
            event.preventDefault();
        }
        
        // Minus key (-) decreases font size
        if (event.key === '-' || event.key === '_') {
            decreaseFontSize();
            event.preventDefault();
        }
        
        // Less than key (<) advances subtitles (makes them appear earlier)
        if (event.key === '<' || event.key === ',') {
            advanceSubtitles();
            event.preventDefault();
        }
        
        // Greater than key (>) delays subtitles (makes them appear later)
        if (event.key === '>' || event.key === '.') {
            delaySubtitles();
            event.preventDefault();
        }
        
        // Reset sync offset with 'r' key
        if (event.key === 'r' || event.key === 'R') {
            resetSyncOffset();
            event.preventDefault();
        }

        // Color customization shortcuts
        if (event.key === 'v' || event.key === 'V') {
            cycleSubtitleColor();
            event.preventDefault();
        }
        
        if (event.key === 'b' || event.key === 'B') {
            cycleBackgroundColor();
            event.preventDefault();
        }
    }
    
    // Increase font size
    function increaseFontSize() {
        if (fontSize < 40) { // Maximum font size
            fontSize += 2;
            updateFontSize();
        }
    }
    
    // Decrease font size
    function decreaseFontSize() {
        if (fontSize > 12) { // Minimum font size
            fontSize -= 2;
            updateFontSize();
        }
    }
    
    // Update subtitle font size
    function updateFontSize() {
        if (subtitleElement) {
            subtitleElement.style.fontSize = `${fontSize}px`;
            showNotification(`Font size: ${fontSize}px`);
        }
    }
    
    // Advance subtitles (make them appear earlier)
    function advanceSubtitles() {
        syncOffset -= 0.5; // Decrease by 0.5 seconds
        showNotification(`Subtitle timing: ${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(1)}s`);
    }
    
    // Delay subtitles (make them appear later)
    function delaySubtitles() {
        syncOffset += 0.5; // Increase by 0.5 seconds
        showNotification(`Subtitle timing: ${syncOffset > 0 ? '+' : ''}${syncOffset.toFixed(1)}s`);
    }
    
    // Reset sync offset
    function resetSyncOffset() {
        syncOffset = 0;
        showNotification('Subtitle timing reset');
    }
    
    // Color cycling functions
    const subtitleColors = ['#FFFFFF', '#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#FF0000'];
    const backgroundColors = [
        'rgba(0, 0, 0, 0.75)',
        'rgba(0, 0, 0, 0.5)',
        'rgba(0, 0, 0, 0.25)',
        'rgba(255, 0, 0, 0.75)',
        'rgba(0, 255, 0, 0.75)',
        'rgba(0, 0, 255, 0.75)'
    ];

    function cycleSubtitleColor() {
        const currentIndex = subtitleColors.indexOf(subtitleColor);
        const nextIndex = (currentIndex + 1) % subtitleColors.length;
        subtitleColor = subtitleColors[nextIndex];
        subtitleElement.style.color = subtitleColor;
        showNotification(`Subtitle color: ${subtitleColor}`);
    }

    function cycleBackgroundColor() {
        const currentIndex = backgroundColors.indexOf(backgroundColor);
        const nextIndex = (currentIndex + 1) % backgroundColors.length;
        backgroundColor = backgroundColors[nextIndex];
        subtitleElement.style.backgroundColor = backgroundColor;
        showNotification(`Background color: ${backgroundColor}`);
    }
    
    // Show temporary notification
    function showNotification(message) {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        notification.style.color = 'white';
        notification.style.padding = '8px 12px';
        notification.style.borderRadius = '4px';
        notification.style.zIndex = '10000000';
        notification.style.fontFamily = 'Arial, sans-serif';
        
        // Add to the current fullscreen element if in fullscreen mode
        if (currentFullscreenElement) {
            currentFullscreenElement.appendChild(notification);
        } else {
            document.body.appendChild(notification);
        }
        
        // Remove the notification after 1.5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 1500);
    }
    
    // Start the interval to check and display subtitles
    function startSubtitleDisplay() {
        console.log('Starting subtitle display');
        
        intervalId = setInterval(() => {
            const videoTime = getCurrentVideoTime();
            
            if (videoTime === null) {
                subtitleElement.innerHTML = '';
                return;
            }
            
            // Apply sync offset to video time for subtitle lookup
            const adjustedTime = videoTime - syncOffset;
            const currentSubtitle = findSubtitleForTime(adjustedTime);
            
            if (currentSubtitle) {
                subtitleElement.innerHTML = currentSubtitle.text;
                subtitleElement.style.display = 'block';
            } else {
                subtitleElement.style.display = 'none';
            }
        }, 100); // Check every 100ms
    }
    
    // Find the current video playing and get its time
    function getCurrentVideoTime() {
        const videos = document.querySelectorAll('video');
        
        for (const video of videos) {
            // Check if video is loaded and has a current time
            if (video.currentTime > 0 && video.readyState > 2) {
                return video.currentTime;
            }
        }
        
        return null;
    }
    
    // Find the subtitle that matches the current time
    function findSubtitleForTime(currentTime) {
        for (const subtitle of subtitles) {
            if (currentTime >= subtitle.startTime && currentTime <= subtitle.endTime) {
                return subtitle;
            }
        }
        return null;
    }
    
    console.log('Subtitle overlay content script loaded');
}