document.addEventListener('DOMContentLoaded', function() {
    const loadButton = document.getElementById('loadSubtitle');
    const subtitleFileInput = document.getElementById('subtitleFile');
    const statusMessage = document.getElementById('statusMessage');
    
    // Store the original load button click handler
    const loadButtonClickHandler = function() {
        const file = subtitleFileInput.files[0];
        if (!file) {
            updateStatus('Please select a file first', 'error');
            return;
        }

        updateStatus('Loading subtitles...', 'info');
        
        // First, ensure content script is injected
        chrome.runtime.sendMessage({ action: 'ensureContentScriptInjected' }, (response) => {
            if (chrome.runtime.lastError) {
                updateStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
            }

            const selectedEncoding = document.getElementById('encodingSelector').value;
            
            // If auto-detect, try to detect encoding or use TextDecoder
            if (selectedEncoding === 'auto') {
                loadWithAutodetect(file);
            } else {
                // Use specific encoding
                loadWithEncoding(file, selectedEncoding);
            }
        });
    };
    
    // Add the click handler to the load button
    loadButton.addEventListener('click', loadButtonClickHandler);
    
    // Update file name display when file is selected
    document.getElementById('subtitleFile').addEventListener('change', function(e) {
        const fileName = e.target.files[0] ? e.target.files[0].name : 'No file selected';
        document.getElementById('fileName').textContent = fileName;
    });
    
    // Function to update status message with appropriate styling
    function updateStatus(message, type) {
        const statusEl = document.getElementById('statusMessage');
        statusEl.textContent = message;
        
        // Remove existing status classes
        statusEl.classList.remove('status-success', 'status-error', 'status-info');
        
        // Add appropriate status class
        if (type === 'success') {
            statusEl.classList.add('status-success');
        } else if (type === 'error') {
            statusEl.classList.add('status-error');
        } else {
            statusEl.classList.add('status-info');
        }
    }
    
    // Show initial info message
    updateStatus('Ready to load subtitles', 'info');
    
    // Function to load with specific encoding
    function loadWithEncoding(file, encoding) {
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                // Convert ArrayBuffer to text using specified encoding
                const decoder = new TextDecoder(encoding);
                const subtitleData = decoder.decode(new Uint8Array(event.target.result));
                
                processSubtitleData(file, subtitleData);
            } catch (error) {
                updateStatus(`Error decoding with ${encoding}: ${error.message}`, 'error');
                console.error('Decoding error:', error);
            }
        };
        // Read as ArrayBuffer instead of text for proper encoding handling
        reader.readAsArrayBuffer(file);
    }
    
    // Function for auto-detection approach
    function loadWithAutodetect(file) {
        // Try common encodings for subtitle files in sequence
        const encodingsToTry = ['UTF-8', 'EUC-KR', 'CP949', 'windows-1252'];
        let currentEncodingIndex = 0;
        
        function tryNextEncoding() {
            if (currentEncodingIndex >= encodingsToTry.length) {
                statusMessage.textContent = 'Could not detect proper encoding. Please select manually.';
                return;
            }
            
            const encoding = encodingsToTry[currentEncodingIndex];
            currentEncodingIndex++;
            
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const decoder = new TextDecoder(encoding);
                    const subtitleData = decoder.decode(new Uint8Array(event.target.result));
                    
                    // Check if the result looks correct (contains valid characters)
                    if (containsNonAsciiCharacters(subtitleData) && !containsReplacementChars(subtitleData)) {
                        // If looks good, process it
                        console.log(`Successfully decoded with ${encoding}`);
                        processSubtitleData(file, subtitleData);
                    } else {
                        // Try next encoding
                        tryNextEncoding();
                    }
                } catch (error) {
                    console.warn(`Error with encoding ${encoding}:`, error);
                    tryNextEncoding();
                }
            };
            reader.readAsArrayBuffer(file);
        }
        
        // Start trying encodings
        tryNextEncoding();
    }
    
    // Helper function to check if text contains non-ASCII characters
    function containsNonAsciiCharacters(text) {
        // For Korean/Chinese/Japanese subtitles, we expect non-ASCII characters
        return /[^\x00-\x7F]/.test(text);
    }
    
    // Check if the text contains replacement characters (indicating encoding issues)
    function containsReplacementChars(text) {
        // Replacement character � (U+FFFD) often appears when encoding is wrong
        return text.includes('�') || text.includes('?') && text.match(/\?/g).length > text.length / 5;
    }
    
    // Process subtitle data once we have the text
    function processSubtitleData(file, subtitleData) {
        let subtitles = [];
        
        // Determine file type by extension and parse accordingly
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        try {
            if (fileExtension === 'srt') {
                subtitles = parseSRT(subtitleData);
            } else if (fileExtension === 'smi') {
                subtitles = parseSMI(subtitleData);
            } else if (fileExtension === 'vtt') {
                subtitles = parseVTT(subtitleData);
            } else {
                throw new Error('Unsupported subtitle format');
            }
            
            // Send the parsed subtitles to the content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'loadSubtitles', 
                    subtitles: subtitles 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        updateStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                        console.error('Error sending subtitles:', chrome.runtime.lastError);
                    } else if (response && response.success) {
                        updateStatus('Subtitles loaded successfully', 'success');
                        
                        // Transform the load button to a close button
                        loadButton.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="button-icon">
                                <path fill="white" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                            Close Window
                        `;
                        
                        // Change the button's click handler to close the popup
                        loadButton.removeEventListener('click', loadButtonClickHandler);
                        
                        // Add the close window functionality
                        loadButton.addEventListener('click', function() {
                            window.close();
                        });
                        
                        // Show keyboard shortcuts info
                        showKeyboardShortcutsInfo();
                    } else {
                        updateStatus('Failed to load subtitles', 'error');
                    }
                });
            });
        } catch (error) {
            updateStatus('Error: ' + error.message, 'error');
            console.error('Error parsing subtitles:', error);
        }
    }
    
    // Function to show keyboard shortcuts info
    function showKeyboardShortcutsInfo() {
        const shortcutsDiv = document.createElement('div');
        shortcutsDiv.className = 'keyboard-shortcuts';
        shortcutsDiv.style.cssText = `
            margin-top: 20px;
            padding: 10px;
            background-color: rgba(130, 187, 181, 0.1);
            border-radius: 6px;
            animation: fadeIn 0.5s;
        `;
        shortcutsDiv.innerHTML = `
            <h3 style="color: #82bbb5; margin-top: 0; margin-bottom: 10px; font-size: 16px; text-align: center;">Keyboard Shortcuts</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid rgba(130, 187, 181, 0.2);">
                    <td style="padding: 6px 4px; font-size: 13px; width: 60px; text-align: right;">+/-</td>
                    <td style="padding: 6px 4px; font-size: 13px;">Font Size Control</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(130, 187, 181, 0.2);">
                    <td style="padding: 6px 4px; font-size: 13px; width: 60px; text-align: right;">&lt;/&gt;</td>
                    <td style="padding: 6px 4px; font-size: 13px;">Timing Control</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(130, 187, 181, 0.2);">
                    <td style="padding: 6px 4px; font-size: 13px; width: 60px; text-align: right;">R</td>
                    <td style="padding: 6px 4px; font-size: 13px;">Reset Timing</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(130, 187, 181, 0.2);">
                    <td style="padding: 6px 4px; font-size: 13px; width: 60px; text-align: right;">V</td>
                    <td style="padding: 6px 4px; font-size: 13px;">Text Color Control</td>
                </tr>
                <tr>
                    <td style="padding: 6px 4px; font-size: 13px; width: 60px; text-align: right;">B</td>
                    <td style="padding: 6px 4px; font-size: 13px;">Background Color Control</td>
                </tr>
            </table>
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            </style>
        `;
        
        // Add it to the container before the footer
        const container = document.querySelector('.container');
        const footer = document.querySelector('.footer');
        container.insertBefore(shortcutsDiv, footer);
    }
    
    // Function to parse SRT format
    function parseSRT(srtData) {
        const subtitles = [];
        const srtChunks = srtData.trim().split(/\n\s*\n/);
        
        for (const chunk of srtChunks) {
            const lines = chunk.trim().split('\n');
            if (lines.length < 3) continue;
            
            // Skip the subtitle number (first line)
            
            // Parse the timestamp line
            const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/);
            if (!timeMatch) continue;
            
            // Calculate start and end times in seconds
            const startTime = 
                parseInt(timeMatch[1]) * 3600 + 
                parseInt(timeMatch[2]) * 60 + 
                parseInt(timeMatch[3]) + 
                parseInt(timeMatch[4]) / 1000;
            
            const endTime = 
                parseInt(timeMatch[5]) * 3600 + 
                parseInt(timeMatch[6]) * 60 + 
                parseInt(timeMatch[7]) + 
                parseInt(timeMatch[8]) / 1000;
            
            // Join the remaining lines as the subtitle text
            const text = lines.slice(2).join('<br>');
            
            subtitles.push({
                startTime,
                endTime,
                text
            });
        }
        
        console.log('Parsed SRT subtitles:', subtitles);
        return subtitles;
    }

    // Function to parse SMI format
    function parseSMI(smiData) {
        const subtitles = [];
        
        try {
            // Extract the BODY content
            const bodyMatch = smiData.match(/<BODY[^>]*>([\s\S]*?)<\/BODY>/i);
            if (!bodyMatch) {
                throw new Error('Invalid SMI format: BODY tag not found');
            }
            
            const bodyContent = bodyMatch[1];
            
            // Extract SYNC elements
            const syncElements = bodyContent.match(/<SYNC[^>]*>[\s\S]*?(?=<SYNC|$)/gi);
            if (!syncElements || syncElements.length === 0) {
                throw new Error('No SYNC elements found in SMI file');
            }

            // Improved SMI parsing for Korean text
            for (let i = 0; i < syncElements.length; i++) {
                const syncElement = syncElements[i];
                
                // Extract start time
                const startTimeMatch = syncElement.match(/<SYNC\s+Start\s*=\s*["']?(\d+)["']?/i);
                if (!startTimeMatch) continue;
                
                // Start time in seconds (SMI uses milliseconds)
                const startTime = parseInt(startTimeMatch[1]) / 1000;
                
                // Look for P or SPAN or CLASS tag with content
                let textContent = '';
                
                // Common patterns for Korean SMI files
                const koreanClass = syncElement.match(/<P[^>]*Class\s*=\s*["']?KRCC["']?[^>]*>([\s\S]*?)(?=<\/P|<SYNC|$)/i);
                if (koreanClass && koreanClass[1]) {
                    textContent = koreanClass[1];
                } else {
                    // Try other common tags
                    const pTagMatch = syncElement.match(/<P[^>]*>([\s\S]*?)(?=<\/P|<SYNC|$)/i);
                    if (pTagMatch && pTagMatch[1]) {
                        textContent = pTagMatch[1];
                    }
                }
                
                // Clean up the text content
                let text = textContent
                    .replace(/<BR\s*\/?>/gi, '<br>') // Normalize <BR> tags
                    .replace(/<[^>]*>/g, '') // Remove other HTML tags
                    .replace(/&nbsp;/g, ' ')  // Replace &nbsp; with spaces
                    .replace(/\s+/g, ' ')     // Normalize whitespace
                    .trim();
                
                // Skip empty captions
                if (text.length === 0) continue;
                
                // End time is the start time of the next SYNC element or some default
                let endTime;
                if (i < syncElements.length - 1) {
                    const nextStartTimeMatch = syncElements[i + 1].match(/<SYNC\s+Start\s*=\s*["']?(\d+)["']?/i);
                    endTime = nextStartTimeMatch ? parseInt(nextStartTimeMatch[1]) / 1000 : startTime + 5;
                } else {
                    // For the last subtitle, use a default duration
                    endTime = startTime + 5; 
                }
                
                subtitles.push({
                    startTime,
                    endTime,
                    text
                });
            }
        } catch (error) {
            console.error('Error parsing SMI file:', error);
            throw new Error(`SMI parsing error: ${error.message}`);
        }
        
        console.log('Parsed SMI subtitles:', subtitles);
        return subtitles;
    }
    
    // Function to parse VTT format (basic support)
    function parseVTT(vttData) {
        const subtitles = [];
        
        // Skip the WebVTT header
        const lines = vttData.trim().split('\n');
        let i = 0;
        
        // Skip header
        while (i < lines.length && !lines[i].includes('-->')) {
            i++;
        }
        
        while (i < lines.length) {
            // Find timestamp line
            if (lines[i].includes('-->')) {
                const timestampLine = lines[i];
                const timeMatch = timestampLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
                
                if (timeMatch) {
                    // Calculate start and end times in seconds
                    const startTime = 
                        parseInt(timeMatch[1]) * 3600 + 
                        parseInt(timeMatch[2]) * 60 + 
                        parseInt(timeMatch[3]) + 
                        parseInt(timeMatch[4]) / 1000;
                    
                    const endTime = 
                        parseInt(timeMatch[5]) * 3600 + 
                        parseInt(timeMatch[6]) * 60 + 
                        parseInt(timeMatch[7]) + 
                        parseInt(timeMatch[8]) / 1000;
                    
                    // Collect text lines
                    let textLines = [];
                    i++;
                    while (i < lines.length && lines[i].trim() !== '') {
                        textLines.push(lines[i]);
                        i++;
                    }
                    
                    // Join text lines
                    const text = textLines.join('<br>');
                    
                    if (text.trim()) {
                        subtitles.push({
                            startTime,
                            endTime,
                            text
                        });
                    }
                }
            }
            i++;
        }
        
        console.log('Parsed VTT subtitles:', subtitles);
        return subtitles;
    }
});