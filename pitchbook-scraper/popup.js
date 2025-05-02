console.log('[Popup] POPUP LOADED - TEST');

document.addEventListener('DOMContentLoaded', function() {
    debugLog('POPUP DOM LOADED - TEST');
    
    const startButton = document.getElementById('startScraping');
    const stopButton = document.getElementById('stopScraping');
    const downloadButton = document.getElementById('downloadCSV');
    const companyCountSpan = document.getElementById('companyCount');
    const pageCountSpan = document.getElementById('pageCount');
    const currentStatusSpan = document.getElementById('currentStatus');
    const statusDiv = document.getElementById('status');

    let isScrapingActive = false;

    startButton.addEventListener('click', async function() {
        debugLog('START BUTTON CLICKED - TEST');
        
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            debugLog('GOT TAB:', tab.id);
            
            if (!tab.url || !tab.url.includes('pitchbook.com')) { 
                throw new Error('Not on a valid PitchBook page');
            }

            isScrapingActive = true;
            startButton.disabled = true;
            stopButton.disabled = false;
            currentStatusSpan.textContent = 'Starting...';
            
            chrome.tabs.sendMessage(tab.id, {action: "startScraping"}, response => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError.message);
                    showStatus('Failed to connect to content script. Reload the page and try again. Error: ' + chrome.runtime.lastError.message, 'error');
                    isScrapingActive = false;
                    startButton.disabled = false;
                    stopButton.disabled = true;
                    currentStatusSpan.textContent = 'Error';
                    return;
                } 
                if (response && response.success) {
                    debugLog('Start scraping message sent successfully and acknowledged.');
                    currentStatusSpan.textContent = 'Scraping...'; 
                    // Poll for updates is less critical now, maybe remove or reduce frequency?
                    // pollForUpdates(); // If needed, uncomment
                } else {
                    console.warn('Content script did not acknowledge start message successfully.', response);
                    showStatus('Content script did not start correctly.', 'warning');
                    isScrapingActive = false;
                    startButton.disabled = false;
                    stopButton.disabled = true;
                    currentStatusSpan.textContent = 'Error';
                }
            });
            
        } catch (error) {
            console.error('Error in startButton click handler:', error);
            showStatus(error.message, 'error');
            isScrapingActive = false; 
            startButton.disabled = false;
            stopButton.disabled = true;
            currentStatusSpan.textContent = 'Error';
        }
    });

    stopButton.addEventListener('click', async function() {
        debugLog('STOP button clicked');
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            chrome.tabs.sendMessage(tab.id, {action: "stopScraping"}, response => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending stop message:', chrome.runtime.lastError.message);
                    showStatus('Failed to send stop command. Content script might have issues.', 'error');
                    return;
                }
                debugLog('Stop scraping message sent successfully');
            });
            
            isScrapingActive = false;
            startButton.disabled = false;
            stopButton.disabled = true;
            currentStatusSpan.textContent = 'Stopping...'; 
        } catch (error) {
            console.error('Error stopping scraping:', error);
            showStatus('Failed to stop scraping: ' + error.message, 'error');
        }
    });

    downloadButton.addEventListener('click', async function() {
        debugLog('Manual Download button clicked');
        showStatus('Manual download gets current in-memory batch only. Automatic downloads save all data.', 'info');
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            chrome.tabs.sendMessage(tab.id, {action: "getScrapedData"}, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('Error getting data:', chrome.runtime.lastError.message);
                    showStatus('Failed to get current batch data: ' + chrome.runtime.lastError.message, 'error');
                    return;
                }
                if (response && response.data && response.data.length > 0) {
                    triggerPopupDownload(response.data);
                    showStatus(`Downloaded current batch of ${response.data.length} rows successfully`, 'success');
                } else {
                    showStatus('No data in the current in-memory batch to download', 'warning');
                }
            });
        } catch (error) {
            console.error('Error downloading data:', error);
            showStatus('Failed to download current batch data: ' + error.message, 'error');
        }
    });

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (sender.tab && request.action === "updateProgress") {
            debugLog('Popup received progress update:', request);
            companyCountSpan.textContent = request.rows || 0;
            pageCountSpan.textContent = request.pages || 0;
            currentStatusSpan.textContent = request.status || (isScrapingActive ? 'Scraping' : 'Ready');
            
            if (request.error) {
                showStatus(request.error, 'error');
                isScrapingActive = false;
                startButton.disabled = false;
                stopButton.disabled = true;
            } else if (request.status === 'Finished' || request.status === 'Stopped') {
                 isScrapingActive = false;
                 startButton.disabled = false;
                 stopButton.disabled = true;
            }
        }
    });

    function showStatus(message, type = 'info') {
        debugLog(`Status update (${type}):`, message);
        statusDiv.textContent = message;
        statusDiv.className = type;
    }
    
    function triggerPopupDownload(data) { 
        if (!data || !data.length) return;
        const headers = Object.keys(data[0]);
        let csvContent = headers.join(',') + '\n';
        csvContent += data.map(row => {
            return headers.map(header => {
                let value = row[header];
                 if (typeof value === 'object' && value !== null && value.text) {
                     value = value.text; 
                 } else if (Array.isArray(value)) {
                     value = value.map(v => (typeof v === 'object' && v !== null && v.text) ? v.text : v).join('; ');
                 }
                 value = (value === null || value === undefined) ? '' : String(value);
                 value = value.replace(/"/g, '""');
                 return `"${value}"`;
            }).join(',');
        }).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '_');
        link.setAttribute('download', `pitchbook_manual_download_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100); 
    }

    function debugLog(...args) {
        console.log('[Popup]', ...args);
    }
}); 