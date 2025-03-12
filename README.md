# Geo Job Scraper
Job posting scraper that uploades data to [Geo Browser](https://www.geobrowser.io) (also a submission for the GRC-20 hackathon).

## Setup & Usage

### Installation
0. Clone and `cd` into the repo
1. Install Node dependencies: `npm i`.
2. Create  a `.env` file (more info on that below).
3. *(Optional)* Configure entity IDs in `main.js`.
4. *(Optional)* Configure initial scraping parameters in `main()`.
5. Run `node main` for the main routine (scrape and upload data).
6. *(Optional)* Run and/or edit the `grc20-tools.js` file to interact with the data *ad hoc*.

### `.env` File
You will need a `.env` file in the same directory as the `main.js` file to store configuration variables. Here is an explanation of the required keys.
* `GECKO_DRIVER_PATH`: The path to the Gecko executable (for `selenium-webdriver`). You could also use some Gecko mod, like [undetected_geckodriver](https://github.com/bytexenon/undetected_geckodriver).
* `FIREFOX_BIN_PATH`: Path to the Firefox binary.
* `GEO_TARGET_SPACE_ID`: The space on Geo with which the data is associated.
* `WEB3_PRIVATE_KEY`: Private key of a Web3 wallet that will do the smart contract calls.
* `MAINNET` (optional): Set to `"true"` to use [Geo Genesis mainnet](https://www.geobrowser.io). All other values will be interpreted as `"false"`.

### Configurable Variables in the Code
There are several variables in `main.js` that are intended for configuration. These values are pre-set for testnet and mainnet, though may be edited if desired.
* `GEO_ENT_IDS`: Geo Entity IDs; found in the first lines of `main.js`.
* `letters`: An array of letters in the beginning of the `main()` function. Each letter will be queried in the [Monster](https://www.monster.com) autocomplete API. For example, the letter `"s"` could be mapped to `"Software Engineer"`.
* `cityList`: An array of cities for which jobs will be queried, using the [GlassDoor](https://www.glassdoor.com) website.
* `pageDepth`: The page depth for the GlassDoor API. Usually a value of `2` or `3` works.

## Routine
Here is a high-level overview of how the code works.
1. Initial setup variables are declared in `main.js`. These variables are `letters`, `cityList`, and `pageDepth`.
2. Job titles are obtained using the Monster autocomplete API for each letter in `letters`.
3. The [GlassDoor](https://www.glassdoor.com) website is used to get jobs for all combinations of job titles, cities, and page depth.
4. The job openings, companies, and skills are converted to the GRC-20 format using [@graphprotocol/grc-20](https://www.npmjs.com/package/@graphprotocol/grc-20).
5. Data is published.

[Selenium Webdriver](https://www.npmjs.com/package/selenium-webdriver) is used to query the front-ends of the GlassDoor service. The `fetch` spec is used for Monster's job title autcomplete.

### Debug mode
You can turn on "debug mode" by creating a directory named `"debug"` in the same level as the JS files. This will save all published operations to a JSON file in `/debug` for manual inspection. Commit names will also have an identifying tag appended at the end, e.g. `"Upload data to Geo (abf5e)"`.

## Ontology
Three types of entities are mostly dealt with: `Job opening`, `Company`, and `Skill`. In addition to name and description, here is the ontological structure.
* **Job opening**
	* Minimum salary *(number)*
	* Maximum salary *(number)*
	* Employer *(relation)*
	* Pay period *(text)*
	* Skill *(relation)*
	* Employment type *(relation)*
*  **Company**
	* Website *(URL)*
	* Date established *(Date-time)*
	* Company rating (GlassDoor) *(number)*
	* Avatar *(relation to image)*


## Deployments
* ["Hackathon glassdoor jobs" space](https://geogenesis-git-feat-testnet-geo-browser.vercel.app/space/CVQRHcnE9S2XN8GqHeqkZV) on testnet.
* [San Francisco space](https://www.geobrowser.io/space/Qs46y2TuFyVvgVV3QbbVW1?tabId=EhNvAfSg2bRMmzSxgcxhkn) on mainnet.
* [My personal page on mainnet](https://www.geobrowser.io/space/Sh32vjiVJ51mSrJrGQaxB1) has some additional content too.
