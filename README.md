# Geo Job Scraper
Job posting scraper that uploades data to [Geo Browser](https://www.geobrowser.io) (also a submission for the GRC-20 hackathon).

## Description
This is a web scraper that collects job postings from GlassDoor and publishes them on the decentralized knowledge graph [Geo](https://www.geobrowser.io). Currently it is still in testing, and instead uploads data to the [Geo Testnet](https://geogenesis-git-feat-testnet-geo-browser.vercel.app). Here is a high-level overview of how the whole routine works.
### Data Collection
There are three APIs that are used:
1. Autocomplete API from [Monster](https://www.monster.com)
2. Location API from [GlassDoor](https://www.glassdoor.com)
3. Job search API from [GlassDoor](https://www.glassdoor.com)
[Selenium Webdriver](https://www.npmjs.com/package/selenium-webdriver) is used to query the front-ends of the latter two APIs, and [cheerio](https://www.npmjs.com/package/cheerio) parses the resulting HTML. The `fetch` spec is used for Monster's job title autcomplete.

### Saving data to Geo
Data is formatted to the GRC-20 format and published to the Geo testnet (soon Geo mainnet) using [@graphprotocol/grc-20](https://www.npmjs.com/package/@graphprotocol/grc-20)

### `.env` File
You will need a `.env` file in the same directory as the `main.js` file to store configuration variables. Here is an explanation of the required keys:
* `GECKO_DRIVER_PATH`: The path to the Gecko executable (for `selenium-webdriver`). You could also use some Gecko mod, like [undetected_geckodriver](https://github.com/bytexenon/undetected_geckodriver)
* `FIREFOX_BIN_PATH`: Path to the Firefox binary.
* `GEO_TARGET_SPACE_ID`: The space on Geo with which the data is associated.
* `WEB3_PRIVATE_KEY`: Private key of a Web3 wallet that will do the smart contract calls.

## Usage
Generally, you want to run `node main` to do the main routine (collecting and uploading data). The `grc20-tools.js` file contains useful setup and management functions to interact with the data *ad hoc*.
