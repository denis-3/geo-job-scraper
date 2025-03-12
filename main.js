const fs = require("fs")
const { Builder, Browser, By, Key, until, Service } = require('selenium-webdriver')
const firefox = require("selenium-webdriver/firefox")
const child_process = require("child_process")
const crypto = require("crypto")
const https = require("https")
const http2 = require("http2")
const url = require("url")
const grc20 = require("@graphprotocol/grc-20")
const {
	publishOpsToSpace,
	getGeoEntitiesByAttributeValue,
	geoFuzzySearch
} = require("./grc20-tools.js")
require("dotenv").config()

const MAINNET = process.env.MAINNET === "true"

// Geo entity IDs
var GEO_ENT_IDS = null
if (MAINNET) {
	GEO_ENT_IDS = {
		// spaces
		targetSpace: process.env.GEO_TARGET_SPACE_ID,
		// entity types
		company: "9vk7Q3pz7US3s2KePFQrJT",
		jobOpening: "RaMe9z4ZwLnHvMJeQL7ZNk",
		skill: "LLx1gxshUy1TFKnSKVG9W6",
		// attributes and relations
		compRating: "4coPj4v66vSSrSSppZfCAh",
		employer: "V7XvcnLXtbj7T2rvdNtKid",
		maxSalary: "Fw48wUrm7oD9z4JbT2K4G2",
		minSalary: "DQA5H2ffqiLGbSnSx27TtN",
		payPeriod: "Q2rGKSbSwfqqDM4XXvezsm",
		requires: "MCCkmuwQ7PY1GFYpgcmSHv",
		yearEst: "MEsV4scGto8ZxoTz9n9KqD",
		employmentType: "BLCNN8nrcU6T6NLu2QDQtw",
		// specific entities
		cities: {
			"Bay Area": "W5ZEpuy3Tij1XSXtJLruQ5",
			"San Francisco": "3qayfdjYyPv1dAYf8gPL5r"
		},
		employmentTypes: {
			"Full-time": "GXE2AJLVKLFjDvsWcNaAEM",
			"In-person": "ToEDDgFcymwVCMrZEKWS88",
			"Hybrid work": "2VXZVTjZ1SsXRAc5Hyor7c",
			"Remote": "UeM4M31P1wU5isw9yyphPo"
		}
	}
} else {
	GEO_ENT_IDS = {
		// spaces
		targetSpace: process.env.GEO_TARGET_SPACE_ID,
		// entity types
		company: "FfaawFDkXPFCREizUeoAGr",
		jobOpening: "8qLhn73tAYAzzV7zXw16oq",
		skill: "LLx1gxshUy1TFKnSKVG9W6",
		// attributes and relations
		compRating: "2nmhNqZh4PPESxnJiYbUmm",
		employer: "Rx4CyKcyYBBoYNitxV9EFa",
		maxSalary: "TTDMDLnFxRuMCZQ8jG9Z1i",
		minSalary: "KKX1RCvBJY6ygbi5oNmqtC",
		payPeriod: "Xw21jBrkjx8aDcEuwHhJfD",
		requires: "MCCkmuwQ7PY1GFYpgcmSHv",
		yearEst: "B7uF3YYNWjkMJvTVBKWDgG",
		employmentType: "BLCNN8nrcU6T6NLu2QDQtw",
		// specific entities
		cities: {
			"Bay Area": "RHoJT3hNVaw7m5fLLtZ8WQ", // this is actually California
			"San Francisco": "3sQ28X1isy9abvvRroVigx"
		},
		employmentTypes: {
			"Full-time": "HU5ENnhnC9T17wygLxgypr",
			"In-person": "3QNTsFttzYFNxeGu7KHygD",
			"Hybrid work": "VGiWcX7DiXZmv2bzAaMxWE",
			"Remote": "QBKxqZbaX41hEu6XjWC6qv"
		}
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
	return resp.result.map(jt => jt.text).slice(0, 1)
}

function generateSeleniumDriver() {
	const ffService = new firefox.ServiceBuilder(process.env.GECKO_DRIVER_PATH)
	const ffOpts = new firefox.Options()
		.setBinary(process.env.FIREFOX_BIN_PATH)
		.addArguments("--headless")
		.addArguments("--width=1200")
		.addArguments("--height=800")
		.setPreference("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.3" + String(Math.random()))
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
	await driver.quit()

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
	const processedCompanies = {}
	for (var i = 0; i < rawJobsData.length; i++) {
		const thisJob = rawJobsData[i]

		// Process job
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

		var payPeriod = thisJob.header.payPeriod
		// normalize capitalization
		if (typeof payPeriod == "string") {
			switch(payPeriod) {
				case "ANNUAL":
					payPeriod = "Annual"
					break
				case "HOURLY":
					payPeriod = "Hourly"
					break
				case "MONTHLY":
					payPeriod = "Monthly"
					break
				default:
					throw Error("Unknown pay period: " + payPeriod)
			}
		}

		// Process company
		const compName = thisJob.header.employer.name ?? thisJob.header.employerNameFromSearch
		processedCompanies[compName] ??= {
			logo: thisJob.overview.squareLogoUrl,
			rating: thisJob.header.rating,
			revenue: thisJob.overview.revenue,
			employees: thisJob.overview.size,
			website: thisJob.overview.website,
			yearFounded: thisJob.overview.yearFounded,
		}
		if (typeof processedCompanies[compName]?.website == "string" && !processedCompanies[compName].website.startsWith("http")) {
			processedCompanies[compName].website = "https://" + processedCompanies[compName].website
		}

		const procJob = {
			title: thisJob.job.jobTitleText,
			company: compName,
			location: thisJob.header.locationName,
			cityName: locInfo.cityName,
			shortDescription: thisJob.job.descriptionFragmentsText.join("\n"),
			minSalary: salaryData?.p10 ?? null,
			maxSalary: salaryData?.p90 ?? null,
			payPeriod: payPeriod,
			payCurrency: thisJob.header.payCurrency ?? null,
			requiredSkills: skillsNames,
			otherAttributes: otherAttrs,
			jobLink: thisJob.header.seoJobLink,
			approxPublishTime: Date.now() - thisJob.header.ageInDays * 24 * 60 * 60 * 1000
		}
		processedJobs.push(procJob)
	}

	return {companies: processedCompanies, jobs: processedJobs, newCookie: extractCookiesFromHeaders(resp.headers)}
}

// gets the raw buffers of image URLs
async function getImageBuffers(imageUrlList) {
	const rawImgBuffList = []
	const driver = generateSeleniumDriver()
	await driver.manage().deleteAllCookies()
	for (var i = 0; i < imageUrlList.length; i++) {
		if (typeof imageUrlList[i] != "string") {
			rawImgBuffList.push(undefined)
			continue
		}
		await driver.get(imageUrlList[i])
		const imgElm = await driver.findElement(By.tagName("img"))
		const imgData = await imgElm.takeScreenshot()
		const imgBuff = Buffer.from(imgData, "base64")
		rawImgBuffList.push(imgBuff)
	}
	await driver.quit()
	return rawImgBuffList
}

// converts jobs to triplet ops for Geo GRC-20
async function convertJobsToGeoOps(jobs, companies) {
	// cache of company names to Geo entity ID
	const companyGeoIdCache = {}
	// cache of company IDs to their avatar
	const companyGeoAvatarIdCache = {}
	// cache of job requirement to Geo entity ID
	const jobReqGeoIdCache = {}

	const allOps = []

	// process companies first
	for (const compName in companies) {
		// get company entity or create it if it doesn't exist
		const tc = companies[compName] // this company
		var thisCompanyId = companyGeoIdCache[compName]
		if (thisCompanyId === undefined) {
			const searchRes = await geoFuzzySearch(compName, GEO_ENT_IDS.company)
			if (searchRes.length == 0) { // no results
				const compProps = {}
				// set company rating if it is defined (zero is the placeholder value)
				if (tc.rating > 0) {
					compProps[GEO_ENT_IDS.compRating] = {value: String(tc.rating), type: "NUMBER"}
				}

				var imgResult = null
				if (tc.logoBuff !== undefined) {
					imgResult = await grc20.Graph.createImage({blob: new Blob([tc.logoBuff, {type:"image/png"}])})
					allOps.push(...imgResult.ops)
					compProps[grc20.ContentIds.AVATAR_ATTRIBUTE] = {to: imgResult.id}
				}

				if (typeof tc.yearFounded == "number") {
					compProps[GEO_ENT_IDS.yearEst] = {value: `${tc.yearFounded}-01-01T00:00:00.000Z`, type: "TIME"}
				}

				if (typeof tc.website == "string") {
					compProps[grc20.ContentIds.WEB_URL_ATTRIBUTE] = {value: tc.website, type: "URL"}
				}

				var description = "A company whose profile is cataloged from GlassDoor."
				if (typeof tc.revenue == "string" && typeof tc.employees == "string") {
					if (!tc.revenue.startsWith("Unknown") && !tc.employees.startsWith("Unknown")) {
						description += ` ${compName} has a revenue of about ${tc.revenue}, with ${tc.employees}.`
					} else if (!tc.revenue.startsWith("Unknown")) {
						description += ` It has a revenue of about ${tc.revenue}.`
					} else if (!tc.employees.startsWith("Unknown")) {
						description += ` It has ${tc.employees}.`
					}
				}

				// create the company entity
				const newComp = grc20.Graph.createEntity({
					name: compName,
					description: description,
					types: [GEO_ENT_IDS.company],
					properties: compProps
				})

				// save the new company id and avatar id to cache
				companyGeoIdCache[compName] = newComp.id
				companyGeoAvatarIdCache[newComp.id] = imgResult?.id
				allOps.push(...newComp.ops)
			} else {
				// save the found company id and avatar id to cache
				companyGeoIdCache[compName] = searchRes[0].id
				companyGeoAvatarIdCache[searchRes[0].id] = searchRes[0].relations.find(r => r.typeId == grc20.ContentIds.AVATAR_ATTRIBUTE)?.toEntityId
			}
		}
	}

	for (var i = 0; i < jobs.length; i++) {
		const jobLinkQuery = await getGeoEntitiesByAttributeValue(grc20.ContentIds.WEB_URL_ATTRIBUTE, jobs[i].jobLink)
		// check if job already exists, and is not deleted
		if (jobLinkQuery.length > 0 && jobLinkQuery?.[0]?.triples?.length > 0) continue // TODO: Later, the code should update job postings
		var payCurrencyGeoId = ""
		switch(jobs[i].payCurrency) {
			case "USD":
				payCurrencyGeoId = "2eGL8drmSYAqLoetcx3yR1"
				break
			case "EUR":
				payCurrencyGeoId = "EWCAJP9TQoZ3EhcwyRg7mk"
				break
			default:
				throw Error("Unknown currency " + jobs[i].payCurrency)
		}

		const jobPublishTime = (new Date(jobs[i].approxPublishTime))
			.toISOString()
			.slice(0, 11) + "00:00:00.000Z"
		// create the job entity
		const jobProps = {
			// value attributes
			[grc20.ContentIds.WEB_URL_ATTRIBUTE]: {value: jobs[i].jobLink, type: "URL"},
			[grc20.ContentIds.PUBLISH_DATE_ATTRIBUTE]: {value: jobPublishTime, type: "TIME"},
			// relation attributes
			[grc20.ContentIds.LOCATION_ATTRIBUTE]: {to: GEO_ENT_IDS.cities["Bay Area"]}
		}

		// add some extra properties if applicable
		if (jobs[i].company != "Confidential" && typeof jobs[i].company == "string" && companyGeoIdCache[jobs[i].company] != "AJpKRzyn9hGfC3r9fvVaRr") {
			jobProps[GEO_ENT_IDS.employer] = {to: companyGeoIdCache[jobs[i].company]}
		}

		if (typeof jobs[i].minSalary == "number") {
			jobProps[GEO_ENT_IDS.minSalary] = {value: String(jobs[i].minSalary), type: "NUMBER", options: {unit: payCurrencyGeoId}}
		}

		if (typeof jobs[i].maxSalary == "number") {
			jobProps[GEO_ENT_IDS.maxSalary] = {value: String(jobs[i].maxSalary), type: "NUMBER", options: {unit: payCurrencyGeoId}}
		}

		if (typeof jobs[i].payPeriod == "string") {
			jobProps[GEO_ENT_IDS.payPeriod] = {value: jobs[i].payPeriod, type: "TEXT"}
		}

		const compAvatarId = companyGeoAvatarIdCache[companyGeoIdCache[jobs[i].company]]
		if (typeof compAvatarId == "string") {
			jobProps[grc20.ContentIds.AVATAR_ATTRIBUTE] = {to: compAvatarId}
		}

		const newJob = grc20.Graph.createEntity({
			name: `${jobs[i].title} @ ${jobs[i].company}`,
			types: [GEO_ENT_IDS.jobOpening],
			properties: jobProps
		})

		const textBlockOps = grc20.TextBlock.make({
			fromId: newJob.id,
			text: jobs[i].shortDescription
		})

		allOps.push(...newJob.ops, ...textBlockOps)

		// additionally add San Francisco if job is in it
		if (jobs[i].location.includes("San Francisco")) {
			allOps.push(grc20.Relation.make({
				fromId: newJob.id,
				relationTypeId: grc20.ContentIds.LOCATION_ATTRIBUTE,
				toId: GEO_ENT_IDS.cities["San Francisco"]
			}))
		}

		// finally, check other attributes
		for (var ii = 0; ii < jobs[i].otherAttributes.length; ii++) {
			const otherAttr = jobs[i].otherAttributes[ii]
			if (GEO_ENT_IDS.employmentTypes[otherAttr] !== undefined) {
				allOps.push(grc20.Relation.make({
					fromId: newJob.id,
					relationTypeId: GEO_ENT_IDS.employmentType,
					toId: GEO_ENT_IDS.employmentTypes[otherAttr]
				}))
			}
		}

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
	const letters = "seabfd".split("")
	const cityList = ["San Francisco"]
	const pageDepth = 2

	console.log("Getting job titles...")
	const jobTitles = ["Data Analyst", "Backend Developer"]
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
	const allCompanies = {}

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
				const jHash = quickSha256(j.jobLink)
				if (!allJobHashes.includes(jHash)) {
					allJobs.push(j)
					allJobHashes.push(jHash)
					newJobCount ++
				}
			})
			for (const newCompName in gdScrapeRes.companies) {
				allCompanies[newCompName] ??= gdScrapeRes.companies[newCompName]
			}
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

	for (const compName in allCompanies) {
		if (!allJobs.some(j => j.company == compName)) {
			delete allCompanies[compName]
		}
	}

	console.log("~~~Scraping metrics~~~")
	console.log("Success ratio:", successCount, "/", totalCount)
	console.log("Total jobs:", allJobs.length)

	// save to CSV if needed
	// jsonToCsv(allJobs, "gd-scrape", ["title", "company", "companyLogo", "companyRating",
		//"location", "minSalary", "maxSalary", "payPeriod", "shortDescription",
		//"requiredSkills", "otherAttributes", "jobLink"])

	// upload to Geo
	console.log("Downloading company logo images...")
	const logoImgBuffs = await getImageBuffers(Object.values(allCompanies).map(c => c.logo))
	Object.keys(allCompanies).forEach((c, i) => {
		allCompanies[c].logoBuff = logoImgBuffs[i]
	})
	console.log("Getting GRC-20 triplet ops from jobs...")
	const geoTripletOps = await convertJobsToGeoOps(allJobs, allCompanies)
	console.log("Uploading data to Geo...")
	const txInfo = await publishOpsToSpace(GEO_ENT_IDS.targetSpace, geoTripletOps, "Add job openings from GlassDoor")
	console.log("Data uploaded! Transaction info:", txInfo)
}

main()

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
