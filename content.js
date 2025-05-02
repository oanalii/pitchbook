let isScrapingActive = false;
let pageCount = 0;
let rowCount = 0;
let scrapedData = [];

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "startScraping") {
        isScrapingActive = true;
        startScraping();
    } else if (request.action === "stopScraping") {
        isScrapingActive = false;
    }
});

async function startScraping() {
    while (isScrapingActive) {
        try {
            // Wait for table to load
            await waitForElement("div[role='grid']");
            
            // Select all text in the table
            const tableData = await scrapeCurrentPage();
            
            if (tableData && tableData.length > 0) {
                scrapedData = [...scrapedData, ...tableData];
                pageCount++;
                rowCount += tableData.length;
                
                // Update popup with progress
                chrome.runtime.sendMessage({
                    action: "updateProgress",
                    pages: pageCount,
                    rows: rowCount
                });
                
                // Save data to storage
                chrome.storage.local.set({ scrapedData: scrapedData });
                
                // Check for and click next page button
                const hasNextPage = await clickNextPage();
                if (!hasNextPage) {
                    break;
                }
                
                // Wait between pages
                await sleep(randomDelay(2000, 4000));
            } else {
                console.log("No data found on current page");
                break;
            }
        } catch (error) {
            console.error("Error during scraping:", error);
            break;
        }
    }
}

async function scrapeCurrentPage() {
    try {
        // Find the table
        const table = await waitForElement("div[role='grid']");
        if (!table) return null;

        // Get all rows
        const rows = await table.querySelectorAll("div[role='row']");
        const data = [];

        // Get headers first
        const headerRow = rows[0];
        const headers = Array.from(headerRow.querySelectorAll("div[role='columnheader']"))
            .map(header => header.textContent.trim());

        // Get data rows
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const cells = row.querySelectorAll("div[role='cell']");
            const rowData = {};
            
            cells.forEach((cell, index) => {
                rowData[headers[index] || `Column${index + 1}`] = cell.textContent.trim();
            });
            
            data.push(rowData);
        }

        return data;
    } catch (error) {
        console.error("Error scraping page:", error);
        return null;
    }
}

async function clickNextPage() {
    try {
        const nextButton = document.querySelector("button[aria-label='Next']");
        if (!nextButton || nextButton.disabled) {
            return false;
        }
        
        nextButton.click();
        return true;
    } catch (error) {
        console.error("Error clicking next page:", error);
        return false;
    }
}

function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations) => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
} 