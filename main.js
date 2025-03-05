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
	// entity types
	company: "MjjKWSQhnZrSMqk3kdcp8s",
	jobOpening: "XrATaWAAV8TpT3Miuho8QB",
	skill: "3DrTkxF8UfNZMe68Dp9Zv2",
	// attributes and relations
	compRating: "CVRXNgt9nXG9aKrwbt2mUE",
	employer: "LTspwW2EM5std2mTGbLR6B",
	inCity: "BeyiZ6oLqLMaSXiG41Yxtf",
	maxSalary: "Hzdj1gPAhKEE1pn84GdEcW",
	minSalary: "YA6eJxicNjAaFAqrDTXgwj",
	payPeriod: "88twyx5CVc5Y25SY2oUZah",
	requires: "3G5QRUn5iJkkhzcWo69zYh",
	// specific entities
	cities: {
		"San Francisco": grc20.ContentIds.CITY_TYPE // TODO: replace with actual SF ID, this is ID of City Type
	}
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

function generateSeleniumDriver() {
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
	return driver
}

async function getGlassDoorLocInfo(query) {
	const driver = generateSeleniumDriver()
	const thisUrl = "view-source:https://www.glassdoor.com/autocomplete/location?locationTypeFilters=CITY,STATE,COUNTRY&caller=jobs&term=" + query

	await driver.manage().deleteAllCookies()
	console.log("Loading GD Loc info URL", thisUrl)
	driver.executeScript("Object.defineProperty(navigator, 'webdriver', {get: () => false})")
	await driver.get(thisUrl)
	const jsonStr = await driver.findElement(By.tagName("pre")).getAttribute("innerHTML")
	driver.quit()

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

		const salaryData = thisJob.header.payPeriodAdjustedPay

		const procJob = {
			title: thisJob.job.jobTitleText,
			company: thisJob.header.employer.name ?? thisJob.header.employerNameFromSearch ?? "[Unknown]",
			companyLogo: thisJob.overview.squareLogoUrl,
			companyRating: thisJob.header.rating,
			location: thisJob.header.locationName,
			cityName: locInfo.cityName,
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

// gets the raw buffers of image URLs
async function getImageBuffers(imageUrlList) {
	const rawImgBuffList = []
	const driver = generateSeleniumDriver()
	await driver.manage().deleteAllCookies()
	for (var i = 0; i < imageUrlList.length; i++) {
		await driver.get(imageUrlList[i])
		const imgElm = await driver.findElement(By.tagName("img"))
		const imgData = await imgElm.takeScreenshot()
		const imgBuff = Buffer.from(imgData, "base64")
		rawImgBuffList.push(imgBuff)
	}
	return rawImgBuffList
}

// converts jobs to triplet ops for Geo GRC-20
async function convertJobsToGeoOps(jobs, compLogoBuffs) {
	// cache of company names to Geo entity ID
	const companyGeoIdCache = {}
	// cache of job requirement to Geo entity ID
	const jobReqGeoIdCache = {}

	const allOps = []

	for (var i = 0; i < jobs.length; i++) {
		// get company entity or create it if it doesn't exist
		var thisCompanyId = companyGeoIdCache[jobs[i].company]
		if (thisCompanyId === undefined) {
			const searchRes = await geoFuzzySearch(jobs[i].company, GEO_ENT_IDS.company)
			if (searchRes.length == 0) { // no results
				const compProps = {
					[grc20.ContentIds.WEB_URL_ATTRIBUTE]: {value: "https://www.example.com", type: "URL"},
				}
				// set company rating if it is defined (zero is the placeholder value)
				if (jobs[i].companyRating > 0) {
					compProps[GEO_ENT_IDS.compRating] = {value: String(jobs[i].companyRating), type: "NUMBER"},
				}

				if (typeof jobs[i].companyLogo == "string") {
					const imgResult = await grc20.Graph.createImage({blob: new Blob([compLogoBuffs[i], {type:"image/png"}])})
					allOps.push(...imgResult.ops)
					compProps[grc20.ContentIds.AVATAR_ATTRIBUTE] = {to: imgResult.id}
				}

				// create the company entity
				const newComp = grc20.Graph.createEntity({
					name: jobs[i].company,
					description: "A company whose profile is cataloged from GlassDoor.",
					types: [GEO_ENT_IDS.company],
					properties: compProps
				})

				thisCompanyId = newComp.id
				companyGeoIdCache[jobs[i].company] = newComp.id
				allOps.push(...newComp.ops)
			} else {
				thisCompanyId = results[0].id
			}
		}

		// create the job entity
		const newJob = grc20.Graph.createEntity({
			name: `${jobs[i].title} @ ${jobs[i].company}`,
			types: [GEO_ENT_IDS.jobOpening],
			properties: {
				// value attributes
				[grc20.SystemIds.DESCRIPTION_ATTRIBUTE]: {value: jobs[i].shortDescription, type: "TEXT"},
				[GEO_ENT_IDS.minSalary]: {value: String(jobs[i].minSalary), type: "NUMBER"},
				[GEO_ENT_IDS.maxSalary]: {value: String(jobs[i].maxSalary), type: "NUMBER"},
				[GEO_ENT_IDS.payPeriod]: {value: jobs[i].payPeriod, type: "TEXT"},
				[grc20.ContentIds.WEB_URL_ATTRIBUTE]: {value: jobs[i].jobLink, type: "URL"},
				[grc20.ContentIds.PUBLISH_DATE_ATTRIBUTE]: {value: (new Date(jobs[i].approxPublishTime)).toISOString(), type: "TIME"},
				// relation attributes
				[GEO_ENT_IDS.employer]: {to: thisCompanyId},
				[grc20.ContentIds.CITIES_ATTRIBUTE]: {to: GEO_ENT_IDS.cities[jobs[i].cityName]}
			}
		})

		allOps.push(...newJob.ops)

		// set up required skills relations
		for (var ii = 0; ii < jobs[i].requiredSkills.length; ii++) {
			const thisSkillName = jobs[i].requiredSkills[ii]
			var thisSkillId = jobReqGeoIdCache[thisSkillName]
			if (thisSkillId == undefined) {
				const searchRes = await geoFuzzySearch(thisSkillName, GEO_ENT_IDS.skill)
				// create skill if it doesn't exist
				if (searchRes.length == 0) {
					const newSkill = grc20.Graph.createEntity({
						name: thisSkillName,
						description: "A skill cataloged from GlassDoor.",
						types: [GEO_ENT_IDS.skill]
					})

					thisSkillId = newSkill.id
					jobReqGeoIdCache[thisSkillName] = newSkill.id
					allOps.push(...newSkill.ops)
				} else {
					thisSkillId = searchRes[0].id
				}
			}

			const newSkillRelationOps = grc20.Relation.make({
				relationTypeId: GEO_ENT_IDS.requires,
				fromId: newJob.id,
				toId: thisSkillId
			})

			allOps.push(newSkillRelationOps)
		}
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
	console.log("Downloading company logo images...")
	const logoImgBuffs = await getImageBuffers(allJobs.map(j => j.companyLogo).filter(x => typeof x == "string"))
	console.log("Getting GRC-20 triplet ops from jobs...")
	const geoTripletOps = await convertJobsToGeoOps(allJobs, logoImgBuffs)
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

// optionally pass a requiredType parameter to only return results that match the type
async function geoFuzzySearch(query, requiredType = undefined) {
	const response = await fetch(`https://api-testnet.grc-20.thegraph.com/search?q=${query}&network=TESTNET`)
	const { results } = await response.json();
	if (results === undefined) return []
	if (requiredType === undefined) return results
	return results.filter(r => r.types.some(t => t.id == requiredType || t.name == requiredType))
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
