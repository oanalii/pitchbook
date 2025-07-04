// --- REMOVE TEMPORARY VISUAL CUE --- 
// document.body.style.border = '5px solid red';
// console.log('[PitchBook Scraper] Added red border to body (temp test)');
// setTimeout(() => {
//     document.body.style.border = ''; // Remove border after 2 seconds
//     console.log('[PitchBook Scraper] Removed red border');
// }, 2000);
// --- END VISUAL CUE ---

const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log('[PitchBook Scraper]', ...args);
    }
}

let isScrapingActive = false;
let scrapedData = [];
let pageCount = 0;
let totalRowsScrapedOverall = 0;
let currentBatchNumber = 1;

// conf for delay
const CONFIG = {
    PAGE_LOAD_WAIT: 3000,      // Wait 3s after elements are found
    BETWEEN_PAGES: 8000,       // Wait 8s between pages
    RANDOM_EXTRA: 4000,        // Add up to 4s random delay
    ELEMENT_TIMEOUT: 60000,     // Wait up to 60s for elements
    BATCH_SIZE: 100000         // Batch size set to 100k
};

// html divs of pb
const SELECTORS = {
    NEXT_BUTTON: 'button[aria-label="Go to next page"]',
    // Fixed left table (company names)
    FIXED_TABLE_CONTAINER: '#search-results-data-table-left',
    FIXED_HEADER_CELLS: '#search-results-data-table-left .data-table__cell_header-cell', // Headers are within the left container
    FIXED_ROWS: '#search-results-data-table-left .data-table__row', // Rows are within the left container
    COMPANY_NAME_LINK: '.custom-cell-format__fixed-entity a', // Link inside a fixed row cell
    // Scrollable right table (other data)
    SCROLLABLE_TABLE_CONTAINER: '#search-results-data-table-right',
    SCROLLABLE_HEADER_CELLS: '#search-results-data-table-right .data-table__cell_header-cell', // Headers within the right container
    SCROLLABLE_ROWS: '#search-results-data-table-right .data-table__row', // Rows within the right container
    // datacells
    DATA_CELL: '.data-table__cell' 
    // Note: Removed LOADING_INDICATOR as it might be unreliable
};

// listens for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    debugLog('Received message:', request.action);
    
    switch(request.action) {
        case "startScraping":
            debugLog('Starting scraping process...');
            isScrapingActive = true;
            scrapedData = [];
            pageCount = 0;
            totalRowsScrapedOverall = 0;
            currentBatchNumber = 1;
            startScraping().catch(error => {
                console.error('Scraping error in startScraping catch:', error);
                updateProgress('Error: ' + error.message, true);
                if(scrapedData.length > 0) {
                    debugLog('Attempting to download remaining data after error...');
                    downloadAndClearBatch(true).catch(dlError => console.error("Error downloading final batch after error:", dlError));
                }
            });
            sendResponse({success: true}); // Acknowledge receipt
            break;
            
        case "stopScraping":
            debugLog('Stopping scraping requested...');
            isScrapingActive = false;
            sendResponse({success: true});
            if(scrapedData.length > 0) {
                 debugLog('Attempting to download remaining data after stop request...');
                 downloadAndClearBatch(true).catch(dlError => console.error("Error downloading final batch after stop:", dlError));
            } else {
                 updateProgress("Stopped");
            }
            break;
            
        case "getScrapedData":
            debugLog('Sending current in-memory data, length:', scrapedData.length);
            sendResponse({data: scrapedData});
            break;
            
        case "getProgress":
            sendResponse({
                pages: pageCount,
                rows: totalRowsScrapedOverall,
                status: isScrapingActive ? 'Scraping' : 'Stopped'
            });
            break;
            
        default:
             debugLog('Unknown action received:', request.action);
             sendResponse({error: "Unknown action"});
             break;
    }
    return true; 
});

async function waitForTableLoad() {
    debugLog('[waitForTableLoad] Starting - Waiting for table sections and rows...');
    
    debugLog('[waitForTableLoad] Step 1: Waiting for Fixed Table Container:', SELECTORS.FIXED_TABLE_CONTAINER);
    await waitForElement(SELECTORS.FIXED_TABLE_CONTAINER, CONFIG.ELEMENT_TIMEOUT);
    debugLog('[waitForTableLoad] Step 1: Fixed Table Container FOUND');
    
    debugLog('[waitForTableLoad] Step 2: Waiting for Scrollable Table Container:', SELECTORS.SCROLLABLE_TABLE_CONTAINER);
    await waitForElement(SELECTORS.SCROLLABLE_TABLE_CONTAINER, CONFIG.ELEMENT_TIMEOUT);
    debugLog('[waitForTableLoad] Step 2: Scrollable Table Container FOUND');
    
    debugLog('[waitForTableLoad] Step 3: Waiting for first Fixed Row:', SELECTORS.FIXED_ROWS);
    await waitForElement(SELECTORS.FIXED_ROWS, CONFIG.ELEMENT_TIMEOUT);
    debugLog('[waitForTableLoad] Step 3: First Fixed Row FOUND');
    
    debugLog('[waitForTableLoad] Step 4: Waiting for first Scrollable Row:', SELECTORS.SCROLLABLE_ROWS);
    await waitForElement(SELECTORS.SCROLLABLE_ROWS, CONFIG.ELEMENT_TIMEOUT);
    debugLog('[waitForTableLoad] Step 4: First Scrollable Row FOUND');
    
    // Add extra delay after finding elements to ensure rendering/data population
    debugLog(`[waitForTableLoad] Step 5: Final wait for rendering: ${CONFIG.PAGE_LOAD_WAIT}ms`);
    await sleep(CONFIG.PAGE_LOAD_WAIT);

    debugLog('[waitForTableLoad] Finished - All required elements found.');
}

function getHeaders() {
    debugLog('[getHeaders] Extracting headers...');
    
    // gets the fixed header like the company one
    const fixedHeaders = Array.from(document.querySelectorAll(SELECTORS.FIXED_HEADER_CELLS))
        .map(cell => {
            const captions = Array.from(cell.querySelectorAll('.smart-caption__text'))
                .map(el => el.textContent.trim())
                .filter(Boolean);
            // Special handling for Company Name header if needed based on html structure
            if (cell.querySelector(SELECTORS.COMPANY_NAME_LINK)) return 'Company Name'; 
            return captions.join(' ');
        })
        .filter(Boolean); // Filter out empty headers
        
     debugLog('[getHeaders] Fixed headers found:', fixedHeaders);
    
    // Get scrollable headers (all other columns)
    const scrollableHeaders = Array.from(document.querySelectorAll(SELECTORS.SCROLLABLE_HEADER_CELLS))
        .map(cell => {
            const captions = Array.from(cell.querySelectorAll('.smart-caption__text'))
                .map(el => el.textContent.trim())
                .filter(Boolean);
            return captions.join(' ');
        })
        .filter(Boolean); // Filter out empty headers
        
    debugLog('[getHeaders] Scrollable headers found:', scrollableHeaders);
    
    // Combine headers: Assume first fixed header is always Company Name 
    // (even if selector didn't catch it above), then add scrollable ones.
    const headers = ['Company Name', ...scrollableHeaders]; 
    
    // Add Company URL manually as we extract it separately
    headers.splice(1, 0, 'Company URL'); 
    
    debugLog('[getHeaders] Combined headers:', headers);
    return headers;
}

async function scrapeCurrentPage() {
    debugLog('[scrapeCurrentPage] Function called. Starting scrape attempt...');
    
    try {
        await waitForTableLoad();
        
        debugLog('[scrapeCurrentPage] Attempting to get headers...');
        const headers = getHeaders();
        if (!headers || headers.length < 2) { 
            throw new Error(`Insufficient headers found (${headers ? headers.length : 0}). Cannot proceed.`);
        }
        debugLog('[scrapeCurrentPage] Headers obtained:', headers);
        
        debugLog('[scrapeCurrentPage] Attempting to get rows...');
        const fixedRows = document.querySelectorAll(SELECTORS.FIXED_ROWS);
        const scrollableRows = document.querySelectorAll(SELECTORS.SCROLLABLE_ROWS);
        
        const fixedRowCount = fixedRows.length;
        const scrollableRowCount = scrollableRows.length;
        
        debugLog(`[scrapeCurrentPage] Found ${fixedRowCount} fixed rows and ${scrollableRowCount} scrollable rows`);
        
        // SIMPLE OFFSET DETECTION: Check if first fixed row has company link
        let offset = 0;
        if (fixedRowCount > 0) {
            const firstFixedRow = fixedRows[0];
            const firstCompanyLink = firstFixedRow.querySelector(SELECTORS.COMPANY_NAME_LINK);
            if (!firstCompanyLink) {
                debugLog('[scrapeCurrentPage] First fixed row has no company link - applying offset of 1');
                offset = 1;
            } else {
                debugLog('[scrapeCurrentPage] First fixed row has company link - no offset needed');
            }
        }
        
        // Handle row mismatch - use the minimum count after applying offset
        const availableFixedRows = fixedRowCount - offset;
        let rowCountToProcess = 0;
        if (availableFixedRows !== scrollableRowCount) {
             debugLog(`[scrapeCurrentPage] Warning: Row count mismatch! Available Fixed=${availableFixedRows}, Scrollable=${scrollableRowCount}. Processing minimum.`);
             rowCountToProcess = Math.min(availableFixedRows, scrollableRowCount);
        } else if (availableFixedRows === 0) {
            throw new Error('No rows available after applying offset.');
        } else {
            rowCountToProcess = availableFixedRows;
        }
        
        debugLog(`[scrapeCurrentPage] Will process ${rowCountToProcess} rows with offset ${offset}.`);
        
        const rows = [];
        
        // Process each row with offset
        for (let i = 0; i < rowCountToProcess; i++) {
            const rowData = {};
            const fixedRowIndex = i + offset;  // Apply offset to fixed rows
            
            // 1. Get company name & URL from fixed section
            const companyLink = fixedRows[fixedRowIndex].querySelector(SELECTORS.COMPANY_NAME_LINK);
            if (companyLink) {
                rowData['Company Name'] = companyLink.textContent.trim();
                rowData['Company URL'] = companyLink.href;
            } else {
                debugLog(`[scrapeCurrentPage] Warning: Company link not found in fixed row ${fixedRowIndex}. Skipping row.`);
                continue; 
            }
            
            // 2. Get other data from corresponding scrollable section row
            if (scrollableRows[i]) { 
                const scrollableCells = scrollableRows[i].querySelectorAll(SELECTORS.DATA_CELL);
                scrollableCells.forEach((cell, idx) => {
                    const headerName = headers[idx + 2]; 
                    if (headerName) {
                        rowData[headerName] = extractCellValue(cell);
                    } else {
                        debugLog(`[scrapeCurrentPage] Warning: No matching header found for scrollable cell index ${idx} in row ${i}.`);
                    }
                });
            } else {
                debugLog(`[scrapeCurrentPage] Warning: Corresponding scrollable row ${i} not found, skipping its data.`);
            }
            
            rows.push(rowData);
        }
        
        if (rows.length === 0 && rowCountToProcess > 0) {
             debugLog('[scrapeCurrentPage] Warning: Processed rows but extracted no data. Check selectors.');
        } else if (rows.length === 0) {
             throw new Error('No data successfully extracted from any rows');
        }
        
        debugLog(`[scrapeCurrentPage] Successfully scraped ${rows.length} rows.`);
        return rows;
        
    } catch (error) {
        console.error('[scrapeCurrentPage] Error scraping page:', error);
        throw error; 
    }
}

function extractCellValue(cell) {
    if (!cell) return 'N/A';
    
    try {
        const links = cell.querySelectorAll('a');
        if (links.length > 0) {
            if (links.length === 1) {
                return { text: links[0].textContent.trim(), url: links[0].href };
            }
            return Array.from(links).map(link => ({ text: link.textContent.trim(), url: link.href }));
        }
        const numericValue = cell.querySelector('.number');
        if (numericValue) return numericValue.textContent.trim();
        const dateValue = cell.querySelector('.date');
        if (dateValue) return dateValue.textContent.trim();
        const currencyValue = cell.querySelector('.currency');
        if (currencyValue) return currencyValue.textContent.trim();
        const meaningfulContent = cell.querySelector('.cell-content, .text-content, [class*="value"], [class*="data"]');
        if (meaningfulContent) return meaningfulContent.textContent.trim();
        const text = cell.textContent.trim().replace(/\s+/g, ' ');
        return text || 'N/A';
    } catch (error) {
        console.error('Error extracting cell value:', error, cell);
        return 'Extract Error';
    }
}

function waitForElement(selector, timeout = CONFIG.ELEMENT_TIMEOUT, waitForRemoval = false) {
    debugLog(`[waitForElement] ${waitForRemoval ? 'Waiting for element to disappear' : 'Waiting for element'}: ${selector}`);
    if (!waitForRemoval) {
        const el = document.querySelector(selector);
        if (el) {
            debugLog(`[waitForElement] Element found immediately (no wait needed): ${selector}`);
            return Promise.resolve(el);
        }
    } else {
        const el = document.querySelector(selector);
        if (!el) {
            debugLog(`[waitForElement] Element already gone (no wait needed): ${selector}`);
            return Promise.resolve();
        }
    }
    return new Promise((resolve, reject) => {
        let timeoutId = null;
        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if ((!waitForRemoval && element) || (waitForRemoval && !element)) {
                clearTimeout(timeoutId);
                obs.disconnect();
                debugLog(`[waitForElement] Element ${waitForRemoval ? 'removed' : 'found'} after observing: ${selector}`);
                resolve(element);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        debugLog(`[waitForElement] Observer started for ${selector}`);
        timeoutId = setTimeout(() => {
            observer.disconnect();
            debugLog(`[waitForElement] Observer stopped due to timeout for ${selector}`);
            reject(new Error(`Timeout (${timeout}ms) ${waitForRemoval ? 'waiting for element to disappear' : 'waiting for element'}: ${selector}`));
        }, timeout);
    });
}

async function startScraping() {
    debugLog('Starting scraping process...');
    pageCount = 0;
    totalRowsScrapedOverall = 0;
    currentBatchNumber = 1;
    scrapedData = []; 

    while (isScrapingActive) {
        try {
            debugLog(`Processing page ${pageCount + 1}`);
            const newRows = await scrapeCurrentPage();
            if (newRows.length > 0) {
                scrapedData.push(...newRows);
                totalRowsScrapedOverall += newRows.length;
                pageCount++;
                debugLog(`Scraped page ${pageCount}, current batch size: ${scrapedData.length}, total rows: ${totalRowsScrapedOverall}`);
                updateProgress(`Scraping page ${pageCount+1}`); 

                if (scrapedData.length >= CONFIG.BATCH_SIZE) {
                    await downloadAndClearBatch();
                }

            } else {
                 debugLog('Warning: scrapeCurrentPage returned 0 rows. Assuming end or error.');
                 break; 
            }
            const nextButton = document.querySelector(SELECTORS.NEXT_BUTTON);
            if (!nextButton || nextButton.disabled || nextButton.getAttribute('aria-disabled') === 'true') {
                debugLog('No more pages available');
                isScrapingActive = false;
                break;
            }
            debugLog('Clicking next button');
            nextButton.click();
            const delay = CONFIG.BETWEEN_PAGES + Math.random() * CONFIG.RANDOM_EXTRA;
            debugLog(`Waiting ${Math.round(delay/1000)}s before next page...`);
            await sleep(delay);
        } catch (error) {
            console.error('Error during scraping loop:', error);
            updateProgress(error.message, true);
            isScrapingActive = false;
            break;
        }
    }

    if(scrapedData.length > 0) {
        debugLog('Scraping finished or stopped. Downloading final batch...');
        await downloadAndClearBatch(true);
    } else {
        debugLog(`Scraping finished. Total rows: ${totalRowsScrapedOverall}`);
        updateProgress("Finished"); 
    }
}

function convertToCSV(data) {
    if (!data || !data.length) return '';
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
    return csvContent;
}

async function downloadAndClearBatch(isFinal = false) {
    if (!scrapedData || scrapedData.length === 0) {
        debugLog("No data in current batch to download.");
        if(isFinal) updateProgress("Finished");
        return;
    }

    debugLog(`Preparing batch ${currentBatchNumber} for download (${scrapedData.length} rows)...`);
    updateProgress(`Downloading batch ${currentBatchNumber}...`);

    try {
        const csvContent = convertToCSV(scrapedData);
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '_');
        const filename = `pitchbook_data_batch_${currentBatchNumber}_${timestamp}.csv`;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        await chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false 
        });
        
        debugLog(`Successfully triggered download for batch ${currentBatchNumber} (${filename}).`);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        scrapedData = [];
        currentBatchNumber++;
        if(isFinal) {
             debugLog(`Final batch downloaded. Total rows: ${totalRowsScrapedOverall}`);
             updateProgress("Finished");
        } else {
             updateProgress(`Batch ${currentBatchNumber - 1} downloaded. Starting next batch...`);
        }

    } catch (error) {
        console.error(`Error downloading batch ${currentBatchNumber}:`, error);
        updateProgress(`Error downloading batch ${currentBatchNumber}: ${error.message}`, true);
        isScrapingActive = false; 
    }
}

function updateProgress(status, isError = false) {
    debugLog('Updating progress:', status);
    chrome.runtime.sendMessage({
        action: "updateProgress",
        pages: pageCount,
        rows: totalRowsScrapedOverall,
        status: status,
        error: isError ? status : null
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

debugLog('PitchBook Scraper content script is ready! (v4 with batching 100k)'); 