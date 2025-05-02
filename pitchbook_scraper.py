import asyncio
import os
import random
import time
import logging
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# --- Logging Setup ---
log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)
logger.addHandler(console_handler)

file_handler = logging.FileHandler('scraper.log', mode='a')
file_handler.setFormatter(log_formatter)
logger.addHandler(file_handler)

# Load environment variables from .env file
load_dotenv()

TARGET_URL = os.getenv("TARGET_URL", "https://my.pitchbook.com/search-results/s547672543/companies")
START_PAGE = int(os.getenv("START_PAGE", "1"))

async def human_like_delay(min_seconds=1.5, max_seconds=4.0):
    """Waits for a random duration to mimic human pauses."""
    await asyncio.sleep(random.uniform(min_seconds, max_seconds))

async def main():
    """Main function to connect to existing Chrome and run the scraper."""
    logger.info("--- Scraper starting ---")

    async with async_playwright() as p:
        # Connect to the running instance of Chrome
        browser = await p.chromium.connect_over_cdp('http://localhost:9222')
        
        try:
            # Use the default context (your logged in session)
            context = browser.contexts[0]
            page = context.pages[0]
            
            if not page:
                page = await context.new_page()

            # Navigate to the target URL
            logger.info(f"Navigating to target URL: {TARGET_URL}")
            await page.goto(TARGET_URL, wait_until='domcontentloaded', timeout=90000)
            await human_like_delay()

            # --- ACTUAL SCRAPING LOOP STARTS HERE --- 
            current_page_num = START_PAGE
            logger.info(f"Starting scraping loop from page {current_page_num}...")
            
            # If starting from a page > 1, need to navigate there first
            if current_page_num > 1:
                logger.info(f"Need to navigate to page {current_page_num} before starting...")
                # TODO: Add logic to navigate to specific page
                pass

            # Main scraping loop
            while True:
                logger.info(f"Processing page {current_page_num}...")
                await human_like_delay()

                try:
                    # Wait for the table to load
                    table_selector = "div[role='grid']" # Update this based on actual table selector
                    await page.wait_for_selector(table_selector, timeout=30000)
                    
                    # Extract rows from the table
                    rows = await page.query_selector_all(f"{table_selector} div[role='row']")
                    
                    if not rows:
                        logger.warning("No rows found on page. Table might not be loaded.")
                        continue

                    num_rows_extracted = len(rows)
                    logger.info(f"Found {num_rows_extracted} rows on page {current_page_num}")

                    # Process each row
                    for row in rows:
                        # Extract cells from row
                        cells = await row.query_selector_all("div[role='cell']")
                        row_data = []
                        
                        for cell in cells:
                            # Get text content of cell
                            text = await cell.text_content()
                            row_data.append(text.strip())
                        
                        # TODO: Process row_data (e.g., save to database)
                        logger.info(f"Extracted row: {row_data}")
                    
                    # Check for next page button
                    next_button = await page.query_selector("button[aria-label='Next']")
                    
                    if not next_button:
                        logger.info("No next page button found. Reached end of data.")
                        break
                        
                    # Check if next button is disabled
                    is_disabled = await next_button.get_attribute('disabled')
                    if is_disabled:
                        logger.info("Next page button is disabled. Reached end of data.")
                        break

                    # Click next page and wait for navigation
                    logger.info(f"Clicking next page button to go to page {current_page_num + 1}...")
                    await next_button.click()
                    await page.wait_for_load_state('networkidle')
                    
                    current_page_num += 1

                    # Add a longer delay between pages
                    await human_like_delay(3.0, 6.0)

                    # TEMPORARY BREAK FOR TESTING - REMOVE LATER
                    if current_page_num > START_PAGE + 2:  # Scrape only 2 pages for testing
                        logger.warning("Reached temporary limit for testing. Stopping loop.")
                        break

                except PlaywrightTimeoutError:
                    logger.error(f"Timeout error on page {current_page_num}")
                    # Maybe retry or handle the error appropriately
                    break
                except Exception as e:
                    logger.exception(f"Error processing page {current_page_num}: {e}")
                    break

        except Exception as e:
            logger.exception(f"An unexpected error occurred: {e}")
        finally:
            await browser.close()
            logger.info("--- Scraper finished ---")

if __name__ == "__main__":
    # First, you need to start Chrome with remote debugging enabled
    print("IMPORTANT: Make sure Chrome is running with remote debugging enabled!")
    print("Run this command first:")
    print("/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222")
    print("\nThen run this script in a new terminal.")
    
    asyncio.run(main()) 