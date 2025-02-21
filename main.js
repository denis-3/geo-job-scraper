const fs = require("fs")
const { Builder, Browser, By, Key, until, Service } = require('selenium-webdriver')
const firefox = require("selenium-webdriver/firefox")
const child_process = require("child_process")
const crypto = require("crypto")
const cheerio = require("cheerio")
const https = require("https")
const http2 = require("http2")
const url = require("url")

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

// node ciphers
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
	const ffService = new firefox.ServiceBuilder("/usr/bin/geckodriver")
	const ffOpts = new firefox.Options()
		.setBinary("/path/to/binary/")
		.addArguments("--headless")
		.addArguments("--width=1200")
		.addArguments("--height=800")
		.setPreference("general.useragent.override", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.3")
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
		var salaryStr = ""
		if (salaryData != null) {
			salaryStr = salaryData.p10 + " - " + salaryData.p90 + " " + thisJob.header.payCurrency
			if (thisJob.header.payPeriod == "ANNUAL") {
				salaryStr += " /year"
			} else if (thisJob.header.payPeriod == "HOURLY") {
				salaryStr += " /hour"
			}
		}

		const procJob = {
			title: thisJob.job.jobTitleText,
			company: thisJob.header.employer.name ?? thisJob.header.employerNameFromSearch ?? "[Unknown]",
			companyLogo: thisJob.overview.squareLogoUrl,
			companyRating: thisJob.header.rating,
			location: thisJob.header.locationName,
			shortDescription: thisJob.job.descriptionFragmentsText.join("\n"),
			salary: salaryStr,
			requiredSkills: skillsNames,
			otherAttributes: otherAttrs,
			jobLink: thisJob.header.seoJobLink
		}
		processedJobs.push(procJob)
	}

	return {jobs: processedJobs, newCookie: extractCookiesFromHeaders(resp.headers)}
}

async function main() {
	// main scrape config
	const letters = "ets".split("")
	const cityList = ["San Francisco", "San Jose"]
	const pageDepth = 4

	const jobTitles = []
	for (var i = 0; i < letters.length; i++) {
		const newJobTitles = await getMonsterJobTitles(letters[i])
		jobTitles.push(...newJobTitles)
	}
	console.log("Job titles", jobTitles)
	var successCount = 0
	const totalCount = cityList.length * jobTitles.length * pageDepth
	const allJobs = []
	const allJobHashes = []
	var jobCt = [0, 0, 0] // count by city, job title, page
	const jobCtLimits = [jobTitles.length, pageDepth] // job counting limits: job title, page

	const cityInfoList = []
	for (var i = 0; i < cityList.length; i++) {
		const cityInfo = await getGlassDoorLocInfo(cityList[i])
		cityInfoList.push(cityInfo)
	}

	const gdCookie = {}
	// get the job (glassdoor)
	for (var i = 0; i < totalCount; i++) {
		try {
			const newJobs = await scrapeGlassDoor(jobTitles[jobCt[1]], cityInfoList[jobCt[0]], 30, jobCt[2], gdCookie)
			allJobs.push(...newJobs.jobs)
			console.log("new cookie", newJobs.newCookie)
			for (const key in newJobs.newCookie) {
				gdCookie[key] = newJobs.newCookie[key]
			}
			successCount ++
			jobCt = arrayCountUp(jobCt, jobCtLimits)
			console.log("iteration", i, "got", newJobs.jobs.length, "jobs")
		} catch (e) {
			console.log("it didn't work", e)
		}
	}

	// todo: De-duplication after all jobs done

	jsonToCsv(allJobs, "gd-scrape", ["title", "company", "companyLogo", "companyRating",
		"location", "salary", "shortDescription", "requiredSkills", "otherAttributes", "jobLink"])

	console.log("success / total", successCount, "/", totalCount)
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

function deduplicateArr(arr) {
    return arr.filter((item, index) => arr.indexOf(item) === index);
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
	fileStr.split("\n").forEach(l => {
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
