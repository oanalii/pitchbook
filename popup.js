let isScrapingActive = false;
let totalPages = 0;
let totalRows = 0;

document.getElementById('startScraping').addEventListener('click', function() {
  isScrapingActive = true;
  this.disabled = true;
  document.getElementById('stopScraping').disabled = false;
  
  // Send message to content script to start scraping
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "startScraping"});
  });
  
  updateStatus('Scraping started...', 'success');
});

document.getElementById('stopScraping').addEventListener('click', function() {
  isScrapingActive = false;
  this.disabled = true;
  document.getElementById('startScraping').disabled = false;
  
  // Send message to content script to stop scraping
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: "stopScraping"});
  });
  
  updateStatus('Scraping stopped', 'error');
});

document.getElementById('downloadCSV').addEventListener('click', function() {
  chrome.storage.local.get(['scrapedData'], function(result) {
    if (result.scrapedData && result.scrapedData.length > 0) {
      const csv = convertToCSV(result.scrapedData);
      downloadCSV(csv);
      updateStatus('CSV downloaded successfully!', 'success');
    } else {
      updateStatus('No data to download', 'error');
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "updateProgress") {
    totalPages = request.pages;
    totalRows = request.rows;
    document.getElementById('pageCount').textContent = totalPages;
    document.getElementById('rowCount').textContent = totalRows;
  }
});

function updateStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = type;
}

function convertToCSV(data) {
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  return [headers, ...rows].join('\n');
}

function downloadCSV(csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', 'pitchbook_data.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
} 