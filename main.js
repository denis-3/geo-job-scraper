const fs = require("fs")
const { Builder, Browser, By, Key, until, Service } = require('selenium-webdriver')
const firefox = require("selenium-webdriver/firefox")
const child_process = require("child_process")
const crypto = require("crypto")
const cheerio = require("cheerio")
const https = require("https")
const http2 = require("http2")
const url = require("url")
const grc20 = require("@graphprotocol/grc-20")
const { publishOpsToSpace } = require("./grc20-tools.js")
require("dotenv").config()

// Geo entity IDs
const GEO_ENT_IDS = {
	// spaces
	targetSpace: "CVQRHcnE9S2XN8GqHeqkZV",
	// entities
	company: "7ZpyzJE2Zh62FpmVu5Wkc1",
	jobOpening: "RvttaELRF1CRagzW2ZajjT",
	// attributes
	employer: "QoFc3JhedpbXqbo7dcySVP",
	minSalary: "GAXHVCav3evrBkWhWwD2K4",
	maxSalary: "Mg4FEdvC8VskHT9kUyjDYK",
	payPeriodId: "8zuGZYesZW4UMmSCTCnhNE",
	reqSkills: "PouZHsLxKo9F7acqJ3Aggc",
	compRating: "6mXHF5mmfk9nfUtudQdCgH",
}

// standard headers for scraping
const STANDARD_HEADERS = {
	"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.1",
	"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.5",
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"DNT": "1",
	"Sec-GPC": "1",
	"Connection": "keep-alive",
	"Upgrade-Insecure-Requests": "1",
	"Upgrade-Insecure-Requests": "1",
	"Sec-Fetch-Dest": "document",
	"Sec-Fetch-Mode": "navigate",
	"Sec-Fetch-Site": "none",
	"Sec-Fetch-User": "?1",
	"Priority": "u=0, i",
	"TE": "trailers"
}

// shuffle around node ciphers for scraping
const NC = crypto.constants.defaultCoreCipherList.split(":")
const STANDARD_CIPHERS = shuffle(NC.slice(0, 3)).join(":") + ":" + shuffle(NC.slice(3, 9999)).join(":")

async function getMonsterJobTitles(query) {
	const req = await fetch("https://appsapi.monster.io/jobs-typeahead-service/v1/title?apikey=nQkzvboJoLLuD9x86DzDlVTsj5YvdWaK&locale=en-us&query=" + query, {
	    "headers": {
	        "User-Agent": "eshjggfs",
	        "Accept": "*/*",
	        "Accept-Language": "en-US,en;q=0.5",
	        "Sec-GPC": "1",
	        "Sec-Fetch-Dest": "empty",
	        "Sec-Fetch-Mode": "cors",
	        "Sec-Fetch-Site": "cross-site",
	        "Priority": "u=4"
	    },
	    "referrer": "https://www.monster.com/",
	    "method": "GET",
	});
	const resp = await req.json()
	return resp.result.map(jt => jt.text).slice(0, 2)
}

async function getGlassDoorLocInfo(query) {
	const ffService = new firefox.ServiceBuilder(process.env.GECKO_DRIVER_PATH)
	const ffOpts = new firefox.Options()
		.setBinary(process.env.FIREFOX_BIN_PATH)
		.addArguments("--headless")
		.addArguments("--width=1200")
		.addArguments("--height=800")
		.setPreference("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.3" + String(Math.random()))
		.setPreference("dom.webdriver.enabled", false)
		.setPreference("useAutomationExtension", false)
	const driver = new Builder().forBrowser("firefox")
		.setFirefoxService(ffService)
		.setFirefoxOptions(ffOpts)
		.build()
	const thisUrl = "view-source:https://www.glassdoor.com/autocomplete/location?locationTypeFilters=CITY,STATE,COUNTRY&caller=jobs&term=" + query
	var jsonStr = ""
	try {
		await driver.manage().deleteAllCookies()
		console.log("Loading GD Loc info URL", thisUrl)
		driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => false})")
		await driver.get(thisUrl)
		jsonStr = await driver.findElement(By.tagName("pre")).getAttribute("innerHTML")
	} catch (e) {
		console.error(e)
	} finally {
		driver.quit()
	}

	const data = JSON.parse(jsonStr)[0]
	const returnData = {
		id: data.id,
		cityName: data.cityName,
		stateAbbreviation: data.stateAbbreviation,
		country2LetterIso: data.country2LetterIso
	}

	return returnData
}

async function scrapeGlassDoor(jobQuery, locInfo, jobCount, pageNum, gdCookie) {
	// calculate slug first
	const slugBase1 = (locInfo.cityName + "-" + locInfo.stateAbbreviation + "-" + locInfo.country2LetterIso)
		.replaceAll(" ", "-").toLowerCase()
	const slugBase2 = jobQuery.replaceAll(" ", "-").toLowerCase()
	const seoSlug = slugBase1 + "-" + slugBase2 + "-jobs"
	const techSlug = "IL.0," + String(slugBase1.length)
		+ "_IC" + String(locInfo.id) + "_KO" + String(slugBase1.length+1) + ","
		+ String(slugBase1.length+slugBase2.length+1)

	const reqHeaders = injectCookies({
		"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0",
		"Accept": "*/*",
		"Accept-Language": "en-US,en;q=0.5",
		"Content-Type": "application/json",
		"gd-csrf-token": "A",
		"x-gd-job-page": "serp",
		"apollographql-client-name": "job-search-next",
		"apollographql-client-version": "7.135.0-hotfix-dns-caching.2",
		"Sec-GPC": "1",
		"Sec-Fetch-Dest": "empty",
		"Sec-Fetch-Mode": "cors",
		"Sec-Fetch-Site": "same-origin",
		"Alt-Used": "www.glassdoor.com",
		"Priority": "u=0, i",
		"Referrer": "https://www.glassdoor.com/"
	}, gdCookie)

	const reqBody = fs.readFileSync("gd-graphql-body.txt").toString("utf8")
		.replaceAll("{{KEYWORDS}}", jobQuery)
		.replaceAll("{{CITY_ID}}", locInfo.id)
		.replaceAll("{{JOB_COUNT}}", jobCount)
		.replaceAll("{{SEO_SLUG}}", seoSlug)
		.replaceAll("{{TECH_SLUG}}", techSlug)
		.replaceAll("{{PAGE_NUMBER}}", pageNum)

	const resp = await httpsFetch("https://www.glassdoor.com/graph", {
		headers: reqHeaders,
		body: reqBody,
		method: "POST",
	});

	if (resp.status !== 200) {
		throw Error("Glass door scrape failed with status" + String(resp.status))
	}

	const rawJobsData = JSON.parse(resp.text)[0].data.jobListings.jobListings
		.map(j => j.jobview)

	fs.writeFileSync("rawJobsGd.json", JSON.stringify(rawJobsData, null, 1))

	const processedJobs = []
	for (var i = 0; i < rawJobsData.length; i++) {
		const thisJob = rawJobsData[i]

		// skills and attrs //
		const thisJobAttrHeader = thisJob.header.indeedJobAttribute
		const skillsNames = []
		const otherAttrs = []
		thisJobAttrHeader.extractedJobAttributes.forEach(a => {
			if (thisJobAttrHeader.skills.includes(a.key)) {
				skillsNames.push(a.value)
			} else {
				otherAttrs.push(a.value)
			}
		});

		// salary //
		const salaryData = thisJob.header.payPeriodAdjustedPay
		// var salaryStr = ""
		// if (salaryData !== null) {
		// 	salaryStr = salaryData.p10 + " - " + salaryData.p90 + " " + thisJob.header.payCurrency
		// 	if (thisJob.header.payPeriod == "ANNUAL") {
		// 		salaryStr += "/year"
		// 	} else if (thisJob.header.payPeriod == "HOURLY") {
		// 		salaryStr += "/hour"
		// 	}
		// }

		const procJob = {
			title: thisJob.job.jobTitleText,
			company: thisJob.header.employer.name ?? thisJob.header.employerNameFromSearch ?? "[Unknown]",
			companyLogo: thisJob.overview.squareLogoUrl,
			companyRating: thisJob.header.rating,
			location: thisJob.header.locationName,
			shortDescription: thisJob.job.descriptionFragmentsText.join("\n"),
			minSalary: salaryData?.p10 ?? null,
			maxSalary: salaryData?.p90 ?? null,
			payPeriod: thisJob.header.payPeriod ?? null,
			payCurrency: thisJob.header.payCurrency ?? null,
			requiredSkills: skillsNames,
			otherAttributes: otherAttrs,
			jobLink: thisJob.header.seoJobLink,
			approxPublishTime: Date.now() - thisJob.header.ageInDays * 24 * 60 * 60 * 1000
		}
		processedJobs.push(procJob)
	}

	return {jobs: processedJobs, newCookie: extractCookiesFromHeaders(resp.headers)}
}

// converts jobs to triplet ops for Geo GRC-20
async function convertJobsToGeoOps(jobs) {
	// cache of company names to Geo entity ID
	const companyGeoIdCache = {}

	const allOps = []

	for (var i = 0; i < jobs.length; i++) {
		const thisId = grc20.Id.generate()

		// get company entity or create it if it doesn't exist
		var thisCompanyId = companyGeoIdCache[jobs[i].company]
		if (thisCompanyId === undefined) {
			const searchRes = await geoFuzzySearch(jobs[i].company)
			if (searchRes.length == 0) { // no results
				const compProps = {
					[grc20.SystemIds.DESCRIPTION_ATTRIBUTE]: {value: "A company whose profile is scraped from the GlassDoor website.", type: "TEXT"},
					[GEO_ENT_IDS.compRating]: {value: String(jobs[i].companyRating*10), type: "NUMBER"},
					[grc20.ContentIds.WEB_URL_ATTRIBUTE]: {value: "https://www.example.com", type: "URL"},
				}

				const imgResult = typeof jobs[i].companyLogo == "string" ? grc20.Image.make(jobs[i].companyLogo) : undefined
				if (imgResult !== undefined) {
					compProps[grc20.ContentIds.AVATAR_ATTRIBUTE] = {to: imgResult.imageId}
				}

				// create the company entity
				const newComp = grc20.Graph.createEntity({
					name: jobs[i].company,
					types: [GEO_ENT_IDS.company],
					properties: compProps
				})
				allOps.push(...newComp.ops)

				thisCompanyId = newComp.id
			} else {
				thisCompanyId = results[0].id
			}
		}

		console.log(jobs[i])
		throw Error("fkgjk")

		// create the job entity
		const newJob = grc20.Graph.createEntity({
			name: jobs[i].title,
			types: [GEO_ENT_IDS.jobOpening],
			properties: {
				// value attributes
				[grc20.SystemIds.DESCRIPTION_ATTRIBUTE]: {value: jobs[i].shortDescription, type: "TEXT"},
				[grc20.ContentIds.LOCATION_ATTRIBUTE]: {value: jobs[i].location, type: "TEXT"},
				[GEO_ENT_IDS.minSalary]: {value: String(jobs[i].minSalary), type: "NUMBER"},
				[GEO_ENT_IDS.maxSalary]: {value: String(jobs[i].maxSalary), type: "NUMBER"},
				[GEO_ENT_IDS.payPeriod]: {value: jobs[i].payPeriod, type: "TEXT"},
				[grc20.ContentIds.WEB_URL_ATTRIBUTE]: {value: jobs[i].jobLink, type: "URL"},
				[grc20.ContentIds.PUBLISH_DATE_ATTRIBUTE]: {value: (new Date(jobs[i].approxPublishTime)).toISOString(), type: "TIME"},
				// relation attributes
				[GEO_ENT_IDS.employer]: {to: thisCompanyId}
			}
		})
		allOps.push(...newJob.ops)
	}

	return allOps
}

async function main() {
	// main scrape config
	const letters = "e".split("")
	const cityList = ["San Francisco"]
	const pageDepth = 1

	console.log("Getting job titles...")
	const jobTitles = []
	for (var i = 0; i < letters.length; i++) {
		const newJobTitles = await getMonsterJobTitles(letters[i])
		jobTitles.push(...newJobTitles)
	}
	console.log("Job titles:", jobTitles)

	var successCount = 0
	const totalCount = cityList.length * jobTitles.length * pageDepth
	const allJobs = []
	const allJobHashes = []
	var jobCt = [0, 0, 0] // count by city, job title, page
	const jobCtLimits = [jobTitles.length, pageDepth] // job counting limits: job title, page

	console.log("Getting city info...")
	const cityInfoList = []
	for (var i = 0; i < cityList.length; i++) {
		const cityInfo = await getGlassDoorLocInfo(cityList[i])
		cityInfoList.push(cityInfo)
	}
	console.log("City info:", cityInfoList)

	console.log("Starting main scrape...")
	const gdCookie = {}
	// get the job (glassdoor)
	for (var i = 0; i < totalCount; i++) {
		try {
			const gdScrapeRes = await scrapeGlassDoor(jobTitles[jobCt[1]], cityInfoList[jobCt[0]], 30, jobCt[2], gdCookie)
			var newJobCount = 0
			gdScrapeRes.jobs.forEach(j => {
				const jHash = quickSha256(j.title + j.jobLink)
				if (!allJobHashes.includes(jHash)) {
					allJobs.push(j)
					allJobHashes.push(jHash)
					newJobCount ++
				}
			})
			for (const key in gdScrapeRes.newCookie) {
				gdCookie[key] = gdScrapeRes.newCookie[key]
			}
			successCount ++
			jobCt = arrayCountUp(jobCt, jobCtLimits)
			console.log("Iteration", i, ", got", newJobCount, "jobs")
		} catch (e) {
			console.error(e)
		}
	}

	allJobs.length = 10

	console.log("~~~Scraping metrics~~~")
	console.log("Success ratio:", successCount, "/", totalCount)
	console.log("Total jobs:", allJobs.length)

	// save to CSV if needed
	// jsonToCsv(allJobs, "gd-scrape", ["title", "company", "companyLogo", "companyRating",
		//"location", "minSalary", "maxSalary", "payPeriod", "shortDescription",
		//"requiredSkills", "otherAttributes", "jobLink"])

	// upload to Geo
	console.log("Getting GRC-20 triplet ops from jobs...")
	const geoTripletOps = await convertJobsToGeoOps(allJobs)
	console.log("Uploading data to Geo...")
	const txInfo = await publishOpsToSpace(GEO_ENT_IDS.targetSpace, geoTripletOps, "Add data from GlassDoor scrape")
	console.log("Data uploaded! Transaction info:", txInfo)
}

main()

async function millis(ct) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve()
		}, ct)
	})
}

// fetch with https library
function httpsFetch(urlStr, options) {
	console.log("Requesting URL", urlStr)
	return new Promise(function (resolve, reject) {
		const headers = JSON.parse(JSON.stringify(options.headers))
		if (options.method == "POST") {
			if (options.body == undefined) {
				throw Error("No post body!")
			}

			headers["Content-Length"] ??= Buffer.byteLength(options.body, "utf8")
		}

		const pUrl = url.parse(urlStr)
		const reqOpts = {
			hostname: pUrl.hostname,
			port: pUrl.protocol == "https:" ? 443 : 80,
			path: pUrl.path,
			headers: headers,
			method: options.method ?? "GET",
			ciphers: STANDARD_CIPHERS,
			gzip: true
		}

		const req = https.request(reqOpts, (res) => {
			res.on("data", (d) => {
				data += String(d)
			})

			res.on("end", () => {
				resolve({ status: res.statusCode, text: data, headers: res.headers})
			})
		} )

		var data = ""

		req.on("error", (e) => {
			reject(e)
		})

		if (options.method == "POST") req.write(options.body)
		req.end()
	})
}

async function geoFuzzySearch(query) {
	const response = await fetch(`https://api-testnet.grc-20.thegraph.com/search?q=${query}&network=TESTNET`)
	const { results } = await response.json();
	if (results === undefined) return []
	return results
}

function jsonToCsv(initData, filename, rows) {
	// const initData = JSON.parse(fs.readFileSync(`./${filename}.json`))
	if (!Array.isArray(initData)) throw Error("Data is not an array")
	var csvData = rows.join(",") + "\n"
	initData.forEach(elm => {
		rows.forEach(rowName => {
			const strVal = String(elm[rowName])
			csvData += `"${strVal.replaceAll("\"", "\"\"").replaceAll("\n", "\\n").replaceAll(",", "\\,")}",` ?? ","
		});
		csvData = csvData.slice(0, -1)
		csvData += "\n"
	});
	fs.writeFileSync(`./${filename}.csv`, csvData.slice(0, -1))
}

function quickSha256(inp) {
	return crypto.createHash("sha256").update(inp).digest("hex")
}

// fisher yates shuffle
function shuffle(array) {
	var currentIndex = array.length, temporaryValue, randomIndex;

	while (0 !== currentIndex) {
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
}

function extractCookiesFromHeaders(headers) {
	const ck = {}
	if (headers["set-cookie"] == undefined) return ck
	headers["set-cookie"].forEach((str) => {
		const idx = str.indexOf("=")
		const idx2 = str.indexOf(";")
		ck[str.slice(0, idx)] = str.slice(idx+1, idx2)
	})
	return ck
}

function injectCookies(headers, cookiesObj) {
	headers["Cookie"] = Object.entries(cookiesObj).map(e => e.join("=")).join("; ")
	return headers
}

function getHeadersFromFile(filePath) {
	const fileStr = fs.readFileSync(filePath).toString("utf8").trim()
	const headers = {}
	fileStr.split("\n").forEach(l => {if (companies[jobs.company])
		l = l.trim()
		const idx = l.indexOf(":")
		headers[l.slice(0, idx)] = l.slice(idx+1, 9999)
	})
	return headers
}

// Counting with different bases; the first digit has no counting limit
// little endian
function arrayCountUp(currentCount, countLimits) {
	if (currentCount.length-1 != countLimits.length) throw Error("Current count should be one more length than count limit")
	currentCount[currentCount.length - 1] ++
	var carry = false
	for (var i = currentCount.length-1; i >= 0; i--) {
		if (carry == true) {
			currentCount[i] ++
			carry = false
		}

		if (i > 0 && currentCount[i] >= countLimits[i-1]) {
			currentCount[i] = 0
			carry = true
		}
	}
	return currentCount
}

// extract company information from jobs list
function getCompaniesFromJobs(jobs) {
	const companies = {}
	for (var i = 0; i < jobs.length; i++) {
		companies[jobs[i].company] ??= {name: jobs[i].company, logo: jobs[i].companyLogo, rating: jobs[i].companyRating}
	}
	return Object.entries(companies)
}
