# PitchBook Scraper Project

This document outlines the structure and plan for the PitchBook web scraper project.

## Phase 1: Login Script (`pitchbook_scraper.py`) Explanation

This script uses Playwright to automate the login process for PitchBook.

**Execution Flow:**

1.  **Imports (Lines 1-6):**
    *   `asyncio`: For asynchronous operations (required by Playwright).
    *   `os`: To access environment variables (credentials).
    *   `random`: To generate random numbers for delays.
    *   `time`: For potential time-based logic (like scheduled pauses).
    *   `dotenv.load_dotenv`: To load variables from the `.env` file.
    *   `playwright.async_api`: Imports the core Playwright components (`async_playwright`, `TimeoutError`).

2.  **Load Environment Variables (Line 9):**
    *   `load_dotenv()`: Reads the `.env` file in the project directory and loads variables like `PITCHBOOK_USERNAME`, `PITCHBOOK_PASSWORD`, `PITCHBOOK_LOGIN_URL` into the script's environment.

3.  **Configuration Setup (Lines 12-14):**
    *   Retrieves the values loaded by `load_dotenv()` using `os.getenv()` and assigns them to Python variables.

4.  **Helper Function: `check_config()` (Lines 17-26):**
    *   Verifies that essential variables (username, password, login URL) were loaded successfully from `.env` and are not empty or placeholders. Returns `True` if okay, `False` otherwise, preventing the script from running without proper config.

5.  **Helper Function: `human_like_delay()` (Lines 28-31):**
    *   An `async` function that pauses the script for a random duration (default 1.5-4.0 seconds) using `asyncio.sleep()` to mimic human hesitation.

6.  **Main Logic Function: `login_to_pitchbook(page)` (Lines 34-84):**
    *   Takes a Playwright `page` object (representing a browser tab) as input.
    *   **Navigation (Lines 36-43):** Tries to navigate the page to `PITCHBOOK_LOGIN_URL`, waiting for the basic HTML structure (`domcontentloaded`) with a 60-second timeout. Handles potential timeout or other navigation errors.
    *   **Pause (Line 45):** Waits using `human_like_delay()`.
    *   **Selector Definitions (Lines 48-54):** Defines placeholder variables for CSS selectors. **These MUST be updated by inspecting the PitchBook login page using browser developer tools.** Correct selectors are needed for:
        *   `username_selector`: The input field for the username/email.
        *   `password_selector`: The input field for the password.
        *   `login_button_selector`: The button to click to submit login.
        *   `post_login_element_selector`: An element that reliably appears *only* after a successful login (e.g., user menu, dashboard element).
    *   **Login Actions (Lines 56-84):**
        *   Uses `page.locator(selector).fill(value)` to find the username/password fields and type the credentials, pausing between steps.
        *   Uses `page.locator(selector).click()` to click the login button.
        *   **Waits for Login Confirmation (Lines 70-76):** Attempts to confirm successful login by waiting (up to 90 seconds) for a specific condition. The primary method is waiting for `post_login_element_selector` to become visible. Alternative methods (waiting for URL change or network idle) are commented out. **One of these MUST be correctly configured.**
        *   **Returns:** `True` if the login and confirmation succeed, `False` if any step fails or times out. Includes error handling and print statements.

7.  **Main Orchestration Function: `main()` (Lines 87-114):**
    *   The main `async` function that sets up and runs the process.
    *   **Config Check (Line 89):** Calls `check_config()` and exits if config is missing.
    *   **Playwright Startup (Line 92):** Starts the Playwright engine using `async_playwright()`.
    *   **Browser Launch (Line 95):** Launches a **visible** Chromium browser (`headless=False`) using `p.chromium.launch()`. `slow_mo=100` adds a 100ms delay before each action for easier visual debugging (remove/reduce for speed later).
    *   **New Page (Line 96):** Opens a new browser tab (`page`).
    *   **Login Attempt (Line 102):** Calls `login_to_pitchbook(page)` and stores the result (`True`/`False`) in `login_ok`.
    *   **Conditional Logic (Lines 104-110):** Checks `login_ok`. If `True`, prints success and indicates where scraping logic will go. If `False`, prints failure message.
    *   **Pause & Close (Lines 112-114):** Waits 15 seconds (allowing visual inspection) then closes the browser using `browser.close()`.

8.  **Script Execution Block (Lines 117-121):**
    *   `if __name__ == "__main__":` ensures this code runs only when the script is executed directly.
    *   Prints a reminder to install Playwright browsers (`playwright install`).
    *   `asyncio.run(main())`: Starts the `asyncio` event loop and runs the `main()` function, kicking off the entire process.

## Phase 2: Data Handling & Deployment Strategy

**Objective:** Scrape ~8.5 million rows of structured data from PitchBook and store it reliably, running the scraper continuously on a server.

**1. Data Storage:**

*   **Choice:** PostgreSQL is recommended due to the structured/relational nature of the data, scalability, robustness, and open-source nature.
*   **Schema Design (Critical):**
    *   **Identify Columns:** Manually inspect the target PitchBook data table(s). List *every* column header to be scraped.
    *   **Determine Data Types:** Assign appropriate PostgreSQL types (`TEXT`, `INTEGER`, `BIGINT`, `NUMERIC`, `DATE`, `TIMESTAMP`, `BOOLEAN`, etc.) to each column.
    *   **Primary Key:** Define a unique identifier for each row (e.g., a PitchBook internal ID if available, or a `BIGSERIAL` auto-incrementing column).
    *   **`CREATE TABLE` SQL:** Write the SQL statement to create the table based on the columns and types. Include constraints (e.g., `UNIQUE`, `NOT NULL` where appropriate) and potentially a `scraped_at TIMESTAMP` column.

**2. Integrating Storage with Scraper (`pitchbook_scraper.py`):**

*   **Database Connector:** Use `asyncpg` (asynchronous driver for PostgreSQL, suitable for `asyncio` code). Add `asyncpg` to `requirements.txt`.
*   **Connection:** Establish a connection to the database within the Python script using credentials loaded from `.env` (host, port, dbname, user, password).
*   **Insertion Logic:**
    *   After scraping data for one or more rows.
    *   Structure data (e.g., list of dictionaries/tuples) matching the table schema.
    *   Use **parameterized queries** (`INSERT ... VALUES ($1, $2)`) with `asyncpg`'s `executemany` method to perform **batch inserts** (e.g., 50-100 rows at a time) for efficiency and security (prevents SQL injection).
    *   Implement **error handling** for database operations.
    *   Consider `INSERT ... ON CONFLICT DO NOTHING/UPDATE` (upsert) if dealing with potential duplicates during re-runs.

**3. Local Development Setup:**

*   Install PostgreSQL locally (e.g., via Homebrew, Docker, installer).
*   Create a database (e.g., `pitchbook_data`) and a dedicated user/password for the scraper using `psql` or a GUI tool (DBeaver, pgAdmin).
*   Run the `CREATE TABLE` SQL statement in the local database.
*   Add local DB connection details (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) to the `.env` file.
*   Test the database connection and insertion logic from the Python script against the local database.

**4. Deployment to DigitalOcean:**

*   **Server:** Create a DigitalOcean Droplet (VPS). Choose region (e.g., Stockholm) and size (monitor RAM/CPU). Install OS (e.g., Ubuntu).
*   **Database:**
    *   **Option A (Self-Managed):** Install PostgreSQL directly on the Droplet. Requires manual management of backups, updates, scaling.
    *   **Option B (Managed - Recommended):** Use DigitalOcean's Managed PostgreSQL Database service. Handles admin tasks automatically but costs more. Obtain connection details from DO dashboard and configure trusted sources (allow Droplet IP).
*   **Code Deployment:**
    *   Install Python, pip, and `playwright` browsers (`playwright install`) on the Droplet.
    *   Transfer script (`pitchbook_scraper.py`), `requirements.txt`, `.env` to the Droplet (e.g., `scp`, `git`).
    *   Install Python dependencies (`pip install -r requirements.txt`).
    *   Configure `.env` on the Droplet with **production** database credentials. Secure the file (`chmod 600 .env`).
*   **Continuous Running (Process Management):**
    *   Use `systemd` (built-in) or `supervisor` (`sudo apt install supervisor`) to run the Python script as a background service.
    *   Configure the process manager to:
        *   Start the script on boot.
        *   Restart the script automatically if it crashes.
        *   Manage log files (capture stdout/stderr).
*   **Logging:** Enhance the Python script to write logs to a file for better debugging on the server.
*   **Monitoring:** Regularly check Droplet resource usage, script logs, and database growth/status.

**5. Stockholm IP Address:**

*   This requirement is handled at the infrastructure level, not within the script itself. The DigitalOcean Droplet needs to be located in the Stockholm region, or all traffic from the Droplet needs to be routed through a Stockholm-based proxy or VPN configured at the OS level on the Droplet. Playwright itself can be configured to use a proxy if needed, but setting it system-wide on the Droplet might be simpler if *all* traffic needs that origin. 